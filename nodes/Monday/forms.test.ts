/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import { describe, expect, it } from 'vitest';

import {
	buildCreateQuestionInput,
	buildFormSettingsInput,
	buildUpdateQuestionInput,
	deepMergeObjects,
	describeFormError,
	extractFormToken,
	FORM_QUESTION_TYPE_OPTIONS,
	splitCsvList,
} from './forms';

describe('extractFormToken', () => {
	it('accepts a bare token', () => {
		expect(extractFormToken('0c3f8a02a12f34bdb92bcb83518ff913')).toBe(
			'0c3f8a02a12f34bdb92bcb83518ff913',
		);
	});

	it('trims whitespace', () => {
		expect(extractFormToken('  abc123  ')).toBe('abc123');
	});

	it('extracts the token from a full form URL', () => {
		expect(extractFormToken('https://forms.monday.com/forms/abc123def456ghi789?r=use1')).toBe(
			'abc123def456ghi789',
		);
	});

	it('extracts the token from a URL without query string', () => {
		expect(extractFormToken('https://forms.monday.com/forms/abc123')).toBe('abc123');
	});

	it('rejects shortened wkf.ms links', () => {
		expect(extractFormToken('https://wkf.ms/0oOoOoO')).toBeNull();
		expect(extractFormToken('wkf.ms/0oOoOoO')).toBeNull();
	});

	it('rejects empty and malformed input', () => {
		expect(extractFormToken('')).toBeNull();
		expect(extractFormToken('   ')).toBeNull();
		expect(extractFormToken('not a token!')).toBeNull();
	});
});

describe('splitCsvList', () => {
	it('splits and trims', () => {
		expect(splitCsvList(' a, b ,c ')).toEqual(['a', 'b', 'c']);
	});

	it('drops empty entries', () => {
		expect(splitCsvList('a,,b,')).toEqual(['a', 'b']);
	});

	it('handles empty input', () => {
		expect(splitCsvList('')).toEqual([]);
	});
});

describe('FORM_QUESTION_TYPE_OPTIONS', () => {
	it('carries all 24 live enum values', () => {
		expect(FORM_QUESTION_TYPE_OPTIONS).toHaveLength(24);
		const values = FORM_QUESTION_TYPE_OPTIONS.map((option) => option.value);
		// Spot-check the mixed-casing values that are easy to get wrong.
		expect(values).toContain('HOUR');
		expect(values).toContain('DISPLAY_TEXT');
		expect(values).toContain('PAGE_BLOCK');
		expect(values).toContain('SingleSelect');
	});
});

describe('buildCreateQuestionInput', () => {
	it('builds a minimal question', () => {
		const result = buildCreateQuestionInput('Your email', 'Email', {});
		expect(result.error).toBeUndefined();
		expect(result.question).toEqual({ title: 'Your email', type: 'Email' });
	});

	it('rejects an empty title', () => {
		expect(buildCreateQuestionInput('  ', 'Email', {}).error).toMatch(/Title/);
	});

	it('rejects a missing type', () => {
		expect(buildCreateQuestionInput('Q', '', {}).error).toMatch(/Type/);
	});

	it('compiles options, flags, placement, and settings', () => {
		const result = buildCreateQuestionInput('Pick one', 'SingleSelect', {
			description: 'Choose wisely',
			required: true,
			visible: false,
			optionLabels: 'Alpha, Beta',
			insertAfterQuestionId: 'q1',
			existingColumnId: 'status',
			settings: { display: 'Dropdown' },
		});
		expect(result.question).toEqual({
			title: 'Pick one',
			type: 'SingleSelect',
			description: 'Choose wisely',
			required: true,
			visible: false,
			options: [{ label: 'Alpha' }, { label: 'Beta' }],
			insert_after_question_id: 'q1',
			existing_column_id: 'status',
			settings: { display: 'Dropdown' },
		});
	});

	it('omits empty optional fields', () => {
		const result = buildCreateQuestionInput('Q', 'ShortText', {
			description: '',
			optionLabels: '',
			insertAfterQuestionId: '',
			settings: {},
		});
		expect(result.question).toEqual({ title: 'Q', type: 'ShortText' });
	});
});

describe('buildUpdateQuestionInput', () => {
	it('always carries the existing type', () => {
		const result = buildUpdateQuestionInput('Email', { title: 'New title' });
		expect(result.question).toEqual({ type: 'Email', title: 'New title' });
	});

	it('rejects an empty change set', () => {
		expect(buildUpdateQuestionInput('Email', {}).error).toMatch(/at least one field/);
	});

	it('compiles all update fields', () => {
		const result = buildUpdateQuestionInput('SingleSelect', {
			title: 'T',
			description: 'D',
			required: false,
			visible: true,
			optionLabels: 'One,Two',
			settings: { optionsOrder: 'Alphabetical' },
		});
		expect(result.question).toEqual({
			type: 'SingleSelect',
			title: 'T',
			description: 'D',
			required: false,
			visible: true,
			options: [{ label: 'One' }, { label: 'Two' }],
			settings: { optionsOrder: 'Alphabetical' },
		});
	});
});

describe('deepMergeObjects', () => {
	it('merges nested objects with the override winning', () => {
		expect(
			deepMergeObjects(
				{ features: { responseLimit: { enabled: true, limit: 5 } }, a: 1 },
				{ features: { responseLimit: { limit: 9 }, reCaptchaChallenge: true } },
			),
		).toEqual({
			features: {
				responseLimit: { enabled: true, limit: 9 },
				reCaptchaChallenge: true,
			},
			a: 1,
		});
	});

	it('replaces arrays instead of merging them', () => {
		expect(deepMergeObjects({ list: [1, 2] }, { list: [3] })).toEqual({ list: [3] });
	});
});

describe('buildFormSettingsInput', () => {
	it('errors when nothing is set', () => {
		expect(buildFormSettingsInput({}).error).toMatch(/at least one setting/);
	});

	it('compiles every typed field', () => {
		const result = buildFormSettingsInput({
			anonymousResponses: true,
			language: 'es',
			primaryColor: '#ff5733',
			showProgressBar: true,
			hideBranding: true,
			submitButtonText: 'Send it',
			requireLogin: true,
			reCaptcha: true,
			responseLimit: 100,
			allowDraftSubmissions: true,
			closeDate: '2026-12-31T23:59:59Z',
			redirectUrlAfterSubmission: 'https://monday.com',
		});
		expect(result.error).toBeUndefined();
		expect(result.settings).toEqual({
			is_anonymous: true,
			accessibility: { language: 'es' },
			appearance: {
				primaryColor: '#ff5733',
				showProgressBar: true,
				hideBranding: true,
				submitButton: { text: 'Send it' },
			},
			features: {
				requireLogin: { enabled: true },
				reCaptchaChallenge: true,
				responseLimit: { enabled: true, limit: 100 },
				draftSubmission: { enabled: true },
				// Normalized to full UTC ISO 8601 (naive picker values get a timezone).
				closeDate: { enabled: true, date: '2026-12-31T23:59:59.000Z' },
				afterSubmissionView: {
					redirectAfterSubmission: { enabled: true, redirectUrl: 'https://monday.com' },
				},
			},
		});
	});

	it('maps a zero response limit to disabled', () => {
		expect(buildFormSettingsInput({ responseLimit: 0 }).settings).toEqual({
			features: { responseLimit: { enabled: false } },
		});
	});

	it('rejects a negative response limit', () => {
		expect(buildFormSettingsInput({ responseLimit: -1 }).error).toMatch(/non-negative/);
	});

	it('merges raw settings over typed fields (raw wins)', () => {
		const result = buildFormSettingsInput(
			{ primaryColor: '#111111' },
			{ appearance: { primaryColor: '#222222', hideBranding: true } },
		);
		expect(result.settings).toEqual({
			appearance: { primaryColor: '#222222', hideBranding: true },
		});
	});

	it('accepts raw settings alone', () => {
		const result = buildFormSettingsInput({}, { features: { reCaptchaChallenge: false } });
		expect(result.settings).toEqual({ features: { reCaptchaChallenge: false } });
	});
});

describe('describeFormError', () => {
	it('explains InvalidFormToken (current error format)', () => {
		const message = describeFormError({
			errorResponse: { extensions: { code: 'InvalidFormToken' } },
		});
		expect(message).toMatch(/token is malformed/);
	});

	it('explains USER_UNAUTHORIZED', () => {
		const message = describeFormError({
			errorResponse: { extensions: { code: 'USER_UNAUTHORIZED' } },
		});
		expect(message).toMatch(/no access|does not exist/);
	});

	it('reads legacy error_code from cause', () => {
		const message = describeFormError({ cause: { error_code: 'InvalidFormToken' } });
		expect(message).toMatch(/token is malformed/);
	});

	it('explains DeactivatedForm with the reactivation hint', () => {
		const message = describeFormError({
			errorResponse: { extensions: { code: 'DeactivatedForm' } },
		});
		expect(message).toMatch(/Activate/);
	});

	it('returns null for unknown errors', () => {
		expect(describeFormError(new Error('boom'))).toBeNull();
		expect(describeFormError({ errorResponse: { extensions: { code: 'OTHER' } } })).toBeNull();
	});
});
