/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MondayGraphQLClient } from './MondayGraphQLClient';
import {
	buildMeetingFieldSelection,
	buildMeetingsFilters,
	fetchAllMeetings,
	MEETINGS_PAGE_SIZE,
	searchMeetings,
} from './notetaker';

function makeClient() {
	const httpMock = vi.fn();
	const mockContext: any = {
		getNode: vi.fn(() => ({ name: 'test-node' })),
		helpers: { httpRequestWithAuthentication: httpMock },
	};
	return { httpMock, client: new MondayGraphQLClient(mockContext, 'mondayApi', undefined, 1), mockContext };
}

const meeting = (id: number) => ({ id: String(id), title: `meeting-${id}` });
const page = (cursor: string | null, ...ids: number[]) => ({
	data: {
		notetaker: {
			meetings: {
				meetings: ids.map(meeting),
				page_info: { has_next_page: cursor !== null, cursor },
			},
		},
	},
});

describe('notetaker', () => {
	describe('buildMeetingFieldSelection', () => {
		it('always includes the base fields', () => {
			const selection = buildMeetingFieldSelection({});
			expect(selection).toContain('id');
			expect(selection).toContain('recording_duration');
			expect(selection).toContain('summary');
			expect(selection).toContain('participants { email }');
			expect(selection).not.toContain('topics');
			expect(selection).not.toContain('action_items');
			expect(selection).not.toContain('transcript');
		});

		it('adds only the opted-in nested collections', () => {
			const selection = buildMeetingFieldSelection({
				topics: true,
				actionItems: true,
				transcript: true,
			});
			expect(selection).toContain('topics { title talking_points { content } }');
			expect(selection).toContain('action_items { id content is_completed owner due_date }');
			expect(selection).toContain('transcript { text start_time end_time speaker language }');
		});

		it('talking points select content only — the API has no start_time there', () => {
			const selection = buildMeetingFieldSelection({ topics: true });
			expect(selection).not.toContain('talking_points { content start_time }');
		});
	});

	describe('buildMeetingsFilters', () => {
		it('compiles ids, search, and access', () => {
			expect(
				buildMeetingsFilters({ ids: ['1', '2'], search: ' demo ', access: 'ALL' }),
			).toEqual({ ids: ['1', '2'], search: 'demo', access: 'ALL' });
		});

		it('drops empty parts', () => {
			expect(buildMeetingsFilters({ ids: [], search: '   ', access: 'OWN' })).toEqual({
				access: 'OWN',
			});
		});

		it('returns undefined when nothing is set so the API default applies', () => {
			expect(buildMeetingsFilters({})).toBeUndefined();
			expect(buildMeetingsFilters({ ids: [], search: '' })).toBeUndefined();
		});
	});

	describe('fetchAllMeetings', () => {
		let httpMock: ReturnType<typeof vi.fn>;
		let client: MondayGraphQLClient;

		beforeEach(() => {
			({ httpMock, client } = makeClient());
		});

		it('returns one page and a null cursor when exhausted', async () => {
			httpMock.mockResolvedValueOnce(page(null, 1, 2));

			const { rows, nextCursor } = await fetchAllMeetings({
				client,
				itemIndex: 0,
				fieldSelection: 'id title',
				limit: 50,
			});

			expect(rows.map((r) => r.id)).toEqual(['1', '2']);
			expect(nextCursor).toBeNull();
			expect(httpMock).toHaveBeenCalledTimes(1);
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: 50 });
		});

		it('sends filters on the first request only — the cursor encodes the query', async () => {
			httpMock.mockResolvedValueOnce(page('c1', 1)).mockResolvedValueOnce(page(null, 2));

			const filters = { search: 'kickoff', access: 'ALL' };
			const { rows } = await fetchAllMeetings({
				client,
				itemIndex: 0,
				filters,
				fieldSelection: 'id title',
				limit: 10,
			});

			expect(rows).toHaveLength(2);
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: 10, filters });
			expect(httpMock.mock.calls[1][1].body.variables).toEqual({ limit: 9, cursor: 'c1' });
		});

		it('caps every request at the API page maximum of 100', async () => {
			httpMock
				.mockResolvedValueOnce(page('c1', ...Array.from({ length: 100 }, (_, i) => i)))
				.mockResolvedValueOnce(page(null, ...Array.from({ length: 20 }, (_, i) => 100 + i)));

			const { rows } = await fetchAllMeetings({
				client,
				itemIndex: 0,
				fieldSelection: 'id',
				limit: 120,
			});

			expect(rows).toHaveLength(120);
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: MEETINGS_PAGE_SIZE });
			expect(httpMock.mock.calls[1][1].body.variables).toEqual({ limit: 20, cursor: 'c1' });
		});

		it('stops at the limit and returns a resumable cursor', async () => {
			httpMock.mockResolvedValueOnce(page('c1', 1, 2));

			const { rows, nextCursor } = await fetchAllMeetings({
				client,
				itemIndex: 0,
				fieldSelection: 'id',
				limit: 2,
			});

			expect(rows).toHaveLength(2);
			expect(nextCursor).toBe('c1');
			expect(httpMock).toHaveBeenCalledTimes(1);
		});

		it('stops when has_next_page is false even if a cursor string is present', async () => {
			httpMock.mockResolvedValueOnce({
				data: {
					notetaker: {
						meetings: {
							meetings: [meeting(1)],
							page_info: { has_next_page: false, cursor: 'stale' },
						},
					},
				},
			});

			const { rows, nextCursor } = await fetchAllMeetings({
				client,
				itemIndex: 0,
				fieldSelection: 'id',
				limit: 10,
			});

			expect(rows).toHaveLength(1);
			expect(nextCursor).toBeNull();
			expect(httpMock).toHaveBeenCalledTimes(1);
		});

		it('resumes from startCursor without sending filters', async () => {
			httpMock.mockResolvedValueOnce(page(null, 9));

			const { rows } = await fetchAllMeetings({
				client,
				itemIndex: 0,
				filters: { access: 'ALL' },
				fieldSelection: 'id',
				limit: 10,
				startCursor: 'resume-me',
			});

			expect(rows.map((r) => r.id)).toEqual(['9']);
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: 10, cursor: 'resume-me' });
		});

		it('returns empty when the response has no payload', async () => {
			httpMock.mockResolvedValueOnce({ data: { notetaker: { meetings: null } } });

			const { rows, nextCursor } = await fetchAllMeetings({
				client,
				itemIndex: 0,
				fieldSelection: 'id',
				limit: 10,
			});

			expect(rows).toEqual([]);
			expect(nextCursor).toBeNull();
		});
	});

	describe('searchMeetings', () => {
		it('sends the search text as filters with access ALL on the first page', async () => {
			const { httpMock, mockContext } = makeClient();
			httpMock.mockResolvedValueOnce({
				data: {
					notetaker: {
						meetings: {
							meetings: [
								{
									id: '7',
									title: 'Weekly Sync',
									start_time: '2026-07-13T09:00:00Z',
									meeting_link: 'https://example.monday.com/meeting/7',
								},
							],
							page_info: { has_next_page: true, cursor: 'c-next' },
						},
					},
				},
			});

			const result = await searchMeetings.call(mockContext, 'sync');

			expect(httpMock.mock.calls[0][1].body.variables).toEqual({
				limit: 50,
				filters: { search: 'sync', access: 'ALL' },
			});
			expect(result.results).toEqual([
				{
					name: 'Weekly Sync (2026-07-13)',
					value: '7',
					url: 'https://example.monday.com/meeting/7',
				},
			]);
			expect(result.paginationToken).toBe('c-next');
		});

		it('follow-up pages send the cursor only', async () => {
			const { httpMock, mockContext } = makeClient();
			httpMock.mockResolvedValueOnce(page(null, 1));

			const result = await searchMeetings.call(mockContext, 'sync', 'c-next');

			expect(httpMock.mock.calls[0][1].body.variables).toEqual({
				limit: 50,
				cursor: 'c-next',
			});
			expect(result.paginationToken).toBeUndefined();
		});
	});
});
