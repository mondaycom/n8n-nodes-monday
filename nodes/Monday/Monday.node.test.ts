/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it, vi } from 'vitest';

import {
	assertRollupFunctionAllowed,
	buildPlatformAgentOutput,
	buildBoardFieldSelection,
	buildBulkArchiveOrDeleteMutation,
	buildClearColumnValuesMutation,
	buildCreateNotificationsMutation,
	buildGetItemQuery,
	buildGroupPositionArgs,
	buildMentionsList,
	buildReplacePlan,
	buildRequestInfoOutput,
	buildRunPromptConfig,
	buildSubscriberRows,
	buildSubscribersSelection,
	buildUpdateGroupMutation,
	buildUserFieldSelection,
	parsePlatformAgentHttpBody,
	resolvePlatformAgentContextId,
	fetchItemUpdateAssets,
	findEdgeGroupId,
	flattenItemColumns,
	formatActivityLogRow,
	formatColumnSchemaRow,
	formatColumnValueOutput,
	completeMoveColumnsMapping,
	getManyAssets,
	MAX_NOTIFICATION_RECIPIENTS,
	Monday,
	moveItem,
	parseGraphqlVariables,
	resolveArchiveOrDeleteAction,
	scanBoardColumnAssets,
} from './Monday.node';
import type { MondayGraphQLClient } from './MondayGraphQLClient';

function makeContext(rawValue: unknown): IExecuteFunctions {
	return {
		getNodeParameter: () => rawValue,
		getNode: () => ({ name: 'monday.com', type: 'CUSTOM.monday', typeVersion: 1 }),
	} as unknown as IExecuteFunctions;
}

describe('buildBoardFieldSelection', () => {
	it('always returns the enriched base fields', () => {
		const selection = buildBoardFieldSelection({});
		for (const field of [
			'id',
			'name',
			'state',
			'board_kind',
			'type',
			'url',
			'description',
			'items_count',
			'item_terminology',
			'created_at',
			'updated_at',
			'board_folder_id',
			'folder { id name }',
			'workspace { id name }',
		]) {
			expect(selection).toContain(field);
		}
	});

	it('keeps structure and complete-data fields out by default', () => {
		const selection = buildBoardFieldSelection({});
		expect(selection).not.toContain('groups');
		expect(selection).not.toContain('columns');
		expect(selection).not.toContain('subscribers');
		expect(selection).not.toContain('access_level');
	});

	it('adds groups, columns and owners for the single-board read', () => {
		const selection = buildBoardFieldSelection({ includeStructure: true });
		expect(selection).toContain('owners { id name email }');
		expect(selection).toContain('groups { id title color position }');
		expect(selection).toContain('columns { id title type settings_str }');
	});

	it('adds every complete-data field behind the toggle', () => {
		const selection = buildBoardFieldSelection({ includeCompleteData: true });
		for (const field of [
			'access_level',
			'permissions',
			'items_limit',
			'hierarchy_type',
			'created_from_board_id',
			'communication',
			'top_group { id title color position }',
			'subscribers { id name email }',
			'team_subscribers { id name }',
			'tags { id name color }',
			'inferred_metadata { item_type }',
			'manual_metadata { board_md }',
		]) {
			expect(selection).toContain(field);
		}
	});
});

describe('buildClearColumnValuesMutation', () => {
	it('builds one aliased change_multiple_column_values per item', () => {
		const { query, variables } = buildClearColumnValuesMutation(
			['111', '222'],
			['status', 'text_1'],
		);
		expect(query).toContain(
			'item0: change_multiple_column_values(board_id: $boardId, item_id: $item0, column_values: $columnValues)',
		);
		expect(query).toContain(
			'item1: change_multiple_column_values(board_id: $boardId, item_id: $item1, column_values: $columnValues)',
		);
		expect(query).toContain('$item0: ID!');
		expect(query).toContain('$item1: ID!');
		expect(variables.item0).toBe('111');
		expect(variables.item1).toBe('222');
	});

	it('nulls every selected column in the shared column_values payload', () => {
		const { variables } = buildClearColumnValuesMutation(['111'], ['status', 'text_1', 'date4']);
		expect(JSON.parse(variables.columnValues as string)).toEqual({
			status: null,
			text_1: null,
			date4: null,
		});
	});

	it('handles a single item without extra aliases', () => {
		const { query } = buildClearColumnValuesMutation(['111'], ['status']);
		expect(query).toContain('item0:');
		expect(query).not.toContain('item1:');
	});
});

describe('buildGetItemQuery', () => {
	it('requests all columns and no extra fields by default', () => {
		const { query, variables } = buildGetItemQuery('111', {});
		expect(query).toContain('column_values(capabilities: [CALCULATED])');
		expect(query).not.toContain('$columnIds');
		expect(query).not.toContain('creator {');
		expect(query).not.toContain('subitems {');
		expect(query).not.toContain('updates {');
		expect(variables).toEqual({ ids: ['111'] });
	});

	it('scopes column_values to the selected columns', () => {
		const { query, variables } = buildGetItemQuery('111', {
			columnIds: ['status', 'text_1'],
		});
		expect(query).toContain('$columnIds: [String!]');
		expect(query).toContain('column_values(ids: $columnIds, capabilities: [CALCULATED])');
		expect(variables).toEqual({ ids: ['111'], columnIds: ['status', 'text_1'] });
	});

	it('accepts a comma-separated string of column IDs (expression mode)', () => {
		const { variables } = buildGetItemQuery('111', { columnIds: 'status, text_1' });
		expect(variables.columnIds).toEqual(['status', 'text_1']);
	});

	it('adds the excluded metadata fields with Include All Item Info', () => {
		const { query } = buildGetItemQuery('111', { includeAllItemInfo: true });
		expect(query).toContain('creator { id name email }');
		expect(query).toContain('email');
		expect(query).toContain('relative_link');
		expect(query).toContain('subscribers { id name }');
	});

	it('keeps the subitems and updates toggles working', () => {
		const { query } = buildGetItemQuery('111', {
			includeSubitems: true,
			includeUpdates: true,
		});
		expect(query).toContain('subitems { id name state url parent_item { id name } }');
		expect(query).toContain('updates { id body created_at creator { id name } }');
	});

	it('requests the linked-value fragments (dependency/board_relation/mirror have null text)', () => {
		const { query } = buildGetItemQuery('111', {});
		expect(query).toContain('... on DependencyValue { display_value linked_item_ids }');
		expect(query).toContain('... on BoardRelationValue { display_value linked_item_ids }');
		expect(query).toContain('... on MirrorValue { display_value }');
	});
});

describe('buildGroupPositionArgs', () => {
	it('sends no positioning arguments when the option is unset (API default = top)', () => {
		expect(buildGroupPositionArgs(undefined, undefined)).toEqual({});
		expect(buildGroupPositionArgs('', '')).toEqual({});
	});

	it('maps At Top to after_at without an anchor', () => {
		expect(buildGroupPositionArgs('top', '')).toEqual({ method: 'after_at' });
	});

	it('maps At Bottom to before_at without an anchor', () => {
		expect(buildGroupPositionArgs('bottom', '')).toEqual({ method: 'before_at' });
	});

	it('maps After Group to after_at relative to the anchor', () => {
		expect(buildGroupPositionArgs('after', 'topics')).toEqual({
			method: 'after_at',
			relativeTo: 'topics',
		});
	});

	it('maps Before Group to before_at relative to the anchor', () => {
		expect(buildGroupPositionArgs('before', 'topics')).toEqual({
			method: 'before_at',
			relativeTo: 'topics',
		});
	});

	it('flags a missing anchor for the relative placements', () => {
		expect(buildGroupPositionArgs('after', '')).toBe('missing-anchor');
		expect(buildGroupPositionArgs('before', undefined)).toBe('missing-anchor');
	});
});

describe('findEdgeGroupId', () => {
	const groups = [
		{ id: 'g-top', position: '16409.0' },
		{ id: 'topics', position: '65536' },
		{ id: 'g-bottom', position: '17592186077184.0' },
	];

	it('returns the group with the highest numeric position for bottom', () => {
		expect(findEdgeGroupId(groups, 'new-group', 'bottom')).toBe('g-bottom');
	});

	it('returns the group with the lowest numeric position for top', () => {
		expect(findEdgeGroupId(groups, 'new-group', 'top')).toBe('g-top');
	});

	it('skips the excluded group', () => {
		expect(findEdgeGroupId(groups, 'g-bottom', 'bottom')).toBe('topics');
		expect(findEdgeGroupId(groups, 'g-top', 'top')).toBe('topics');
	});

	it('ignores unparseable positions and handles an empty board', () => {
		expect(findEdgeGroupId([{ id: 'weird', position: 'n/a' }], 'x', 'bottom')).toBeUndefined();
		expect(findEdgeGroupId([], 'x', 'top')).toBeUndefined();
	});
});

describe('buildUpdateGroupMutation', () => {
	it('builds one aliased update_group per attribute, in order', () => {
		const { query, variables } = buildUpdateGroupMutation([
			{ attribute: 'title', value: 'New name' },
			{ attribute: 'color', value: 'turquoise' },
			{ attribute: 'relative_position_after', value: 'group_abc' },
		]);
		expect(query).toContain(
			'u0: update_group(board_id: $boardId, group_id: $groupId, group_attribute: title, new_value: $value0)',
		);
		expect(query).toContain('u1: update_group');
		expect(query).toContain('group_attribute: color, new_value: $value1');
		expect(query).toContain('group_attribute: relative_position_after, new_value: $value2');
		expect(query).toContain('$value0: String!');
		expect(query).toContain('$value2: String!');
		expect(variables).toEqual({
			value0: 'New name',
			value1: 'turquoise',
			value2: 'group_abc',
		});
	});

	it('requests the full group record from every alias', () => {
		const { query } = buildUpdateGroupMutation([{ attribute: 'title', value: 'x' }]);
		expect(query).toContain('{ id title color position archived }');
		expect(query).not.toContain('u1:');
	});
});

describe('buildBulkArchiveOrDeleteMutation', () => {
	it('builds one aliased archive_item per ID for archive', () => {
		const { query, variables } = buildBulkArchiveOrDeleteMutation('archive', ['111', '222']);
		expect(query).toContain('item0: archive_item(item_id: $item0) { id name state }');
		expect(query).toContain('item1: archive_item(item_id: $item1) { id name state }');
		expect(query).toContain('$item0: ID!');
		expect(query).toContain('$item1: ID!');
		expect(query).not.toContain('delete_item');
		expect(variables).toEqual({ item0: '111', item1: '222' });
	});

	it('builds delete_item aliases for delete', () => {
		const { query } = buildBulkArchiveOrDeleteMutation('delete', ['111']);
		expect(query).toContain('item0: delete_item(item_id: $item0) { id name state }');
		expect(query).not.toContain('archive_item');
	});

	it('handles a single item without extra aliases', () => {
		const { query } = buildBulkArchiveOrDeleteMutation('archive', ['111']);
		expect(query).toContain('item0:');
		expect(query).not.toContain('item1:');
	});

	it('scales to the 50-item cap with one variable per ID', () => {
		const ids = Array.from({ length: 50 }, (_, i) => String(1000 + i));
		const { query, variables } = buildBulkArchiveOrDeleteMutation('archive', ids);
		expect(query).toContain('item49: archive_item(item_id: $item49)');
		expect(Object.keys(variables)).toHaveLength(50);
		expect(variables.item49).toBe('1049');
	});
});

describe('buildMentionsList', () => {
	it('maps user and team IDs to typed mentions', () => {
		expect(buildMentionsList(['1', '2'], ['30'])).toEqual([
			{ id: '1', type: 'User' },
			{ id: '2', type: 'User' },
			{ id: '30', type: 'Team' },
		]);
	});

	it('accepts CSV strings from expression mode', () => {
		expect(buildMentionsList('1, 2', '')).toEqual([
			{ id: '1', type: 'User' },
			{ id: '2', type: 'User' },
		]);
	});

	it('returns an empty list when nothing is selected', () => {
		expect(buildMentionsList(undefined, undefined)).toEqual([]);
		expect(buildMentionsList([], '')).toEqual([]);
	});
});

describe('parseGraphqlVariables', () => {
	it('parses a JSON string into an object', () => {
		const result = parseGraphqlVariables.call(makeContext('{"limit": 2, "ids": ["1"]}'), 0);
		expect(result).toEqual({ limit: 2, ids: ['1'] });
	});

	it('passes through an object from an expression', () => {
		const result = parseGraphqlVariables.call(makeContext({ limit: 5 }), 0);
		expect(result).toEqual({ limit: 5 });
	});

	it('returns undefined for empty input and empty object', () => {
		expect(parseGraphqlVariables.call(makeContext(''), 0)).toBeUndefined();
		expect(parseGraphqlVariables.call(makeContext('{}'), 0)).toBeUndefined();
		expect(parseGraphqlVariables.call(makeContext(undefined), 0)).toBeUndefined();
	});

	it('throws a clear error for invalid JSON', () => {
		expect(() => parseGraphqlVariables.call(makeContext('{not json'), 0)).toThrow(
			/valid JSON object/,
		);
	});

	it('throws for JSON that is not an object', () => {
		expect(() => parseGraphqlVariables.call(makeContext('[1, 2]'), 0)).toThrow(
			/valid JSON object/,
		);
		expect(() => parseGraphqlVariables.call(makeContext('"text"'), 0)).toThrow(
			/valid JSON object/,
		);
	});
});

describe('buildRequestInfoOutput', () => {
	it('maps all header-derived fields plus the requested API version', () => {
		const output = buildRequestInfoOutput(
			{
				requestId: 'req-1',
				apiVersion: '2025-10',
				statusCode: 200,
				rateLimit: { minuteRate: { remaining: 4999 }, complexityMinute: { remaining: 4950000 } },
				rateLimitPolicy: { minuteRate: { limit: 5000, windowSeconds: 60 } },
			},
			'2026-07',
		);

		expect(output).toEqual({
			rateLimit: { minuteRate: { remaining: 4999 }, complexityMinute: { remaining: 4950000 } },
			rateLimitPolicy: { minuteRate: { limit: 5000, windowSeconds: 60 } },
			apiVersionRequested: '2026-07',
			apiVersionReturned: '2025-10',
			requestId: 'req-1',
			statusCode: 200,
		});
	});

	it('nulls missing fields instead of dropping the keys', () => {
		expect(buildRequestInfoOutput({}, '2026-07')).toEqual({
			rateLimit: null,
			rateLimitPolicy: null,
			apiVersionRequested: '2026-07',
			apiVersionReturned: null,
			requestId: null,
			statusCode: null,
		});
	});
});

describe('formatColumnValueOutput', () => {
	const item = { id: '42', name: 'My Item' };

	it('decodes the raw JSON value and keeps the original string', () => {
		const result = formatColumnValueOutput(
			item,
			{
				id: 'status',
				type: 'status',
				text: 'Done',
				value: '{"index":1,"changed_at":"2026-01-01T00:00:00Z"}',
				column: { title: 'Status' },
			},
			'status',
		);
		expect(result).toEqual({
			itemId: '42',
			itemName: 'My Item',
			columnId: 'status',
			columnTitle: 'Status',
			columnType: 'status',
			text: 'Done',
			value: { index: 1, changed_at: '2026-01-01T00:00:00Z' },
			valueRaw: '{"index":1,"changed_at":"2026-01-01T00:00:00Z"}',
		});
	});

	it('returns nulls for an unset column value', () => {
		const result = formatColumnValueOutput(
			item,
			{ id: 'date4', type: 'date', text: '', value: null, column: { title: 'Due' } },
			'date4',
		);
		expect(result.value).toBeNull();
		expect(result.valueRaw).toBeNull();
		expect(result.text).toBe('');
	});

	it('falls back to the raw string when value is not valid JSON', () => {
		const result = formatColumnValueOutput(
			item,
			{ id: 'x', type: 'text', text: 'hi', value: 'not-json', column: null },
			'x',
		);
		expect(result.value).toBe('not-json');
		expect(result.columnTitle).toBeNull();
	});

	it('renders status rollups (BatteryValue) as label counts with batteryValue/isLeaf', () => {
		const result = formatColumnValueOutput(
			item,
			{
				id: 'status',
				type: 'status',
				text: null,
				value: null,
				column: { title: 'Status', settings_str: '{"labels":{"0":"Working on it","1":"Done"}}' },
				battery_value: [
					{ key: '1', count: 2 },
					{ key: '0', count: 1 },
				],
				is_leaf: false,
			},
			'status',
		);
		expect(result.text).toBe('Done: 2, Working on it: 1');
		expect(result.batteryValue).toEqual([
			{ key: '1', count: 2 },
			{ key: '0', count: 1 },
		]);
		expect(result.isLeaf).toBe(false);
	});

	it('surfaces dependency links via display_value (text/value are null in the API)', () => {
		const result = formatColumnValueOutput(
			item,
			{
				id: 'dep_1',
				type: 'dependency',
				text: null,
				value: null,
				column: { title: 'Depends On' },
				display_value: 'Task A, Task B',
				linked_item_ids: ['11', '22'],
				linked_items: [
					{ id: '11', name: 'Task A' },
					{ id: '22', name: 'Task B' },
				],
				dependency_links: [
					{ linked_item_id: '11', dependency_type: null, lag: null },
					{ linked_item_id: '22', dependency_type: 0, lag: 2 },
				],
			},
			'dep_1',
		);
		expect(result.text).toBe('Task A, Task B');
		expect(result.displayValue).toBe('Task A, Task B');
		expect(result.linkedItemIds).toEqual(['11', '22']);
		expect(result.linkedItems).toEqual([
			{ id: '11', name: 'Task A' },
			{ id: '22', name: 'Task B' },
		]);
		expect(result.dependencyLinks).toEqual([
			{ linked_item_id: '11', dependency_type: null, lag: null },
			{ linked_item_id: '22', dependency_type: 0, lag: 2 },
		]);
	});

	it('keeps text null on an empty board_relation value (display_value "")', () => {
		const result = formatColumnValueOutput(
			item,
			{
				id: 'connect_1',
				type: 'board_relation',
				text: null,
				value: null,
				column: { title: 'Connected' },
				display_value: '',
				linked_item_ids: [],
			},
			'connect_1',
		);
		expect(result.text).toBeNull();
		expect(result.displayValue).toBe('');
		expect(result.linkedItemIds).toEqual([]);
		expect(result.linkedItems).toBeUndefined();
		expect(result.dependencyLinks).toBeUndefined();
	});
});

describe('flattenItemColumns', () => {
	it('flattens by column title with text values', () => {
		expect(
			flattenItemColumns([
				{ id: 'text_1', text: 'hello', column: { title: 'Notes' } },
				{ id: 'num_1', text: '', column: { title: 'Amount' } },
				{ id: 'orphan', text: null, column: null },
			]),
		).toEqual({ Notes: 'hello', Amount: '', orphan: null });
	});

	it('renders battery values through the column status labels', () => {
		expect(
			flattenItemColumns([
				{
					id: 'status',
					text: null,
					column: { title: 'Status', settings_str: '{"labels":{"0":"Stuck","1":"Done"}}' },
					battery_value: [
						{ key: '1', count: 1 },
						{ key: '0', count: 2 },
					],
				},
			]),
		).toEqual({ Status: 'Done: 1, Stuck: 2' });
	});

	it('falls back to display_value for dependency/board_relation/mirror (text is null)', () => {
		expect(
			flattenItemColumns([
				{ id: 'dep_1', text: null, column: { title: 'Depends On' }, display_value: 'Task A, Task B' },
				{ id: 'connect_1', text: null, column: { title: 'Connected' }, display_value: '' },
				{ id: 'mirror_1', text: null, column: { title: 'Mirror' }, display_value: 'Done' },
			]),
		).toEqual({ 'Depends On': 'Task A, Task B', Connected: null, Mirror: 'Done' });
	});
});

describe('resolvePlatformAgentContextId', () => {
	it('returns the trimmed user value when set', () => {
		expect(resolvePlatformAgentContextId('  item-123  ')).toBe('item-123');
	});

	it('generates a 32-char hex hash when Context ID is empty', () => {
		const id = resolvePlatformAgentContextId('');
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('generates a 32-char hex hash when Context ID is whitespace only', () => {
		const id = resolvePlatformAgentContextId('   ');
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('generates different hashes on consecutive empty calls', () => {
		const first = resolvePlatformAgentContextId('');
		const second = resolvePlatformAgentContextId('');
		expect(first).not.toBe(second);
	});
});

describe('buildPlatformAgentOutput', () => {
	const sent = 'abc123def4567890abcdef1234567890';

	it('always returns the sent contextId even when the API omits it', () => {
		expect(buildPlatformAgentOutput({ response: 'hello' }, sent)).toEqual({
			response: 'hello',
			contextId: sent,
		});
	});

	it('always returns the sent contextId even when the API returns null', () => {
		expect(buildPlatformAgentOutput({ response: 'hello', contextId: null }, sent)).toEqual({
			response: 'hello',
			contextId: sent,
		});
	});

	it('unwraps a nested body envelope from httpRequestWithAuthentication', () => {
		expect(
			buildPlatformAgentOutput({ body: { response: 'nested' }, statusCode: 200 }, sent),
		).toEqual({ response: 'nested', contextId: sent });
	});
});

describe('parsePlatformAgentHttpBody', () => {
	it('parses JSON strings', () => {
		expect(parsePlatformAgentHttpBody('{"response":"x"}')).toEqual({ response: 'x' });
	});
});

describe('buildUserFieldSelection', () => {
	it('returns the modern standard fields without deprecated ones', () => {
		const selection = buildUserFieldSelection(false);
		for (const field of ['kind', 'status', 'photo_url { thumb_small }', 'teams { id name }']) {
			expect(selection).toContain(field);
		}
		// Removed in API 2026-10 — must never be requested again.
		for (const deprecated of [
			'is_admin',
			'is_guest',
			'is_pending',
			'is_view_only',
			'enabled',
			'is_verified',
			'join_date',
			'photo_thumb_small\n',
			'photo_original',
		]) {
			expect(selection).not.toContain(deprecated);
		}
		expect(selection).not.toContain('account_id');
	});

	it('adds the extended fields and the full photo size set when toggled on', () => {
		const selection = buildUserFieldSelection(true);
		for (const field of [
			'account_id',
			'became_active_at',
			'invitation_method',
			'is_email_confirmed',
			'serial_number',
			'utc_hours_diff',
			'out_of_office { active disable_notifications end_date start_date type }',
			'user_config { kind role_id visibility }',
			'photo_url { original small thumb thumb_small tiny }',
		]) {
			expect(selection).toContain(field);
		}
	});
});

describe('buildCreateNotificationsMutation', () => {
	it('builds one aliased create_notification per recipient sharing target/text', () => {
		const { query } = buildCreateNotificationsMutation(['1', '2', '3'], 'Project');
		expect(query).toContain('$user0: ID!');
		expect(query).toContain('$user2: ID!');
		expect(query).toContain(
			'notify0: create_notification(user_id: $user0, target_id: $targetId, text: $text, target_type: Project) { text }',
		);
		expect(query).toContain('notify2: create_notification');
		expect(query).not.toContain('notify3:');
	});

	it('uses target_type Post for update targets', () => {
		const { query } = buildCreateNotificationsMutation(['9'], 'Post');
		expect(query).toContain('target_type: Post');
	});

	it('caps recipients at 30 per run (enforced by the operation)', () => {
		expect(MAX_NOTIFICATION_RECIPIENTS).toBe(30);
	});
});

describe('resolveArchiveOrDeleteAction', () => {
	it('defaults the unified operation to archive (the safe default)', () => {
		const context = makeContext('archive');
		expect(resolveArchiveOrDeleteAction.call(context, 'archiveOrDeleteItem', 0)).toBe('archive');
	});

	it('honors an explicit delete selection', () => {
		const context = makeContext('delete');
		expect(resolveArchiveOrDeleteAction.call(context, 'archiveOrDeleteBoard', 0)).toBe('delete');
	});

	it('falls back to archive for any unexpected parameter value', () => {
		const context = makeContext('something-else');
		expect(resolveArchiveOrDeleteAction.call(context, 'archiveOrDeleteGroup', 0)).toBe('archive');
	});

	it('maps the legacy operation values without reading the parameter', () => {
		const context = makeContext(undefined);
		expect(resolveArchiveOrDeleteAction.call(context, 'archiveItem', 0)).toBe('archive');
		expect(resolveArchiveOrDeleteAction.call(context, 'deleteItem', 0)).toBe('delete');
	});
});

describe('buildSubscriberRows', () => {
	it('flattens users and teams into typed role rows', () => {
		const rows = buildSubscriberRows({
			subscribers: [{ id: '1', name: 'Ada', email: 'ada@x.com' }],
			owners: [{ id: '1', name: 'Ada', email: 'ada@x.com' }],
			team_subscribers: [{ id: '9', name: 'Devs' }],
			team_owners: [],
		});
		expect(rows).toEqual([
			{ type: 'user', role: 'owner', id: '1', name: 'Ada', email: 'ada@x.com' },
			{ type: 'user', role: 'subscriber', id: '1', name: 'Ada', email: 'ada@x.com' },
			{ type: 'team', role: 'subscriber', id: '9', name: 'Devs' },
		]);
	});

	it('handles a board with no subscribers', () => {
		expect(buildSubscriberRows({})).toEqual([]);
	});

	it('passes enriched user and team fields through to the rows', () => {
		const rows = buildSubscriberRows({
			subscribers: [{ id: '1', name: 'Ada', email: 'ada@x.com', kind: 'admin', status: 'ACTIVE' }],
			team_subscribers: [{ id: '9', name: 'Devs', is_guest: false }],
		});
		expect(rows).toEqual([
			{
				type: 'user',
				role: 'subscriber',
				id: '1',
				name: 'Ada',
				email: 'ada@x.com',
				kind: 'admin',
				status: 'ACTIVE',
			},
			{ type: 'team', role: 'subscriber', id: '9', name: 'Devs', is_guest: false },
		]);
	});
});

describe('buildSubscribersSelection', () => {
	const all = { subscribers: true, owners: true, teamSubscribers: true, teamOwners: true };

	it('includes all four connections with enriched fields when everything is on', () => {
		const selection = buildSubscribersSelection(all);
		expect(selection).toContain('subscribers { id name email kind status title }');
		expect(selection).toContain('owners { id name email kind status title }');
		expect(selection).toContain('team_subscribers(limit: 1000, page: 1) { id name is_guest picture_url }');
		expect(selection).toContain('team_owners(limit: 1000, page: 1) { id name is_guest picture_url }');
	});

	it('omits toggled-off connections', () => {
		const selection = buildSubscribersSelection({
			...all,
			owners: false,
			teamOwners: false,
		});
		expect(selection).toContain('subscribers {');
		expect(selection).not.toContain('owners {');
		expect(selection).toContain('team_subscribers(');
		expect(selection).not.toContain('team_owners(');
	});

	it('returns an empty selection when all toggles are off', () => {
		expect(
			buildSubscribersSelection({
				subscribers: false,
				owners: false,
				teamSubscribers: false,
				teamOwners: false,
			}),
		).toBe('');
	});
});

describe('buildReplacePlan', () => {
	it('removes current members not in the desired selection', () => {
		const plan = buildReplacePlan(
			{
				subscribers: [{ id: '1' }, { id: '2' }, { id: '3' }],
				owners: [{ id: '1' }],
				team_subscribers: [{ id: '10' }, { id: '11' }],
				team_owners: [{ id: '10' }],
			},
			['2'],
			['11'],
			'99',
		);
		expect(plan.removeUserIds.sort()).toEqual(['1', '3']);
		expect(plan.removeTeamIds).toEqual(['10']);
		expect(plan.keptExecutingUser).toBe(false);
	});

	it('never removes the executing user and reports it', () => {
		const plan = buildReplacePlan(
			{ subscribers: [{ id: '99' }, { id: '2' }], owners: [{ id: '99' }] },
			['2'],
			[],
			'99',
		);
		expect(plan.removeUserIds).toEqual([]);
		expect(plan.keptExecutingUser).toBe(true);
	});

	it('does not report the executing user as kept when they are in the selection', () => {
		const plan = buildReplacePlan({ subscribers: [{ id: '99' }] }, ['99'], [], '99');
		expect(plan.removeUserIds).toEqual([]);
		expect(plan.keptExecutingUser).toBe(false);
	});

	it('dedupes members listed as both owner and subscriber', () => {
		const plan = buildReplacePlan(
			{ subscribers: [{ id: '5' }], owners: [{ id: '5' }] },
			['6'],
			[],
			'99',
		);
		expect(plan.removeUserIds).toEqual(['5']);
	});

	it('removes nothing when the selection matches the current membership', () => {
		const plan = buildReplacePlan(
			{ subscribers: [{ id: '1' }], team_subscribers: [{ id: '10' }] },
			['1'],
			['10'],
			'99',
		);
		expect(plan).toEqual({ removeUserIds: [], removeTeamIds: [], keptExecutingUser: false });
	});
});

describe('formatActivityLogRow', () => {
	it('parses the data JSON string and converts the 17-digit timestamp', () => {
		const row = formatActivityLogRow({
			id: 'log-1',
			event: 'update_column_value',
			entity: 'pulse',
			data: '{"board_id":123,"value":{"label":"Done"}}',
			user_id: '7',
			account_id: '55',
			// 17-digit UNIX time in 1e-7 s: 2026-01-01T00:00:00Z
			created_at: '17672256000000000',
		});
		expect(row.data).toEqual({ board_id: 123, value: { label: 'Done' } });
		expect(row.createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(row.createdAtRaw).toBe('17672256000000000');
		expect(row.event).toBe('update_column_value');
	});

	it('keeps unparseable data as-is and nulls a missing timestamp', () => {
		const row = formatActivityLogRow({ id: 'log-2', data: 'not-json' });
		expect(row.data).toBe('not-json');
		expect(row.createdAt).toBeNull();
	});
});

describe('formatColumnSchemaRow', () => {
	it('parses settings_str into a settings object', () => {
		const row = formatColumnSchemaRow({
			id: 'status',
			title: 'Status',
			type: 'status',
			description: 'Where it stands',
			settings_str: '{"labels":{"0":"Todo","1":"Done"}}',
		});
		expect(row.settings).toEqual({ labels: { '0': 'Todo', '1': 'Done' } });
		expect(row.id).toBe('status');
	});

	it('returns null settings for empty or invalid settings_str', () => {
		expect(formatColumnSchemaRow({ id: 'x', settings_str: '' }).settings).toBeNull();
		expect(formatColumnSchemaRow({ id: 'x', settings_str: '{oops' }).settings).toBeNull();
		expect(formatColumnSchemaRow({ id: 'x' }).settings).toBeNull();
	});

	it('surfaces the calculated capability as rollup, null when absent', () => {
		const withRollup = formatColumnSchemaRow({
			id: 'num',
			capabilities: { calculated: { function: 'SUM', calculated_type: 'rollup' } },
		});
		expect(withRollup.rollup).toEqual({ function: 'SUM', calculated_type: 'rollup' });

		expect(formatColumnSchemaRow({ id: 'x' }).rollup).toBeNull();
		expect(formatColumnSchemaRow({ id: 'x', capabilities: { calculated: null } }).rollup).toBeNull();
	});
});

describe('assertRollupFunctionAllowed (Column Create/Update pre-flight)', () => {
	const node = makeContext(null).getNode();

	// Matrix probed live (CalculatedFunction enum, 2026-07 schema): rows are
	// column types, columns are functions; ✓ = valid, ✗ = friendly error.
	const VALID: Array<[string, string]> = [
		['numbers', 'SUM'],
		['numbers', 'MIN'],
		['numbers', 'MAX'],
		['numbers', 'NONE'],
		['date', 'MIN'],
		['date', 'MAX'],
		['date', 'NONE'],
		['timeline', 'MIN_MAX'],
		['timeline', 'NONE'],
		['status', 'COUNT_KEYS'],
		['status', 'NONE'],
	];
	const INVALID: Array<[string, string]> = [
		['numbers', 'MIN_MAX'],
		['numbers', 'COUNT_KEYS'],
		['date', 'SUM'],
		['date', 'MIN_MAX'],
		['date', 'COUNT_KEYS'],
		['timeline', 'SUM'],
		['timeline', 'MIN'],
		['timeline', 'MAX'],
		['timeline', 'COUNT_KEYS'],
		['status', 'SUM'],
		['status', 'MIN'],
		['status', 'MAX'],
		['status', 'MIN_MAX'],
	];

	it.each(VALID)('allows %s + %s', (columnType, rollupFunction) => {
		expect(() => assertRollupFunctionAllowed(node, 0, columnType, rollupFunction)).not.toThrow();
	});

	it.each(INVALID)('rejects %s + %s with the supported list', (columnType, rollupFunction) => {
		expect(() => assertRollupFunctionAllowed(node, 0, columnType, rollupFunction)).toThrow(
			new RegExp(`${rollupFunction} is not supported on ${columnType} columns`),
		);
	});

	it('rejects non-rollup column types with a friendly explanation', () => {
		for (const columnType of ['text', 'people', 'checkbox', 'rating']) {
			expect(() => assertRollupFunctionAllowed(node, 0, columnType, 'SUM')).toThrow(
				/Rollup is not supported on .* columns/,
			);
		}
	});

	it('is a no-op when no rollup function is set (Board Default)', () => {
		expect(() => assertRollupFunctionAllowed(node, 0, 'text', '')).not.toThrow();
	});
});

describe('buildRunPromptConfig', () => {
	it('maps only the options the user set into API field names', () => {
		expect(
			buildRunPromptConfig({
				model: 'MONDAY_POWERFUL',
				systemPrompt: 'Be terse.',
				temperature: 0.2,
				maxTokens: 100,
			}),
		).toEqual({
			model: 'MONDAY_POWERFUL',
			system_prompt: 'Be terse.',
			temperature: 0.2,
			max_tokens: 100,
		});
	});

	it('omits blank system prompts and returns null when nothing was set', () => {
		expect(buildRunPromptConfig({ systemPrompt: '   ' })).toBeNull();
		expect(buildRunPromptConfig({})).toBeNull();
	});

	it('keeps a temperature of 0 (falsy but valid)', () => {
		expect(buildRunPromptConfig({ temperature: 0 })).toEqual({ temperature: 0 });
	});
});

/** Context whose getNodeParameter resolves from a name → value map. */
function makeParamsContext(params: Record<string, unknown>): IExecuteFunctions {
	return {
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			params[name] !== undefined ? params[name] : fallback,
		getNode: () => ({ name: 'monday.com', type: 'CUSTOM.monday', typeVersion: 1 }),
	} as unknown as IExecuteFunctions;
}

function makeClient(responses: IDataObject[]): {
	client: MondayGraphQLClient;
	execute: ReturnType<typeof vi.fn>;
} {
	let call = 0;
	const execute = vi.fn(async () => responses[Math.min(call++, responses.length - 1)]);
	return { client: { execute } as unknown as MondayGraphQLClient, execute };
}

describe('getManyAssets', () => {
	const asset = (id: string) => ({ id, name: `file-${id}.txt` });

	it('by asset IDs: queries assets(ids:) with the normalized ID list', async () => {
		const { client, execute } = makeClient([{ assets: [asset('1'), asset('2')] }]);
		const result = await getManyAssets.call(
			makeParamsContext({ assetsSource: 'assetIds', assetIds: '1, 2' }),
			client,
			0,
		);
		expect(result).toHaveLength(2);
		expect(execute.mock.calls[0][0]).toContain('assets(ids: $ids)');
		expect(execute.mock.calls[0][2]).toEqual({ ids: ['1', '2'] });
	});

	it('by asset IDs: rejects an empty ID list', async () => {
		const { client } = makeClient([{}]);
		await expect(
			getManyAssets.call(
				makeParamsContext({ assetsSource: 'assetIds', assetIds: '' }),
				client,
				0,
			),
		).rejects.toThrow('at least one asset ID');
	});

	it('by board item (all): uses assets_source: all and annotates the item', async () => {
		const { client, execute } = makeClient([{ items: [{ assets: [asset('1')] }] }]);
		const result = await getManyAssets.call(
			makeParamsContext({ assetsSource: 'boardItem', itemId: '77', itemAssetsScope: 'all' }),
			client,
			0,
		);
		expect(execute.mock.calls[0][0]).toContain('assets_source: all');
		expect(result[0]).toMatchObject({ id: '1', itemId: '77', source: 'all' });
	});

	it('by board item (columns): scopes to the selected file columns', async () => {
		const { client, execute } = makeClient([{ items: [{ assets: [asset('1')] }] }]);
		await getManyAssets.call(
			makeParamsContext({
				assetsSource: 'boardItem',
				itemId: '77',
				itemAssetsScope: 'columns',
				itemFileColumnIds: ['file_col'],
			}),
			client,
			0,
		);
		expect(execute.mock.calls[0][0]).toContain('assets_source: columns');
		expect(execute.mock.calls[0][0]).toContain('column_ids: $columnIds');
		expect(execute.mock.calls[0][2]).toEqual({ ids: ['77'], columnIds: ['file_col'] });
	});

	it('by board item: throws a friendly error when the item does not exist', async () => {
		const { client } = makeClient([{ items: [] }]);
		await expect(
			getManyAssets.call(
				makeParamsContext({ assetsSource: 'boardItem', itemId: '404', itemAssetsScope: 'all' }),
				client,
				0,
			),
		).rejects.toThrow('Item 404 not found');
	});

	it('by board column with an item: queries just that item and annotates the column', async () => {
		const { client, execute } = makeClient([{ items: [{ assets: [asset('9')] }] }]);
		const result = await getManyAssets.call(
			makeParamsContext({ assetsSource: 'boardColumn', fileColumnId: 'file_col', itemId: '77' }),
			client,
			0,
		);
		expect(execute.mock.calls[0][2]).toEqual({ ids: ['77'], columnIds: ['file_col'] });
		expect(result[0]).toMatchObject({ id: '9', itemId: '77', columnId: 'file_col' });
	});

	it('respects the Options limit on item-scoped reads', async () => {
		const { client } = makeClient([
			{ items: [{ assets: [asset('1'), asset('2'), asset('3')] }] },
		]);
		const result = await getManyAssets.call(
			makeParamsContext({
				assetsSource: 'boardItem',
				itemId: '77',
				itemAssetsScope: 'all',
				getAssetsOptions: { limit: 2 },
			}),
			client,
			0,
		);
		expect(result).toHaveLength(2);
	});
});

describe('fetchItemUpdateAssets', () => {
	it('collects update attachments, dedupes across updates and tags updateId', async () => {
		const { client } = makeClient([
			{
				items: [
					{
						updates: [
							{ id: 'u1', assets: [{ id: 'a1', name: 'one.txt' }] },
							{ id: 'u2', assets: [{ id: 'a1', name: 'one.txt' }, { id: 'a2', name: 'two.txt' }] },
						],
					},
				],
			},
		]);
		const result = await fetchItemUpdateAssets.call(makeParamsContext({}), client, 0, '77', 50);
		expect(result).toEqual([
			{ id: 'a1', name: 'one.txt', updateId: 'u1' },
			{ id: 'a2', name: 'two.txt', updateId: 'u2' },
		]);
	});

	it('stops paging as soon as the asset budget is filled', async () => {
		const { client, execute } = makeClient([
			{
				items: [
					{
						updates: Array.from({ length: 100 }, (_, index) => ({
							id: `u${index}`,
							assets: [{ id: `a${index}`, name: `${index}.txt` }],
						})),
					},
				],
			},
		]);
		const result = await fetchItemUpdateAssets.call(makeParamsContext({}), client, 0, '77', 3);
		expect(result).toHaveLength(3);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('throws a friendly error for a missing item', async () => {
		const { client } = makeClient([{ items: [] }]);
		await expect(
			fetchItemUpdateAssets.call(makeParamsContext({}), client, 0, '404', 50),
		).rejects.toThrow('Item 404 not found');
	});
});

describe('scanBoardColumnAssets', () => {
	it('pages the board by cursor and stops when the asset budget is filled', async () => {
		const { client, execute } = makeClient([
			{
				boards: [
					{
						items_page: {
							cursor: 'c1',
							items: [
								{ id: 'i1', name: 'one', assets: [{ id: 'a1', name: 'a.txt' }] },
								{ id: 'i2', name: 'two', assets: [] },
							],
						},
					},
				],
			},
			{
				next_items_page: {
					cursor: null,
					items: [{ id: 'i3', name: 'three', assets: [{ id: 'a2', name: 'b.txt' }] }],
				},
			},
		]);
		const result = await scanBoardColumnAssets.call(
			makeParamsContext({}),
			client,
			0,
			'123',
			'file_col',
			50,
		);
		expect(result).toEqual([
			{ id: 'a1', name: 'a.txt', itemId: 'i1', itemName: 'one', columnId: 'file_col' },
			{ id: 'a2', name: 'b.txt', itemId: 'i3', itemName: 'three', columnId: 'file_col' },
		]);
		// Column scoping is inlined into the item selection.
		expect(execute.mock.calls[0][0]).toContain('column_ids: ["file_col"]');
		expect(execute.mock.calls[1][0]).toContain('next_items_page');
	});

	it('does not follow the cursor once the budget is reached', async () => {
		const { client, execute } = makeClient([
			{
				boards: [
					{
						items_page: {
							cursor: 'c1',
							items: [{ id: 'i1', name: 'one', assets: [{ id: 'a1' }, { id: 'a2' }] }],
						},
					},
				],
			},
		]);
		const result = await scanBoardColumnAssets.call(
			makeParamsContext({}),
			client,
			0,
			'123',
			'file_col',
			2,
		);
		expect(result).toHaveLength(2);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it('throws a friendly error for a missing board', async () => {
		const { client } = makeClient([{ boards: [] }]);
		await expect(
			scanBoardColumnAssets.call(makeParamsContext({}), client, 0, '404', 'file_col', 10),
		).rejects.toThrow('Board 404 not found');
	});
});

describe('completeMoveColumnsMapping', () => {
	const sourceColumns = [
		{ id: 'name', type: 'name' },
		{ id: 'status', type: 'status' },
		{ id: 'text_1', type: 'text' },
		{ id: 'date_1', type: 'date' },
		{ id: 'formula_1', type: 'formula' },
		{ id: 'subtasks_1', type: 'subtasks' },
	];
	const targetColumns = [
		{ id: 'name', type: 'name' },
		{ id: 'status_target', type: 'status' },
		{ id: 'text_9', type: 'text' },
	];

	it('keeps the picked pairs and fills every other mappable column with target: null', () => {
		const mapping = completeMoveColumnsMapping(
			[{ source: 'text_1', target: 'text_9' }],
			sourceColumns,
			targetColumns,
		);
		expect(mapping).toEqual([
			{ source: 'text_1', target: 'text_9' },
			{ source: 'status', target: null },
			{ source: 'date_1', target: null },
		]);
	});

	it('never includes name, subtasks, or formula columns in the fill', () => {
		const mapping = completeMoveColumnsMapping([], sourceColumns, targetColumns);
		expect(mapping.map((pair) => pair.source)).toEqual(['status', 'text_1', 'date_1']);
	});

	it('rejects a source column that does not exist on the board', () => {
		expect(() =>
			completeMoveColumnsMapping(
				[{ source: 'nope', target: 'text_9' }],
				sourceColumns,
				targetColumns,
			),
		).toThrow("does not exist on the item's board");
	});

	it('rejects mapping an unmappable column type', () => {
		expect(() =>
			completeMoveColumnsMapping([{ source: 'name', target: 'name' }], sourceColumns, targetColumns),
		).toThrow('cannot be mapped');
	});

	it('rejects a duplicate source column', () => {
		expect(() =>
			completeMoveColumnsMapping(
				[
					{ source: 'text_1', target: 'text_9' },
					{ source: 'text_1', target: 'text_9' },
				],
				sourceColumns,
				targetColumns,
			),
		).toThrow('mapped more than once');
	});

	it('rejects a target column that does not exist on the target board', () => {
		expect(() =>
			completeMoveColumnsMapping(
				[{ source: 'text_1', target: 'nope' }],
				sourceColumns,
				targetColumns,
			),
		).toThrow('does not exist on the target board');
	});
});

describe('moveItem', () => {
	const boardMoveParams = {
		boardId: '123',
		itemId: '11',
		moveDestination: 'board',
		targetBoardId: '999',
		targetBoardGroupId: 'topics',
	};

	// The boards lookup moveItem runs before completing a configured mapping.
	const boardsResponse = {
		boards: [
			{
				id: '123',
				columns: [
					{ id: 'name', type: 'name' },
					{ id: 'status', type: 'status' },
					{ id: 'text_1', type: 'text' },
					{ id: 'date_1', type: 'date' },
				],
			},
			{
				id: '999',
				columns: [
					{ id: 'status_target', type: 'status' },
					{ id: 'text_9', type: 'text' },
				],
			},
		],
	};

	it('moves to a group on the same board via move_item_to_group', async () => {
		const { client, execute } = makeClient([{ move_item_to_group: { id: '11' } }]);
		const result = await moveItem.call(
			makeParamsContext({ itemId: '11', moveDestination: 'group', targetGroupId: 'done' }),
			client,
			0,
		);
		expect(execute.mock.calls[0][0]).toContain('move_item_to_group');
		expect(execute.mock.calls[0][2]).toEqual({ itemId: '11', groupId: 'done' });
		expect(result).toEqual({ id: '11' });
	});

	it('cross-board: completes the guided mapper rows into a full columns_mapping', async () => {
		const { client, execute } = makeClient([boardsResponse, { move_item_to_board: { id: '11' } }]);
		await moveItem.call(
			makeParamsContext({
				...boardMoveParams,
				columnsMappingUi: {
					mappings: [
						{ source: 'status', target: 'status_target' },
						{ source: 'text_1', target: 'text_9' },
					],
				},
			}),
			client,
			0,
		);
		expect(execute.mock.calls[0][0]).toContain('boards(ids: $ids)');
		expect(execute.mock.calls[0][2]).toEqual({ ids: ['123', '999'] });
		expect(execute.mock.calls[1][0]).toContain('move_item_to_board');
		expect(execute.mock.calls[1][2]).toEqual({
			boardId: '999',
			groupId: 'topics',
			itemId: '11',
			columnsMapping: [
				{ source: 'status', target: 'status_target' },
				{ source: 'text_1', target: 'text_9' },
				{ source: 'date_1', target: null },
			],
		});
	});

	it('cross-board: mapper rows take precedence over the JSON escape hatch', async () => {
		const { client, execute } = makeClient([boardsResponse, { move_item_to_board: { id: '11' } }]);
		await moveItem.call(
			makeParamsContext({
				...boardMoveParams,
				columnsMappingUi: { mappings: [{ source: 'status', target: 'status_target' }] },
				moveOptions: { columnsMapping: '[{"source": "text_1", "target": "text_9"}]' },
			}),
			client,
			0,
		);
		expect(execute.mock.calls[1][2].columnsMapping).toEqual([
			{ source: 'status', target: 'status_target' },
			{ source: 'text_1', target: null },
			{ source: 'date_1', target: null },
		]);
	});

	it('cross-board: surfaces a friendly error for an unknown mapped column', async () => {
		const { client } = makeClient([boardsResponse]);
		await expect(
			moveItem.call(
				makeParamsContext({
					...boardMoveParams,
					columnsMappingUi: { mappings: [{ source: 'nope', target: 'text_9' }] },
				}),
				client,
				0,
			),
		).rejects.toThrow("does not exist on the item's board");
	});

	it('cross-board: rejects a mapper row missing the target column', async () => {
		const { client } = makeClient([{}]);
		await expect(
			moveItem.call(
				makeParamsContext({
					...boardMoveParams,
					columnsMappingUi: { mappings: [{ source: 'status', target: '' }] },
				}),
				client,
				0,
			),
		).rejects.toThrow('row 1 needs both a source and a target column');
	});

	it('cross-board: completes the JSON escape hatch mapping when no rows are configured', async () => {
		const { client, execute } = makeClient([boardsResponse, { move_item_to_board: { id: '11' } }]);
		await moveItem.call(
			makeParamsContext({
				...boardMoveParams,
				columnsMappingUi: {},
				moveOptions: { columnsMapping: '[{"source": "text_1", "target": "text_9"}]' },
			}),
			client,
			0,
		);
		expect(execute.mock.calls[1][2].columnsMapping).toEqual([
			{ source: 'text_1', target: 'text_9' },
			{ source: 'status', target: null },
			{ source: 'date_1', target: null },
		]);
	});

	it('cross-board: rejects non-array JSON mapping', async () => {
		const { client } = makeClient([{}]);
		await expect(
			moveItem.call(
				makeParamsContext({
					...boardMoveParams,
					moveOptions: { columnsMapping: '{"source": "a"}' },
				}),
				client,
				0,
			),
		).rejects.toThrow('JSON array');
	});

	it('cross-board: sends null columns_mapping when nothing is configured', async () => {
		const { client, execute } = makeClient([{ move_item_to_board: { id: '11' } }]);
		await moveItem.call(makeParamsContext(boardMoveParams), client, 0);
		expect(execute.mock.calls[0][2].columnsMapping).toBeNull();
	});

	// Roadmap item 12570922790: move_item_to_board has no with_updates argument on
	// any API version (2026-10 / 2027-01 / dev, introspected 2026-07-19) — updates
	// always travel with the moved item (verified live). The UI documents that via
	// a notice instead of a toggle; the mutation must never invent the argument.
	it('cross-board: never sends a with_updates argument (API does not have one)', async () => {
		const { client, execute } = makeClient([{ move_item_to_board: { id: '11' } }]);
		await moveItem.call(makeParamsContext(boardMoveParams), client, 0);
		expect(execute.mock.calls[0][0]).not.toContain('with_updates');
		expect(Object.keys(execute.mock.calls[0][2] as IDataObject)).toEqual([
			'boardId',
			'groupId',
			'itemId',
			'columnsMapping',
		]);
	});

	it('documents that updates always move with the item via a UI notice, not a toggle', () => {
		const properties = new Monday().description.properties;
		const notice = properties.find((p) => p.name === 'moveToBoardUpdatesNotice');
		expect(notice?.type).toBe('notice');
		expect(notice?.displayOptions?.show?.moveDestination).toEqual(['board']);
		expect(String(notice?.displayName)).toContain('updates');

		// The only withUpdates toggle belongs to Item: Duplicate — none on Move.
		const withUpdatesParams = properties.filter((p) => p.name === 'withUpdates');
		expect(withUpdatesParams).toHaveLength(1);
		expect(withUpdatesParams[0].displayOptions?.show?.operation).toEqual(['duplicateItem']);
	});
});

// AI: Respond to Agent Chat (roadmap item 12571815268) — the deferred
// webhook reply for the trigger's Agent Interaction event, run once per
// execution.
describe('respondToAgentChat execute path', () => {
	function makeRespondContext(
		params: Record<string, unknown>,
		items: Array<{ json: Record<string, unknown> }>,
		continueOnFail = false,
	) {
		const sendResponse = vi.fn();
		const context = {
			getInputData: () => items,
			getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
				params[name] ?? fallback,
			sendResponse,
			continueOnFail: () => continueOnFail,
			getNode: () => ({ name: 'monday.com', type: 'CUSTOM.monday', typeVersion: 1 }),
		} as unknown as IExecuteFunctions;
		return { context, sendResponse };
	}

	const node = new Monday();

	it('sends the SSE reply once and passes items through', async () => {
		const items = [{ json: { stream: true, text: 'hi' } }];
		const { context, sendResponse } = makeRespondContext(
			{ operation: 'respondToAgentChat', replyText: 'The answer is 42' },
			items,
		);

		const result = await node.execute.call(context);

		expect(sendResponse).toHaveBeenCalledTimes(1);
		const response = sendResponse.mock.calls[0][0];
		expect(response.headers['content-type']).toBe('text/event-stream');
		expect(response.body.toString('utf8')).toContain('The answer is 42');
		expect(result).toEqual([items]);
	});

	it('auto mode follows the trigger item stream flag', async () => {
		const { context, sendResponse } = makeRespondContext(
			{
				operation: 'respondToAgentChat',
				replyText: 'plain',
				respondToAgentChatOptions: { responseFormat: 'auto' },
			},
			[{ json: { stream: false } }],
		);

		await node.execute.call(context);
		expect(sendResponse.mock.calls[0][0].body).toEqual({ message: 'plain' });
	});

	it('explicit format options override the stream flag', async () => {
		const { context, sendResponse } = makeRespondContext(
			{
				operation: 'respondToAgentChat',
				replyText: 'forced json',
				respondToAgentChatOptions: { responseFormat: 'json' },
			},
			[{ json: { stream: true } }],
		);
		await node.execute.call(context);
		expect(sendResponse.mock.calls[0][0].body).toEqual({ message: 'forced json' });

		const { context: sseContext, sendResponse: sseSend } = makeRespondContext(
			{
				operation: 'respondToAgentChat',
				replyText: 'forced sse',
				respondToAgentChatOptions: { responseFormat: 'sse' },
			},
			[{ json: { stream: false } }],
		);
		await node.execute.call(sseContext);
		expect(sseSend.mock.calls[0][0].headers['content-type']).toBe('text/event-stream');
	});

	it('defaults to SSE when the stream flag did not reach this node', async () => {
		const { context, sendResponse } = makeRespondContext(
			{ operation: 'respondToAgentChat', replyText: 'x' },
			[{ json: { output: 'ai text' } }],
		);
		await node.execute.call(context);
		expect(sendResponse.mock.calls[0][0].headers['content-type']).toBe('text/event-stream');
	});

	it('returns error rows under continueOnFail', async () => {
		const items = [{ json: {} }];
		const { context } = makeRespondContext(
			{ operation: 'respondToAgentChat', replyText: 'x' },
			items,
			true,
		);
		(context as unknown as { sendResponse: unknown }).sendResponse = vi.fn(() => {
			throw new Error('response channel closed');
		});

		const result = await node.execute.call(context);
		expect(result[0][0].json).toEqual({ error: 'response channel closed' });
	});

	it('is listed under the AI & Agent Actions resource in the UI', () => {
		const properties = new Monday().description.properties;
		const resource = properties.find((p) => p.name === 'resource');
		expect(resource?.options).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: 'AI & Agent Actions', value: 'ai' })]),
		);
		const aiOperations = properties.find(
			(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('ai'),
		);
		expect(aiOperations?.options).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'Respond to Agent Chat (Beta)',
					value: 'respondToAgentChat',
				}),
				expect.objectContaining({
					name: 'Respond to Agent Mention (Beta)',
					value: 'respondToAgentMention',
				}),
			]),
		);
	});

	it('hides the credential only for the chat reply operation', () => {
		const credentials = new Monday().description.credentials ?? [];
		expect(credentials[0].displayOptions?.hide?.operation).toEqual(['respondToAgentChat']);
	});
});

// AI: Respond to Agent Mention — Update: Create with board/item/reply-to
// targeting read from the trigger's mention event data instead of params.
describe('respondToAgentMention execute path', () => {
	function makeMentionContext(
		params: Record<string, unknown>,
		items: Array<{ json: Record<string, unknown> }>,
		apiResponse: IDataObject = { data: { create_update: { id: '901' } } },
	) {
		const httpRequest = vi.fn(async () => apiResponse);
		const context = {
			getInputData: () => items,
			getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
				params[name] ?? fallback,
			continueOnFail: () => false,
			getNode: () => ({ name: 'monday.com', type: 'CUSTOM.monday', typeVersion: 1 }),
			helpers: { httpRequestWithAuthentication: httpRequest },
		} as unknown as IExecuteFunctions;
		return { context, httpRequest };
	}

	const node = new Monday();
	const params = {
		operation: 'respondToAgentMention',
		mentionReplyText: 'On it!',
		respondToAgentMentionOptions: {},
	};

	it('posts a threaded reply using itemId/updateId from the trigger payload', async () => {
		const items = [
			{ json: { triggerType: 'mention', payload: { itemId: 123, boardId: 456, updateId: 789 } } },
		];
		const { context, httpRequest } = makeMentionContext(params, items);

		const result = await node.execute.call(context);

		expect(httpRequest).toHaveBeenCalledTimes(1);
		const requestBody = (httpRequest.mock.calls[0] as unknown[])[1] as {
			body: { query: string; variables: Record<string, unknown> };
		};
		expect(requestBody.body.query).toContain('create_update');
		expect(requestBody.body.variables).toMatchObject({
			itemId: '123',
			body: 'On it!',
			parentId: '789',
		});
		expect(result[0][0].json).toEqual({ id: '901' });
	});

	it('falls back to a top-level update when the payload has no updateId', async () => {
		const items = [{ json: { payload: { itemId: '123' } } }];
		const { context, httpRequest } = makeMentionContext(params, items);

		await node.execute.call(context);

		const requestBody = (httpRequest.mock.calls[0] as unknown[])[1] as {
			body: { variables: Record<string, unknown> };
		};
		expect(requestBody.body.variables.parentId).toBeNull();
	});

	it('throws a clear error when no mention context reached the input', async () => {
		const { context, httpRequest } = makeMentionContext(params, [
			{ json: { output: 'ai text without trigger fields' } },
		]);

		await expect(node.execute.call(context)).rejects.toThrow(
			'No agent mention found in the input data',
		);
		expect(httpRequest).not.toHaveBeenCalled();
	});
});
