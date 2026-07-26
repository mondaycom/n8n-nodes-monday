/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import { createHmac } from 'node:crypto';

import { describe, it, expect } from 'vitest';

import {
	AGENT_TRIGGER_TYPES,
	buildAgentResponse,
	buildAgentSseBody,
	extractAgentMentionContext,
	normalizeTriggerType,
	resolveSelectedTriggerTypes,
	verifyAgentSignature,
} from './agentWebhook';

function sign(secret: string, timestamp: string, body: string): string {
	return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

describe('normalizeTriggerType', () => {
	it('passes canonical values through', () => {
		expect(normalizeTriggerType('chat')).toBe('chat');
		expect(normalizeTriggerType('mention')).toBe('mention');
		expect(normalizeTriggerType('assigned')).toBe('assigned');
	});

	it('accepts the live variants seen on the wire', () => {
		// Docs say "mention", the observed payloads used "mentioned".
		expect(normalizeTriggerType('mentioned')).toBe('mention');
		expect(normalizeTriggerType('assign')).toBe('assigned');
		expect(normalizeTriggerType('Chat')).toBe('chat');
		expect(normalizeTriggerType(' MENTIONED ')).toBe('mention');
	});

	it('maps anything else to unknown', () => {
		expect(normalizeTriggerType('somethingelse')).toBe('unknown');
		expect(normalizeTriggerType(undefined)).toBe('unknown');
		expect(normalizeTriggerType(42)).toBe('unknown');
	});
});

describe('verifyAgentSignature', () => {
	const secret = 'test-signing-secret';
	const timestamp = '1782326623754';
	const body = '{"event":"agent_triggered","triggerType":"chat","payload":{"text":"hi"}}';

	it('accepts a valid signature', () => {
		const signature = sign(secret, timestamp, body);
		expect(verifyAgentSignature(secret, body, timestamp, signature)).toBe(true);
		expect(verifyAgentSignature(secret, Buffer.from(body), timestamp, signature)).toBe(true);
	});

	it('rejects a tampered body', () => {
		const signature = sign(secret, timestamp, body);
		expect(verifyAgentSignature(secret, body.replace('hi', 'ho'), timestamp, signature)).toBe(
			false,
		);
	});

	it('rejects a wrong secret, missing headers, and malformed signatures', () => {
		const signature = sign(secret, timestamp, body);
		expect(verifyAgentSignature('other-secret', body, timestamp, signature)).toBe(false);
		expect(verifyAgentSignature(secret, body, undefined, signature)).toBe(false);
		expect(verifyAgentSignature(secret, body, timestamp, undefined)).toBe(false);
		// Different length must not throw (timingSafeEqual guard).
		expect(verifyAgentSignature(secret, body, timestamp, 'sha256=short')).toBe(false);
	});

	it('signs over timestamp.body, so a different timestamp fails', () => {
		const signature = sign(secret, timestamp, body);
		expect(verifyAgentSignature(secret, body, '9999999999999', signature)).toBe(false);
	});
});

describe('buildAgentSseBody', () => {
	it('emits one text chunk and the DONE terminator', () => {
		expect(buildAgentSseBody('Hello there')).toBe(
			'data: {"type":"text","content":"Hello there"}\n\ndata: [DONE]\n\n',
		);
	});

	it('emits a bare DONE for an empty reply', () => {
		expect(buildAgentSseBody('')).toBe('data: [DONE]\n\n');
	});

	it('JSON-escapes the reply text', () => {
		expect(buildAgentSseBody('line1\n"quoted"')).toContain(
			JSON.stringify({ type: 'text', content: 'line1\n"quoted"' }),
		);
	});
});

describe('buildAgentResponse', () => {
	it('builds an SSE response for streaming requests', () => {
		const response = buildAgentResponse('Hello!', true);
		expect(response.statusCode).toBe(200);
		expect(response.headers['content-type']).toBe('text/event-stream');
		expect(Buffer.isBuffer(response.body)).toBe(true);
		expect((response.body as Buffer).toString('utf8')).toBe(
			'data: {"type":"text","content":"Hello!"}\n\ndata: [DONE]\n\n',
		);
	});

	it('builds a JSON message for non-streaming requests', () => {
		const response = buildAgentResponse('Hello!', false);
		expect(response.body).toEqual({ message: 'Hello!' });
		expect(response.headers['content-type']).toBe('application/json');
	});
});

describe('extractAgentMentionContext', () => {
	it('reads the IDs from the trigger payload and stringifies numbers', () => {
		expect(
			extractAgentMentionContext({
				triggerType: 'mention',
				payload: { itemId: 123456789, boardId: 987654321, updateId: 111222333 },
			}),
		).toEqual({ itemId: '123456789', updateId: '111222333', boardId: '987654321' });
	});

	it('accepts flattened top-level fields, with payload winning on conflict', () => {
		expect(extractAgentMentionContext({ itemId: '1', updateId: '2' })).toEqual({
			itemId: '1',
			updateId: '2',
			boardId: null,
		});
		expect(
			extractAgentMentionContext({ itemId: '1', payload: { itemId: '9' } }).itemId,
		).toBe('9');
	});

	it('returns nulls for missing, empty, or non-scalar fields', () => {
		expect(extractAgentMentionContext({ output: 'ai text' })).toEqual({
			itemId: null,
			updateId: null,
			boardId: null,
		});
		expect(
			extractAgentMentionContext({ payload: { itemId: '  ', updateId: null, boardId: {} } }),
		).toEqual({ itemId: null, updateId: null, boardId: null });
	});
});

describe('resolveSelectedTriggerTypes', () => {
	it('keeps canonical order regardless of selection order', () => {
		expect(resolveSelectedTriggerTypes(['assigned', 'chat'])).toEqual(['chat', 'assigned']);
	});

	it('falls back to all types for empty or invalid selections', () => {
		expect(resolveSelectedTriggerTypes([])).toEqual([...AGENT_TRIGGER_TYPES]);
		expect(resolveSelectedTriggerTypes(undefined)).toEqual([...AGENT_TRIGGER_TYPES]);
		expect(resolveSelectedTriggerTypes(['bogus'])).toEqual([...AGENT_TRIGGER_TYPES]);
	});
});
