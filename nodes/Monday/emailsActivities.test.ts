/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any, n8n-nodes-base/node-param-display-name-miscased */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MondayGraphQLClient } from './MondayGraphQLClient';
import {
	buildTimelineItemInput,
	CUSTOM_ACTIVITY_COLOR_OPTIONS,
	CUSTOM_ACTIVITY_ICON_OPTIONS,
	fetchTimelineItems,
	getCustomActivitiesList,
} from './emailsActivities';

const NOW = '2026-07-17T12:00:00.000Z';

describe('buildTimelineItemInput', () => {
	const now = () => NOW;

	it('defaults the timestamp to now and nulls unset fields', () => {
		const { variables, error } = buildTimelineItemInput('Call summary', {}, now);

		expect(error).toBeUndefined();
		expect(variables).toEqual({
			title: 'Call summary',
			timestamp: NOW,
			summary: null,
			content: null,
			location: null,
			phone: null,
			url: null,
			timeRange: null,
		});
	});

	it('passes all fields through, using the explicit timestamp', () => {
		const { variables } = buildTimelineItemInput(
			'Meeting',
			{
				timestamp: '2026-01-01T10:00:00Z',
				summary: 'sum',
				content: 'body',
				location: 'Tel Aviv',
				phone: '+9721234567',
				url: 'https://example.com',
				timeRangeStart: '2026-01-01T09:00:00Z',
				timeRangeEnd: '2026-01-01T10:00:00Z',
			},
			now,
		);

		expect(variables).toEqual({
			title: 'Meeting',
			// Datetimes are normalized to full UTC ISO 8601 — the picker's
			// naive local format is rejected by the ISO8601DateTime scalar.
			timestamp: '2026-01-01T10:00:00.000Z',
			summary: 'sum',
			content: 'body',
			location: 'Tel Aviv',
			phone: '+9721234567',
			url: 'https://example.com',
			timeRange: {
				start_timestamp: '2026-01-01T09:00:00.000Z',
				end_timestamp: '2026-01-01T10:00:00.000Z',
			},
		});
	});

	it.each([
		['start only', { timeRangeStart: '2026-01-01T09:00:00Z' }],
		['end only', { timeRangeEnd: '2026-01-01T10:00:00Z' }],
	])('rejects a half-set time range (%s)', (_label, fields) => {
		const { error } = buildTimelineItemInput('Meeting', fields, now);
		expect(error).toContain('together');
	});

	it('rejects an empty title and over-length titles/summaries', () => {
		expect(buildTimelineItemInput('', {}, now).error).toContain('Title');
		expect(buildTimelineItemInput('x'.repeat(256), {}, now).error).toContain('Title');
		expect(buildTimelineItemInput('ok', { summary: 'x'.repeat(256) }, now).error).toContain(
			'Summary',
		);
		// 255 exactly is fine.
		expect(buildTimelineItemInput('x'.repeat(255), { summary: 'y'.repeat(255) }, now).error);
	});
});

describe('enum option lists', () => {
	it('carries the live enum values, including the misspelled UTENCILS icon', () => {
		expect(CUSTOM_ACTIVITY_COLOR_OPTIONS).toHaveLength(18);
		expect(CUSTOM_ACTIVITY_ICON_OPTIONS).toHaveLength(15);
		expect(CUSTOM_ACTIVITY_ICON_OPTIONS.map((o) => o.value)).toContain('UTENCILS');
		expect(CUSTOM_ACTIVITY_ICON_OPTIONS.map((o) => o.value)).not.toContain('UTENSILS');
	});
});

describe('timeline fetching and activity listing', () => {
	let mockContext: any;
	let client: MondayGraphQLClient;
	let httpMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		httpMock = vi.fn();
		mockContext = {
			getNode: vi.fn(() => ({ name: 'test-node' })),
			helpers: { httpRequestWithAuthentication: httpMock },
		};
		client = new MondayGraphQLClient(mockContext, 'mondayApi', undefined, 1);
	});

	const page = (ids: string[], cursor: string | null) => ({
		data: {
			timeline: {
				timeline_items_page: {
					cursor,
					timeline_items: ids.map((id) => ({ id, title: `t-${id}` })),
				},
			},
		},
	});

	describe('fetchTimelineItems', () => {
		it('returns a single page and stops when the cursor is null', async () => {
			httpMock.mockResolvedValueOnce(page(['a', 'b'], null));

			const rows = await fetchTimelineItems(client, 0, '123', { limit: 50 });

			expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
			expect(httpMock).toHaveBeenCalledTimes(1);
			expect(httpMock.mock.calls[0][1].body.variables).toMatchObject({
				id: '123',
				limit: 50,
				cursor: null,
				skip: null,
			});
		});

		it('follows the cursor and requests only the remaining budget', async () => {
			const firstPage = Array.from({ length: 100 }, (_, i) => `row-${i}`);
			httpMock
				.mockResolvedValueOnce(page(firstPage, 'CURSOR-1'))
				.mockResolvedValueOnce(page(['last'], 'CURSOR-2'));

			const rows = await fetchTimelineItems(client, 0, '123', { limit: 101 });

			expect(rows).toHaveLength(101);
			expect(httpMock).toHaveBeenCalledTimes(2);
			expect(httpMock.mock.calls[0][1].body.variables).toMatchObject({ limit: 100 });
			expect(httpMock.mock.calls[1][1].body.variables).toMatchObject({
				limit: 1,
				cursor: 'CURSOR-1',
			});
		});

		it('passes skipConnectedItems through and stops on an empty page', async () => {
			httpMock.mockResolvedValueOnce(page([], 'STALE-CURSOR'));

			const rows = await fetchTimelineItems(client, 0, '123', {
				limit: 50,
				skipConnectedItems: true,
			});

			expect(rows).toEqual([]);
			expect(httpMock).toHaveBeenCalledTimes(1);
			expect(httpMock.mock.calls[0][1].body.variables).toMatchObject({ skip: true });
		});
	});

	describe('getCustomActivitiesList', () => {
		it('lists activities sorted by name, falling back to the ID', async () => {
			httpMock.mockResolvedValueOnce({
				data: {
					custom_activity: [
						{ id: 'u2', name: 'Zoom Call' },
						{ id: 'u1', name: 'Demo' },
						{ id: 'u3', name: '' },
					],
				},
			});
			const loadContext = { ...mockContext };

			const options = await getCustomActivitiesList.call(loadContext);

			expect(options).toEqual([
				{ name: 'Activity u3', value: 'u3' },
				{ name: 'Demo', value: 'u1' },
				{ name: 'Zoom Call', value: 'u2' },
			]);
		});
	});
});
