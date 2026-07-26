/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MondayGraphQLClient } from './MondayGraphQLClient';
import {
	buildDirectoryQueryParams,
	describeDirectoryError,
	fetchAllDirectoryResources,
} from './directoryResources';

describe('directoryResources', () => {
	describe('buildDirectoryQueryParams', () => {
		it('compiles rows into contains_text rules with the match operator', () => {
			const params = buildDirectoryQueryParams(
				[
					{ attribute: 'NAME', value: 'Graham' },
					{ attribute: 'SKILLS', value: ' Figma ' },
				],
				'or',
			);

			expect(params).toEqual({
				operator: 'or',
				rules: [
					{ column_id: 'NAME', operator: 'contains_text', compare_value: 'Graham' },
					{ column_id: 'SKILLS', operator: 'contains_text', compare_value: 'Figma' },
				],
			});
		});

		it('defaults to AND and drops empty rows', () => {
			const params = buildDirectoryQueryParams(
				[
					{ attribute: 'EMAIL', value: '@monday.com' },
					{ attribute: 'LOCATION', value: '   ' },
					{ value: 'no attribute' },
				],
				'and',
			);

			expect(params).toEqual({
				operator: 'and',
				rules: [
					{ column_id: 'EMAIL', operator: 'contains_text', compare_value: '@monday.com' },
				],
			});
		});

		it('returns undefined when no usable rule remains', () => {
			expect(buildDirectoryQueryParams([], 'and')).toBeUndefined();
			expect(buildDirectoryQueryParams([{ attribute: 'NAME', value: '' }], 'and')).toBeUndefined();
		});
	});

	describe('fetchAllDirectoryResources', () => {
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

		const resource = (id: number) => ({ id: String(id), name: `resource-${id}` });
		const page = (cursor: string | null, ...ids: number[]) => ({
			data: { get_directory_resources: { cursor, resources: ids.map(resource) } },
		});

		it('returns one page and a null cursor when exhausted', async () => {
			httpMock.mockResolvedValueOnce(page(null, 1, 2));

			const { rows, nextCursor } = await fetchAllDirectoryResources({
				client,
				itemIndex: 0,
				limit: 50,
			});

			expect(rows.map((r) => r.id)).toEqual(['1', '2']);
			expect(nextCursor).toBeNull();
			expect(httpMock).toHaveBeenCalledTimes(1);
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: 50 });
		});

		it('sends query_params on the first request only — the cursor encodes the filter', async () => {
			httpMock.mockResolvedValueOnce(page('c1', 1)).mockResolvedValueOnce(page(null, 2));

			const queryParams = {
				operator: 'and',
				rules: [{ column_id: 'NAME', operator: 'contains_text', compare_value: 'an' }],
			};
			const { rows } = await fetchAllDirectoryResources({
				client,
				itemIndex: 0,
				queryParams,
				limit: 10,
			});

			expect(rows).toHaveLength(2);
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: 10, queryParams });
			// The API rejects cursor + query_params together (verified live).
			expect(httpMock.mock.calls[1][1].body.variables).toEqual({ limit: 9, cursor: 'c1' });
		});

		it('stops at the limit and returns a resumable cursor', async () => {
			httpMock.mockResolvedValueOnce(page('c1', 1, 2));

			const { rows, nextCursor } = await fetchAllDirectoryResources({
				client,
				itemIndex: 0,
				limit: 2,
			});

			expect(rows).toHaveLength(2);
			expect(nextCursor).toBe('c1');
			expect(httpMock).toHaveBeenCalledTimes(1);
			// Page size capped at the limit so the cursor stays aligned.
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: 2 });
		});

		it('requests only the remaining budget on follow-up pages', async () => {
			httpMock
				.mockResolvedValueOnce(page('c1', ...Array.from({ length: 100 }, (_, i) => i)))
				.mockResolvedValueOnce(page('c2', ...Array.from({ length: 50 }, (_, i) => 100 + i)));

			const { rows, nextCursor } = await fetchAllDirectoryResources({
				client,
				itemIndex: 0,
				limit: 150,
			});

			expect(rows).toHaveLength(150);
			expect(httpMock.mock.calls[1][1].body.variables).toEqual({ limit: 50, cursor: 'c1' });
			expect(nextCursor).toBe('c2');
		});

		it('resumes from startCursor without sending query_params', async () => {
			httpMock.mockResolvedValueOnce(page(null, 9));

			const { rows, nextCursor } = await fetchAllDirectoryResources({
				client,
				itemIndex: 0,
				queryParams: { operator: 'and', rules: [] },
				limit: 10,
				startCursor: 'resume-me',
			});

			expect(rows.map((r) => r.id)).toEqual(['9']);
			expect(nextCursor).toBeNull();
			expect(httpMock.mock.calls[0][1].body.variables).toEqual({ limit: 10, cursor: 'resume-me' });
		});

		it('returns empty when the response has no payload', async () => {
			httpMock.mockResolvedValueOnce({ data: { get_directory_resources: null } });

			const { rows, nextCursor } = await fetchAllDirectoryResources({
				client,
				itemIndex: 0,
				limit: 10,
			});

			expect(rows).toEqual([]);
			expect(nextCursor).toBeNull();
		});
	});

	describe('describeDirectoryError', () => {
		// NodeApiError stores the raw monday error object on errorResponse
		// (non-Error inputs never land on cause).
		const errorWithCode = (code: string) => ({
			errorResponse: { extensions: { code } },
		});

		it('explains the Enterprise-plan 500s from both endpoints', () => {
			expect(describeDirectoryError(errorWithCode('INTERNAL_SERVER_ERROR'))).toContain(
				'Enterprise',
			);
			expect(describeDirectoryError(errorWithCode('RESOURCE_ATTRIBUTES_UPDATE_FAILED'))).toContain(
				'Enterprise',
			);
		});

		it('explains ATTRIBUTE_NOT_FOUND as a missing directory attribute value', () => {
			const message = describeDirectoryError(errorWithCode('ATTRIBUTE_NOT_FOUND'));
			expect(message).toContain('Resource Directory');
			expect(message).toContain('existing attribute values');
		});

		it('reads the legacy top-level error_code format too', () => {
			expect(
				describeDirectoryError({ errorResponse: { error_code: 'ATTRIBUTE_NOT_FOUND' } }),
			).toContain('attribute');
		});

		it('falls back to cause for wrapped Error-shaped inputs', () => {
			expect(
				describeDirectoryError({ cause: { extensions: { code: 'ATTRIBUTE_NOT_FOUND' } } }),
			).toContain('attribute');
		});

		it('returns null for unrelated errors', () => {
			expect(describeDirectoryError(errorWithCode('ComplexityException'))).toBeNull();
			expect(describeDirectoryError(new Error('boom'))).toBeNull();
			expect(describeDirectoryError(undefined)).toBeNull();
		});
	});
});
