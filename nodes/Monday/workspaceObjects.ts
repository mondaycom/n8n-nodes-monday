import type { IDataObject, INodePropertyOptions } from 'n8n-workflow';

import type { MondayGraphQLClient } from './MondayGraphQLClient';

/**
 * Left-pane object actions of the Folder & Object resource — the contents
 * of a workspace's left pane
 * (boards, docs, folders, dashboards) and the positioning API that
 * reorders them. Live-verified facts (2026-07-19, version 2026-10) this
 * module is built around:
 *
 * - There is NO API that reads left-pane ORDER: no position field exists
 *   on boards or folders (the favorites query has one, but only for the
 *   personal favorites list). Get Many therefore returns structure
 *   (folder nesting), not sibling order.
 * - Dashboards (overviews) cannot be LISTED on any dated API version —
 *   the `overviews` query exists only in the unreleased "dev" schema, the
 *   `objects` query never returns them (not even by ID), and they don't
 *   ride along in the boards query. They can still be MOVED via
 *   update_overview_hierarchy(overview_id!, attributes!).
 * - The boards query is the left-pane read surface for everything else:
 *   it returns real boards, docs (type "document"), workflows and other
 *   custom objects (type "custom_object"), and subitem boards (type
 *   "sub_items_board" — never shown in the left pane, always dropped).
 *   `workspace_ids: [null]` = the account's Main workspace, same
 *   convention as the folders query.
 * - update_board_hierarchy(board_id!, attributes!) moves boards AND docs
 *   — for docs the object id (the boards-query id / the number in the doc
 *   URL) is required; the internal doc id fails with
 *   InvalidBoardIdException.
 * - DynamicPosition = { object_id!, object_type! (Board/Folder/Overview),
 *   is_after }. Positioning next to a reference at the workspace root
 *   pulls the target OUT of its folder, but positioning next to a
 *   reference inside a folder does NOT pull the target in — send
 *   folder_id alongside position to move into a folder (combining both in
 *   one call works, verified live).
 * - A bogus/inaccessible position reference id fails with a misleading
 *   USER_UNAUTHORIZED 403 ("User unauthorized to perform action") on all
 *   three mutations. Bogus target ids fail cleanly
 *   (InvalidBoardIdException, "The overview does not exist...",
 *   InvalidFolderIdException).
 * - update_folder has the reset-everything quirk (see folders.ts): a
 *   position-only update wipes color/icon/font weight and un-nests the
 *   folder — verified live. Folder moves must read the current state and
 *   re-send it.
 */

/** ObjectType enum values accepted by DynamicPosition.object_type. */
export const POSITION_REFERENCE_TYPE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Board or Doc', value: 'Board' },
	{ name: 'Dashboard (Overview)', value: 'Overview' },
	{ name: 'Folder', value: 'Folder' },
];

/** The user's New Position collection, normalized. */
export interface HierarchyPosition {
	/** The reference object's id (a board/doc object id, folder id, or dashboard id). */
	objectId: string;
	/** DynamicPosition.object_type: Board | Folder | Overview. */
	objectType: string;
	/** true = place after the reference, false = before. */
	isAfter: boolean;
}

/** Everything a hierarchy move can change. */
export interface HierarchyMove {
	folderId?: string;
	workspaceId?: string;
	position?: HierarchyPosition;
}

/**
 * Builds the attributes input object shared by update_board_hierarchy and
 * update_overview_hierarchy (UpdateBoardHierarchyAttributesInput /
 * UpdateOverviewHierarchyAttributesInput have identical shapes). Unset
 * arguments are omitted entirely.
 */
export function buildHierarchyAttributes(move: HierarchyMove): IDataObject {
	const attributes: IDataObject = {};
	if (move.folderId) attributes.folder_id = move.folderId;
	if (move.workspaceId) attributes.workspace_id = move.workspaceId;
	if (move.position) {
		attributes.position = {
			object_id: move.position.objectId,
			object_type: move.position.objectType,
			is_after: move.position.isAfter,
		};
	}
	return attributes;
}

/** One row of Get Many output (and one node of the tree output). */
export interface WorkspaceObjectRow extends IDataObject {
	/** board | doc | customObject | folder */
	objectType: string;
	id: string;
	name: string;
	/** The containing folder's id; null = workspace root. */
	folderId: string | null;
	workspaceId: string | null;
	url?: string;
	/** Tree output only: the folder's contents (folders first, then objects). */
	children?: WorkspaceObjectRow[];
}

/** The boards-query row shape Get Many reads. */
export interface LeftPaneBoardRow {
	id: string;
	name: string;
	type?: string;
	board_folder_id?: string | null;
	url?: string;
	workspace?: { id?: string | null } | null;
}

/** The folders-query row shape Get Many reads. */
export interface LeftPaneFolderRow {
	id: string;
	name: string;
	parent?: { id?: string | null } | null;
	workspace?: { id?: string | null } | null;
}

/** Maps the BoardObjectType enum to this resource's objectType values. */
const BOARD_TYPE_TO_OBJECT_TYPE: Record<string, string> = {
	board: 'board',
	document: 'doc',
	custom_object: 'customObject',
};

/**
 * Maps one boards-query row to an output row, or null for subitem boards
 * (type "sub_items_board"), which never appear in the left pane.
 */
export function mapLeftPaneBoardRow(row: LeftPaneBoardRow): WorkspaceObjectRow | null {
	const objectType = BOARD_TYPE_TO_OBJECT_TYPE[row.type ?? 'board'];
	if (!objectType) return null;
	const mapped: WorkspaceObjectRow = {
		objectType,
		id: String(row.id),
		name: row.name,
		folderId: row.board_folder_id ? String(row.board_folder_id) : null,
		workspaceId: row.workspace?.id ? String(row.workspace.id) : null,
	};
	if (row.url) mapped.url = row.url;
	return mapped;
}

/** Maps one folders-query row to an output row. */
export function mapLeftPaneFolderRow(row: LeftPaneFolderRow): WorkspaceObjectRow {
	return {
		objectType: 'folder',
		id: String(row.id),
		name: row.name,
		folderId: row.parent?.id ? String(row.parent.id) : null,
		workspaceId: row.workspace?.id ? String(row.workspace.id) : null,
	};
}

/**
 * Merges folder and board/doc rows into the flat Get Many output, applying
 * the Object Types filter (empty = everything). Folders come first, then
 * the other objects, each group sorted by name — the API exposes no
 * left-pane order to preserve (see module header).
 */
export function buildWorkspaceObjectRows(
	folderRows: WorkspaceObjectRow[],
	boardRows: WorkspaceObjectRow[],
	includeTypes: string[],
): WorkspaceObjectRow[] {
	const include = (row: WorkspaceObjectRow) =>
		includeTypes.length === 0 || includeTypes.includes(row.objectType);
	const byName = (a: WorkspaceObjectRow, b: WorkspaceObjectRow) => a.name.localeCompare(b.name);
	return [
		...folderRows.filter(include).sort(byName),
		...boardRows.filter(include).sort(byName),
	];
}

/**
 * Builds the tree output: root-level nodes with folder contents nested in
 * `children`. Objects whose folder is not in the row set (deleted folder,
 * folder beyond the page cap) land at the root rather than vanishing.
 * Children are ordered folders-first, then objects, by name.
 */
export function buildWorkspaceObjectTree(
	folderRows: WorkspaceObjectRow[],
	objectRows: WorkspaceObjectRow[],
): WorkspaceObjectRow[] {
	const foldersById = new Map<string, WorkspaceObjectRow>();
	for (const folder of folderRows) {
		foldersById.set(folder.id, { ...folder, children: [] });
	}

	const roots: WorkspaceObjectRow[] = [];
	const byName = (a: WorkspaceObjectRow, b: WorkspaceObjectRow) => a.name.localeCompare(b.name);

	const attach = (row: WorkspaceObjectRow) => {
		const parent = row.folderId ? foldersById.get(row.folderId) : undefined;
		if (parent) {
			parent.children!.push(row);
		} else {
			roots.push(row);
		}
	};

	// Folders first so every parent exists before objects attach to it.
	for (const folder of foldersById.values()) attach(folder);
	for (const row of objectRows) attach(row);

	const sortChildren = (nodes: WorkspaceObjectRow[]): WorkspaceObjectRow[] => {
		const folders = nodes.filter((node) => node.objectType === 'folder').sort(byName);
		const objects = nodes.filter((node) => node.objectType !== 'folder').sort(byName);
		for (const folder of folders) {
			folder.children = sortChildren(folder.children ?? []);
		}
		return [...folders, ...objects];
	};

	return sortChildren(roots);
}

/** The value shape of an n8n resourceLocator parameter. */
interface LocatorValue {
	mode?: string;
	value?: string | number;
}

/**
 * Resolves whatever the Doc locator holds into the doc's OBJECT id — the
 * only id update_board_hierarchy accepts for docs (the internal id fails
 * with InvalidBoardIdException, verified live):
 *
 * - By URL → the URL already carries the object id.
 * - From List → the internal id (searchDocs' option value) → one lookup.
 * - By ID / expression → either kind: tried as an internal id first, then
 *   as an object id. Two bounded queries worst case.
 *
 * Returns null when no doc matches either way.
 */
export async function resolveDocObjectId(
	client: MondayGraphQLClient,
	itemIndex: number,
	locator: LocatorValue | string | number,
): Promise<string | null> {
	const raw =
		typeof locator === 'object' && locator !== null
			? String(locator.value ?? '')
			: String(locator ?? '');
	const mode = typeof locator === 'object' && locator !== null ? locator.mode : undefined;

	const urlMatch = raw.match(/monday\.com\/docs\/([0-9]+)/);
	const value = urlMatch ? urlMatch[1] : raw.trim();
	if (!value) return null;
	if (mode === 'url' || urlMatch) return value;

	const byInternal = await client.execute(
		'query ($ids: [ID!]) { docs(ids: $ids) { object_id } }',
		itemIndex,
		{ ids: [value] },
	);
	const internalHit = ((byInternal.docs as IDataObject[]) ?? [])[0];
	if (internalHit?.object_id) return String(internalHit.object_id);

	const byObject = await client.execute(
		'query ($objectIds: [ID!]) { docs(object_ids: $objectIds) { object_id } }',
		itemIndex,
		{ objectIds: [value] },
	);
	const objectHit = ((byObject.docs as IDataObject[]) ?? [])[0];
	return objectHit?.object_id ? String(objectHit.object_id) : null;
}

/**
 * All three hierarchy mutations reject a bad POSITION REFERENCE with a
 * bare USER_UNAUTHORIZED 403 ("User unauthorized to perform action") —
 * verified live for (a) a bogus/inaccessible reference id and (b) a
 * reference the target can't legally sit next to (e.g. positioning a
 * FOLDER relative to a board that lives inside another folder). When a
 * move that carried a position fails that way, the reference is by far
 * the most likely culprit; this returns the hint to surface, or null for
 * other errors.
 */
export function describePositionReferenceError(
	message: string,
	hadPosition: boolean,
): string | null {
	if (!hadPosition) return null;
	if (!/user unauthorized/i.test(message)) return null;
	return (
		'monday.com rejected the move with "User unauthorized to perform action". ' +
		'For position moves this usually means the reference object in New Position does not exist ' +
		'(wrong ID or wrong reference type), the API user cannot access it, or the object cannot sit ' +
		'next to it (e.g. positioning a folder relative to a board that lives inside another folder). ' +
		'Check the Reference Object ID and Reference Object Type.'
	);
}
