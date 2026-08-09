import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { AgentIdentity, AgentTriggerType } from '../Monday/agentWebhook';
import {
	AGENT_SSE_HEADERS,
	AGENT_TRIGGER_TYPES,
	AGENT_TRIGGER_TYPE_LABELS,
	buildAgentSseBody,
	EXTERNAL_AGENT_DETACHED_USER_KIND,
	EXTERNAL_AGENT_USER_KIND,
	formatAgentIdentityLabel,
	isExternalAgentTokenKind,
	normalizeTriggerType,
	resolveSelectedTriggerTypes,
	verifyAgentSignature,
} from '../Monday/agentWebhook';
import { boardResourceLocator, searchBoards } from '../Monday/boardLocator';
import { getBoardColumns } from '../Monday/columnOptions';
import { MONDAY_AGENTS_API_VERSION } from '../Monday/constants';
import { getBoardGroups } from '../Monday/groupLocator';
import { MondayGraphQLClient } from '../Monday/MondayGraphQLClient';
import { COLUMN_VALUES_CALCULATED_ARG, LINKED_VALUE_FRAGMENTS } from '../Monday/multiLevel';

const AGENT_EVENT = 'agent_interaction';

const AGENT_BY_USER_QUERY = `query ($agentUserIds: [ID!]) {
	custom_agents(agent_user_ids: $agentUserIds, limit: 1) {
		id
		kind
		state
		agent_user_id
		app_feature_id
		goal
		created_at
		updated_at
		profile { name }
	}
}`;

type CustomAgentRow = {
	id?: string | number;
	kind?: string;
	state?: string;
	agent_user_id?: string | number | null;
	app_feature_id?: string | number | null;
	goal?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	profile?: { name?: string } | null;
};

/**
 * Resolves the Custom Agent bound to the selected monday API credential.
 * Relies on `me.kind === external_agent_member` (verified live). Agent tokens
 * cannot query `custom_agents` (returns Internal server error), so identity
 * comes from `me` — name, user id, and custom agent id parsed from
 * `agent-{id}@agent.monday.com`.
 */
export async function resolveConnectedAgentIdentity(
	this: ILoadOptionsFunctions | IHookFunctions,
): Promise<AgentIdentity> {
	const client = new MondayGraphQLClient(this, 'mondayApi', MONDAY_AGENTS_API_VERSION);
	const meData = await client.execute('query { me { id name kind email } }', 0);
	const me = (meData.me ?? {}) as {
		id?: string | number;
		name?: string;
		kind?: string;
		email?: string | null;
	};
	const kind = me.kind ?? '';
	if (!isExternalAgentTokenKind(kind)) {
		throw new NodeOperationError(
			this.getNode(),
			'This credential is not a Custom Agent API token',
			{
				description:
					`Agent Interaction requires the agent's own api_token (me.kind like "${EXTERNAL_AGENT_USER_KIND}" or "${EXTERNAL_AGENT_DETACHED_USER_KIND}"). ` +
					`This credential resolved to kind "${kind || 'unknown'}". ` +
					'Create a monday.com API credential with the api_token shown when the Custom Agent was created — owner/personal tokens will not work.',
			},
		);
	}
	const userId = String(me.id ?? '');
	if (!userId) {
		throw new NodeOperationError(this.getNode(), 'Could not resolve the agent user from this token');
	}

	const email = me.email ?? null;
	const emailMatch = email?.match(/^agent-(\d+)@agent\.monday\.com$/i);
	const agentIdFromEmail = emailMatch?.[1];

	// Best-effort enrichment via custom_agents — agent tokens currently 500
	// on this query (verified live), so failures are ignored and me/email used.
	let agent: CustomAgentRow | null = null;
	try {
		const data = await client.execute(AGENT_BY_USER_QUERY, 0, { agentUserIds: [userId] });
		const agents = (data.custom_agents ?? []) as CustomAgentRow[];
		agent = agents[0] ?? null;
	} catch {
		agent = null;
	}

	const agentId = agent?.id != null ? String(agent.id) : agentIdFromEmail;
	if (!agentId) {
		throw new NodeOperationError(
			this.getNode(),
			'Could not resolve the Custom Agent ID for this token',
			{
				description:
					'Expected me.email like agent-<id>@agent.monday.com for Custom Agent tokens. Re-create the agent credentials in monday.com and update this credential.',
			},
		);
	}

	return {
		userId,
		userName: me.name ?? '',
		kind,
		email,
		agentId,
		agentName: agent?.profile?.name ?? me.name ?? String(agentId),
		agentKind: agent?.kind ?? 'EXTERNAL',
		state: agent?.state ?? null,
		agentUserId: agent?.agent_user_id != null ? String(agent.agent_user_id) : userId,
		appFeatureId: agent?.app_feature_id != null ? String(agent.app_feature_id) : null,
		goal: agent?.goal ?? null,
		createdAt: agent?.created_at ?? null,
		updatedAt: agent?.updated_at ?? null,
	};
}

/**
 * loadOptions for the Connected Agent field — surfaces name, ID, and
 * metadata from the agent token so the user can confirm the credential
 * before activating. Returns a single warning option when the token is wrong.
 */
export async function loadConnectedAgentOptions(
	this: ILoadOptionsFunctions,
): Promise<Array<{ name: string; value: string }>> {
	try {
		const identity = await resolveConnectedAgentIdentity.call(this);
		const details = [
			`user ${identity.userId}`,
			identity.agentKind,
			identity.email,
		]
			.filter(Boolean)
			.join(' · ');
		return [
			{
				name: `${formatAgentIdentityLabel(identity)}${details ? ` — ${details}` : ''}`,
				value: identity.agentId,
			},
		];
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid agent credential';
		return [{ name: `⚠️ ${message}`, value: '' }];
	}
}

/**
 * Combined events: one dropdown entry that watches an event at both item
 * levels (item event → its subitem-level WebhookEventType). monday has no
 * combined WebhookEventType, so "all" scope registers TWO webhooks (one
 * per level, both on the parent board) on the same URL and the node
 * routes each delivery to its own output. When adding a pair here, also
 * add its key to the inlined `description.outputs` expression below.
 */
export const COMBINED_EVENTS: Record<string, string> = {
	create_item: 'create_subitem',
	change_column_value: 'change_subitem_column_value',
	change_name: 'change_subitem_name',
	item_archived: 'subitem_archived',
	item_deleted: 'subitem_deleted',
	// HIGHEST routing risk of the merged pairs: monday's documented
	// create_update payload (userId, boardId, pulseId, body, textBody,
	// updateId, replyId...) does NOT list parentItemId, and
	// create_subitem_update deliveries may lack it too. Verify live; if
	// subitem update deliveries carry no parentItemId, switch this pair to
	// subscriptionId-based routing (store per-level webhook ids at create,
	// match the delivery's subscriptionId) per MULTI_OUTPUT_TRIGGERS.md §7.
	create_update: 'create_subitem_update',
};

function isCombinedEvent(event: unknown): event is string {
	return typeof event === 'string' && COMBINED_EVENTS[event] !== undefined;
}

export type ItemScope = 'all' | 'top' | 'subitems';

/** monday webhook events to register for a combined event at the given scope. */
export function buildEventSubscriptions(event: string, scope: ItemScope): string[] {
	if (scope === 'top') return [event];
	if (scope === 'subitems') return [COMBINED_EVENTS[event]];
	return [event, COMBINED_EVENTS[event]];
}

/**
 * Output routing for a combined-event delivery. Subitem deliveries are
 * recognized by payload shape (parentItemId — verified live for the
 * create pair), never by event name: both levels arrive with the same
 * legacy type (e.g. "create_pulse").
 */
export function routeCombinedEvent(
	scope: ItemScope,
	isSubitem: boolean,
): { outputCount: number; outputIndex: number } {
	if (scope === 'all') return { outputCount: 2, outputIndex: isSubitem ? 1 : 0 };
	return { outputCount: 1, outputIndex: 0 };
}

/**
 * All WebhookEventType values of the pinned API version (verified live via
 * introspection on 2026-07). Grouped mentally as: item events, subitem
 * events, update events, structure events.
 */
const EVENT_OPTIONS = [
	{
		name: 'Agent Interaction (Beta)',
		value: AGENT_EVENT,
		action: 'On agent interaction',
		description: 'When a monday.com agent is triggered by a chat message, @mention, or assignment',
	},
	{ name: 'Column Created', value: 'create_column' },
	{
		name: 'Column Value Changed',
		value: 'change_column_value',
		description:
			'When any column value changes — on top-level items, subitems, or both, per the Items to Watch selection',
	},
	{
		name: 'Item Archived',
		value: 'item_archived',
		description:
			'When an item is archived — top-level items, subitems, or both, per the Items to Watch selection',
	},
	{
		name: 'Item Created',
		value: 'create_item',
		description:
			'When an item is created — top-level items, subitems, or both, per the Items to Watch selection',
	},
	{
		name: 'Item Deleted',
		value: 'item_deleted',
		description:
			'When an item is deleted — top-level items, subitems, or both, per the Items to Watch selection',
	},
	{ name: 'Item Moved to Any Group', value: 'item_moved_to_any_group' },
	{ name: 'Item Moved to Specific Group', value: 'item_moved_to_specific_group' },
	{
		name: 'Item Name Changed',
		value: 'change_name',
		description:
			'When an item is renamed — top-level items, subitems, or both, per the Items to Watch selection',
	},
	{ name: 'Item Restored', value: 'item_restored' },
	{ name: 'Specific Column Value Changed', value: 'change_specific_column_value' },
	{ name: 'Status Column Value Changed', value: 'change_status_column_value' },
	{ name: 'Subitem Moved', value: 'move_subitem' },
	{
		name: 'Update Created',
		value: 'create_update',
		description:
			'When an update is posted — on top-level items, subitems, or both, per the Items to Watch selection',
	},
	{ name: 'Update Deleted', value: 'delete_update' },
	{ name: 'Update Edited', value: 'edit_update' },
];

/**
 * Builds the create_webhook config JSON for events that need one.
 * Exported for unit tests.
 */
export function buildWebhookConfig(
	event: string,
	columnId?: string,
	groupId?: string,
): IDataObject | undefined {
	if (event === 'change_specific_column_value' && columnId) {
		return { columnId };
	}
	if (event === 'item_moved_to_specific_group' && groupId) {
		return { groupId };
	}
	return undefined;
}

/**
 * Outputs for the current parameters: board events get one main output;
 * the agent event gets one output per selected trigger type in canonical
 * order (chat, mention, assigned; empty selection = all three); combined
 * events get Items + Subitems outputs when watching all items, or one
 * labeled output for a narrowed scope. Inlined as an expression in
 * `description.outputs` — kept here as the tested source of truth for
 * that expression's logic.
 */
export function buildOutputsFromParameters(
	event: unknown,
	triggerTypes: unknown,
	itemScope?: unknown,
): Array<{ type: string; displayName?: string }> {
	if (isCombinedEvent(event)) {
		if (itemScope === 'top') return [{ type: 'main', displayName: 'Items' }];
		if (itemScope === 'subitems') return [{ type: 'main', displayName: 'Subitems' }];
		return [
			{ type: 'main', displayName: 'Items' },
			{ type: 'main', displayName: 'Subitems' },
		];
	}
	if (event !== 'agent_interaction') return [{ type: 'main' }];
	const order = ['chat', 'mention', 'assigned'];
	const labels: Record<string, string> = { chat: 'Chat', mention: 'Mention', assigned: 'Assigned' };
	const selected = Array.isArray(triggerTypes) ? (triggerTypes as string[]) : [];
	const active = order.filter((type) => selected.includes(type));
	return (active.length > 0 ? active : order).map((type) => ({
		type: 'main',
		displayName: labels[type],
	}));
}

/**
 * Sends the synchronous reply monday's agent run expects: SSE by default,
 * a single JSON object when the request opted out with `stream: false`.
 */
function sendAgentReply(
	response: ReturnType<IWebhookFunctions['getResponseObject']>,
	replyText: string,
	wantsStream: boolean,
): void {
	if (!wantsStream) {
		response.status(200).json({ message: replyText });
		return;
	}
	response.status(200);
	for (const [name, value] of Object.entries(AGENT_SSE_HEADERS)) {
		response.setHeader(name, value);
	}
	response.send(buildAgentSseBody(replyText));
}

/**
 * Handles an agent delivery: verifies the HMAC signature and routes the
 * event to the output of its trigger type. Chat defers the HTTP response
 * to the monday.com node's Respond to Agent Chat operation (the agent
 * chat renders it); mention/assigned are acknowledged immediately since
 * monday shows nothing from their HTTP response. Unknown or unselected
 * trigger types are acknowledged without starting the workflow.
 */
async function handleAgentWebhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
	const response = this.getResponseObject();
	const body = this.getBodyData();
	const staticData = this.getWorkflowStaticData('node');

	// Signature check first — before trusting anything in the body. The
	// HMAC covers `${timestamp}.${rawBody}` with the signing secret returned
	// by update_custom_agent (persisted on activation). Raw request bytes,
	// not re-serialized JSON.
	const signingSecret = String(staticData.signingSecret ?? '');
	if (!signingSecret) {
		response.status(401).json({
			error: 'Agent signing secret is missing — activate the workflow with a Custom Agent API token to register the callback URL',
		});
		return { noWebhookResponse: true };
	}
	const request = this.getRequestObject() as { rawBody?: Buffer } & ReturnType<
		IWebhookFunctions['getRequestObject']
	>;
	const headers = this.getHeaderData();
	const valid = verifyAgentSignature(
		signingSecret,
		request.rawBody ?? JSON.stringify(body ?? {}),
		headers['x-monday-timestamp'] as string | undefined,
		headers['x-monday-signature'] as string | undefined,
	);
	if (!valid) {
		response.status(401).json({ error: 'Invalid signature' });
		return { noWebhookResponse: true };
	}

	const triggerType = normalizeTriggerType(body.triggerType);
	const activeTypes = resolveSelectedTriggerTypes(this.getNodeParameter('triggerTypes', []));
	const outputIndex = activeTypes.indexOf(triggerType as AgentTriggerType);
	const wantsStream = body.stream !== false;

	// Unknown or unselected trigger type: acknowledge so the agent run
	// completes cleanly, but don't start the workflow.
	if (outputIndex === -1) {
		sendAgentReply(response, '', wantsStream);
		return { noWebhookResponse: true };
	}

	const payload = (body.payload ?? {}) as IDataObject;
	const headerAgentId = this.getHeaderData()['x-monday-agent-id'] as string | undefined;
	const item: IDataObject = {
		triggerType,
		text: payload.text ?? null,
		payload,
		timestamp: body.timestamp ?? null,
		agentId: headerAgentId ?? (staticData.agentId as string | undefined) ?? null,
		agentName: (staticData.agentName as string | undefined) ?? null,
		agentUserId: (staticData.agentUserId as string | undefined) ?? null,
		agentKind: (staticData.agentKind as string | undefined) ?? null,
		stream: wantsStream,
	};

	// Route to the matched output only; all other outputs stay empty.
	const workflowData = activeTypes.map((type, index) =>
		index === outputIndex ? this.helpers.returnJsonArray([item]) : [],
	);

	// Chat is the only trigger type whose HTTP response is shown in monday
	// (the agent chat renders it) — defer it so the workflow can compute
	// the reply and return it via the monday.com node's Respond to Agent
	// Chat operation.
	if (triggerType === 'chat') {
		return { workflowData };
	}

	// Mention/assigned have no reply surface for the HTTP response — monday
	// shows nothing from it. Acknowledge right away so the agent run
	// completes; the workflow continues independently and responds via the
	// API (Respond to Agent Mention, or e.g. Create Update for assigned).
	sendAgentReply(response, '', wantsStream);
	return { workflowData, noWebhookResponse: true };
}

// Webhook trigger nodes can't be AI tools (usableAsTool's type only allows `true`).
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class MondayTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'monday.com Trigger',
		name: 'mondayTrigger',
		icon: { light: 'file:../Monday/monday.svg', dark: 'file:../Monday/monday.dark.svg' },
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when monday.com board events or agent interactions occur',
		subtitle: '={{$parameter["event"]}}',
		defaults: {
			name: 'monday.com Trigger',
		},
		inputs: [],
		// Board events: one main output. Agent Interaction: one output per
		// selected trigger type. Combined events: Items + Subitems outputs
		// (or one, per scope). Logic mirrored by buildOutputsFromParameters;
		// the expression can't reference module constants, so the
		// COMBINED_EVENTS keys are inlined here — keep both lists in sync.
		outputs: `={{((event, types, scope) => {
			if (['create_item', 'change_column_value', 'change_name', 'item_archived', 'item_deleted', 'create_update'].includes(event)) {
				if (scope === 'top') return [{ type: 'main', displayName: 'Items' }];
				if (scope === 'subitems') return [{ type: 'main', displayName: 'Subitems' }];
				return [{ type: 'main', displayName: 'Items' }, { type: 'main', displayName: 'Subitems' }];
			}
			if (event !== 'agent_interaction') return [{ type: 'main' }];
			const order = ['chat', 'mention', 'assigned'];
			const labels = { chat: 'Chat', mention: 'Mention', assigned: 'Assigned' };
			const selected = Array.isArray(types) ? types : [];
			const active = order.filter((type) => selected.includes(type));
			return (active.length > 0 ? active : order).map((type) => ({ type: 'main', displayName: labels[type] }));
		})($parameter["event"], $parameter["triggerTypes"], $parameter["itemScope"])}}`,
		credentials: [
			{
				name: 'mondayApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode:
					'={{$parameter["event"] === "agent_interaction" ? "responseNode" : "onReceived"}}',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: EVENT_OPTIONS,
				default: 'create_item',
				required: true,
				description: 'The monday.com event that starts the workflow',
			},
			{
				...boardResourceLocator,
				displayOptions: { hide: { event: [AGENT_EVENT] } },
			},
			{
				displayName: 'Items to Watch',
				name: 'itemScope',
				type: 'options',
				options: [
					{
						name: 'All Items (Main and Subitems)',
						value: 'all',
						description:
							'Watches both levels. Top-level items go to the Items output, subitems to the Subitems output.',
					},
					{
						name: 'Subitems Only',
						value: 'subitems',
						description: 'Only events on subitems under items of the board',
					},
					{
						name: 'Top-Level Items Only',
						value: 'top',
						description: 'Only events on items directly on the board',
					},
				],
				default: 'all',
				description:
					'Which item levels start the workflow. The node\'s outputs adapt to the selection.',
				displayOptions: { show: { event: Object.keys(COMBINED_EVENTS) } },
			},
			{
				// The column ID string is the value; "Name or ID" suffix per lint.
				displayName: 'Column Name or ID',
				name: 'columnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'Only changes to this column fire the trigger. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { event: ['change_specific_column_value'] } },
			},
			{
				displayName: 'Group Name or ID',
				name: 'groupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardGroups',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'Only items moved into this group fire the trigger. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { event: ['item_moved_to_specific_group'] } },
			},
			{
				displayName:
					'Use a Custom Agent API token credential (the api_token shown when the agent was created in monday.com). Owner/personal tokens will not work — the node checks me.kind is an external agent kind (e.g. external_agent_member). On activation it registers this workflow\'s webhook as the agent callback URL and stores the signing secret automatically. The agents API is pre-release ("dev").',
				name: 'setupNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { event: [AGENT_EVENT] } },
			},
			{
				displayName: 'Connected Agent Name or ID',
				name: 'connectedAgent',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'loadConnectedAgentOptions',
				},
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { event: [AGENT_EVENT] } },
			},
			{
				displayName: 'Trigger Types',
				name: 'triggerTypes',
				type: 'multiOptions',
				options: AGENT_TRIGGER_TYPES.map((type) => ({
					name: AGENT_TRIGGER_TYPE_LABELS[type],
					value: type,
				})),
				default: ['chat', 'mention', 'assigned'],
				description:
					'Which agent events start the workflow. Each selected type gets its own output, so no extra routing step is needed. Events of unselected types are acknowledged without starting the workflow.',
				displayOptions: { show: { event: [AGENT_EVENT] } },
			},
			{
				displayName:
					"Chat events wait for the monday.com node's AI & Agent Actions → Respond to Agent Chat operation — that reply is shown in the agent chat and must arrive within 30 seconds. Mention and Assigned events are acknowledged automatically; reply with Respond to Agent Mention (mentions) or by acting on the item (e.g. Create Update).",
				name: 'respondNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { event: [AGENT_EVENT] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { hide: { event: [AGENT_EVENT] } },
				options: [
					{
						displayName: 'Enrich Item',
						name: 'enrichItem',
						type: 'boolean',
						default: false,
						description:
							'Whether to fetch the full item (with column values) on each event. Webhook payloads are lean; this adds one API call per event.',
					},
				],
			},
		],
	};

	methods = {
		listSearch: { searchBoards },
		loadOptions: { getBoardColumns, getBoardGroups, loadConnectedAgentOptions },
	};

	webhookMethods = {
		default: {
			/**
			 * Board events: true only if the webhook this node registered
			 * earlier still exists on the board (users can delete webhooks in
			 * monday). Agent event: true only when the stored callback URL still
			 * matches this workflow's webhook URL and a signing secret was
			 * persisted — otherwise create() re-registers (which rotates the
			 * secret whenever the callback URL is set/updated).
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const event = this.getNodeParameter('event') as string;
				if (event === AGENT_EVENT) {
					const staticData = this.getWorkflowStaticData('node');
					const webhookUrl = this.getNodeWebhookUrl('default') as string;
					return (
						typeof staticData.signingSecret === 'string' &&
						staticData.signingSecret !== '' &&
						staticData.callbackUrl === webhookUrl
					);
				}

				const staticData = this.getWorkflowStaticData('node');

				// Combined events register multiple webhooks (one per level).
				// All of them must still exist, and the set must match the
				// current scope — a changed scope forces a re-register.
				if (isCombinedEvent(event)) {
					const webhookIds = staticData.webhookIds as string[] | undefined;
					const scope = this.getNodeParameter('itemScope', 'all') as ItemScope;
					const expected = buildEventSubscriptions(event, scope);
					if (!webhookIds || webhookIds.length !== expected.length) return false;

					const boardId = this.getNodeParameter('boardId', undefined, {
						extractValue: true,
					}) as string;
					const client = new MondayGraphQLClient(this);
					const data = await client.execute(
						'query ($boardId: ID!) { webhooks(board_id: $boardId) { id } }',
						0,
						{ boardId },
					);
					const existing = new Set(
						((data.webhooks ?? []) as Array<{ id: string }>).map((webhook) => webhook.id),
					);
					return webhookIds.every((id) => existing.has(id));
				}

				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId) return false;

				const boardId = this.getNodeParameter('boardId', undefined, {
					extractValue: true,
				}) as string;
				const client = new MondayGraphQLClient(this);
				const data = await client.execute(
					'query ($boardId: ID!) { webhooks(board_id: $boardId) { id } }',
					0,
					{ boardId },
				);
				const webhooks = (data.webhooks ?? []) as Array<{ id: string }>;
				return webhooks.some((webhook) => webhook.id === webhookId);
			},

			/**
			 * Board events: create_webhook — monday immediately POSTs a JSON
			 * challenge to the URL and only registers the webhook if it's
			 * echoed back (handled in webhook() below). Agent event: points
			 * the agent's callback URL at this workflow's webhook URL via
			 * update_custom_agent using the AGENT token (omit agent_id — monday
			 * resolves the agent from the token) and persists the rotated
			 * signing_secret.
			 */
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;

				if ((this.getNodeParameter('event') as string) === AGENT_EVENT) {
					const identity = await resolveConnectedAgentIdentity.call(this);
					const client = new MondayGraphQLClient(this, 'mondayApi', MONDAY_AGENTS_API_VERSION);
					let signingSecret: string | undefined;
					try {
						const data = await client.execute(
							`mutation ($input: UpdateCustomAgentInput!) {
								update_custom_agent(input: $input) { success signing_secret }
							}`,
							0,
							// Omit agent_id — inferred from the agent token identity.
							{ input: { callback_url: webhookUrl } },
						);
						const payload = data.update_custom_agent as
							| { success?: boolean; signing_secret?: string | null }
							| undefined;
						signingSecret = payload?.signing_secret ?? undefined;
						if (!signingSecret) {
							throw new NodeOperationError(
								this.getNode(),
								'update_custom_agent did not return a signing_secret',
								{
									description:
										'The callback URL may not have changed, or the API response was incomplete. Deactivate and reactivate the workflow, or set a new public WEBHOOK_URL and try again.',
								},
							);
						}
					} catch (error) {
						if (error instanceof NodeOperationError) {
							// Already mapped — rethrow as-is (signing_secret missing, etc.).
							// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
							throw error;
						}
						if (
							error instanceof Error &&
							/not authorized to update this agent|not an? agent|forbidden/i.test(error.message)
						) {
							throw new NodeOperationError(
								this.getNode(),
								'Not authorized to update this agent',
								{
									description:
										`monday.com refused to update the agent callback URL. Use the Custom Agent's api_token (me.kind "${EXTERNAL_AGENT_USER_KIND}"), not an owner/personal token. ` +
										`Resolved agent: ${formatAgentIdentityLabel(identity)}.`,
								},
							);
						}
						// Live error text: "callback_url must use HTTPS" (localhost or
						// http URLs are rejected at registration).
						if (error instanceof Error && /callback_url/i.test(error.message)) {
							throw new NodeOperationError(this.getNode(), 'monday.com rejected the webhook URL', {
								description:
									`monday.com only accepts public HTTPS callback URLs, but this n8n instance's webhook URL is ${webhookUrl}. ` +
									'If self-hosting, set the WEBHOOK_URL environment variable to your public HTTPS address (or use a tunnel for local testing).',
							});
						}
						// Errors from MondayGraphQLClient are already mapped NodeApiErrors.
						// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
						throw error;
					}

					const staticData = this.getWorkflowStaticData('node');
					staticData.agentId = identity.agentId;
					staticData.agentName = identity.agentName;
					staticData.agentUserId = identity.agentUserId;
					staticData.agentKind = identity.agentKind;
					staticData.agentState = identity.state;
					staticData.agentEmail = identity.email;
					staticData.appFeatureId = identity.appFeatureId;
					staticData.callbackUrl = webhookUrl;
					staticData.signingSecret = signingSecret;
					return true;
				}

				const boardId = this.getNodeParameter('boardId', undefined, {
					extractValue: true,
				}) as string;
				const event = this.getNodeParameter('event') as string;

				const client = new MondayGraphQLClient(this);

				const registerWebhook = async (
					webhookEvent: string,
					config: IDataObject | undefined,
				): Promise<string | undefined> => {
					let data: IDataObject;
					try {
						data = await client.execute(
							`mutation ($boardId: ID!, $url: String!, $event: WebhookEventType!, $config: JSON) {
								create_webhook(board_id: $boardId, url: $url, event: $event, config: $config) {
									id
								}
							}`,
							0,
							{
								boardId,
								url: webhookUrl,
								event: webhookEvent,
								config: config ? JSON.stringify(config) : null,
							},
						);
					} catch (error) {
						// monday validates the URL at registration by POSTing a JSON
						// challenge to it. When it can't reach the URL (localhost, VPN,
						// firewall) it fails with a bare "Internal Server Error" —
						// translate that into something actionable.
						if (error instanceof Error && /internal server error/i.test(error.message)) {
							throw new NodeOperationError(
								this.getNode(),
								'monday.com could not verify the webhook URL',
								{
									description:
										`monday.com sends a verification request to your n8n webhook URL when the trigger is registered, and that request failed. ` +
										`Your n8n instance must be reachable from the internet — a localhost or private-network URL won't work. ` +
										`Current webhook URL: ${webhookUrl}. ` +
										`If self-hosting, set the WEBHOOK_URL environment variable to your public address (or use a tunnel for local testing).`,
								},
							);
						}
						// Errors from MondayGraphQLClient are already mapped NodeApiErrors.
						// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
						throw error;
					}
					const id = (data.create_webhook as IDataObject | undefined)?.id;
					return id === undefined ? undefined : String(id);
				};

				// Combined events need one monday webhook per watched level —
				// there is no combined item+subitem event in the API. Both
				// registrations share this node's URL; routing happens by
				// payload shape in webhook().
				if (isCombinedEvent(event)) {
					const scope = this.getNodeParameter('itemScope', 'all') as ItemScope;
					const webhookIds: string[] = [];
					try {
						for (const subscription of buildEventSubscriptions(event, scope)) {
							const id = await registerWebhook(subscription, undefined);
							if (id) webhookIds.push(id);
						}
					} catch (error) {
						// Don't leave a half-registered pair behind.
						for (const id of webhookIds) {
							try {
								await client.execute('mutation ($id: ID!) { delete_webhook(id: $id) { id } }', 0, {
									id,
								});
							} catch {
								// Best effort — the original error matters more.
							}
						}
						// eslint-disable-next-line @n8n/community-nodes/require-node-api-error
						throw error;
					}
					if (webhookIds.length === 0) return false;
					this.getWorkflowStaticData('node').webhookIds = webhookIds;
					return true;
				}

				const columnId = this.getNodeParameter('columnId', '') as string;
				const groupId = this.getNodeParameter('groupId', '') as string;
				const webhookId = await registerWebhook(
					event,
					buildWebhookConfig(event, columnId, groupId),
				);
				if (!webhookId) return false;
				this.getWorkflowStaticData('node').webhookId = webhookId;
				return true;
			},

			/**
			 * Board events: delete the board webhook. Agent event: deliberately
			 * does NOT touch the agent — the agent identity (mentions,
			 * assignments, board access) outlives any one workflow, and there
			 * is no "previous URL" to restore; reactivating the workflow
			 * repoints the callback URL again.
			 */
			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');

				if ((this.getNodeParameter('event') as string) === AGENT_EVENT) {
					delete staticData.agentId;
					delete staticData.agentName;
					delete staticData.agentUserId;
					delete staticData.agentKind;
					delete staticData.agentState;
					delete staticData.agentEmail;
					delete staticData.appFeatureId;
					delete staticData.callbackUrl;
					delete staticData.signingSecret;
					return true;
				}

				const webhookId = staticData.webhookId as string | undefined;
				const webhookIds = (staticData.webhookIds as string[] | undefined) ?? [];
				const allIds = [...(webhookId ? [webhookId] : []), ...webhookIds];
				if (allIds.length === 0) return true;

				const client = new MondayGraphQLClient(this);
				for (const id of allIds) {
					try {
						await client.execute('mutation ($id: ID!) { delete_webhook(id: $id) { id } }', 0, {
							id,
						});
					} catch {
						// Already gone (deleted in monday's UI) — treat as removed.
					}
				}
				delete staticData.webhookId;
				delete staticData.webhookIds;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();

		if ((this.getNodeParameter('event') as string) === AGENT_EVENT) {
			return handleAgentWebhook.call(this);
		}

		// Registration handshake: monday POSTs {"challenge": "..."} and
		// expects the identical JSON back, otherwise create_webhook fails.
		if (body.challenge) {
			const response = this.getResponseObject();
			response.status(200).json({ challenge: body.challenge });
			return { noWebhookResponse: true };
		}

		const event = (body.event ?? body) as IDataObject;
		const output: IDataObject = { ...event };
		const selectedEvent = this.getNodeParameter('event') as string;

		const options = this.getNodeParameter('options', {}) as IDataObject;
		if (options.enrichItem === true) {
			// Payload `type` uses legacy naming (create_pulse, not create_item —
			// seen live), so enrichability is decided by the presence of an item
			// ID, not by event name.
			const itemId = event.pulseId ?? event.itemId;
			if (itemId) {
				const client = new MondayGraphQLClient(this);
				const data = await client.execute(
					`query ($ids: [ID!]) {
						items(ids: $ids) {
							id
							name
							url
							state
							board { id name }
							group { id title }
							column_values(${COLUMN_VALUES_CALCULATED_ARG}) { id type text value column { title } ${LINKED_VALUE_FRAGMENTS} }
						}
					}`,
					0,
					{ ids: [String(itemId)] },
				);
				const items = (data.items ?? []) as IDataObject[];
				output.item = items[0] ?? null;
			}
		}

		// Combined events: route by payload shape — subitem deliveries carry
		// parentItemId (both levels arrive with the same legacy type, e.g.
		// "create_pulse", so the event name can't distinguish them).
		if (isCombinedEvent(selectedEvent)) {
			const scope = this.getNodeParameter('itemScope', 'all') as ItemScope;
			const isSubitem = event.parentItemId !== undefined && event.parentItemId !== null;
			output.isSubitem = isSubitem;
			const { outputCount, outputIndex } = routeCombinedEvent(scope, isSubitem);
			const workflowData = Array.from({ length: outputCount }, (_, index) =>
				index === outputIndex ? this.helpers.returnJsonArray([output]) : [],
			);
			return { workflowData };
		}

		return {
			workflowData: [this.helpers.returnJsonArray([output])],
		};
	}
}
