import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

import type { MondayGraphQLClient } from './MondayGraphQLClient';
import { RETURN_ALL_HARD_CAP, DEFAULT_PAGE_SIZE } from './pagination';

/**
 * Resource Directory (Enterprise-only, API >= 2026-01; the node's pinned
 * version qualifies). One query + one mutation:
 *
 * - get_directory_resources(limit, cursor, query_params) — cursor-paginated,
 *   filterable via ItemsQuery rules on attribute pseudo-columns.
 * - update_directory_resources_attributes(attribute, values, resource_ids).
 *
 * Live-verified quirks (enterprise account 20692525, 2026-07-17):
 * - Non-Enterprise accounts get a raw 500 INTERNAL_SERVER_ERROR from the
 *   query and RESOURCE_ATTRIBUTES_UPDATE_FAILED from the mutation — there is
 *   no clean "not on your plan" error, so we map those codes ourselves.
 * - Filter rules work with contains_text on NAME/EMAIL/SKILLS; SKILLS with
 *   the documented any_of operator silently returns [] — the node only
 *   offers contains_text.
 * - Update semantics: SKILLS values are APPENDED to the existing set with
 *   dedupe (sending one skill does NOT drop the others); JOB_ROLE/LOCATION
 *   hold a single value that gets overwritten. Removing/clearing is
 *   impossible: values: [] returns success: true but is a silent no-op, and
 *   values: [""] is rejected with INVALID_INPUT.
 * - The pagination cursor encodes the filter, and a request carrying BOTH
 *   cursor and query_params is rejected — follow-up pages send cursor only.
 * - limit up to 500 verified; we page at DEFAULT_PAGE_SIZE like other lists.
 */

/** All fields of DirectoryResource. resource_type (USER | VIEWER | GUEST)
 * exists in the live schema but is missing from the docs table. */
export const DIRECTORY_RESOURCE_FIELDS = `
	id
	name
	email
	job_role
	location
	skills
	resource_type
`;

/**
 * Filterable attributes — the pseudo-column ids get_directory_resources
 * accepts in query_params rules.
 */
export const DIRECTORY_FILTER_ATTRIBUTE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Email', value: 'EMAIL' },
	{ name: 'Job Role', value: 'JOB_ROLE' },
	{ name: 'Location', value: 'LOCATION' },
	{ name: 'Name', value: 'NAME' },
	{ name: 'Skills', value: 'SKILLS' },
	{ name: 'Teams', value: 'TEAMS' },
];

/** The DirectoryResourceAttribute enum — the only writable attributes. */
export const DIRECTORY_UPDATE_ATTRIBUTE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Job Role', value: 'JOB_ROLE' },
	{ name: 'Location', value: 'LOCATION' },
	{ name: 'Skills', value: 'SKILLS' },
];

export interface DirectoryFilterRow {
	attribute?: string;
	value?: string;
}

/**
 * Compiles the Filters rows into a get_directory_resources query_params
 * object, or undefined when no usable rule remains. Every rule uses
 * contains_text — the one operator verified to work across attributes.
 */
export function buildDirectoryQueryParams(
	rows: DirectoryFilterRow[],
	match: string,
): IDataObject | undefined {
	const rules = rows
		.filter((row) => row.attribute && (row.value ?? '').trim() !== '')
		.map((row) => ({
			column_id: row.attribute,
			operator: 'contains_text',
			compare_value: (row.value as string).trim(),
		}));
	if (rules.length === 0) return undefined;
	return { operator: match === 'or' ? 'or' : 'and', rules };
}

export interface DirectoryFetchOptions {
	client: MondayGraphQLClient;
	itemIndex: number;
	queryParams?: IDataObject;
	/** Maximum records to return (hard-capped). */
	limit?: number;
	pageSize?: number;
	/** Resume from a previous run's nextCursor instead of a fresh query. */
	startCursor?: string;
}

export interface DirectoryFetchResult {
	rows: IDataObject[];
	/** Cursor for the next unfetched resource, or null when exhausted. */
	nextCursor: string | null;
}

/**
 * Cursor pagination for get_directory_resources. Each request asks for
 * exactly the remaining record budget so the returned nextCursor always
 * points at the first unfetched resource. query_params only rides on the
 * first request — the cursor encodes the filter, and the API rejects a
 * request carrying both (verified live).
 */
export async function fetchAllDirectoryResources(
	options: DirectoryFetchOptions,
): Promise<DirectoryFetchResult> {
	const { client, itemIndex, queryParams } = options;
	const max = Math.min(options.limit ?? RETURN_ALL_HARD_CAP, RETURN_ALL_HARD_CAP);
	const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

	const rows: IDataObject[] = [];
	let cursor: string | null = options.startCursor || null;
	let isFirstRequest = !cursor;

	while (rows.length < max && (cursor || isFirstRequest)) {
		const variables: Record<string, unknown> = {
			limit: Math.min(pageSize, max - rows.length),
		};
		if (cursor) {
			variables.cursor = cursor;
		} else if (queryParams) {
			variables.queryParams = queryParams;
		}

		const data = await client.execute(
			`query ($limit: Int, $cursor: String, $queryParams: ItemsQuery) {
				get_directory_resources(limit: $limit, cursor: $cursor, query_params: $queryParams) {
					cursor
					resources { ${DIRECTORY_RESOURCE_FIELDS} }
				}
			}`,
			itemIndex,
			variables,
		);

		const page = data.get_directory_resources as
			| { cursor?: string | null; resources?: IDataObject[] }
			| undefined;
		if (!page) break;

		rows.push(...(page.resources ?? []));
		cursor = page.cursor ?? null;
		isFirstRequest = false;
	}

	return { rows: rows.slice(0, max), nextCursor: cursor };
}

/**
 * Error codes the Resource Directory endpoints return for "not available on
 * this plan" — both are 500s with no plan hint in the message (verified live
 * on a free-tier account, 2026-07-17).
 */
const DIRECTORY_PLAN_ERROR_CODES = new Set([
	'INTERNAL_SERVER_ERROR',
	'RESOURCE_ATTRIBUTES_UPDATE_FAILED',
]);

/**
 * Friendlier description for Resource Directory failures, or null when the
 * error isn't one this module knows how to explain. The client passes the
 * raw monday error object into NodeApiError, which stores non-Error inputs
 * on `errorResponse` (n8n-workflow NodeError; `cause` is only used for real
 * Error instances) — check both to stay robust.
 */
export function describeDirectoryError(error: unknown): string | null {
	interface RawMondayError {
		extensions?: { code?: string };
		error_code?: string;
	}
	const candidate = error as { errorResponse?: RawMondayError; cause?: RawMondayError };
	const raw = candidate?.errorResponse ?? candidate?.cause;
	const code = raw?.extensions?.code ?? raw?.error_code;
	if (code === 'ATTRIBUTE_NOT_FOUND') {
		return (
			'One or more values do not exist as attributes in the account\u2019s Resource Directory. ' +
			'The API can only assign existing attribute values \u2014 create the value in the Resource Directory first (Attribute Setup), then re-run.'
		);
	}
	if (code && DIRECTORY_PLAN_ERROR_CODES.has(code)) {
		return (
			'monday.com could not serve this Resource Directory request. This usually means the account is not on an Enterprise plan \u2014 ' +
			'the Resource Directory API is Enterprise-only. (The API reports this as a generic server error.)'
		);
	}
	return null;
}
