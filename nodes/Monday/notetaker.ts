import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

import { MondayGraphQLClient } from './MondayGraphQLClient';
import { RETURN_ALL_HARD_CAP } from './pagination';

/**
 * monday Notetaker meetings API (API >= 2026-04; the node's pinned version
 * qualifies). Read-only: the schema has NO notetaker mutations (introspected
 * 2026-07-19 on 2026-10), and only meetings with COMPLETED recordings are
 * returned.
 *
 * Live-verified facts (2026-07-19):
 * - notetaker.meetings(limit, cursor, filters) — limit range 1–100; 101
 *   fails with INTERNAL_SERVER_ERROR, so pages are capped at 100.
 * - filters = { ids: [ID!], search: String, access: MeetingAccessFilter }.
 *   access DEFAULTS TO OWN — fetching a shared meeting by ID needs ALL.
 * - Accounts without Notetaker recordings return an empty list, not an
 *   error, on free and enterprise plans alike — no plan mapping needed.
 * - recording_duration is milliseconds; transcript entries carry
 *   text/start_time/end_time/speaker/language (times are Float seconds).
 */

/** Per-request page cap — the API rejects limit > 100 (verified live). */
export const MEETINGS_PAGE_SIZE = 100;

/** The MeetingAccessFilter enum for the Get Many Access filter. */
export const MEETING_ACCESS_FILTER_OPTIONS: INodePropertyOptions[] = [
	{
		name: 'All Accessible',
		value: 'ALL',
		description: 'Owned, shared with you, and shared with the account',
	},
	{ name: 'Owned by Me', value: 'OWN', description: 'Only meetings you own (the API default)' },
	{ name: 'Shared With Account', value: 'SHARED_WITH_ACCOUNT' },
	{ name: 'Shared With Me', value: 'SHARED_WITH_ME' },
];

/** Fields every meeting row carries. */
export const MEETING_BASE_FIELDS = `
	id
	title
	start_time
	end_time
	recording_duration
	access_type
	meeting_link
	summary
	participants { email }
`;

const MEETING_TOPICS_FIELD = 'topics { title talking_points { content } }';
const MEETING_ACTION_ITEMS_FIELD = 'action_items { id content is_completed owner due_date }';
const MEETING_TRANSCRIPT_FIELD = 'transcript { text start_time end_time speaker language }';

export interface MeetingFieldToggles {
	topics?: boolean;
	actionItems?: boolean;
	transcript?: boolean;
}

/**
 * Builds the meeting selection set: base fields plus the opted-in nested
 * collections. The transcript can run to thousands of entries per meeting,
 * so it is opt-in everywhere.
 */
export function buildMeetingFieldSelection(toggles: MeetingFieldToggles): string {
	const parts = [MEETING_BASE_FIELDS];
	if (toggles.topics) parts.push(MEETING_TOPICS_FIELD);
	if (toggles.actionItems) parts.push(MEETING_ACTION_ITEMS_FIELD);
	if (toggles.transcript) parts.push(MEETING_TRANSCRIPT_FIELD);
	return parts.join('\n');
}

export interface MeetingsFilterInput {
	ids?: string[];
	search?: string;
	access?: string;
}

/**
 * Compiles the UI filters into a MeetingsFilterInput object, or undefined
 * when nothing is set (letting the API default — access OWN — apply).
 */
export function buildMeetingsFilters(input: {
	ids?: string[];
	search?: string;
	access?: string;
}): MeetingsFilterInput | undefined {
	const filters: MeetingsFilterInput = {};
	if (input.ids && input.ids.length > 0) filters.ids = input.ids;
	const search = (input.search ?? '').trim();
	if (search) filters.search = search;
	if (input.access) filters.access = input.access;
	return Object.keys(filters).length > 0 ? filters : undefined;
}

/**
 * Shared Meeting selector. Notetaker libraries grow unbounded, so From List
 * searches server-side (filters.search matches title, participant name, and
 * email) and pages by cursor — never a full dump.
 */
export const meetingResourceLocator: INodeProperties = {
	displayName: 'Meeting',
	name: 'meetingId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The Notetaker meeting to operate on',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'searchMeetings',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 123456789',
		},
	],
};

const MEETINGS_SEARCH_PAGE_SIZE = 50;

interface MeetingSearchRow {
	id: string;
	title: string;
	start_time?: string | null;
	meeting_link?: string | null;
}

interface MeetingsPagePayload {
	meetings?: MeetingSearchRow[] | IDataObject[] | null;
	page_info?: { has_next_page?: boolean; cursor?: string | null } | null;
}

/**
 * listSearch method for the Meeting picker. The search text goes to the API
 * (filters.search); access ALL so shared meetings are pickable too. The
 * page_info cursor doubles as n8n's paginationToken.
 */
export async function searchMeetings(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const client = new MondayGraphQLClient(this);

	const variables: Record<string, unknown> = { limit: MEETINGS_SEARCH_PAGE_SIZE };
	if (paginationToken) {
		variables.cursor = paginationToken;
	} else {
		variables.filters = buildMeetingsFilters({ search: filter, access: 'ALL' });
	}

	const data = await client.execute(
		`query ($limit: Int, $cursor: String, $filters: MeetingsFilterInput) {
			notetaker {
				meetings(limit: $limit, cursor: $cursor, filters: $filters) {
					meetings { id title start_time meeting_link }
					page_info { has_next_page cursor }
				}
			}
		}`,
		0,
		variables,
	);

	const page = (data.notetaker as IDataObject | undefined)?.meetings as
		| MeetingsPagePayload
		| undefined;
	const meetings = (page?.meetings ?? []) as MeetingSearchRow[];

	return {
		results: meetings.map((meeting) => ({
			name: meeting.start_time
				? `${meeting.title} (${String(meeting.start_time).slice(0, 10)})`
				: meeting.title,
			value: meeting.id,
			url: meeting.meeting_link ?? undefined,
		})),
		paginationToken:
			page?.page_info?.has_next_page && page.page_info.cursor
				? page.page_info.cursor
				: undefined,
	};
}

export interface MeetingsFetchOptions {
	client: MondayGraphQLClient;
	itemIndex: number;
	filters?: MeetingsFilterInput;
	/** GraphQL selection set for each meeting. */
	fieldSelection: string;
	/** Maximum records to return (hard-capped). */
	limit?: number;
	pageSize?: number;
	/** Resume from a previous run's nextCursor instead of a fresh query. */
	startCursor?: string;
}

export interface MeetingsFetchResult {
	rows: IDataObject[];
	/** Cursor for the next unfetched meeting, or null when exhausted. */
	nextCursor: string | null;
}

/**
 * Cursor pagination for notetaker.meetings. Each request asks for exactly
 * the remaining record budget (capped at the API's 100-per-page maximum) so
 * the returned nextCursor always points at the first unfetched meeting.
 * Filters ride only on the first request — monday cursors encode the query
 * (same convention as items_page and get_directory_resources).
 */
export async function fetchAllMeetings(options: MeetingsFetchOptions): Promise<MeetingsFetchResult> {
	const { client, itemIndex, filters, fieldSelection } = options;
	const max = Math.min(options.limit ?? RETURN_ALL_HARD_CAP, RETURN_ALL_HARD_CAP);
	const pageSize = Math.min(options.pageSize ?? MEETINGS_PAGE_SIZE, MEETINGS_PAGE_SIZE);

	const rows: IDataObject[] = [];
	let cursor: string | null = options.startCursor || null;
	let isFirstRequest = !cursor;

	while (rows.length < max && (cursor || isFirstRequest)) {
		const variables: Record<string, unknown> = {
			limit: Math.min(pageSize, max - rows.length),
		};
		if (cursor) {
			variables.cursor = cursor;
		} else if (filters) {
			variables.filters = filters;
		}

		const data = await client.execute(
			`query ($limit: Int, $cursor: String, $filters: MeetingsFilterInput) {
				notetaker {
					meetings(limit: $limit, cursor: $cursor, filters: $filters) {
						meetings { ${fieldSelection} }
						page_info { has_next_page cursor }
					}
				}
			}`,
			itemIndex,
			variables,
		);

		const page = (data.notetaker as IDataObject | undefined)?.meetings as
			| MeetingsPagePayload
			| undefined;
		if (!page) break;

		rows.push(...((page.meetings ?? []) as IDataObject[]));
		cursor = page.page_info?.has_next_page ? (page.page_info.cursor ?? null) : null;
		isFirstRequest = false;
	}

	return { rows: rows.slice(0, max), nextCursor: cursor };
}
