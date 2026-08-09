/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any, n8n-nodes-base/node-param-display-name-miscased */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MondayGraphQLClient } from './MondayGraphQLClient';
import {
	AUDIT_LOGS_SERVER_PAGE_CAP,
	buildAuditLogsQuery,
	fetchAuditLogs,
	getAuditEventsList,
} from './auditLogs';

describe('auditLogs', () => {
	describe('buildAuditLogsQuery', () => {
		it('always sends limit and page, and only the filters that are set', () => {
			const { query, variables } = buildAuditLogsQuery({});

			expect(query).toContain('audit_logs(limit: $limit, page: $page)');
			expect(query).toContain('activity_metadata');
			expect(query).toContain('user { id name email }');
			expect(query).not.toContain('user_id');
			expect(query).not.toContain('events:');
			expect(query).not.toContain('ip_address:');
			expect(query).not.toContain('start_time');
			expect(query).not.toContain('end_time');
			expect(variables).toEqual({});
		});

		it('compiles every filter into the matching argument', () => {
			const { query, variables } = buildAuditLogsQuery({
				userId: '123',
				events: ['login', 'logout'],
				ipAddress: '192.0.2.10',
				startTime: '2026-07-01T00:00:00Z',
				endTime: '2026-07-19T00:00:00Z',
			});

			expect(query).toContain('user_id: $userId');
			expect(query).toContain('events: $events');
			expect(query).toContain('ip_address: $ipAddress');
			expect(query).toContain('start_time: $startTime');
			expect(query).toContain('end_time: $endTime');
			expect(variables).toEqual({
				userId: '123',
				events: ['login', 'logout'],
				ipAddress: '192.0.2.10',
				startTime: '2026-07-01T00:00:00Z',
				endTime: '2026-07-19T00:00:00Z',
			});
		});

		it('treats an empty events array as no filter', () => {
			const { query } = buildAuditLogsQuery({ events: [] });
			expect(query).not.toContain('events:');
		});
	});

	describe('fetchAuditLogs', () => {
		let httpMock: ReturnType<typeof vi.fn>;
		let client: MondayGraphQLClient;

		beforeEach(() => {
			httpMock = vi.fn();
			const mockContext: any = {
				getNode: vi.fn(() => ({ name: 'test-node' })),
				helpers: { httpRequestWithAuthentication: httpMock },
			};
			client = new MondayGraphQLClient(mockContext, 'mondayApi', undefined, 1);
		});

		const log = (row: number) => ({ event: `event-${row}`, timestamp: `t-${row}` });
		const pageOf = (start: number, count: number) => ({
			data: {
				audit_logs: {
					logs: Array.from({ length: count }, (_, i) => log(start + i)),
					pagination: { has_more_pages: true },
				},
			},
		});

		it('passes limit and page through untouched at or under the server cap', async () => {
			httpMock.mockResolvedValueOnce(pageOf(0, 50));

			const rows = await fetchAuditLogs({
				client,
				itemIndex: 0,
				filters: { events: ['login'] },
				limit: 50,
				page: 3,
			});

			expect(rows).toHaveLength(50);
			expect(httpMock).toHaveBeenCalledTimes(1);
			// The client calls httpRequestWithAuthentication.call(ctx, credName, opts),
			// so the mock sees (credName, opts).
			const body = httpMock.mock.calls[0][1].body;
			expect(body.variables).toEqual({ events: ['login'], limit: 50, page: 3 });
		});

		it('tiles cap-sized server pages for a limit above the cap', async () => {
			// limit 500, page 1 → rows 0..499 → server pages 1..3 (200 each).
			httpMock
				.mockResolvedValueOnce(pageOf(0, AUDIT_LOGS_SERVER_PAGE_CAP))
				.mockResolvedValueOnce(pageOf(200, AUDIT_LOGS_SERVER_PAGE_CAP))
				.mockResolvedValueOnce(pageOf(400, AUDIT_LOGS_SERVER_PAGE_CAP));

			const rows = await fetchAuditLogs({
				client,
				itemIndex: 0,
				filters: {},
				limit: 500,
				page: 1,
			});

			expect(rows).toHaveLength(500);
			expect(rows[0]).toEqual(log(0));
			expect(rows[499]).toEqual(log(499));
			expect(httpMock).toHaveBeenCalledTimes(3);
			for (const [index, call] of httpMock.mock.calls.entries()) {
				expect(call[1].body.variables).toEqual({
					limit: AUDIT_LOGS_SERVER_PAGE_CAP,
					page: index + 1,
				});
			}
		});

		it('offsets server pages and slices for a later user-facing page', async () => {
			// limit 500, page 2 → rows 500..999 → server pages 3..5, slice from 100.
			httpMock
				.mockResolvedValueOnce(pageOf(400, AUDIT_LOGS_SERVER_PAGE_CAP))
				.mockResolvedValueOnce(pageOf(600, AUDIT_LOGS_SERVER_PAGE_CAP))
				.mockResolvedValueOnce(pageOf(800, AUDIT_LOGS_SERVER_PAGE_CAP));

			const rows = await fetchAuditLogs({
				client,
				itemIndex: 0,
				filters: {},
				limit: 500,
				page: 2,
			});

			expect(rows).toHaveLength(500);
			expect(rows[0]).toEqual(log(500));
			expect(rows[499]).toEqual(log(999));
			expect(httpMock.mock.calls.map((call) => call[1].body.variables.page)).toEqual([3, 4, 5]);
		});

		it('stops early and returns the partial window when the log is exhausted', async () => {
			httpMock
				.mockResolvedValueOnce(pageOf(0, AUDIT_LOGS_SERVER_PAGE_CAP))
				.mockResolvedValueOnce(pageOf(200, 30));

			const rows = await fetchAuditLogs({
				client,
				itemIndex: 0,
				filters: {},
				limit: 1000,
				page: 1,
			});

			expect(rows).toHaveLength(230);
			expect(httpMock).toHaveBeenCalledTimes(2);
		});

		it('returns [] when audit_logs comes back null (feature unavailable)', async () => {
			httpMock.mockResolvedValueOnce({ data: { audit_logs: null } });

			const rows = await fetchAuditLogs({
				client,
				itemIndex: 0,
				filters: {},
				limit: 50,
				page: 1,
			});

			expect(rows).toEqual([]);
		});
	});

	describe('getAuditEventsList', () => {
		it('maps and sorts the catalogue, dropping nameless entries', async () => {
			const httpMock = vi.fn().mockResolvedValueOnce({
				data: {
					audit_event_catalogue: [
						{ name: 'logout', description: 'User logged out' },
						{ name: 'login', description: 'User logged in' },
						{ description: 'no name' },
					],
				},
			});
			const mockContext: any = {
				getNode: vi.fn(() => ({ name: 'test-node' })),
				helpers: { httpRequestWithAuthentication: httpMock },
			};

			const options = await getAuditEventsList.call(mockContext);

			expect(options).toEqual([
				{ name: 'login', value: 'login', description: 'User logged in' },
				{ name: 'logout', value: 'logout', description: 'User logged out' },
			]);
		});
	});
});
