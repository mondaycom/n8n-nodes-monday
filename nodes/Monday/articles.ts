import { splitUserTeamIds } from './userLocator';

/**
 * Knowledge Base articles API (API >= 2026-04; the node's pinned version
 * qualifies). Queries: articles (by object IDs, published only),
 * article_blocks (paginated content blocks), knowledge_base_search
 * (AI answer + grounding snippets). Mutations: create_article (draft),
 * publish_article, delete_article.
 *
 * Live-verified quirks (2026-07-19, free account 36003074 + enterprise
 * account 20692525, every API version 2026-04..dev):
 * - On accounts WITHOUT the Knowledge Base feature provisioned, ALL article
 *   queries and mutations fail with a raw 500 INTERNAL_SERVER_ERROR — there
 *   is no clean "feature not available" error, so we map that code
 *   ourselves (same pattern as the Resource Directory module).
 * - knowledge_base_search works even on those accounts: it also grounds on
 *   monday's own support KB, not only account articles.
 * - ArticleMetadata carries more fields than the docs table shows
 *   (introspected): draft_article_id, published_article_id, updated_at,
 *   creator (an ID scalar, NOT a User object).
 * - The articles query returns PUBLISHED articles only and requires
 *   object_ids — drafts cannot be enumerated, so no article picker is
 *   possible anywhere (plain ID fields with a "from the Create output or
 *   the article URL" hint instead).
 */

/** All scalar fields of ArticleMetadata, plus owners/subscribers users. */
export const ARTICLE_METADATA_FIELDS = `
	object_id
	draft_article_id
	published_article_id
	name
	privacy_kind
	workspace_id
	folder_id
	state
	updated_at
	creator
	owners { id name }
	subscribers { id name }
`;

/** All fields of ArticleBlock. content is a raw JSON scalar. */
export const ARTICLE_BLOCK_FIELDS = `
	id
	type
	content
	position
	parent_block_id
	published_article_id
	created_at
	updated_at
	created_by { id name }
`;

/** All fields of SnippetSearchResult (knowledge_base_search grounding). */
export const KB_SNIPPET_FIELDS = `
	id
	title
	text
	parent_id
	created_at
	updated_at
	distance
	url
`;

export interface PublishArticleInput {
	objectId: string;
	/** PUBLIC | PRIVATE */
	privacyKind: string;
	folderId?: string;
	/** Combined users+teams picker values (`user:<id>` / `team:<id>`). */
	addSubscribers: string[];
	removeSubscribers: string[];
}

/**
 * Compiles the Publish inputs into publish_article variables. The combined
 * users+teams selections are split into the API's separate user and team ID
 * arguments; empty lists and an empty folder are omitted entirely so the
 * API defaults stay in effect.
 */
export function buildPublishArticleVariables(input: PublishArticleInput): Record<string, unknown> {
	const variables: Record<string, unknown> = {
		objectId: input.objectId,
		privacyKind: input.privacyKind,
	};
	if (input.folderId?.trim()) variables.folderId = input.folderId.trim();

	const add = splitUserTeamIds(input.addSubscribers);
	const remove = splitUserTeamIds(input.removeSubscribers);
	if (add.userIds.length > 0) variables.addSubscriberIds = add.userIds;
	if (add.teamIds.length > 0) variables.addSubscriberTeamIds = add.teamIds;
	if (remove.userIds.length > 0) variables.removeSubscriberIds = remove.userIds;
	if (remove.teamIds.length > 0) variables.removeSubscriberTeamIds = remove.teamIds;
	return variables;
}

/**
 * Friendlier description for Knowledge Base failures, or null when the
 * error isn't one this module knows how to explain. Article endpoints
 * return a bare 500 INTERNAL_SERVER_ERROR on accounts where the Knowledge
 * Base feature is not provisioned (verified live on free AND Enterprise
 * accounts, 2026-07-19). NodeApiError stores a non-Error input on
 * `errorResponse` (`cause` is only used for real Error instances) — check
 * both to stay robust.
 */
export function describeArticleError(error: unknown): string | null {
	interface RawMondayError {
		extensions?: { code?: string };
		error_code?: string;
	}
	const candidate = error as { errorResponse?: RawMondayError; cause?: RawMondayError };
	const raw = candidate?.errorResponse ?? candidate?.cause;
	const code = raw?.extensions?.code ?? raw?.error_code;
	if (code === 'INTERNAL_SERVER_ERROR') {
		return (
			'monday.com could not serve this Knowledge Base request. This usually means the Knowledge Base feature is not set up on the account \u2014 ' +
			'the article APIs report this as a generic server error. Create a knowledge base in your monday.com account first, then re-run.'
		);
	}
	return null;
}
