import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Shared pure helpers for the external-agent webhook flow, used by both
 * the monday.com Trigger node (Agent Interaction event) and the Respond
 * to monday.com Agent node. Everything here is side-effect free and
 * unit-tested.
 *
 * Wire contract (verified against developer.monday.com
 * "Build an external agent", 2026-07): monday POSTs
 * `{ event: "agent_triggered", triggerType, payload, timestamp }` with
 * HMAC headers and reads the reply synchronously from the HTTP response —
 * SSE by default, single JSON object when the request carries
 * `stream: false`. 30s window, response ≤ 1 MB.
 */

/**
 * Canonical trigger-type order. Output connectors on the trigger node
 * follow this order (not the user's click order in the multi-select).
 */
export const AGENT_TRIGGER_TYPES = ['chat', 'mention', 'assigned'] as const;
export type AgentTriggerType = (typeof AGENT_TRIGGER_TYPES)[number];

export const AGENT_TRIGGER_TYPE_LABELS: Record<AgentTriggerType, string> = {
	chat: 'Chat',
	mention: 'Mention',
	assigned: 'Assigned',
};

/**
 * Normalizes the webhook's triggerType. The docs say `mention`, but the
 * live payloads observed via make.com used `mentioned` — accept both
 * (plus `assign`/`assigned`) so the router never mis-routes on naming.
 */
export function normalizeTriggerType(raw: unknown): AgentTriggerType | 'unknown' {
	if (typeof raw !== 'string') return 'unknown';
	const value = raw.toLowerCase().trim();
	if (value === 'chat') return 'chat';
	if (value === 'mention' || value === 'mentioned') return 'mention';
	if (value === 'assigned' || value === 'assign') return 'assigned';
	return 'unknown';
}

/**
 * Verifies monday's webhook signature: HMAC-SHA256 over
 * `${timestamp}.${rawBody}` with the agent's signing secret, hex digest
 * prefixed with `sha256=`, compared in constant time. The raw (unparsed)
 * body bytes MUST be used — re-serializing the parsed body changes key
 * order/whitespace and breaks the digest.
 */
export function verifyAgentSignature(
	signingSecret: string,
	rawBody: Buffer | string,
	timestamp: string | undefined,
	signature: string | undefined,
): boolean {
	if (!timestamp || !signature) return false;
	const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
	const expected = `sha256=${createHmac('sha256', signingSecret)
		.update(`${timestamp}.${body}`)
		.digest('hex')}`;
	const expectedBuffer = Buffer.from(expected);
	const receivedBuffer = Buffer.from(signature);
	// timingSafeEqual throws on length mismatch — guard first.
	return (
		expectedBuffer.length === receivedBuffer.length &&
		timingSafeEqual(expectedBuffer, receivedBuffer)
	);
}

/**
 * Builds the SSE reply body the agent chat expects. A single non-streamed
 * body in SSE format renders fine (monday concatenates the `content`
 * chunks); a plain JSON body for a streaming chat request does NOT render.
 * An empty reply produces a bare `[DONE]` acknowledgement.
 */
export function buildAgentSseBody(replyText: string): string {
	const chunk = replyText
		? `data: ${JSON.stringify({ type: 'text', content: replyText })}\n\n`
		: '';
	return `${chunk}data: [DONE]\n\n`;
}

export const AGENT_SSE_HEADERS = {
	'content-type': 'text/event-stream',
	'cache-control': 'no-cache',
	connection: 'keep-alive',
} as const;

/**
 * Builds the `{ body, headers, statusCode }` webhook response for an agent
 * reply (the AI resource's Respond to Agent operation). SSE is what
 * monday's agent chat expects by default; a single JSON `{ message }`
 * object is the shape for requests that opted out of streaming
 * (`stream: false` on the trigger payload). A Buffer body makes n8n write
 * it verbatim with our headers — exactly what the SSE format needs.
 */
export function buildAgentResponse(
	replyText: string,
	wantsStream: boolean,
): { body: Buffer | { message: string }; headers: Record<string, string>; statusCode: number } {
	if (!wantsStream) {
		return {
			body: { message: replyText },
			headers: { 'content-type': 'application/json' },
			statusCode: 200,
		};
	}
	return {
		body: Buffer.from(buildAgentSseBody(replyText), 'utf8'),
		headers: { ...AGENT_SSE_HEADERS },
		statusCode: 200,
	};
}

export interface AgentMentionContext {
	itemId: string | null;
	updateId: string | null;
	boardId: string | null;
}

/**
 * Pulls the mention target IDs out of a workflow item emitted by the
 * trigger's Agent Interaction event (Mention output). The IDs live on
 * `json.payload`, but flattened top-level fields are accepted too so the
 * context survives simple Set/Code pass-through nodes. Missing fields
 * come back null — the caller decides what is required.
 */
export function extractAgentMentionContext(json: Record<string, unknown>): AgentMentionContext {
	const payload =
		json.payload && typeof json.payload === 'object'
			? (json.payload as Record<string, unknown>)
			: {};
	const pick = (field: string): string | null => {
		const value = payload[field] ?? json[field];
		if (typeof value === 'number') return String(value);
		if (typeof value === 'string' && value.trim() !== '') return value.trim();
		return null;
	};
	return { itemId: pick('itemId'), updateId: pick('updateId'), boardId: pick('boardId') };
}

/**
 * Resolves the user's trigger-type multi-select into canonical order.
 * An empty selection means "all types" (the node's outputs expression
 * falls back the same way, so output indexes always line up).
 */
export function resolveSelectedTriggerTypes(param: unknown): AgentTriggerType[] {
	const selected = Array.isArray(param) ? (param as string[]) : [];
	const active = AGENT_TRIGGER_TYPES.filter((type) => selected.includes(type));
	return active.length > 0 ? active : [...AGENT_TRIGGER_TYPES];
}
