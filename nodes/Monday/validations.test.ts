/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports */
import { describe, it, expect } from 'vitest';

import {
	compileRuleClause,
	compileRuleConstraint,
	findUnsupportedRuleConstraints,
	formatUnsupportedRuleMessage,
	getRuleCapableColumnTypes,
	getRuleOperatorOptions,
	IF_CLAUSE_OPERATORS,
	PLAIN_RULE_OPERATORS,
	REQUIRED_CAPABLE_COLUMN_TYPES,
	RULE_OPERATOR_OPTIONS,
	simplifyValidations,
	summarizeRule,
	THEN_CLAUSE_OPERATORS,
	type RuleColumnMeta,
} from './validations';

const COLUMNS: RuleColumnMeta[] = [
	{
		id: 'status_col',
		title: 'Stage',
		type: 'status',
		settings_str: JSON.stringify({ labels: { '0': 'Backlog', '1': 'Doing', '2': 'Done' } }),
	},
	{
		id: 'dropdown_col',
		title: 'Tags',
		type: 'dropdown',
		settings_str: JSON.stringify({ labels: [{ id: 3, name: 'Red' }, { id: 7, name: 'Blue' }] }),
	},
	{ id: 'num_col', title: 'Amount', type: 'numbers' },
	{ id: 'text_col', title: 'Notes', type: 'text' },
	{ id: 'date_col', title: 'Due', type: 'date' },
	{ id: 'rating_col', title: 'Score', type: 'rating' },
	{ id: 'timeline_col', title: 'Range', type: 'timeline' },
];

describe('compileRuleConstraint', () => {
	it('resolves status label names to indexes', () => {
		const result = compileRuleConstraint(
			{ columnId: 'status_col', operator: 'ANY_OF', value: 'Doing, done' },
			COLUMNS,
		);
		expect(result).toEqual({
			operator: 'ANY_OF',
			column_id: 'status_col',
			compare_value: [1, 2],
		});
	});

	it('resolves dropdown label names to their label ids', () => {
		const result = compileRuleConstraint(
			{ columnId: 'dropdown_col', operator: 'NOT_ANY_OF', value: 'Blue' },
			COLUMNS,
		);
		expect(result.compare_value).toEqual([7]);
	});

	it('keeps numeric input numeric for status columns (explicit index)', () => {
		const result = compileRuleConstraint(
			{ columnId: 'status_col', operator: 'ANY_OF', value: '1,2' },
			COLUMNS,
		);
		expect(result.compare_value).toEqual([1, 2]);
	});

	it('converts numbers and rating values to numbers', () => {
		expect(
			compileRuleConstraint({ columnId: 'num_col', operator: 'GREATER_THAN', value: '5' }, COLUMNS)
				.compare_value,
		).toEqual([5]);
		expect(
			compileRuleConstraint({ columnId: 'rating_col', operator: 'ANY_OF', value: '4,5' }, COLUMNS)
				.compare_value,
		).toEqual([4, 5]);
	});

	it('omits compare_value for IS_EMPTY / IS_NOT_EMPTY', () => {
		const result = compileRuleConstraint(
			{ columnId: 'text_col', operator: 'IS_NOT_EMPTY', value: 'ignored' },
			COLUMNS,
		);
		expect(result).toEqual({ operator: 'IS_NOT_EMPTY', column_id: 'text_col' });
		expect('compare_value' in result).toBe(false);
	});

	it('prefixes EXACT for date operators except BETWEEN (API requires it)', () => {
		expect(
			compileRuleConstraint(
				{ columnId: 'date_col', operator: 'GREATER_THAN', value: '2026-01-01' },
				COLUMNS,
			).compare_value,
		).toEqual(['EXACT', '2026-01-01']);

		// BETWEEN takes two plain dates
		expect(
			compileRuleConstraint(
				{ columnId: 'date_col', operator: 'BETWEEN', value: '2026-01-01, 2026-12-31' },
				COLUMNS,
			).compare_value,
		).toEqual(['2026-01-01', '2026-12-31']);
	});

	it('does not double-prefix EXACT when the user already supplied it', () => {
		expect(
			compileRuleConstraint(
				{ columnId: 'date_col', operator: 'GREATER_THAN', value: 'EXACT, 2026-01-01' },
				COLUMNS,
			).compare_value,
		).toEqual(['EXACT', '2026-01-01']);
	});

	it('treats text values as strings even when numeric-looking', () => {
		expect(
			compileRuleConstraint(
				{ columnId: 'text_col', operator: 'CONTAINS_TEXT', value: '42' },
				COLUMNS,
			).compare_value,
		).toEqual(['42']);
	});

	it('splits multi-value operators on commas, single-value operators keep commas', () => {
		expect(
			compileRuleConstraint(
				{ columnId: 'text_col', operator: 'CONTAINS_TEXT', value: 'a, b' },
				COLUMNS,
			).compare_value,
		).toEqual(['a, b']);
	});
});

describe('compileRuleClause', () => {
	it('compiles rows with the given match operator', () => {
		const clause = compileRuleClause(
			[
				{ columnId: 'text_col', operator: 'IS_NOT_EMPTY' },
				{ columnId: 'num_col', operator: 'GREATER_THAN', value: '1' },
			],
			COLUMNS,
			'OR',
		);
		expect(clause.operator).toBe('OR');
		expect(clause.groups).toHaveLength(2);
		expect(clause.groups[1].compare_value).toEqual([1]);
	});

	it('defaults to AND', () => {
		expect(compileRuleClause([], COLUMNS).operator).toBe('AND');
	});
});

describe('operator matrices (probed live 2026-07-17)', () => {
	it('plain rules: only the five documented families plus live-verified extras', () => {
		expect(PLAIN_RULE_OPERATORS.status).toEqual(['ANY_OF', 'NOT_ANY_OF']);
		expect(PLAIN_RULE_OPERATORS.numbers).toContain('NOT_EQUALS');
		expect(PLAIN_RULE_OPERATORS.numbers).not.toContain('BETWEEN');
		expect(PLAIN_RULE_OPERATORS.date).toContain('BETWEEN');
		expect(PLAIN_RULE_OPERATORS.text).toEqual([
			'CONTAINS_TEXT',
			'NOT_CONTAINS_TEXT',
			'STARTS_WITH_TEXT',
		]);
		// undocumented-but-working types (verified live)
		expect(PLAIN_RULE_OPERATORS.long_text).toEqual(PLAIN_RULE_OPERATORS.text);
		expect(PLAIN_RULE_OPERATORS.dropdown).toEqual(['ANY_OF', 'NOT_ANY_OF']);
		expect(PLAIN_RULE_OPERATORS.email).toEqual(PLAIN_RULE_OPERATORS.text);
		// types with no plain-rule support at all
		expect(PLAIN_RULE_OPERATORS.checkbox).toEqual([]);
		expect(PLAIN_RULE_OPERATORS.people).toEqual([]);
		expect(PLAIN_RULE_OPERATORS.timeline).toEqual([]);
		expect(PLAIN_RULE_OPERATORS.location).toEqual([]);
	});

	it('if clause: IS_NOT_EMPTY broadly available, EQUALS only on numbers', () => {
		expect(IF_CLAUSE_OPERATORS.status).toContain('IS_NOT_EMPTY');
		expect(IF_CLAUSE_OPERATORS.numbers).toContain('EQUALS');
		expect(IF_CLAUSE_OPERATORS.numbers).toContain('NOT_EQUALS');
		expect(IF_CLAUSE_OPERATORS.text).not.toContain('EQUALS');
	});

	it('then clause: supports IS_NOT_EMPTY on more types than plain rules', () => {
		expect(THEN_CLAUSE_OPERATORS.text).toContain('IS_NOT_EMPTY');
		expect(THEN_CLAUSE_OPERATORS.numbers).toContain('IS_NOT_EMPTY');
	});

	it('getRuleOperatorOptions narrows and falls back to all for unknown types', () => {
		const statusPlain = getRuleOperatorOptions('plain', 'status');
		expect(statusPlain.map((option) => option.value)).toEqual(['ANY_OF', 'NOT_ANY_OF']);
		expect(getRuleOperatorOptions('plain', 'some_future_type')).toEqual(RULE_OPERATOR_OPTIONS);
		expect(getRuleOperatorOptions('then', undefined)).toEqual(RULE_OPERATOR_OPTIONS);
	});

	it('getRuleCapableColumnTypes excludes zero-operator types', () => {
		const plainTypes = getRuleCapableColumnTypes('plain');
		expect(plainTypes.has('status')).toBe(true);
		expect(plainTypes.has('checkbox')).toBe(false);
	});
});

describe('findUnsupportedRuleConstraints', () => {
	it('flags operators the column type rejects in the clause', () => {
		const offending = findUnsupportedRuleConstraints(
			'plain',
			[{ columnId: 'status_col', operator: 'CONTAINS_TEXT', value: 'x' }],
			COLUMNS,
		);
		expect(offending).toHaveLength(1);
		expect(offending[0].columnType).toBe('status');
		expect(formatUnsupportedRuleMessage(offending)).toContain('CONTAINS_TEXT');
		expect(formatUnsupportedRuleMessage(offending)).toContain('ANY_OF');
	});

	it('flags zero-support column types with a dedicated message', () => {
		const offending = findUnsupportedRuleConstraints(
			'plain',
			[{ columnId: 'timeline_col', operator: 'ANY_OF', value: '1' }],
			COLUMNS,
		);
		expect(offending).toHaveLength(1);
		expect(formatUnsupportedRuleMessage(offending)).toContain('cannot be used');
	});

	it('passes unknown column IDs and types through (API validates)', () => {
		expect(
			findUnsupportedRuleConstraints(
				'plain',
				[{ columnId: 'mystery_col', operator: 'ANY_OF', value: '1' }],
				COLUMNS,
			),
		).toEqual([]);
	});

	it('accepts valid constraints', () => {
		expect(
			findUnsupportedRuleConstraints(
				'if',
				[{ columnId: 'num_col', operator: 'EQUALS', value: '5' }],
				COLUMNS,
			),
		).toEqual([]);
	});
});

describe('simplifyValidations', () => {
	it('turns the UUID-keyed rules blob into an iterable array', () => {
		const result = simplifyValidations({
			required_column_ids: ['text_col'],
			rules: {
				'uuid-1': { then: { operator: 'AND', groups: [] } },
				'uuid-2': {
					if: { operator: 'AND', groups: [] },
					then: { operator: 'AND', groups: [] },
				},
			},
		});
		expect(result.requiredColumnIds).toEqual(['text_col']);
		expect(result.rules).toHaveLength(2);
		expect(result.rules[0]).toEqual({
			ruleId: 'uuid-1',
			if: null,
			then: { operator: 'AND', groups: [] },
		});
		expect(result.rules[1].if).not.toBeNull();
	});

	it('handles a null response (feature unavailable) as empty output', () => {
		expect(simplifyValidations(null)).toEqual({ requiredColumnIds: [], rules: [] });
		expect(simplifyValidations({ required_column_ids: null, rules: null })).toEqual({
			requiredColumnIds: [],
			rules: [],
		});
	});
});

describe('summarizeRule', () => {
	it('renders a conditional rule with column titles', () => {
		const summary = summarizeRule(
			{
				if: {
					operator: 'AND',
					groups: [{ operator: 'ANY_OF', column_id: 'status_col', compare_value: [1] }],
				},
				then: {
					operator: 'AND',
					groups: [{ operator: 'IS_NOT_EMPTY', column_id: 'text_col', compare_value: [] }],
				},
			},
			COLUMNS,
		);
		expect(summary).toBe('IF Stage any of [1] THEN Notes is not empty');
	});

	it('renders a plain rule without IF, joining OR groups', () => {
		const summary = summarizeRule(
			{
				then: {
					operator: 'OR',
					groups: [
						{ operator: 'GREATER_THAN', column_id: 'num_col', compare_value: [5] },
						{ operator: 'IS_NOT_EMPTY', column_id: 'text_col' },
					],
				},
			},
			COLUMNS,
		);
		expect(summary).toBe('Amount greater than [5] OR Notes is not empty');
	});

	it('falls back to column IDs when titles are unknown', () => {
		const summary = summarizeRule({
			then: { operator: 'AND', groups: [{ operator: 'ANY_OF', column_id: 'zzz', compare_value: [1] }] },
		});
		expect(summary).toBe('zzz any of [1]');
	});
});

describe('REQUIRED_CAPABLE_COLUMN_TYPES', () => {
	it('contains exactly the types add_required_column accepts (probed live)', () => {
		// 13 documented + long_text (accepted live even though undocumented)
		expect(REQUIRED_CAPABLE_COLUMN_TYPES.size).toBe(14);
		for (const type of [
			'status',
			'dropdown',
			'numbers',
			'date',
			'timeline',
			'people',
			'text',
			'long_text',
			'email',
			'phone',
			'link',
			'rating',
			'country',
			'location',
		]) {
			expect(REQUIRED_CAPABLE_COLUMN_TYPES.has(type)).toBe(true);
		}
		expect(REQUIRED_CAPABLE_COLUMN_TYPES.has('checkbox')).toBe(false);
		expect(REQUIRED_CAPABLE_COLUMN_TYPES.has('file')).toBe(false);
	});
});
