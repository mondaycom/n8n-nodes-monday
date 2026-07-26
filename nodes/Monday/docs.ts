import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

import { SEARCH_MAX_LIMIT } from './accountSearch';
import { MondayGraphQLClient } from './MondayGraphQLClient';

/**
 * monday docs (workdocs) API. Live-verified quirks (2026-07-19, version
 * 2026-10) this module is built around:
 *
 * - Every doc has TWO IDs: the internal `id` (returned by the docs query
 *   and create_doc) and the `object_id` (the number in the doc URL and in
 *   doc column values). ALL doc mutations, export_markdown_from_doc, and
 *   add_content_to_doc_from_markdown accept ONLY the internal id — an
 *   object id fails with "Doc not found" (update_doc_name/delete_doc),
 *   INTERNAL_SERVER_ERROR (add_content...), or a raw fetcher-500 string
 *   (export). resolveDocId therefore auto-resolves: internal first, then
 *   object_ids lookup.
 * - duplicate_doc returns `{success, id}` where id is the NEW DOC'S OBJECT
 *   ID (verified live), while import_doc_from_html returns the INTERNAL id
 *   in doc_id. Both get read back through the docs query for a consistent
 *   output.
 * - update_doc_name / delete_doc / export_markdown_from_doc never throw on
 *   a missing doc — they return success: false plus an error string (the
 *   export one is a raw "Fetcher response returned NON-OK status=500").
 * - create_doc_block's `content: JSON!` variable must be a JSON-ENCODED
 *   STRING — a real JSON object fails request validation ("Invalid type,
 *   expected a JSON string"). The exact opposite of update_column settings.
 * - delete_doc_blocks is all-or-nothing: one unknown block ID fails the
 *   whole request (NOT_FOUND) and nothing is deleted.
 * - blocks(limit) defaults to 25 but accepts higher values (100 verified).
 * - The docs query has no name filter — searchDocs sends a typed search
 *   term to the cross-entity search API (search.docs) instead, same hybrid
 *   pattern as searchBoards. Search results carry TWO id spaces: the
 *   top-level/indexed id is the OBJECT id, live_data.id is the INTERNAL
 *   docId (verified live — see SEARCH_DOCS_ISSUES.md issue 4).
 */

/** Selection set for every doc read and mutation echo. */
export const DOC_FIELDS = `
	id
	object_id
	name
	doc_kind
	url
	relative_url
	workspace_id
	workspace { id name }
	doc_folder_id
	created_at
	updated_at
	created_by { id name }
	settings
`;

/** Selection set for block reads. content is an escaped-JSON string. */
export const DOC_BLOCK_FIELDS = `
	id
	type
	content
	position
	parent_block_id
	doc_id
	created_at
	updated_at
	created_by { id name }
`;

/**
 * Matches the object ID inside a monday doc URL, e.g.
 * https://acme.monday.com/docs/18422738203
 */
export const DOC_URL_REGEX = 'https?://[^/]+\\.monday\\.com/docs/([0-9]+)';

/**
 * Shared Doc selector: From List (searchable, most recently used first),
 * By ID (internal or URL/object ID — resolveDocId sorts out which), By URL.
 */
export const docResourceLocator: INodeProperties = {
	displayName: 'Doc',
	name: 'docId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The doc to operate on',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'searchDocs',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 44677893 or 18422738203',
			validation: [
				{
					type: 'regex',
					properties: {
						regex: '[0-9]+',
						errorMessage: 'The doc ID must be a number',
					},
				},
			],
		},
		{
			displayName: 'By URL',
			name: 'url',
			type: 'string',
			placeholder: 'e.g. https://yourorg.monday.com/docs/1234567890',
			validation: [
				{
					type: 'regex',
					properties: {
						regex: DOC_URL_REGEX,
						errorMessage: 'Not a valid monday.com doc URL',
					},
				},
			],
			extractValue: {
				type: 'regex',
				regex: DOC_URL_REGEX,
			},
		},
	],
};

const DOCS_PAGE_SIZE = 50;

interface DocSearchRow {
	id: string;
	object_id: string;
	name: string;
	url?: string;
	workspace?: { name?: string } | null;
}

/** "Doc (Workspace)" labels, same convention as board pickers. */
export function formatDocLabel(doc: {
	name: string;
	workspace?: { name?: string } | null;
}): string {
	return doc.workspace?.name ? `${doc.name} (${doc.workspace.name})` : doc.name;
}

/** A search.docs result row: indexed snapshot + optional live entity. */
interface DocSearchApiResult {
	id: string;
	indexed_data?: { name?: string | null } | null;
	live_data?: {
		id: string;
		name: string;
		url?: string;
		workspace?: { name?: string } | null;
	} | null;
}

/**
 * Search path: one search.docs request, relevance-ordered and fuzzy,
 * hard-capped at 20 results with no pagination (per the search API
 * reference) — a more specific term surfaces what the cap hides.
 *
 * ID-space trap (verified live, SEARCH_DOCS_ISSUES.md issue 4): the
 * top-level result id is the doc's OBJECT id, while live_data.id is the
 * INTERNAL docId — the only id doc mutations accept, and what From List
 * must emit as the value. Rows with null live_data (deleted, inaccessible,
 * or index lag) are therefore dropped: their internal id is unknowable
 * from the search result alone, and emitting the object id would break
 * every downstream mutation.
 */
async function searchDocsViaSearchApi(
	client: MondayGraphQLClient,
	query: string,
): Promise<INodeListSearchResult> {
	const data = await client.execute(
		`query ($q: String!, $limit: Int) {
			search {
				docs(query: $q, limit: $limit) {
					results {
						id
						indexed_data { name }
						live_data { id name url workspace { name } }
					}
				}
			}
		}`,
		0,
		{ q: query, limit: SEARCH_MAX_LIMIT },
	);

	const container = (data.search as { docs?: { results?: DocSearchApiResult[] } } | undefined)
		?.docs;

	const results = (container?.results ?? [])
		.filter((result) => result.live_data?.id)
		.map((result) => ({
			name: formatDocLabel(result.live_data!),
			value: String(result.live_data!.id),
			url: result.live_data!.url,
		}));

	// No paginationToken: the search API returns top-N only.
	return { results };
}

/**
 * listSearch method for the Doc From List mode — hybrid, same pattern as
 * searchBoards:
 * - No filter → browse mode: pages through docs (most recently used
 *   first), 50 per request.
 * - Filter typed → server-side fuzzy search across the whole account via
 *   search.docs (searchDocsViaSearchApi above), relevance-ranked.
 * Option value = the INTERNAL doc id (the one every doc mutation needs)
 * on both paths.
 */
export async function searchDocs(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const client = new MondayGraphQLClient(this);

	const query = filter?.trim();
	if (query) {
		return await searchDocsViaSearchApi(client, query);
	}

	const page = paginationToken ? Number.parseInt(paginationToken, 10) : 1;

	const data = await client.execute(
		`query ($limit: Int!, $page: Int!) {
			docs(limit: $limit, page: $page, order_by: used_at) {
				id
				object_id
				name
				url
				workspace { name }
			}
		}`,
		0,
		{ limit: DOCS_PAGE_SIZE, page },
	);

	const docs = (data.docs ?? []) as DocSearchRow[];

	const results = docs.map((doc) => ({
		name: formatDocLabel(doc),
		value: doc.id,
		url: doc.url,
	}));

	return {
		results,
		paginationToken: docs.length === DOCS_PAGE_SIZE ? String(page + 1) : undefined,
	};
}

/** The value shape of an n8n resourceLocator parameter. */
export interface DocLocatorValue {
	mode?: string;
	value?: string | number;
}

/**
 * Resolves whatever the Doc locator holds into the INTERNAL doc id, which
 * is the only id the doc mutations accept:
 *
 * - From List → already the internal id (searchDocs uses it as the value).
 * - By URL → the URL carries the object id → one object_ids lookup.
 * - By ID / expression → could be either kind. Internal ids are tried
 *   first; on a miss the value is retried as an object id. Two bounded
 *   queries worst case, one normally.
 *
 * Returns null when no doc matches either way.
 */
export async function resolveDocId(
	client: MondayGraphQLClient,
	itemIndex: number,
	locator: DocLocatorValue | string | number,
): Promise<string | null> {
	const raw =
		typeof locator === 'object' && locator !== null
			? String(locator.value ?? '')
			: String(locator ?? '');
	const mode = typeof locator === 'object' && locator !== null ? locator.mode : undefined;

	// By URL values may arrive as the full URL (no extractValue applied when
	// the raw parameter is read) — pull the object id out ourselves.
	const urlMatch = raw.match(/monday\.com\/docs\/([0-9]+)/);
	const value = urlMatch ? urlMatch[1] : raw.trim();
	if (!value) return null;

	if (mode === 'list') return value;

	const lookupByObjectId = mode === 'url' || urlMatch !== null;
	if (!lookupByObjectId) {
		const data = await client.execute(
			'query ($ids: [ID!]) { docs(ids: $ids) { id } }',
			itemIndex,
			{ ids: [value] },
		);
		const hit = ((data.docs as IDataObject[]) ?? [])[0];
		if (hit?.id) return String(hit.id);
	}

	const data = await client.execute(
		'query ($objectIds: [ID!]) { docs(object_ids: $objectIds) { id } }',
		itemIndex,
		{ objectIds: [value] },
	);
	const hit = ((data.docs as IDataObject[]) ?? [])[0];
	return hit?.id ? String(hit.id) : null;
}

/**
 * Parses the escaped-JSON scalar fields of a doc/block row (block content,
 * doc settings) into real objects for friendlier output. Unparseable
 * values pass through untouched.
 */
export function parseJsonField(value: unknown): unknown {
	if (typeof value !== 'string' || value === '') return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

/** The DocBlockContentType enum (Title Case labels, verified live). */
export const DOC_BLOCK_TYPE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Bulleted List', value: 'bulleted_list' },
	{ name: 'Check List', value: 'check_list' },
	{ name: 'Code', value: 'code' },
	{ name: 'Divider', value: 'divider' },
	{ name: 'Image', value: 'image' },
	{ name: 'Large Title', value: 'large_title' },
	{ name: 'Layout', value: 'layout' },
	{ name: 'Medium Title', value: 'medium_title' },
	{ name: 'Normal Text', value: 'normal_text' },
	{ name: 'Notice Box', value: 'notice_box' },
	{ name: 'Numbered List', value: 'numbered_list' },
	{ name: 'Page Break', value: 'page_break' },
	{ name: 'Quote', value: 'quote' },
	{ name: 'Small Title', value: 'small_title' },
	{ name: 'Table', value: 'table' },
	{ name: 'Video', value: 'video' },
];

/** Block types whose content is a plain deltaFormat text payload. */
export const TEXT_DELTA_BLOCK_TYPES = new Set([
	'bulleted_list',
	'check_list',
	'code',
	'large_title',
	'medium_title',
	'normal_text',
	'numbered_list',
	'quote',
	'small_title',
]);

/** Block types that take an empty content object. */
export const EMPTY_CONTENT_BLOCK_TYPES = new Set(['divider', 'page_break']);

/**
 * Builds the content argument for Create/Update Block in Text mode, or
 * returns null for types that need structured JSON (table, layout, image,
 * video, notice box) — the caller turns that into a friendly error telling
 * the user to switch to Raw JSON mode.
 *
 * The returned value is a JSON-encoded STRING because that is what the
 * `content: JSON!` variable demands (verified live — objects are rejected).
 */
export function buildTextBlockContent(blockType: string, text: string): string | null {
	if (TEXT_DELTA_BLOCK_TYPES.has(blockType)) {
		return JSON.stringify({ deltaFormat: [{ insert: text }] });
	}
	if (EMPTY_CONTENT_BLOCK_TYPES.has(blockType)) {
		return JSON.stringify({});
	}
	return null;
}

/**
 * Normalizes the Raw JSON content input (string or object from an
 * expression) into the JSON-encoded string the API wants. Throws on
 * invalid JSON so the error surfaces before any API call.
 */
export function normalizeBlockContentJson(value: unknown): string {
	if (typeof value === 'object' && value !== null) {
		return JSON.stringify(value);
	}
	const text = String(value ?? '').trim();
	if (text === '') return JSON.stringify({});
	// Validate — JSON.parse throws on garbage, and re-stringifying
	// normalizes formatting quirks like trailing whitespace.
	return JSON.stringify(JSON.parse(text));
}
