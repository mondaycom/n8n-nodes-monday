import type { INodePropertyOptions } from 'n8n-workflow';

/**
 * Folder resource — workspace folders that organize boards, docs, and
 * dashboards. API surface (verified live 2026-07-19 on version 2026-10):
 *
 * - folders(ids, workspace_ids, limit, page) — page-based, max limit 100
 *   per request (MaxQueryLimitExceededException above that). The list is
 *   FLAT: sub-folders appear as their own rows with `parent` set.
 *   workspace_ids: [null] returns the Main workspace's folders (the
 *   workspaces query does not list Main, so null is its only handle).
 * - create_folder(name!, workspace_id, parent_folder_id, color,
 *   custom_icon, font_weight) — omitting workspace_id creates in Main.
 *   QUIRK: parent_folder_id WITHOUT workspace_id fails with
 *   InvalidParentFolderIdException "Folder has different WS than parent
 *   folder" even when the parent is in Main — the node resolves the
 *   parent's workspace and sends it explicitly. (update_folder does NOT
 *   have this quirk: re-nesting with parent_folder_id alone works.)
 * - update_folder(folder_id!, ...) — CRITICAL QUIRK (verified live): every
 *   attribute NOT sent is RESET — a name-only update wipes color,
 *   custom_icon, font_weight AND un-nests the folder (parent → null). The
 *   node therefore reads the current state first and re-sends everything
 *   the user didn't change (see buildUpdateFolderArgs). The reset behavior
 *   doubles as the only "clear" mechanism — there is no way to explicitly
 *   null an attribute (the enums' NULL member just reads back as null).
 * - delete_folder(folder_id!) — deletes the folder AND its contents:
 *   contained boards end up state: deleted (verified live), sub-folders are
 *   deleted recursively.
 * - Bogus folder IDs → InvalidFolderIdException ("The folder does not
 *   exist...") on both update and delete.
 */

/** The folders query rejects limits above 100 (MaxQueryLimitExceededException). */
export const FOLDERS_API_MAX_PAGE_SIZE = 100;

/** Selection set for every folder read and mutation echo. */
export const FOLDER_FIELDS = `
	id
	name
	color
	custom_icon
	font_weight
	owner_id
	created_at
	workspace { id name }
	parent { id name }
	sub_folders { id name }
`;

/**
 * Sentinel for "no parent — workspace root" in the Update parent picker.
 * Maps to omitting parent_folder_id, which the API's reset behavior turns
 * into an un-nest.
 */
export const FOLDER_ROOT_PARENT = '__root__';

/**
 * Sentinel for "clear this attribute" in the styling dropdowns. Maps to
 * omitting the argument: on create that keeps the API default, on update
 * the reset behavior clears the attribute.
 */
export const FOLDER_ATTRIBUTE_NONE = '__none__';

/** The FolderColor enum (NULL excluded — clearing goes through omission). */
export const FOLDER_COLOR_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Aquamarine', value: 'AQUAMARINE' },
	{ name: 'Bright Blue', value: 'BRIGHT_BLUE' },
	{ name: 'Bright Green', value: 'BRIGHT_GREEN' },
	{ name: 'Chili Blue', value: 'CHILI_BLUE' },
	{ name: 'Dark Orange', value: 'DARK_ORANGE' },
	{ name: 'Dark Purple', value: 'DARK_PURPLE' },
	{ name: 'Dark Red', value: 'DARK_RED' },
	{ name: 'Done Green', value: 'DONE_GREEN' },
	{ name: 'Indigo', value: 'INDIGO' },
	{ name: 'Lipstick', value: 'LIPSTICK' },
	{ name: 'None (Default)', value: FOLDER_ATTRIBUTE_NONE },
	{ name: 'Purple', value: 'PURPLE' },
	{ name: 'Sofia Pink', value: 'SOFIA_PINK' },
	{ name: 'Stuck Red', value: 'STUCK_RED' },
	{ name: 'Sunset', value: 'SUNSET' },
	{ name: 'Working Orange', value: 'WORKING_ORANGE' },
];

/** The FolderCustomIcon enum (NULL excluded — see FOLDER_ATTRIBUTE_NONE). */
export const FOLDER_ICON_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Folder', value: 'FOLDER' },
	{ name: 'More Below', value: 'MOREBELOW' },
	{ name: 'More Below (Filled)', value: 'MOREBELOWFILLED' },
	{ name: 'None (Default)', value: FOLDER_ATTRIBUTE_NONE },
	{ name: 'Work', value: 'WORK' },
];

/** The FolderFontWeight enum (NULL excluded — see FOLDER_ATTRIBUTE_NONE). */
export const FOLDER_FONT_WEIGHT_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Bold', value: 'FONT_WEIGHT_BOLD' },
	{ name: 'Light', value: 'FONT_WEIGHT_LIGHT' },
	{ name: 'None (Default)', value: FOLDER_ATTRIBUTE_NONE },
	{ name: 'Normal', value: 'FONT_WEIGHT_NORMAL' },
	{ name: 'Very Light', value: 'FONT_WEIGHT_VERY_LIGHT' },
];

/** The current state of a folder, as read back before an update. */
export interface CurrentFolderState {
	name?: string | null;
	color?: string | null;
	custom_icon?: string | null;
	font_weight?: string | null;
	parent?: { id?: string | null } | null;
}

/** The user's Update Fields selections (all optional). */
export interface FolderUpdateChanges {
	name?: string;
	color?: string;
	customIcon?: string;
	fontWeight?: string;
	/** A folder ID, or FOLDER_ROOT_PARENT to move to the workspace root. */
	parentFolderId?: string;
	/** Move the folder to another workspace. */
	workspaceId?: string;
}

/** The update_folder arguments to send; undefined = omit (→ API resets it). */
export interface UpdateFolderArgs {
	name?: string;
	color?: string;
	customIcon?: string;
	fontWeight?: string;
	parentFolderId?: string;
	workspaceId?: string;
}

/**
 * Merges the user's changes with the folder's current state so unsent
 * attributes survive update_folder's reset-everything behavior:
 *
 * - Unchanged attributes are re-sent with their current value.
 * - FOLDER_ATTRIBUTE_NONE / FOLDER_ROOT_PARENT omit the argument, letting
 *   the reset clear the attribute (the API has no explicit clear).
 * - Moving to another workspace drops the parent unless a new parent was
 *   picked too — the old parent lives in the old workspace.
 */
export function buildUpdateFolderArgs(
	current: CurrentFolderState,
	changes: FolderUpdateChanges,
): UpdateFolderArgs {
	const pick = (change: string | undefined, currentValue: string | null | undefined) => {
		if (change === FOLDER_ATTRIBUTE_NONE) return undefined;
		if (change !== undefined && change !== '') return change;
		return currentValue ?? undefined;
	};

	let parentFolderId: string | undefined;
	if (changes.parentFolderId === FOLDER_ROOT_PARENT) {
		parentFolderId = undefined;
	} else if (changes.parentFolderId) {
		parentFolderId = changes.parentFolderId;
	} else if (changes.workspaceId) {
		// Cross-workspace move without an explicit parent: land at the root
		// of the target workspace instead of re-sending a stale parent.
		parentFolderId = undefined;
	} else {
		parentFolderId = current.parent?.id ?? undefined;
	}

	return {
		name: changes.name !== undefined && changes.name !== '' ? changes.name : (current.name ?? undefined),
		color: pick(changes.color, current.color),
		customIcon: pick(changes.customIcon, current.custom_icon),
		fontWeight: pick(changes.fontWeight, current.font_weight),
		parentFolderId,
		workspaceId: changes.workspaceId || undefined,
	};
}

/**
 * Label for folder dropdowns. The folders list is flat, so sub-folders are
 * labeled "Parent / Name" to stay findable.
 */
export function formatFolderLabel(folder: {
	name: string;
	parent?: { name?: string | null } | null;
}): string {
	return folder.parent?.name ? `${folder.parent.name} / ${folder.name}` : folder.name;
}
