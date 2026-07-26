/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
	buildTextBlockContent,
	DOC_BLOCK_TYPE_OPTIONS,
	DOC_URL_REGEX,
	docResourceLocator,
	formatDocLabel,
	normalizeBlockContentJson,
	parseJsonField,
	resolveDocId,
	searchDocs,
	TEXT_DELTA_BLOCK_TYPES,
	EMPTY_CONTENT_BLOCK_TYPES,
} from './docs';
import { MondayGraphQLClient } from './MondayGraphQLClient';

describe('DOC_URL_REGEX', () => {
	const regex = new RegExp(DOC_URL_REGEX);

	it.each([
		['https://acme.monday.com/docs/18422738203', '18422738203'],
		['http://sub-domain.monday.com/docs/42', '42'],
	])('extracts the object ID from %s', (url, expected) => {
		expect(url.match(regex)?.[1]).toBe(expected);
	});

	it.each([
		'https://acme.monday.com/boards/123',
		'https://example.com/docs/123',
		'not a url',
	])('does not match %s', (url) => {
		expect(url.match(regex)).toBeNull();
	});
});

describe('docResourceLocator', () => {
	it('offers the three required modes', () => {
		const modeNames = docResourceLocator.modes?.map((m) => m.name);
		expect(modeNames).toEqual(['list', 'id', 'url']);
	});

	it('uses the searchDocs listSearch method with search enabled', () => {
		const listMode = docResourceLocator.modes?.find((m) => m.name === 'list');
		expect(listMode?.typeOptions?.searchListMethod).toBe('searchDocs');
		expect(listMode?.typeOptions?.searchable).toBe(true);
	});
});

describe('formatDocLabel', () => {
	it('appends the workspace name when present', () => {
		expect(formatDocLabel({ name: 'Spec', workspace: { name: 'Product' } })).toBe(
			'Spec (Product)',
		);
	});

	it('returns the bare name without a workspace', () => {
		expect(formatDocLabel({ name: 'Spec' })).toBe('Spec');
		expect(formatDocLabel({ name: 'Spec', workspace: null })).toBe('Spec');
	});
});

describe('searchDocs', () => {
	let mockContext: any;

	const doc = (id: number, name: string) => ({
		id: String(id),
		object_id: String(id + 1000),
		name,
		url: `https://acme.monday.com/docs/${id + 1000}`,
		workspace: { name: 'Main' },
	});

	beforeEach(() => {
		mockContext = {
			getNode: vi.fn(() => ({ name: 'test-node' })),
			helpers: { httpRequestWithAuthentication: vi.fn() },
		};
	});

	it('maps docs to name/value/url using the INTERNAL id as the value', async () => {
		mockContext.helpers.httpRequestWithAuthentication.mockResolvedValue({
			data: { docs: [doc(1, 'Spec'), doc(2, 'Notes')] },
		});

		const result = await searchDocs.call(mockContext);

		expect(result.results).toEqual([
			{ name: 'Spec (Main)', value: '1', url: 'https://acme.monday.com/docs/1001' },
			{ name: 'Notes (Main)', value: '2', url: 'https://acme.monday.com/docs/1002' },
		]);
		expect(result.paginationToken).toBeUndefined();
	});

	it('signals another page when the page is full', async () => {
		mockContext.helpers.httpRequestWithAuthentication.mockResolvedValue({
			data: { docs: Array.from({ length: 50 }, (_, i) => doc(i, `Doc ${i}`)) },
		});

		const result = await searchDocs.call(mockContext);
		expect(result.paginationToken).toBe('2');
	});
});

describe('searchDocs — search API path (filter typed)', () => {
	let mockContext: any;

	// Search-result rows carry TWO id spaces: top-level id = OBJECT id,
	// live_data.id = INTERNAL docId (the value the picker must emit).
	const searchResult = (objectId: number, live: { id: number; name: string } | null) => ({
		id: String(objectId),
		indexed_data: { name: live?.name ?? `Indexed ${objectId}` },
		live_data: live
			? {
					id: String(live.id),
					name: live.name,
					url: `https://acme.monday.com/docs/${objectId}`,
					workspace: { name: 'Main' },
				}
			: null,
	});

	const mockSearchResponse = (results: unknown[]) => {
		mockContext.helpers.httpRequestWithAuthentication.mockResolvedValue({
			data: { search: { docs: { results } } },
		});
	};

	beforeEach(() => {
		mockContext = {
			getNode: vi.fn(() => ({ name: 'test-node' })),
			helpers: { httpRequestWithAuthentication: vi.fn() },
		};
	});

	it('sends one search.docs request with the filter and the max limit of 20', async () => {
		mockSearchResponse([]);

		await searchDocs.call(mockContext, 'spec');

		const call = mockContext.helpers.httpRequestWithAuthentication.mock.calls[0][1];
		expect(call.body.query).toContain('search {');
		expect(call.body.query).toContain('docs(query: $q, limit: $limit)');
		expect(call.body.variables).toEqual({ q: 'spec', limit: 20 });
	});

	it('uses live_data.id (the INTERNAL docId) as the value, never the object id', async () => {
		mockSearchResponse([searchResult(18422738203, { id: 44677893, name: 'Spec' })]);

		const result = await searchDocs.call(mockContext, 'spec');

		expect(result.results).toEqual([
			{
				name: 'Spec (Main)',
				value: '44677893',
				url: 'https://acme.monday.com/docs/18422738203',
			},
		]);
	});

	it('drops rows with null live_data (their internal id is unknowable)', async () => {
		mockSearchResponse([
			searchResult(1001, { id: 1, name: 'Spec' }),
			searchResult(1002, null),
		]);

		const result = await searchDocs.call(mockContext, 'spec');

		expect(result.results.map((r: any) => r.value)).toEqual(['1']);
	});

	it('never returns a paginationToken (the search API has no pagination)', async () => {
		mockSearchResponse([searchResult(1001, { id: 1, name: 'Spec' })]);

		const result = await searchDocs.call(mockContext, 'spec', '2');

		expect(result.paginationToken).toBeUndefined();
	});

	it('treats a whitespace-only filter as browse mode', async () => {
		mockContext.helpers.httpRequestWithAuthentication.mockResolvedValue({
			data: { docs: [] },
		});

		await searchDocs.call(mockContext, '   ');

		const call = mockContext.helpers.httpRequestWithAuthentication.mock.calls[0][1];
		expect(call.body.query).not.toContain('search {');
		expect(call.body.variables).toEqual({ limit: 50, page: 1 });
	});
});

describe('resolveDocId', () => {
	let mockContext: any;
	let client: MondayGraphQLClient;

	beforeEach(() => {
		mockContext = {
			getNode: vi.fn(() => ({ name: 'test-node' })),
			helpers: { httpRequestWithAuthentication: vi.fn() },
		};
		client = new MondayGraphQLClient(mockContext);
	});

	const mockResponses = (...bodies: any[]) => {
		for (const body of bodies) {
			mockContext.helpers.httpRequestWithAuthentication.mockResolvedValueOnce(body);
		}
	};

	it('returns list-mode values as-is without an API call', async () => {
		const id = await resolveDocId(client, 0, { mode: 'list', value: '44677893' });
		expect(id).toBe('44677893');
		expect(mockContext.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('resolves URL mode via object_ids only', async () => {
		mockResponses({ data: { docs: [{ id: '44677893' }] } });

		const id = await resolveDocId(client, 0, { mode: 'url', value: '18422738203' });

		expect(id).toBe('44677893');
		const body = mockContext.helpers.httpRequestWithAuthentication.mock.calls[0][1].body;
		expect(body.query).toContain('object_ids');
		expect(body.variables.objectIds).toEqual(['18422738203']);
	});

	it('extracts the object id from a full URL string', async () => {
		mockResponses({ data: { docs: [{ id: '77' }] } });

		const id = await resolveDocId(client, 0, 'https://acme.monday.com/docs/18422738203');

		expect(id).toBe('77');
		const body = mockContext.helpers.httpRequestWithAuthentication.mock.calls[0][1].body;
		expect(body.variables.objectIds).toEqual(['18422738203']);
	});

	it('tries internal ids first in id mode, then falls back to object ids', async () => {
		mockResponses(
			{ data: { docs: [] } }, // ids: miss
			{ data: { docs: [{ id: '44677893' }] } }, // object_ids: hit
		);

		const id = await resolveDocId(client, 0, { mode: 'id', value: '18422738203' });

		expect(id).toBe('44677893');
		expect(mockContext.helpers.httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
	});

	it('short-circuits when the internal id matches', async () => {
		mockResponses({ data: { docs: [{ id: '44677893' }] } });

		const id = await resolveDocId(client, 0, { mode: 'id', value: '44677893' });

		expect(id).toBe('44677893');
		expect(mockContext.helpers.httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	});

	it('returns null when neither lookup matches', async () => {
		mockResponses({ data: { docs: [] } }, { data: { docs: [] } });

		const id = await resolveDocId(client, 0, { mode: 'id', value: '999' });
		expect(id).toBeNull();
	});

	it('returns null for an empty value without an API call', async () => {
		const id = await resolveDocId(client, 0, { mode: 'id', value: '' });
		expect(id).toBeNull();
		expect(mockContext.helpers.httpRequestWithAuthentication).not.toHaveBeenCalled();
	});
});

describe('parseJsonField', () => {
	it('parses escaped-JSON strings', () => {
		expect(parseJsonField('{"deltaFormat":[{"insert":"hi"}]}')).toEqual({
			deltaFormat: [{ insert: 'hi' }],
		});
	});

	it('passes through non-JSON strings and non-strings', () => {
		expect(parseJsonField('not json')).toBe('not json');
		expect(parseJsonField(null)).toBeNull();
		expect(parseJsonField(undefined)).toBeUndefined();
		expect(parseJsonField(42)).toBe(42);
		expect(parseJsonField('')).toBe('');
	});
});

describe('buildTextBlockContent', () => {
	it('wraps text-like types into a deltaFormat payload (JSON string)', () => {
		const content = buildTextBlockContent('normal_text', 'hello');
		expect(content).toBe(JSON.stringify({ deltaFormat: [{ insert: 'hello' }] }));
	});

	it('covers every text-delta type', () => {
		for (const type of TEXT_DELTA_BLOCK_TYPES) {
			expect(buildTextBlockContent(type, 'x')).not.toBeNull();
		}
	});

	it('returns an empty object for divider and page break', () => {
		for (const type of EMPTY_CONTENT_BLOCK_TYPES) {
			expect(buildTextBlockContent(type, 'ignored')).toBe('{}');
		}
	});

	it('returns null for structured types (caller errors out)', () => {
		for (const type of ['table', 'layout', 'image', 'video', 'notice_box']) {
			expect(buildTextBlockContent(type, 'x')).toBeNull();
		}
	});

	it('every DocBlockContentType option is classified', () => {
		for (const option of DOC_BLOCK_TYPE_OPTIONS) {
			const type = option.value as string;
			const classified =
				TEXT_DELTA_BLOCK_TYPES.has(type) ||
				EMPTY_CONTENT_BLOCK_TYPES.has(type) ||
				buildTextBlockContent(type, 'x') === null;
			expect(classified).toBe(true);
		}
	});
});

describe('normalizeBlockContentJson', () => {
	it('stringifies objects (expression-mode input)', () => {
		expect(normalizeBlockContentJson({ theme: 'tips' })).toBe('{"theme":"tips"}');
	});

	it('re-encodes valid JSON strings', () => {
		expect(normalizeBlockContentJson(' {"a": 1} ')).toBe('{"a":1}');
	});

	it('turns empty input into an empty object', () => {
		expect(normalizeBlockContentJson('')).toBe('{}');
		expect(normalizeBlockContentJson(undefined)).toBe('{}');
	});

	it('throws on invalid JSON', () => {
		expect(() => normalizeBlockContentJson('{nope')).toThrow();
	});
});
