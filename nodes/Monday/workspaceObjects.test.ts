/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import { describe, it, expect, vi } from 'vitest';
import type { MondayGraphQLClient } from './MondayGraphQLClient';
import {
	buildHierarchyAttributes,
	buildWorkspaceObjectRows,
	buildWorkspaceObjectTree,
	describePositionReferenceError,
	mapLeftPaneBoardRow,
	mapLeftPaneFolderRow,
	resolveDocObjectId,
	type WorkspaceObjectRow,
} from './workspaceObjects';

describe('workspaceObjects', () => {
	describe('buildHierarchyAttributes', () => {
		it('builds the full attributes input', () => {
			expect(
				buildHierarchyAttributes({
					folderId: '77',
					workspaceId: '88',
					position: { objectId: '99', objectType: 'Board', isAfter: true },
				}),
			).toEqual({
				folder_id: '77',
				workspace_id: '88',
				position: { object_id: '99', object_type: 'Board', is_after: true },
			});
		});

		it('omits everything unset', () => {
			expect(buildHierarchyAttributes({})).toEqual({});
		});

		it('keeps is_after false for before-placement', () => {
			const attributes = buildHierarchyAttributes({
				position: { objectId: '5', objectType: 'Folder', isAfter: false },
			});
			expect(attributes.position).toEqual({
				object_id: '5',
				object_type: 'Folder',
				is_after: false,
			});
		});
	});

	describe('mapLeftPaneBoardRow', () => {
		it('maps a real board', () => {
			expect(
				mapLeftPaneBoardRow({
					id: '1',
					name: 'Roadmap',
					type: 'board',
					board_folder_id: '20',
					url: 'https://acme.monday.com/boards/1',
					workspace: { id: '9' },
				}),
			).toEqual({
				objectType: 'board',
				id: '1',
				name: 'Roadmap',
				folderId: '20',
				workspaceId: '9',
				url: 'https://acme.monday.com/boards/1',
			});
		});

		it('maps docs and custom objects to their own object types', () => {
			expect(mapLeftPaneBoardRow({ id: '2', name: 'Spec', type: 'document' })?.objectType).toBe(
				'doc',
			);
			expect(
				mapLeftPaneBoardRow({ id: '3', name: 'Flow', type: 'custom_object' })?.objectType,
			).toBe('customObject');
		});

		it('drops subitem boards — they never appear in the left pane', () => {
			expect(mapLeftPaneBoardRow({ id: '4', name: 'Subitems of X', type: 'sub_items_board' })).toBeNull();
		});

		it('normalizes an empty folder to null and omits a missing url', () => {
			const row = mapLeftPaneBoardRow({ id: '5', name: 'B', type: 'board', board_folder_id: null });
			expect(row?.folderId).toBeNull();
			expect(row && 'url' in row).toBe(false);
		});
	});

	describe('mapLeftPaneFolderRow', () => {
		it('maps parent to folderId', () => {
			expect(
				mapLeftPaneFolderRow({ id: '10', name: 'Sub', parent: { id: '11' }, workspace: { id: '9' } }),
			).toEqual({ objectType: 'folder', id: '10', name: 'Sub', folderId: '11', workspaceId: '9' });
		});

		it('root folders get folderId null', () => {
			expect(mapLeftPaneFolderRow({ id: '12', name: 'Root', parent: null }).folderId).toBeNull();
		});
	});

	const folder = (id: string, name: string, parentId: string | null): WorkspaceObjectRow => ({
		objectType: 'folder',
		id,
		name,
		folderId: parentId,
		workspaceId: '9',
	});
	const board = (id: string, name: string, folderId: string | null): WorkspaceObjectRow => ({
		objectType: 'board',
		id,
		name,
		folderId,
		workspaceId: '9',
	});

	describe('buildWorkspaceObjectRows', () => {
		it('lists folders first, each group sorted by name', () => {
			const rows = buildWorkspaceObjectRows(
				[folder('1', 'Zeta', null), folder('2', 'Alpha', null)],
				[board('3', 'Boards Z', null), board('4', 'Boards A', '1')],
				[],
			);
			expect(rows.map((row) => row.name)).toEqual(['Alpha', 'Zeta', 'Boards A', 'Boards Z']);
		});

		it('applies the object-type filter', () => {
			const rows = buildWorkspaceObjectRows(
				[folder('1', 'F', null)],
				[
					board('2', 'B', null),
					{ ...board('3', 'D', null), objectType: 'doc' },
				],
				['doc'],
			);
			expect(rows.map((row) => row.id)).toEqual(['3']);
		});
	});

	describe('buildWorkspaceObjectTree', () => {
		it('nests folder contents and orders children folders-first by name', () => {
			const roots = buildWorkspaceObjectTree(
				[folder('1', 'Top', null), folder('2', 'Nested', '1')],
				[board('3', 'In Top', '1'), board('4', 'At Root', null), board('5', 'In Nested', '2')],
			);
			expect(roots.map((node) => node.id)).toEqual(['1', '4']);
			const top = roots[0];
			expect(top.children!.map((node) => node.id)).toEqual(['2', '3']);
			expect(top.children![0].children!.map((node) => node.id)).toEqual(['5']);
		});

		it('re-roots objects whose folder is missing from the row set', () => {
			const roots = buildWorkspaceObjectTree([], [board('1', 'Orphan', '404')]);
			expect(roots.map((node) => node.id)).toEqual(['1']);
		});

		it('gives every folder a children array, even when empty', () => {
			const roots = buildWorkspaceObjectTree([folder('1', 'Empty', null)], []);
			expect(roots[0].children).toEqual([]);
		});
	});

	describe('resolveDocObjectId', () => {
		const clientWith = (responses: Record<string, unknown[]>) =>
			({
				execute: vi.fn(async (query: string) => {
					if (query.includes('object_ids:')) return { docs: responses.byObject ?? [] };
					return { docs: responses.byInternal ?? [] };
				}),
			}) as unknown as MondayGraphQLClient;

		it('returns the URL object id without any lookup', async () => {
			const client = clientWith({});
			const id = await resolveDocObjectId(client, 0, {
				mode: 'url',
				value: 'https://acme.monday.com/docs/18421889097',
			});
			expect(id).toBe('18421889097');
			expect((client.execute as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
		});

		it('resolves a From List (internal) id to the object id', async () => {
			const client = clientWith({ byInternal: [{ object_id: '18421889097' }] });
			expect(await resolveDocObjectId(client, 0, { mode: 'list', value: '44442593' })).toBe(
				'18421889097',
			);
		});

		it('falls back to an object-id lookup for By ID values', async () => {
			const client = clientWith({ byObject: [{ object_id: '18421889097' }] });
			expect(await resolveDocObjectId(client, 0, { mode: 'id', value: '18421889097' })).toBe(
				'18421889097',
			);
			expect((client.execute as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
		});

		it('returns null when nothing matches', async () => {
			expect(await resolveDocObjectId(clientWith({}), 0, { mode: 'id', value: '123' })).toBeNull();
		});

		it('returns null for an empty locator', async () => {
			expect(await resolveDocObjectId(clientWith({}), 0, { mode: 'id', value: '' })).toBeNull();
		});
	});

	describe('describePositionReferenceError', () => {
		it('hints on USER_UNAUTHORIZED when a position was sent', () => {
			expect(
				describePositionReferenceError('User unauthorized to perform action', true),
			).toMatch(/Reference Object ID/);
		});

		it('stays silent without a position', () => {
			expect(describePositionReferenceError('User unauthorized to perform action', false)).toBeNull();
		});

		it('stays silent for other errors', () => {
			expect(describePositionReferenceError('The board does not exist', true)).toBeNull();
		});
	});
});
