/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

import {
	snapshotRecentBoardIds,
	splitProjectBoards,
	waitForCreatedBoard,
	waitForProjectBoards,
	type CreatedBoardRow,
	type PollExecutor,
} from './portfolio';

const noSleep = async () => {};

const board = (
	id: string,
	name: string,
	extra: Partial<CreatedBoardRow> = {},
): CreatedBoardRow => ({
	id,
	name,
	url: `https://acme.monday.com/boards/${id}`,
	type: 'board',
	hierarchy_type: 'classic',
	...extra,
});

/** Fake client returning one boards page per call (last page repeats). */
function fakeClient(pages: CreatedBoardRow[][]): PollExecutor & { calls: any[] } {
	const calls: any[] = [];
	return {
		calls,
		execute: vi.fn(async (query: string, _itemIndex: number, variables?: any) => {
			calls.push({ query, variables });
			const page = pages[Math.min(calls.length - 1, pages.length - 1)];
			return { boards: page } as any;
		}),
	};
}

describe('snapshotRecentBoardIds', () => {
	it('collects IDs and excludes docs/subitem boards', async () => {
		const client = fakeClient([
			[
				board('1', 'a'),
				board('2', 'doc', { type: 'document' }),
				board('3', 'sub', { type: 'sub_items_board' }),
			],
		]);

		const ids = await snapshotRecentBoardIds(client, 0);

		expect([...ids]).toEqual(['1']);
		expect(client.calls[0].query).not.toContain('workspace_ids');
	});

	it('scopes the query to the workspace when one is given', async () => {
		const client = fakeClient([[]]);

		await snapshotRecentBoardIds(client, 0, '777');

		expect(client.calls[0].query).toContain('workspace_ids: $workspaceIds');
		expect(client.calls[0].variables.workspaceIds).toEqual(['777']);
	});
});

describe('waitForCreatedBoard', () => {
	it('ignores pre-existing boards with the same name and resolves the new one', async () => {
		const client = fakeClient([
			[board('old', 'My Portfolio')],
			[board('new', 'My Portfolio'), board('old', 'My Portfolio')],
		]);

		const result = await waitForCreatedBoard(client, 0, {
			name: 'My Portfolio',
			excludeIds: new Set(['old']),
			timeoutMs: 60_000,
			sleepFn: noSleep,
		});

		expect(result?.id).toBe('new');
		expect(client.execute).toHaveBeenCalledTimes(2);
	});

	it('ignores boards with a different name', async () => {
		const client = fakeClient([[board('other', 'Some Other Board')]]);

		const result = await waitForCreatedBoard(client, 0, {
			name: 'My Portfolio',
			excludeIds: new Set(),
			timeoutMs: 1,
			sleepFn: noSleep,
		});

		expect(result).toBeNull();
	});

	it('returns null once the timeout expires', async () => {
		const client = fakeClient([[]]);

		const result = await waitForCreatedBoard(client, 0, {
			name: 'My Portfolio',
			excludeIds: new Set(),
			timeoutMs: 1,
			sleepFn: noSleep,
		});

		expect(result).toBeNull();
	});
});

describe('splitProjectBoards', () => {
	it('picks the multi-level board as the project and the classic one as overview', () => {
		const overview = board('2', 'P', { item_terminology: 'project' });
		const task = board('1', 'P', { hierarchy_type: 'multi_level', item_terminology: 'task' });

		const result = splitProjectBoards([overview, task]);

		expect(result.projectBoard?.id).toBe('1');
		expect(result.overviewBoard?.id).toBe('2');
	});

	it('falls back to item_terminology "task", then to the first row', () => {
		const byTerminology = splitProjectBoards([
			board('2', 'P', { item_terminology: 'project' }),
			board('1', 'P', { item_terminology: 'task' }),
		]);
		expect(byTerminology.projectBoard?.id).toBe('1');

		const firstRow = splitProjectBoards([board('9', 'P')]);
		expect(firstRow.projectBoard?.id).toBe('9');
		expect(firstRow.overviewBoard).toBeUndefined();
	});

	it('returns empty on no matches', () => {
		expect(splitProjectBoards([])).toEqual({});
	});
});

describe('waitForProjectBoards', () => {
	const task = board('t1', 'P', { hierarchy_type: 'multi_level', item_terminology: 'task' });
	const overview = board('o1', 'P', { item_terminology: 'project' });

	it('returns as soon as both the task board and the overview companion exist', async () => {
		const client = fakeClient([[], [task], [overview, task]]);

		const result = await waitForProjectBoards(client, 0, {
			name: 'P',
			excludeIds: new Set(),
			timeoutMs: 60_000,
			sleepFn: noSleep,
		});

		expect(result.projectBoard?.id).toBe('t1');
		expect(result.overviewBoard?.id).toBe('o1');
		expect(client.execute).toHaveBeenCalledTimes(3);
	});

	it('returns the task board alone after the companion grace window expires', async () => {
		const client = fakeClient([[task]]);

		const result = await waitForProjectBoards(client, 0, {
			name: 'P',
			excludeIds: new Set(),
			timeoutMs: 60_000,
			companionGraceMs: 0,
			sleepFn: noSleep,
		});

		expect(result.projectBoard?.id).toBe('t1');
		expect(result.overviewBoard).toBeUndefined();
		expect(client.execute).toHaveBeenCalledTimes(1);
	});

	it('returns whatever matched when the timeout expires without a task board', async () => {
		const client = fakeClient([[overview]]);

		const result = await waitForProjectBoards(client, 0, {
			name: 'P',
			excludeIds: new Set(),
			timeoutMs: 1,
			sleepFn: noSleep,
		});

		// No multi-level board appeared — the classic row is still surfaced
		// as the best-guess project board (template edge cases).
		expect(result.projectBoard?.id).toBe('o1');
	});

	it('excludes pre-existing boards from both roles', async () => {
		const client = fakeClient([[task, overview]]);

		const result = await waitForProjectBoards(client, 0, {
			name: 'P',
			excludeIds: new Set(['t1', 'o1']),
			timeoutMs: 1,
			sleepFn: noSleep,
		});

		expect(result.projectBoard).toBeUndefined();
	});
});
