/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MondayGraphQLClient, parseRateLimitHeader } from './MondayGraphQLClient';
import { getApiVersions } from './versionOptions';
import { MONDAY_API_VERSION } from './constants';

describe('parseRateLimitHeader', () => {
	it('parses the live RateLimit header shape (verified 2026-07)', () => {
		const parsed = parseRateLimitHeader(
			'"minuteRate";r=4999, "concurrency";r=249, "complexityMinute";r=4950000;t=45',
		);

		expect(parsed).toEqual({
			minuteRate: { remaining: 4999 },
			concurrency: { remaining: 249 },
			complexityMinute: { remaining: 4950000, resetSeconds: 45 },
		});
	});

	it('parses the live RateLimit-Policy header shape (verified 2026-07)', () => {
		const parsed = parseRateLimitHeader(
			'"minuteRate";q=5000;w=60, "concurrency";q=250;qu="concurrent-requests", "complexityMinute";q=5000000;w=60;qu="content-bytes"',
		);

		expect(parsed).toEqual({
			minuteRate: { limit: 5000, windowSeconds: 60 },
			concurrency: { limit: 250, unit: 'concurrent-requests' },
			complexityMinute: { limit: 5000000, windowSeconds: 60, unit: 'content-bytes' },
		});
	});

	it('returns undefined for a missing header', () => {
		expect(parseRateLimitHeader(undefined)).toBeUndefined();
	});
});

describe('executeWithInfo', () => {
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

	const fullResponse = {
		body: {
			data: { me: { id: '1' } },
			extensions: { request_id: 'req-from-body' },
		},
		statusCode: 200,
		headers: {
			'x-request-id': 'req-from-header',
			'api-version': '2025-10',
			ratelimit: '"minuteRate";r=4999',
			'ratelimit-policy': '"minuteRate";q=5000;w=60',
		},
	};

	it('requests the full response and returns parsed request info', async () => {
		httpMock.mockResolvedValue(fullResponse);

		const { data, requestInfo } = await client.executeWithInfo('{ me { id } }', 0);

		expect(httpMock.mock.calls[0][1].returnFullResponse).toBe(true);
		expect(data).toEqual({ me: { id: '1' } });
		expect(requestInfo.statusCode).toBe(200);
		expect(requestInfo.apiVersion).toBe('2025-10');
		// Body extensions.request_id wins over the header (same value in practice).
		expect(requestInfo.requestId).toBe('req-from-body');
		expect(requestInfo.rateLimit).toEqual({ minuteRate: { remaining: 4999 } });
		expect(requestInfo.rateLimitPolicy).toEqual({ minuteRate: { limit: 5000, windowSeconds: 60 } });
	});

	it('falls back to the x-request-id header when the body has no request_id', async () => {
		httpMock.mockResolvedValue({
			...fullResponse,
			body: { data: { me: { id: '1' } } },
		});

		const { requestInfo } = await client.executeWithInfo('{ me { id } }', 0);

		expect(requestInfo.requestId).toBe('req-from-header');
	});

	it('sends the API version override header', async () => {
		httpMock.mockResolvedValue(fullResponse);

		await client.executeWithInfo('{ me { id } }', 0, undefined, { apiVersion: '2026-10' });

		expect(httpMock.mock.calls[0][1].headers['API-Version']).toBe('2026-10');
	});

	it('defaults to the pinned version when no override is given', async () => {
		httpMock.mockResolvedValue(fullResponse);

		await client.executeWithInfo('{ me { id } }', 0);

		expect(httpMock.mock.calls[0][1].headers['API-Version']).toBe(MONDAY_API_VERSION);
	});

	it('plain execute() does not request the full response (mocks/back-compat)', async () => {
		httpMock.mockResolvedValue({ data: { me: { id: '1' } } });

		await client.execute('{ me { id } }', 0);

		expect(httpMock.mock.calls[0][1].returnFullResponse).toBe(false);
	});
});

describe('error trace (request ID + status code)', () => {
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

	it('includes request ID and status code on GraphQL-level errors (live body shape)', async () => {
		// Real error body shape verified live 2026-07-14.
		httpMock.mockResolvedValue({
			errors: [
				{
					message: 'The board does not exist. Please check your board ID and try again',
					extensions: {
						code: 'InvalidBoardIdException',
						status_code: 200,
						error_data: { board_id: 1 },
					},
				},
			],
			data: { create_item: null },
			extensions: { request_id: '8c311702-3086-9b2d-83f0-bf9e685abc51' },
		});

		try {
			await client.execute('mutation { create_item(board_id: 1, item_name: "x") { id } }', 0);
			expect.fail('Should have thrown');
		} catch (error) {
			const description = (error as any).description as string;
			expect(description).toContain('Request ID: 8c311702-3086-9b2d-83f0-bf9e685abc51');
			expect(description).toContain('HTTP status: 200');
		}
	});

	it('includes request ID and status code on HTTP-level errors', async () => {
		const httpError = Object.assign(new Error('401 - Unauthorized'), {
			statusCode: 401,
			response: { headers: { 'x-request-id': 'req-http-401' } },
		});
		httpMock.mockRejectedValue(httpError);

		try {
			await client.execute('{ me { id } }', 0);
			expect.fail('Should have thrown');
		} catch (error) {
			const description = (error as any).description as string;
			expect(description).toContain('Request ID: req-http-401');
			expect(description).toContain('HTTP status: 401');
		}
	});

	it('omits the request ID cleanly when the response never had one (network error)', async () => {
		httpMock.mockRejectedValue(new Error('socket hang up'));

		try {
			await client.execute('{ me { id } }', 0, undefined, 0);
			expect.fail('Should have thrown');
		} catch (error) {
			const description = (error as any).description as string;
			expect(description).toContain('socket hang up');
			expect(description).not.toContain('Request ID');
		}
	});
});

describe('getApiVersions', () => {
	let mockContext: any;
	let httpMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		httpMock = vi.fn();
		mockContext = {
			getNode: vi.fn(() => ({ name: 'test-node' })),
			helpers: { httpRequestWithAuthentication: httpMock },
		};
	});

	it('lists versions newest-first, labeled "version — lifecycle", excluding dev', async () => {
		httpMock.mockResolvedValue({
			data: {
				versions: [
					{ kind: 'maintenance', value: '2026-04', display_name: 'Maintenance' },
					{ kind: 'current', value: '2026-07', display_name: 'Current' },
					{ kind: 'release_candidate', value: '2027-01', display_name: 'Release Candidate' },
					{ kind: 'dev', value: 'dev', display_name: 'Development' },
				],
			},
		});

		const options = await getApiVersions.call(mockContext);

		expect(options).toEqual([
			{ name: '2027-01 — Release Candidate', value: '2027-01' },
			{ name: '2026-07 — Current', value: '2026-07' },
			{ name: '2026-04 — Maintenance', value: '2026-04' },
		]);
	});
});
