/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import { describe, expect, it } from 'vitest';

import {
	ARTICLE_BLOCK_FIELDS,
	ARTICLE_METADATA_FIELDS,
	buildPublishArticleVariables,
	describeArticleError,
	KB_SNIPPET_FIELDS,
} from './articles';

describe('ARTICLE_METADATA_FIELDS', () => {
	it('selects the full introspected ArticleMetadata surface', () => {
		for (const field of [
			'object_id',
			'draft_article_id',
			'published_article_id',
			'name',
			'privacy_kind',
			'workspace_id',
			'folder_id',
			'state',
			'updated_at',
			'creator',
		]) {
			expect(ARTICLE_METADATA_FIELDS).toContain(field);
		}
		// owners/subscribers are User arrays and need a sub-selection.
		expect(ARTICLE_METADATA_FIELDS).toMatch(/owners \{ id name \}/);
		expect(ARTICLE_METADATA_FIELDS).toMatch(/subscribers \{ id name \}/);
	});

	it('does NOT select creator as an object — it is an ID scalar in the live schema', () => {
		expect(ARTICLE_METADATA_FIELDS).not.toMatch(/creator \{/);
	});
});

describe('ARTICLE_BLOCK_FIELDS', () => {
	it('selects the full introspected ArticleBlock surface', () => {
		for (const field of [
			'id',
			'type',
			'content',
			'position',
			'parent_block_id',
			'published_article_id',
			'created_at',
			'updated_at',
		]) {
			expect(ARTICLE_BLOCK_FIELDS).toContain(field);
		}
		expect(ARTICLE_BLOCK_FIELDS).toMatch(/created_by \{ id name \}/);
	});
});

describe('KB_SNIPPET_FIELDS', () => {
	it('selects the full SnippetSearchResult surface', () => {
		for (const field of [
			'id',
			'title',
			'text',
			'parent_id',
			'created_at',
			'updated_at',
			'distance',
			'url',
		]) {
			expect(KB_SNIPPET_FIELDS).toContain(field);
		}
	});
});

describe('buildPublishArticleVariables', () => {
	it('always carries objectId and privacyKind', () => {
		expect(
			buildPublishArticleVariables({
				objectId: '123',
				privacyKind: 'PUBLIC',
				addSubscribers: [],
				removeSubscribers: [],
			}),
		).toEqual({ objectId: '123', privacyKind: 'PUBLIC' });
	});

	it('omits empty folder and subscriber arguments entirely', () => {
		const variables = buildPublishArticleVariables({
			objectId: '123',
			privacyKind: 'PUBLIC',
			folderId: '   ',
			addSubscribers: [],
			removeSubscribers: [],
		});
		expect(variables).not.toHaveProperty('folderId');
		expect(variables).not.toHaveProperty('addSubscriberIds');
		expect(variables).not.toHaveProperty('addSubscriberTeamIds');
		expect(variables).not.toHaveProperty('removeSubscriberIds');
		expect(variables).not.toHaveProperty('removeSubscriberTeamIds');
	});

	it('splits combined user/team selections into the separate API arguments', () => {
		const variables = buildPublishArticleVariables({
			objectId: '9',
			privacyKind: 'PRIVATE',
			folderId: '555',
			addSubscribers: ['user:11', 'team:22', 'user:33'],
			removeSubscribers: ['team:44'],
		});
		expect(variables).toEqual({
			objectId: '9',
			privacyKind: 'PRIVATE',
			folderId: '555',
			addSubscriberIds: ['11', '33'],
			addSubscriberTeamIds: ['22'],
			removeSubscriberTeamIds: ['44'],
		});
	});

	it('treats bare IDs from expression mode as user IDs', () => {
		const variables = buildPublishArticleVariables({
			objectId: '9',
			privacyKind: 'PRIVATE',
			addSubscribers: ['77'],
			removeSubscribers: [],
		});
		expect(variables.addSubscriberIds).toEqual(['77']);
		expect(variables).not.toHaveProperty('addSubscriberTeamIds');
	});
});

describe('describeArticleError', () => {
	const featureError = (code: string) => ({ errorResponse: { extensions: { code } } });

	it('maps the raw 500 to a Knowledge Base availability explanation', () => {
		const friendly = describeArticleError(featureError('INTERNAL_SERVER_ERROR'));
		expect(friendly).toContain('Knowledge Base');
		expect(friendly).toContain('not set up');
	});

	it('reads the code from cause as a fallback', () => {
		const friendly = describeArticleError({
			cause: { extensions: { code: 'INTERNAL_SERVER_ERROR' } },
		});
		expect(friendly).not.toBeNull();
	});

	it('supports the legacy top-level error_code format', () => {
		expect(describeArticleError({ errorResponse: { error_code: 'INTERNAL_SERVER_ERROR' } })).not.toBeNull();
	});

	it('returns null for unrelated errors so the mapped NodeApiError propagates', () => {
		expect(describeArticleError(featureError('InvalidBoardIdException'))).toBeNull();
		expect(describeArticleError(new Error('boom'))).toBeNull();
		expect(describeArticleError(undefined)).toBeNull();
	});
});
