/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any */
import { createHmac } from 'node:crypto';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
	buildEventSubscriptions,
	buildOutputsFromParameters,
	buildWebhookConfig,
	COMBINED_EVENTS,
	MondayTrigger,
	routeCombinedEvent,
	searchAgents,
} from './MondayTrigger.node';

const httpRequestWithAuthentication = vi.fn();

function makeHookContext(params: Record<string, unknown>, staticData: Record<string, unknown>) {
	return {
		getNodeParameter: (name: string, fallback?: unknown) => params[name] ?? fallback,
		getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/abc',
		getWorkflowStaticData: () => staticData,
		getNode: () => ({ name: 'monday.com Trigger', type: 'CUSTOM.mondayTrigger', typeVersion: 1 }),
		helpers: { httpRequestWithAuthentication },
	} as any;
}

interface WebhookExtras {
	headers?: Record<string, string>;
	rawBody?: Buffer;
	staticData?: Record<string, unknown>;
}

function makeWebhookContext(
	body: unknown,
	params: Record<string, unknown> = {},
	extras: WebhookExtras = {},
) {
	const status = vi.fn().mockReturnThis();
	const json = vi.fn();
	const send = vi.fn();
	const setHeader = vi.fn();
	return {
		context: {
			getBodyData: () => body,
			getHeaderData: () => extras.headers ?? {},
			getRequestObject: () => ({ rawBody: extras.rawBody }),
			getNodeParameter: (name: string, fallback?: unknown) => params[name] ?? fallback,
			getWorkflowStaticData: () => extras.staticData ?? {},
			getResponseObject: () => ({ status, json, send, setHeader }),
			getNode: () => ({ name: 'monday.com Trigger', type: 'CUSTOM.mondayTrigger', typeVersion: 1 }),
			helpers: {
				httpRequestWithAuthentication,
				returnJsonArray: (items: unknown[]) => items.map((json_) => ({ json: json_ })),
			},
		} as any,
		status,
		json,
		send,
		setHeader,
	};
}

const trigger = new MondayTrigger();
const hooks = trigger.webhookMethods.default;

describe('buildWebhookConfig', () => {
	it('builds a columnId config only for change_specific_column_value', () => {
		expect(buildWebhookConfig('change_specific_column_value', 'status_1')).toEqual({
			columnId: 'status_1',
		});
		expect(buildWebhookConfig('create_item', 'status_1', 'grp')).toBeUndefined();
	});

	it('builds a groupId config only for item_moved_to_specific_group', () => {
		expect(buildWebhookConfig('item_moved_to_specific_group', '', 'group_1')).toEqual({
			groupId: 'group_1',
		});
	});
});

describe('webhook lifecycle', () => {
	beforeEach(() => {
		httpRequestWithAuthentication.mockReset();
	});

	it('create registers the webhook and stores its ID', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { create_webhook: { id: '987' } },
		});
		const staticData: Record<string, unknown> = {};
		const context = makeHookContext(
			{ boardId: '111', event: 'item_restored', columnId: '', groupId: '' },
			staticData,
		);

		expect(await hooks.create.call(context)).toBe(true);
		expect(staticData.webhookId).toBe('987');

		const body = httpRequestWithAuthentication.mock.calls[0][1].body;
		expect(body.variables).toMatchObject({
			boardId: '111',
			url: 'https://n8n.example.com/webhook/abc',
			event: 'item_restored',
			config: null,
		});
	});

	it('create sends the config JSON for column-specific events', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { create_webhook: { id: '988' } },
		});
		const context = makeHookContext(
			{ boardId: '111', event: 'change_specific_column_value', columnId: 'status_1', groupId: '' },
			{},
		);

		await hooks.create.call(context);

		const body = httpRequestWithAuthentication.mock.calls[0][1].body;
		expect(body.variables.config).toBe('{"columnId":"status_1"}');
	});

	it('create maps the unreachable-URL failure to an actionable error', async () => {
		// monday returns a bare "Internal Server Error" when it cannot deliver
		// the challenge to the webhook URL (e.g. localhost).
		httpRequestWithAuthentication.mockResolvedValueOnce({
			errors: [{ message: 'Internal Server Error' }],
		});
		const context = makeHookContext(
			{ boardId: '111', event: 'item_restored', columnId: '', groupId: '' },
			{},
		);

		await expect(hooks.create.call(context)).rejects.toMatchObject({
			message: 'monday.com could not verify the webhook URL',
			description: expect.stringContaining('WEBHOOK_URL'),
		});
	});

	it('checkExists is false without a stored ID and true when monday still has it', async () => {
		expect(await hooks.checkExists.call(makeHookContext({ boardId: '111' }, {}))).toBe(false);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();

		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { webhooks: [{ id: '987' }, { id: '111' }] },
		});
		expect(
			await hooks.checkExists.call(makeHookContext({ boardId: '111' }, { webhookId: '987' })),
		).toBe(true);

		httpRequestWithAuthentication.mockResolvedValueOnce({ data: { webhooks: [] } });
		expect(
			await hooks.checkExists.call(makeHookContext({ boardId: '111' }, { webhookId: '987' })),
		).toBe(false);
	});

	it('delete removes the webhook and clears the stored ID', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { delete_webhook: { id: '987' } },
		});
		const staticData: Record<string, unknown> = { webhookId: '987' };

		expect(await hooks.delete.call(makeHookContext({}, staticData))).toBe(true);
		expect(staticData.webhookId).toBeUndefined();
		expect(httpRequestWithAuthentication.mock.calls[0][1].body.variables).toEqual({ id: '987' });
	});

	it('delete tolerates a webhook already removed in monday', async () => {
		httpRequestWithAuthentication.mockRejectedValueOnce(new Error('not found'));
		const staticData: Record<string, unknown> = { webhookId: '987' };

		expect(await hooks.delete.call(makeHookContext({}, staticData))).toBe(true);
		expect(staticData.webhookId).toBeUndefined();
	});
});

describe('webhook()', () => {
	beforeEach(() => {
		httpRequestWithAuthentication.mockReset();
	});

	it('echoes the registration challenge without emitting workflow data', async () => {
		const { context, status, json } = makeWebhookContext({ challenge: 'abc123' });

		const result = await trigger.webhook.call(context);

		expect(result).toEqual({ noWebhookResponse: true });
		expect(status).toHaveBeenCalledWith(200);
		expect(json).toHaveBeenCalledWith({ challenge: 'abc123' });
	});

	it('emits the event payload as one item', async () => {
		const event = { type: 'create_item', pulseId: 42, boardId: 111 };
		const { context } = makeWebhookContext({ event });

		const result = await trigger.webhook.call(context);

		expect(result.workflowData).toEqual([[{ json: event }]]);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('enriches the item when the option is on and the event carries a pulseId', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { items: [{ id: '42', name: 'Enriched' }] },
		});
		const event = { type: 'create_item', pulseId: 42 };
		const { context } = makeWebhookContext({ event }, { options: { enrichItem: true } });

		const result = await trigger.webhook.call(context);

		const output = (result.workflowData as any)[0][0].json;
		expect(output.item).toEqual({ id: '42', name: 'Enriched' });
		expect(httpRequestWithAuthentication.mock.calls[0][1].body.variables).toEqual({
			ids: ['42'],
		});
	});

	it('does not enrich events without an item, even with the option on', async () => {
		const event = { type: 'delete_update', boardId: 111 };
		const { context } = makeWebhookContext({ event }, { options: { enrichItem: true } });

		const result = await trigger.webhook.call(context);

		expect((result.workflowData as any)[0][0].json.item).toBeUndefined();
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});
});

describe('buildOutputsFromParameters', () => {
	it('gives board events a single unlabeled main output', () => {
		expect(buildOutputsFromParameters('item_restored', ['chat'])).toEqual([{ type: 'main' }]);
	});

	it('creates one output per selected agent trigger type in canonical order', () => {
		expect(buildOutputsFromParameters('agent_interaction', ['assigned', 'chat'])).toEqual([
			{ type: 'main', displayName: 'Chat' },
			{ type: 'main', displayName: 'Assigned' },
		]);
	});

	it('falls back to all three agent outputs for an empty selection', () => {
		expect(
			buildOutputsFromParameters('agent_interaction', []).map((o) => o.displayName),
		).toEqual(['Chat', 'Mention', 'Assigned']);
	});

	it('gives combined events two labeled outputs for all items, one for a narrowed scope', () => {
		for (const event of Object.keys(COMBINED_EVENTS)) {
			expect(buildOutputsFromParameters(event, [], 'all')).toEqual([
				{ type: 'main', displayName: 'Items' },
				{ type: 'main', displayName: 'Subitems' },
			]);
			expect(buildOutputsFromParameters(event, [], 'top')).toEqual([
				{ type: 'main', displayName: 'Items' },
			]);
			expect(buildOutputsFromParameters(event, [], 'subitems')).toEqual([
				{ type: 'main', displayName: 'Subitems' },
			]);
			// Undefined scope (fresh node) behaves like the 'all' default.
			expect(buildOutputsFromParameters(event, [], undefined)).toHaveLength(2);
		}
	});

	it('matches the inlined outputs expression in the node description', () => {
		// The expression mirrors buildOutputsFromParameters but must be a
		// self-contained string (n8n evaluates it without module context).
		// Dynamic evaluation is off-limits under n8n's community-node rules
		// (no `Function`/`eval`, `node:vm` is not an allowed import), so
		// assert the structural pieces the two implementations share.
		const expression = trigger.description.outputs as string;
		expect(expression.startsWith('={{')).toBe(true);
		expect(expression.endsWith('}}')).toBe(true);

		// Combined-event keys are interpolated from COMBINED_EVENTS at module
		// load, so the two lists cannot drift — pin the interpolated form.
		expect(expression).toContain(`${JSON.stringify(Object.keys(COMBINED_EVENTS))}.includes(event)`);

		// Combined events: per-scope outputs, same shapes as the function.
		expect(expression).toContain(`if (scope === 'top') return [{ type: 'main', displayName: 'Items' }]`);
		expect(expression).toContain(`if (scope === 'subitems') return [{ type: 'main', displayName: 'Subitems' }]`);
		expect(expression).toContain(
			`return [{ type: 'main', displayName: 'Items' }, { type: 'main', displayName: 'Subitems' }]`,
		);

		// Board events: single unlabeled output.
		expect(expression).toContain(`if (event !== 'agent_interaction') return [{ type: 'main' }]`);

		// Agent interaction: canonical order, labels, and all-three fallback.
		expect(expression).toContain(`const order = ['chat', 'mention', 'assigned']`);
		expect(expression).toContain(`const labels = { chat: 'Chat', mention: 'Mention', assigned: 'Assigned' }`);
		expect(expression).toContain(`(active.length > 0 ? active : order)`);

		// The expression reads exactly the parameters the function takes.
		expect(expression).toContain(
			`($parameter["event"], $parameter["triggerTypes"], $parameter["itemScope"])`,
		);
	});
});

describe('combined events', () => {
	beforeEach(() => {
		httpRequestWithAuthentication.mockReset();
	});

	it('pairs each item-level event with its subitem-level event', () => {
		expect(COMBINED_EVENTS.create_item).toBe('create_subitem');
		expect(COMBINED_EVENTS.change_column_value).toBe('change_subitem_column_value');
		expect(COMBINED_EVENTS.change_name).toBe('change_subitem_name');
		expect(COMBINED_EVENTS.item_archived).toBe('subitem_archived');
		expect(COMBINED_EVENTS.item_deleted).toBe('subitem_deleted');
		expect(COMBINED_EVENTS.create_update).toBe('create_subitem_update');
	});

	it('maps each scope to the monday events to register, for every pair', () => {
		for (const [itemEvent, subitemEvent] of Object.entries(COMBINED_EVENTS)) {
			expect(buildEventSubscriptions(itemEvent, 'all')).toEqual([itemEvent, subitemEvent]);
			expect(buildEventSubscriptions(itemEvent, 'top')).toEqual([itemEvent]);
			expect(buildEventSubscriptions(itemEvent, 'subitems')).toEqual([subitemEvent]);
		}
	});

	it('routes deliveries per scope', () => {
		expect(routeCombinedEvent('all', false)).toEqual({ outputCount: 2, outputIndex: 0 });
		expect(routeCombinedEvent('all', true)).toEqual({ outputCount: 2, outputIndex: 1 });
		expect(routeCombinedEvent('top', false)).toEqual({ outputCount: 1, outputIndex: 0 });
		expect(routeCombinedEvent('subitems', true)).toEqual({ outputCount: 1, outputIndex: 0 });
	});

	const testEventParams = (scope: string) => ({
		boardId: '111',
		event: 'create_item',
		itemScope: scope,
	});

	it('create registers two webhooks for all-items scope and stores both IDs', async () => {
		httpRequestWithAuthentication
			.mockResolvedValueOnce({ data: { create_webhook: { id: '901' } } })
			.mockResolvedValueOnce({ data: { create_webhook: { id: '902' } } });
		const staticData: Record<string, unknown> = {};

		expect(await hooks.create.call(makeHookContext(testEventParams('all'), staticData))).toBe(
			true,
		);
		expect(staticData.webhookIds).toEqual(['901', '902']);
		expect(staticData.webhookId).toBeUndefined();

		const events = httpRequestWithAuthentication.mock.calls.map(
			(call) => call[1].body.variables.event,
		);
		expect(events).toEqual(['create_item', 'create_subitem']);
	});

	it('create registers a single webhook for a narrowed scope', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { create_webhook: { id: '903' } },
		});
		const staticData: Record<string, unknown> = {};

		await hooks.create.call(makeHookContext(testEventParams('subitems'), staticData));

		expect(staticData.webhookIds).toEqual(['903']);
		expect(httpRequestWithAuthentication.mock.calls[0][1].body.variables.event).toBe(
			'create_subitem',
		);
	});

	it('create rolls back the first webhook when the second registration fails', async () => {
		httpRequestWithAuthentication
			.mockResolvedValueOnce({ data: { create_webhook: { id: '901' } } })
			.mockResolvedValueOnce({ errors: [{ message: 'Internal Server Error' }] })
			.mockResolvedValueOnce({ data: { delete_webhook: { id: '901' } } });
		const staticData: Record<string, unknown> = {};

		await expect(
			hooks.create.call(makeHookContext(testEventParams('all'), staticData)),
		).rejects.toMatchObject({ message: 'monday.com could not verify the webhook URL' });

		expect(staticData.webhookIds).toBeUndefined();
		// Third call is the rollback delete of the first webhook.
		const rollback = httpRequestWithAuthentication.mock.calls[2][1].body;
		expect(rollback.query).toContain('delete_webhook');
		expect(rollback.variables).toEqual({ id: '901' });
	});

	it('checkExists requires all stored webhooks to exist and the count to match the scope', async () => {
		// No stored IDs yet.
		expect(
			await hooks.checkExists.call(makeHookContext(testEventParams('all'), {})),
		).toBe(false);

		// Scope changed from all → top: stored pair no longer matches.
		expect(
			await hooks.checkExists.call(
				makeHookContext(testEventParams('top'), { webhookIds: ['901', '902'] }),
			),
		).toBe(false);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();

		// Both present in monday → true.
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { webhooks: [{ id: '901' }, { id: '902' }] },
		});
		expect(
			await hooks.checkExists.call(
				makeHookContext(testEventParams('all'), { webhookIds: ['901', '902'] }),
			),
		).toBe(true);

		// One deleted in monday → false.
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { webhooks: [{ id: '901' }] },
		});
		expect(
			await hooks.checkExists.call(
				makeHookContext(testEventParams('all'), { webhookIds: ['901', '902'] }),
			),
		).toBe(false);
	});

	it('delete removes every stored webhook and clears the array', async () => {
		httpRequestWithAuthentication
			.mockResolvedValueOnce({ data: { delete_webhook: { id: '901' } } })
			.mockResolvedValueOnce({ data: { delete_webhook: { id: '902' } } });
		const staticData: Record<string, unknown> = { webhookIds: ['901', '902'] };

		expect(await hooks.delete.call(makeHookContext(testEventParams('all'), staticData))).toBe(
			true,
		);
		expect(staticData.webhookIds).toBeUndefined();
		const deletedIds = httpRequestWithAuthentication.mock.calls.map(
			(call) => call[1].body.variables.id,
		);
		expect(deletedIds).toEqual(['901', '902']);
	});

	it('webhook routes a top-level item to the Items output', async () => {
		const event = { type: 'create_pulse', pulseId: 42, boardId: 111 };
		const { context } = makeWebhookContext({ event }, testEventParams('all'));

		const result = await trigger.webhook.call(context);

		expect(result.workflowData).toHaveLength(2);
		expect((result.workflowData as any)[0][0].json).toMatchObject({
			pulseId: 42,
			isSubitem: false,
		});
		expect((result.workflowData as any)[1]).toHaveLength(0);
	});

	it('webhook routes a subitem (parentItemId present) to the Subitems output', async () => {
		const event = {
			type: 'create_pulse',
			pulseId: 43,
			boardId: 222,
			parentItemId: '42',
			parentItemBoardId: '111',
		};
		const { context } = makeWebhookContext({ event }, testEventParams('all'));

		const result = await trigger.webhook.call(context);

		expect(result.workflowData).toHaveLength(2);
		expect((result.workflowData as any)[0]).toHaveLength(0);
		expect((result.workflowData as any)[1][0].json).toMatchObject({
			pulseId: 43,
			isSubitem: true,
			parentItemId: '42',
		});
	});

	it('webhook routes column-change deliveries by parentItemId presence', async () => {
		// Payload shape for the change_subitem_column_value pair is assumed to
		// match the create pair (parentItemId on subitem deliveries) — flagged
		// for live verification in the verify pass.
		const params = { boardId: '111', event: 'change_column_value', itemScope: 'all' };

		const topLevel = { type: 'update_column_value', pulseId: 50, boardId: 111, columnId: 'status' };
		let { context } = makeWebhookContext({ event: topLevel }, params);
		let result = await trigger.webhook.call(context);
		expect(result.workflowData).toHaveLength(2);
		expect((result.workflowData as any)[0][0].json).toMatchObject({
			pulseId: 50,
			isSubitem: false,
		});
		expect((result.workflowData as any)[1]).toHaveLength(0);

		const subitem = { ...topLevel, pulseId: 51, boardId: 222, parentItemId: '50' };
		({ context } = makeWebhookContext({ event: subitem }, params));
		result = await trigger.webhook.call(context);
		expect((result.workflowData as any)[0]).toHaveLength(0);
		expect((result.workflowData as any)[1][0].json).toMatchObject({
			pulseId: 51,
			isSubitem: true,
			parentItemId: '50',
		});
	});

	it('webhook routes name-change deliveries by parentItemId presence', async () => {
		// Payload shape for the change_subitem_name pair is assumed to match
		// the create pair (parentItemId on subitem deliveries) — flagged for
		// live verification in the verify pass.
		const params = { boardId: '111', event: 'change_name', itemScope: 'all' };

		const topLevel = { type: 'update_name', pulseId: 60, boardId: 111, value: { name: 'New' } };
		let { context } = makeWebhookContext({ event: topLevel }, params);
		let result = await trigger.webhook.call(context);
		expect(result.workflowData).toHaveLength(2);
		expect((result.workflowData as any)[0][0].json).toMatchObject({
			pulseId: 60,
			isSubitem: false,
		});
		expect((result.workflowData as any)[1]).toHaveLength(0);

		const subitem = { ...topLevel, pulseId: 61, boardId: 222, parentItemId: '60' };
		({ context } = makeWebhookContext({ event: subitem }, params));
		result = await trigger.webhook.call(context);
		expect((result.workflowData as any)[0]).toHaveLength(0);
		expect((result.workflowData as any)[1][0].json).toMatchObject({
			pulseId: 61,
			isSubitem: true,
			parentItemId: '60',
		});
	});

	it('webhook routes archive deliveries by parentItemId presence', async () => {
		// Payload shape for the subitem_archived pair is assumed to match the
		// create pair (parentItemId on subitem deliveries) — flagged for live
		// verification in the verify pass.
		const params = { boardId: '111', event: 'item_archived', itemScope: 'all' };

		const topLevel = { type: 'archive_pulse', pulseId: 70, boardId: 111 };
		let { context } = makeWebhookContext({ event: topLevel }, params);
		let result = await trigger.webhook.call(context);
		expect(result.workflowData).toHaveLength(2);
		expect((result.workflowData as any)[0][0].json).toMatchObject({
			pulseId: 70,
			isSubitem: false,
		});
		expect((result.workflowData as any)[1]).toHaveLength(0);

		const subitem = { ...topLevel, pulseId: 71, boardId: 222, parentItemId: '70' };
		({ context } = makeWebhookContext({ event: subitem }, params));
		result = await trigger.webhook.call(context);
		expect((result.workflowData as any)[0]).toHaveLength(0);
		expect((result.workflowData as any)[1][0].json).toMatchObject({
			pulseId: 71,
			isSubitem: true,
			parentItemId: '70',
		});
	});

	it('webhook routes delete deliveries by parentItemId presence', async () => {
		// Payload shape for the subitem_deleted pair is assumed to match the
		// create pair (parentItemId on subitem deliveries) — flagged for live
		// verification in the verify pass (deleted-item payloads may be lean;
		// subscriptionId routing is the fallback if parent fields are absent).
		const params = { boardId: '111', event: 'item_deleted', itemScope: 'all' };

		const topLevel = { type: 'delete_pulse', pulseId: 80, boardId: 111 };
		let { context } = makeWebhookContext({ event: topLevel }, params);
		let result = await trigger.webhook.call(context);
		expect(result.workflowData).toHaveLength(2);
		expect((result.workflowData as any)[0][0].json).toMatchObject({
			pulseId: 80,
			isSubitem: false,
		});
		expect((result.workflowData as any)[1]).toHaveLength(0);

		const subitem = { ...topLevel, pulseId: 81, boardId: 222, parentItemId: '80' };
		({ context } = makeWebhookContext({ event: subitem }, params));
		result = await trigger.webhook.call(context);
		expect((result.workflowData as any)[0]).toHaveLength(0);
		expect((result.workflowData as any)[1][0].json).toMatchObject({
			pulseId: 81,
			isSubitem: true,
			parentItemId: '80',
		});
	});

	it('webhook routes update-created deliveries by parentItemId presence', async () => {
		// HIGHEST routing risk of the merged pairs: monday's documented
		// create_update payload does not list parentItemId, so
		// create_subitem_update deliveries may lack it too. This test encodes
		// the standard parentItemId-presence assumption — MUST be verified
		// live; the fallback is subscriptionId-based routing (playbook §7).
		const params = { boardId: '111', event: 'create_update', itemScope: 'all' };

		const topLevel = {
			type: 'create_update',
			pulseId: 90,
			boardId: 111,
			updateId: 900,
			body: '<p>hi</p>',
			textBody: 'hi',
		};
		let { context } = makeWebhookContext({ event: topLevel }, params);
		let result = await trigger.webhook.call(context);
		expect(result.workflowData).toHaveLength(2);
		expect((result.workflowData as any)[0][0].json).toMatchObject({
			pulseId: 90,
			isSubitem: false,
		});
		expect((result.workflowData as any)[1]).toHaveLength(0);

		const subitem = { ...topLevel, pulseId: 91, boardId: 222, updateId: 901, parentItemId: '90' };
		({ context } = makeWebhookContext({ event: subitem }, params));
		result = await trigger.webhook.call(context);
		expect((result.workflowData as any)[0]).toHaveLength(0);
		expect((result.workflowData as any)[1][0].json).toMatchObject({
			pulseId: 91,
			isSubitem: true,
			parentItemId: '90',
		});
	});

	it('webhook emits a single output for a narrowed scope', async () => {
		const event = { type: 'create_pulse', pulseId: 44, boardId: 111 };
		const { context } = makeWebhookContext({ event }, testEventParams('top'));

		const result = await trigger.webhook.call(context);

		expect(result.workflowData).toHaveLength(1);
		expect((result.workflowData as any)[0][0].json).toMatchObject({
			pulseId: 44,
			isSubitem: false,
		});
	});

	it('webhook still echoes the challenge for a combined event', async () => {
		const { context, json } = makeWebhookContext({ challenge: 'xyz' }, testEventParams('all'));

		const result = await trigger.webhook.call(context);

		expect(result).toEqual({ noWebhookResponse: true });
		expect(json).toHaveBeenCalledWith({ challenge: 'xyz' });
	});
});

describe('agent lifecycle (callback URL management)', () => {
	beforeEach(() => {
		httpRequestWithAuthentication.mockReset();
	});

	const agentParams = (agentId: string) => ({ event: 'agent_interaction', agentId });

	it('checkExists returns true (skip create) only when no agent ID is set', async () => {
		expect(await hooks.checkExists.call(makeHookContext(agentParams(''), {}))).toBe(true);
		expect(await hooks.checkExists.call(makeHookContext(agentParams('177035'), {}))).toBe(false);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('create repoints the callback URL via update_custom_agent on the dev API version', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { update_custom_agent: { success: true } },
		});
		const staticData: Record<string, unknown> = {};
		const context = makeHookContext(agentParams(' 177035 '), staticData);

		expect(await hooks.create.call(context)).toBe(true);

		const [, requestOptions] = httpRequestWithAuthentication.mock.calls[0];
		expect(requestOptions.headers['API-Version']).toBe('dev');
		expect(requestOptions.body.query).toContain('update_custom_agent');
		expect(requestOptions.body.variables).toEqual({
			input: { agent_id: 177035, callback_url: 'https://n8n.example.com/webhook/abc' },
		});
		expect(staticData).toEqual({
			agentId: '177035',
			callbackUrl: 'https://n8n.example.com/webhook/abc',
		});
	});

	it('create is a no-op without an agent ID (manual URL management)', async () => {
		expect(await hooks.create.call(makeHookContext(agentParams(''), {}))).toBe(true);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('create rejects a non-numeric agent ID before any API call', async () => {
		await expect(
			hooks.create.call(makeHookContext(agentParams('my-agent'), {})),
		).rejects.toMatchObject({ message: expect.stringContaining('must be numeric') });
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('create maps the not-owner error to an actionable message', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			errors: [
				{ message: 'Not authorized to update this agent', extensions: { code: 'FORBIDDEN' } },
			],
		});
		await expect(
			hooks.create.call(makeHookContext(agentParams('177035'), {})),
		).rejects.toMatchObject({
			message: 'Not authorized to update this agent',
			description: expect.stringContaining('owner'),
		});
	});

	it('create maps the HTTPS-only URL rejection to an actionable message', async () => {
		// Live error text from update_custom_agent (verified 2026-07-16).
		httpRequestWithAuthentication.mockResolvedValueOnce({
			errors: [{ message: 'callback_url must use HTTPS' }],
		});
		await expect(
			hooks.create.call(makeHookContext(agentParams('177035'), {})),
		).rejects.toMatchObject({
			message: 'monday.com rejected the webhook URL',
			description: expect.stringContaining('WEBHOOK_URL'),
		});
	});

	it('delete never touches the agent, only clears static data', async () => {
		const staticData: Record<string, unknown> = { agentId: '177035', callbackUrl: 'x' };
		expect(await hooks.delete.call(makeHookContext(agentParams('177035'), staticData))).toBe(true);
		expect(staticData).toEqual({});
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('searchAgents lists agents on the dev API version and filters client-side', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: {
				custom_agents: [
					{ id: 177035, state: 'active', profile: { name: 'Support Bot' } },
					{ id: 52822, state: 'active', profile: { name: 'n8n test k' } },
				],
			},
		});

		const result = await searchAgents.call(makeHookContext({}, {}), 'support');

		const [, requestOptions] = httpRequestWithAuthentication.mock.calls[0];
		expect(requestOptions.headers['API-Version']).toBe('dev');
		expect(requestOptions.body.query).toContain('custom_agents');
		expect(result.results).toEqual([{ name: 'Support Bot (177035)', value: '177035' }]);
	});
});

function signedHeaders(secret: string, rawBody: string, agentId = '177035') {
	const timestamp = '1782326623754';
	return {
		'x-monday-agent-id': agentId,
		'x-monday-timestamp': timestamp,
		'x-monday-signature': `sha256=${createHmac('sha256', secret)
			.update(`${timestamp}.${rawBody}`)
			.digest('hex')}`,
	};
}

describe('webhook() agent events', () => {
	const chatBody = {
		event: 'agent_triggered',
		triggerType: 'chat',
		payload: { text: 'hello agent' },
		timestamp: '2026-07-16T12:00:00.000Z',
	};

	it('routes a chat event to the chat output and defers the response', async () => {
		const raw = JSON.stringify(chatBody);
		const { context, send, json } = makeWebhookContext(
			chatBody,
			{
				event: 'agent_interaction',
				agentOptions: { signingSecret: 'secret' },
				triggerTypes: ['chat', 'mention', 'assigned'],
			},
			{ headers: signedHeaders('secret', raw), rawBody: Buffer.from(raw) },
		);

		const result = await trigger.webhook.call(context);

		// HTTP response is deferred to the Respond to Agent operation.
		expect(send).not.toHaveBeenCalled();
		expect(json).not.toHaveBeenCalled();
		expect(result.noWebhookResponse).toBeUndefined();
		expect(result.workflowData).toHaveLength(3);
		expect(result.workflowData![0]).toHaveLength(1);
		expect(result.workflowData![0][0].json).toMatchObject({
			triggerType: 'chat',
			text: 'hello agent',
			agentId: '177035',
			stream: true,
		});
		expect(result.workflowData![1]).toHaveLength(0);
		expect(result.workflowData![2]).toHaveLength(0);
	});

	it('rejects an invalid signature with 401 and does not start the workflow', async () => {
		const raw = JSON.stringify(chatBody);
		const { context, status, json } = makeWebhookContext(
			chatBody,
			{
				event: 'agent_interaction',
				agentOptions: { signingSecret: 'secret' },
				triggerTypes: ['chat'],
			},
			{ headers: signedHeaders('wrong-secret', raw), rawBody: Buffer.from(raw) },
		);

		const result = await trigger.webhook.call(context);

		expect(status).toHaveBeenCalledWith(401);
		expect(json).toHaveBeenCalledWith({ error: 'Invalid signature' });
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('skips verification when no signing secret is configured', async () => {
		const { context, status } = makeWebhookContext(chatBody, {
			event: 'agent_interaction',
			triggerTypes: ['chat'],
		});

		const result = await trigger.webhook.call(context);
		expect(status).not.toHaveBeenCalledWith(401);
		expect(result.workflowData![0]).toHaveLength(1);
	});

	it('routes the live "mentioned" variant to the mention output and acknowledges immediately', async () => {
		const body = {
			event: 'agent_triggered',
			triggerType: 'mentioned',
			payload: { text: 'do the thing', itemId: 123, boardId: 456 },
			timestamp: '2026-07-16T12:00:00.000Z',
		};
		const { context, send } = makeWebhookContext(body, {
			event: 'agent_interaction',
			triggerTypes: ['chat', 'mention', 'assigned'],
		});

		const result = await trigger.webhook.call(context);
		expect(result.workflowData![1][0].json).toMatchObject({
			triggerType: 'mention',
			payload: { itemId: 123, boardId: 456, text: 'do the thing' },
		});
		// Mention has no reply surface for the HTTP response — the trigger
		// acks so the workflow runs independently of the webhook.
		expect(result.noWebhookResponse).toBe(true);
		expect(send).toHaveBeenCalledWith('data: [DONE]\n\n');
	});

	it('acknowledges unselected trigger types without starting the workflow', async () => {
		const body = { ...chatBody, triggerType: 'assigned' };
		const { context, send } = makeWebhookContext(body, {
			event: 'agent_interaction',
			triggerTypes: ['chat'],
		});

		const result = await trigger.webhook.call(context);
		expect(result).toEqual({ noWebhookResponse: true });
		// Bare [DONE] acknowledgement.
		expect(send).toHaveBeenCalledWith('data: [DONE]\n\n');
	});

	it('acknowledges unselected types with JSON when the request opted out of streaming', async () => {
		const body = { ...chatBody, triggerType: 'assigned', stream: false };
		const { context, json, send } = makeWebhookContext(body, {
			event: 'agent_interaction',
			triggerTypes: ['chat'],
		});

		await trigger.webhook.call(context);
		expect(json).toHaveBeenCalledWith({ message: '' });
		expect(send).not.toHaveBeenCalled();
	});

	it('passes stream:false through to the item for the Respond to Agent node', async () => {
		const body = { ...chatBody, stream: false };
		const { context } = makeWebhookContext(body, {
			event: 'agent_interaction',
			triggerTypes: ['chat'],
		});

		const result = await trigger.webhook.call(context);
		expect(result.workflowData![0][0].json).toMatchObject({ stream: false });
	});

	it('routes to the correct output when only some types are selected', async () => {
		const body = { ...chatBody, triggerType: 'assigned' };
		const { context, send } = makeWebhookContext(body, {
			event: 'agent_interaction',
			triggerTypes: ['mention', 'assigned'],
		});

		const result = await trigger.webhook.call(context);
		// Outputs: [mention, assigned] — assigned is index 1.
		expect(result.workflowData).toHaveLength(2);
		expect(result.workflowData![0]).toHaveLength(0);
		expect(result.workflowData![1]).toHaveLength(1);
		// Assigned is acknowledged immediately, like mention.
		expect(result.noWebhookResponse).toBe(true);
		expect(send).toHaveBeenCalled();
	});
});
