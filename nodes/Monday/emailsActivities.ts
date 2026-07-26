import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';

import { toIso8601 } from './filterOptions';
import { MondayGraphQLClient } from './MondayGraphQLClient';

/**
 * The CustomActivityColor enum of the pinned API version (introspected live
 * 2026-07-17). n8n dropdowns can't render swatches, so each name carries a
 * hue-grouping circle emoji — same convention as the group/status palettes.
 */
export const CUSTOM_ACTIVITY_COLOR_OPTIONS: INodePropertyOptions[] = [
	{ name: '⚪ Gray', value: 'GRAY' },
	{ name: '🔴 Brink Pink', value: 'BRINK_PINK' },
	{ name: '🔴 Dingy Dungeon', value: 'DINGY_DUNGEON' },
	{ name: '🔴 Paradise Pink', value: 'PARADISE_PINK' },
	{ name: '🔵 Celtic Blue', value: 'CELTIC_BLUE' },
	{ name: '🔵 Cornflower Blue', value: 'CORNFLOWER_BLUE' },
	{ name: '🔵 Maya Blue', value: 'MAYA_BLUE' },
	{ name: '🔵 Medium Turquoise', value: 'MEDIUM_TURQUOISE' },
	{ name: '🔵 Slate Blue', value: 'SLATE_BLUE' },
	{ name: '🔵 Vivid Cerulean', value: 'VIVID_CERULEAN' },
	{ name: '🔵 Yankees Blue', value: 'YANKEES_BLUE' },
	{ name: '🟠 Yellow Orange', value: 'YELLOW_ORANGE' },
	{ name: '🟡 Philippine Yellow', value: 'PHILIPPINE_YELLOW' },
	{ name: '🟢 Go Green', value: 'GO_GREEN' },
	{ name: '🟢 Philippine Green', value: 'PHILIPPINE_GREEN' },
	{ name: '🟢 Yellow Green', value: 'YELLOW_GREEN' },
	{ name: '🟣 Light Deep Pink', value: 'LIGHT_DEEP_PINK' },
	{ name: '🟣 Light Hot Pink', value: 'LIGHT_HOT_PINK' },
];

/**
 * The CustomActivityIcon enum of the pinned API version (introspected live
 * 2026-07-17). NOTE: the live enum value really is UTENCILS — the docs'
 * UTENSILS spelling is rejected by the API.
 */
export const CUSTOM_ACTIVITY_ICON_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Ascending', value: 'ASCENDING' },
	{ name: 'Camera', value: 'CAMERA' },
	{ name: 'Conference', value: 'CONFERENCE' },
	{ name: 'Flag', value: 'FLAG' },
	{ name: 'Gift', value: 'GIFT' },
	{ name: 'Headphones', value: 'HEADPHONES' },
	{ name: 'Home Keys', value: 'HOMEKEYS' },
	{ name: 'Location', value: 'LOCATION' },
	{ name: 'Notebook', value: 'NOTEBOOK' },
	{ name: 'Paper Plane', value: 'PAPERPLANE' },
	{ name: 'Plane', value: 'PLANE' },
	{ name: 'Pliers', value: 'PLIERS' },
	{ name: 'Tripod', value: 'TRIPOD' },
	{ name: 'Two Flags', value: 'TWOFLAGS' },
	{ name: 'Utensils', value: 'UTENCILS' },
];

/**
 * The field selection for timeline-item reads. Full selections (incl. the
 * nested user/item/board) are safe on queries; mutations keep a slimmer
 * selection — a large mutation selection triggered a transient 500 during
 * live verification.
 */
export const TIMELINE_ITEM_FIELDS = `
	id
	title
	type
	content
	created_at
	custom_activity_id
	user { id name }
	item { id name }
	board { id }
`;

/** Title and summary share the API's 255-character cap. */
const TIMELINE_TEXT_MAX = 255;

/**
 * loadOptions method for the Custom Activity dropdown (Create Timeline Item,
 * Delete Custom Activity). The custom_activity query returns at most 50
 * activities account-wide, so a plain non-paginated dropdown is safe on any
 * account size.
 */
export async function getCustomActivitiesList(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const client = new MondayGraphQLClient(this);
	const data = await client.execute('query { custom_activity { id name } }', 0);

	return ((data.custom_activity ?? []) as Array<{ id: string; name?: string }>)
		.map((activity) => ({
			name: activity.name || `Activity ${activity.id}`,
			value: activity.id,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export interface TimelineItemInput {
	variables?: IDataObject;
	error?: string;
}

/**
 * Compiles the Create Timeline Item parameters into create_timeline_item
 * variables. Pure so the validation rules (length caps, time-range pairing,
 * timestamp default) are unit-testable. `now` is injectable for tests.
 */
export function buildTimelineItemInput(
	title: string,
	fields: IDataObject,
	now: () => string = () => new Date().toISOString(),
): TimelineItemInput {
	if (!title || title.length > TIMELINE_TEXT_MAX) {
		return {
			error: `Title must be between 1 and ${TIMELINE_TEXT_MAX} characters (got ${title.length})`,
		};
	}
	const summary = (fields.summary as string) || '';
	if (summary.length > TIMELINE_TEXT_MAX) {
		return {
			error: `Summary must be at most ${TIMELINE_TEXT_MAX} characters (got ${summary.length})`,
		};
	}

	// toIso8601: the picker emits naive local datetimes, which the
	// ISO8601DateTime scalar rejects (needs a timezone designator).
	const start = toIso8601(fields.timeRangeStart) ?? '';
	const end = toIso8601(fields.timeRangeEnd) ?? '';
	if (Boolean(start) !== Boolean(end)) {
		return { error: 'Start Time and End Time must be set together' };
	}

	const variables: IDataObject = {
		title,
		timestamp: toIso8601(fields.timestamp) ?? now(),
		summary: summary || null,
		content: (fields.content as string) || null,
		location: (fields.location as string) || null,
		phone: (fields.phone as string) || null,
		url: (fields.url as string) || null,
		timeRange: start ? { start_timestamp: start, end_timestamp: end } : null,
	};
	return { variables };
}

const TIMELINE_PAGE_SIZE = 100;

/**
 * Pages through an item's E&A timeline (timeline_items_page cursor loop),
 * requesting only the remaining budget per page so the last page never
 * over-fetches. The timeline only contains API-created entries — activities
 * logged by users in the UI are not visible to the API.
 */
export async function fetchTimelineItems(
	client: MondayGraphQLClient,
	itemIndex: number,
	itemId: string,
	options: { limit: number; skipConnectedItems?: boolean },
): Promise<IDataObject[]> {
	const rows: IDataObject[] = [];
	let cursor: string | null = null;

	do {
		const pageSize = Math.min(TIMELINE_PAGE_SIZE, options.limit - rows.length);
		const data = await client.execute(
			`query ($id: ID!, $skip: Boolean, $limit: Int, $cursor: String) {
				timeline(id: $id, skipConnectedItems: $skip) {
					timeline_items_page(limit: $limit, cursor: $cursor) {
						cursor
						timeline_items { ${TIMELINE_ITEM_FIELDS} }
					}
				}
			}`,
			itemIndex,
			{
				id: itemId,
				skip: options.skipConnectedItems === true ? true : null,
				limit: pageSize,
				cursor,
			},
		);
		const page = ((data.timeline ?? {}) as IDataObject).timeline_items_page as
			| { cursor?: string | null; timeline_items?: IDataObject[] }
			| undefined;
		const pageRows = page?.timeline_items ?? [];
		rows.push(...pageRows);
		cursor = page?.cursor ?? null;
		// An empty page means the server is done regardless of the cursor.
		if (pageRows.length === 0) break;
	} while (cursor && rows.length < options.limit);

	return rows.slice(0, options.limit);
}
