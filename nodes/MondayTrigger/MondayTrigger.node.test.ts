/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any, @n8n/community-nodes/no-dangerous-functions */
import { createHmac } from 'node:crypto';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
	buildEventSubscriptions,
	buildOutputsFromParameters,
	buildWebhookConfig,
	COMBINED_EVENTS,
	loadConnectedAgentOptions,
	MondayTrigger,
	routeCombinedEvent,
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
		// The description carries the same logic as an inline expression —
		// keep them in sync by evaluating the expression body directly.
		// Tests never ship, so Function is fine here.
		const expression = trigger.description.outputs as string;
		const inner = expression.replace(/^=\{\{/, '').replace(/\}\}$/, '');
		const evaluate = new Function(
			'$parameter',
			`return (${inner
				.replace(/\$parameter\["event"\]/g, '$parameter.event')
				.replace(/\$parameter\["triggerTypes"\]/g, '$parameter.triggerTypes')
				.replace(/\$parameter\["itemScope"\]/g, '$parameter.itemScope')});`,
		);
		const cases: Array<[string, string[], string | undefined]> = [
			['item_restored', [], undefined],
			['change_column_value', [], 'all'],
			['agent_interaction', [], undefined],
			['agent_interaction', ['chat'], undefined],
			['agent_interaction', ['mention', 'assigned'], undefined],
			['agent_interaction', ['assigned', 'chat', 'mention'], undefined],
			// Every combined-event key must be inlined in the expression.
			...Object.keys(COMBINED_EVENTS).flatMap(
				(event): Array<[string, string[], string | undefined]> => [
					[event, [], 'all'],
					[event, [], 'top'],
					[event, [], 'subitems'],
					[event, [], undefined],
				],
			),
		];
		for (const [event, selection, scope] of cases) {
			expect(evaluate({ event, triggerTypes: selection, itemScope: scope })).toEqual(
				buildOutputsFromParameters(event, selection, scope),
			);
		}
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

	const agentParams = () => ({ event: 'agent_interaction' });

	const mockAgentIdentity = () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: {
				me: {
					id: '110197650',
					name: 'n8n test k',
					kind: 'external_agent_member',
					email: 'agent-187604@agent.monday.com',
				},
			},
		});
		// custom_agents enrichment fails for agent tokens — fall back to me/email.
		httpRequestWithAuthentication.mockResolvedValueOnce({
			errors: [{ message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
		});
	};

	it('checkExists is true only when callback URL and signing secret are persisted', async () => {
		expect(await hooks.checkExists.call(makeHookContext(agentParams(), {}))).toBe(false);
		expect(
			await hooks.checkExists.call(
				makeHookContext(agentParams(), {
					callbackUrl: 'https://n8n.example.com/webhook/abc',
					signingSecret: 'abc',
				}),
			),
		).toBe(true);
		expect(
			await hooks.checkExists.call(
				makeHookContext(agentParams(), {
					callbackUrl: 'https://other.example.com/webhook/abc',
					signingSecret: 'abc',
				}),
			),
		).toBe(false);
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('create registers callback via agent token (no agent_id) and stores signing_secret', async () => {
		mockAgentIdentity();
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: {
				update_custom_agent: { success: true, signing_secret: 'deadbeef'.repeat(8) },
			},
		});
		const staticData: Record<string, unknown> = {};
		const context = makeHookContext(agentParams(), staticData);

		expect(await hooks.create.call(context)).toBe(true);

		// me + custom_agents + update_custom_agent
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
		const [, updateRequest] = httpRequestWithAuthentication.mock.calls[2];
		expect(updateRequest.headers['API-Version']).toBe('dev');
		expect(updateRequest.headers['User-Agent']).toBe('n8n-monday');
		expect(updateRequest.body.query).toContain('update_custom_agent');
		expect(updateRequest.body.query).toContain('signing_secret');
		expect(updateRequest.body.variables).toEqual({
			input: { callback_url: 'https://n8n.example.com/webhook/abc' },
		});
		expect(staticData).toMatchObject({
			agentId: '187604',
			agentName: 'n8n test k',
			agentUserId: '110197650',
			agentKind: 'EXTERNAL',
			callbackUrl: 'https://n8n.example.com/webhook/abc',
			signingSecret: 'deadbeef'.repeat(8),
		});
	});

	it('create rejects a non-agent (owner) token before updating the callback', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { me: { id: '109088039', name: 'Daniel Hai', kind: 'admin', email: 'x@y.z' } },
		});
		await expect(hooks.create.call(makeHookContext(agentParams(), {}))).rejects.toMatchObject({
			message: 'This credential is not a Custom Agent API token',
			description: expect.stringContaining('external_agent'),
		});
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
	});

	it('create maps the not-owner/forbidden error to an actionable message', async () => {
		mockAgentIdentity();
		httpRequestWithAuthentication.mockResolvedValueOnce({
			errors: [
				{ message: 'Not authorized to update this agent', extensions: { code: 'FORBIDDEN' } },
			],
		});
		await expect(hooks.create.call(makeHookContext(agentParams(), {}))).rejects.toMatchObject({
			message: 'Not authorized to update this agent',
			description: expect.stringContaining('api_token'),
		});
	});

	it('create maps the HTTPS-only URL rejection to an actionable message', async () => {
		mockAgentIdentity();
		httpRequestWithAuthentication.mockResolvedValueOnce({
			errors: [{ message: 'callback_url must use HTTPS' }],
		});
		await expect(hooks.create.call(makeHookContext(agentParams(), {}))).rejects.toMatchObject({
			message: 'monday.com rejected the webhook URL',
			description: expect.stringContaining('WEBHOOK_URL'),
		});
	});

	it('create fails when signing_secret is missing from the response', async () => {
		mockAgentIdentity();
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { update_custom_agent: { success: true, signing_secret: null } },
		});
		await expect(hooks.create.call(makeHookContext(agentParams(), {}))).rejects.toMatchObject({
			message: expect.stringContaining('signing_secret'),
		});
	});

	it('delete never touches the agent, only clears static data', async () => {
		const staticData: Record<string, unknown> = {
			agentId: '187604',
			agentName: 'n8n test k',
			callbackUrl: 'x',
			signingSecret: 'secret',
		};
		expect(await hooks.delete.call(makeHookContext(agentParams(), staticData))).toBe(true);
		expect(staticData).toEqual({});
		expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
	});

	it('loadConnectedAgentOptions surfaces agent metadata from the token', async () => {
		mockAgentIdentity();
		const result = await loadConnectedAgentOptions.call(makeHookContext({}, {}));
		expect(result).toHaveLength(1);
		expect(result[0].value).toBe('187604');
		expect(result[0].name).toContain('n8n test k');
		expect(result[0].name).toContain('187604');
	});

	it('loadConnectedAgentOptions returns a warning option for owner tokens', async () => {
		httpRequestWithAuthentication.mockResolvedValueOnce({
			data: { me: { id: '1', name: 'Owner', kind: 'admin', email: null } },
		});
		const result = await loadConnectedAgentOptions.call(makeHookContext({}, {}));
		expect(result[0].value).toBe('');
		expect(result[0].name).toContain('⚠️');
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
				triggerTypes: ['chat', 'mention', 'assigned'],
			},
			{
				headers: signedHeaders('secret', raw),
				rawBody: Buffer.from(raw),
				staticData: { signingSecret: 'secret', agentId: '177035', agentName: 'E2E Test Agent' },
			},
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
			agentName: 'E2E Test Agent',
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
				triggerTypes: ['chat'],
			},
			{
				headers: signedHeaders('wrong-secret', raw),
				rawBody: Buffer.from(raw),
				staticData: { signingSecret: 'secret' },
			},
		);

		const result = await trigger.webhook.call(context);

		expect(status).toHaveBeenCalledWith(401);
		expect(json).toHaveBeenCalledWith({ error: 'Invalid signature' });
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('rejects deliveries when no signing secret was persisted on activation', async () => {
		const { context, status, json } = makeWebhookContext(chatBody, {
			event: 'agent_interaction',
			triggerTypes: ['chat'],
		});

		const result = await trigger.webhook.call(context);
		expect(status).toHaveBeenCalledWith(401);
		expect(json).toHaveBeenCalledWith(
			expect.objectContaining({ error: expect.stringContaining('signing secret') }),
		);
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('routes the live "mentioned" variant to the mention output and acknowledges immediately', async () => {
		const body = {
			event: 'agent_triggered',
			triggerType: 'mentioned',
			payload: { text: 'do the thing', itemId: 123, boardId: 456 },
			timestamp: '2026-07-16T12:00:00.000Z',
		};
		const raw = JSON.stringify(body);
		const { context, send } = makeWebhookContext(
			body,
			{
				event: 'agent_interaction',
				triggerTypes: ['chat', 'mention', 'assigned'],
			},
			{
				headers: signedHeaders('secret', raw),
				rawBody: Buffer.from(raw),
				staticData: { signingSecret: 'secret' },
			},
		);

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
		const raw = JSON.stringify(body);
		const { context, send } = makeWebhookContext(
			body,
			{
				event: 'agent_interaction',
				triggerTypes: ['chat'],
			},
			{
				headers: signedHeaders('secret', raw),
				rawBody: Buffer.from(raw),
				staticData: { signingSecret: 'secret' },
			},
		);

		const result = await trigger.webhook.call(context);
		expect(result).toEqual({ noWebhookResponse: true });
		// Bare [DONE] acknowledgement.
		expect(send).toHaveBeenCalledWith('data: [DONE]\n\n');
	});

	it('acknowledges unselected types with JSON when the request opted out of streaming', async () => {
		const body = { ...chatBody, triggerType: 'assigned', stream: false };
		const raw = JSON.stringify(body);
		const { context, json, send } = makeWebhookContext(
			body,
			{
				event: 'agent_interaction',
				triggerTypes: ['chat'],
			},
			{
				headers: signedHeaders('secret', raw),
				rawBody: Buffer.from(raw),
				staticData: { signingSecret: 'secret' },
			},
		);

		await trigger.webhook.call(context);
		expect(json).toHaveBeenCalledWith({ message: '' });
		expect(send).not.toHaveBeenCalled();
	});

	it('passes stream:false through to the item for the Respond to Agent node', async () => {
		const body = { ...chatBody, stream: false };
		const raw = JSON.stringify(body);
		const { context } = makeWebhookContext(
			body,
			{
				event: 'agent_interaction',
				triggerTypes: ['chat'],
			},
			{
				headers: signedHeaders('secret', raw),
				rawBody: Buffer.from(raw),
				staticData: { signingSecret: 'secret' },
			},
		);

		const result = await trigger.webhook.call(context);
		expect(result.workflowData![0][0].json).toMatchObject({ stream: false });
	});

	it('routes to the correct output when only some types are selected', async () => {
		const body = { ...chatBody, triggerType: 'assigned' };
		const raw = JSON.stringify(body);
		const { context, send } = makeWebhookContext(
			body,
			{
				event: 'agent_interaction',
				triggerTypes: ['mention', 'assigned'],
			},
			{
				headers: signedHeaders('secret', raw),
				rawBody: Buffer.from(raw),
				staticData: { signingSecret: 'secret' },
			},
		);

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
