/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import { describe, it, expect } from 'vitest';
import {
	buildUpdateFolderArgs,
	FOLDER_ATTRIBUTE_NONE,
	FOLDER_COLOR_OPTIONS,
	FOLDER_FONT_WEIGHT_OPTIONS,
	FOLDER_ICON_OPTIONS,
	FOLDER_ROOT_PARENT,
	formatFolderLabel,
} from './folders';

describe('folders', () => {
	describe('buildUpdateFolderArgs', () => {
		const styledCurrent = {
			name: 'Old Name',
			color: 'PURPLE',
			custom_icon: 'WORK',
			font_weight: 'FONT_WEIGHT_BOLD',
			parent: { id: '111' },
		};

		it('re-sends every current attribute on a name-only change (update_folder resets unsent args)', () => {
			expect(buildUpdateFolderArgs(styledCurrent, { name: 'New Name' })).toEqual({
				name: 'New Name',
				color: 'PURPLE',
				customIcon: 'WORK',
				fontWeight: 'FONT_WEIGHT_BOLD',
				parentFolderId: '111',
				workspaceId: undefined,
			});
		});

		it('keeps the current name when only styling changes', () => {
			const args = buildUpdateFolderArgs(styledCurrent, { color: 'SUNSET' });
			expect(args.name).toBe('Old Name');
			expect(args.color).toBe('SUNSET');
			expect(args.customIcon).toBe('WORK');
		});

		it('clears an attribute via the None sentinel by omitting the argument', () => {
			const args = buildUpdateFolderArgs(styledCurrent, {
				color: FOLDER_ATTRIBUTE_NONE,
				customIcon: FOLDER_ATTRIBUTE_NONE,
				fontWeight: FOLDER_ATTRIBUTE_NONE,
			});
			expect(args.color).toBeUndefined();
			expect(args.customIcon).toBeUndefined();
			expect(args.fontWeight).toBeUndefined();
			// The rest still rides along.
			expect(args.name).toBe('Old Name');
			expect(args.parentFolderId).toBe('111');
		});

		it('omits attributes that are currently unset', () => {
			const args = buildUpdateFolderArgs(
				{ name: 'Plain', color: null, custom_icon: null, font_weight: null, parent: null },
				{ name: 'Renamed' },
			);
			expect(args).toEqual({
				name: 'Renamed',
				color: undefined,
				customIcon: undefined,
				fontWeight: undefined,
				parentFolderId: undefined,
				workspaceId: undefined,
			});
		});

		it('moves to the workspace root via the root sentinel', () => {
			const args = buildUpdateFolderArgs(styledCurrent, { parentFolderId: FOLDER_ROOT_PARENT });
			expect(args.parentFolderId).toBeUndefined();
		});

		it('re-nests under a new parent', () => {
			const args = buildUpdateFolderArgs(styledCurrent, { parentFolderId: '222' });
			expect(args.parentFolderId).toBe('222');
		});

		it('drops a stale parent on a cross-workspace move without an explicit parent', () => {
			const args = buildUpdateFolderArgs(styledCurrent, { workspaceId: '999' });
			expect(args.workspaceId).toBe('999');
			expect(args.parentFolderId).toBeUndefined();
		});

		it('keeps an explicitly picked parent on a cross-workspace move', () => {
			const args = buildUpdateFolderArgs(styledCurrent, {
				workspaceId: '999',
				parentFolderId: '333',
			});
			expect(args.workspaceId).toBe('999');
			expect(args.parentFolderId).toBe('333');
		});
	});

	describe('formatFolderLabel', () => {
		it('labels root folders with their plain name', () => {
			expect(formatFolderLabel({ name: 'Marketing' })).toBe('Marketing');
			expect(formatFolderLabel({ name: 'Marketing', parent: null })).toBe('Marketing');
		});

		it('labels sub-folders with the parent name prefix', () => {
			expect(formatFolderLabel({ name: 'Q3', parent: { name: 'Marketing' } })).toBe(
				'Marketing / Q3',
			);
		});
	});

	describe('enum option lists', () => {
		it('every option list carries the None sentinel exactly once', () => {
			for (const list of [FOLDER_COLOR_OPTIONS, FOLDER_ICON_OPTIONS, FOLDER_FONT_WEIGHT_OPTIONS]) {
				const noneCount = list.filter((option) => option.value === FOLDER_ATTRIBUTE_NONE).length;
				expect(noneCount).toBe(1);
			}
		});

		it('never exposes the raw NULL enum member (clearing goes through omission)', () => {
			for (const list of [FOLDER_COLOR_OPTIONS, FOLDER_ICON_OPTIONS, FOLDER_FONT_WEIGHT_OPTIONS]) {
				expect(list.some((option) => option.value === 'NULL')).toBe(false);
			}
		});
	});
});
