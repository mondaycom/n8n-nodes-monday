import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { parseLabelIndexes } from './itemFilters';
import { MondayGraphQLClient } from './MondayGraphQLClient';

/**
 * Board validations (required columns + validation rules) — Pro/Enterprise
 * only, API version 2026-07+. All operator/type support in this module was
 * verified EMPIRICALLY against the live API on 2026-07-17 (enterprise test
 * account, one create_validation_rule per type × operator × clause — see
 * roadmap item 12559549967 for the evidence); the docs' support table is
 * incomplete in both directions.
 */

/**
 * Column types add_required_column accepts (probed live: every other type
 * is rejected with "Column ids are unsupported due to their types").
 */
export const REQUIRED_CAPABLE_COLUMN_TYPES = new Set([
	'country',
	'date',
	'dropdown',
	'email',
	'link',
	'location',
	'numbers',
	'people',
	'phone',
	'rating',
	'status',
	'text',
	'timeline',
	'long_text',
]);

/** UI options for rule operators, mapped 1:1 to the RuleOperator enum. */
export const RULE_OPERATOR_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Any Of', value: 'ANY_OF' },
	{ name: 'Between', value: 'BETWEEN' },
	{ name: 'Contains Text', value: 'CONTAINS_TEXT' },
	{ name: 'Equals', value: 'EQUALS' },
	{ name: 'Greater Than', value: 'GREATER_THAN' },
	{ name: 'Greater Than or Equals', value: 'GREATER_THAN_OR_EQUALS' },
	{ name: 'Is Empty', value: 'IS_EMPTY' },
	{ name: 'Is Not Empty', value: 'IS_NOT_EMPTY' },
	{ name: 'Lower Than', value: 'LOWER_THAN' },
	{ name: 'Lower Than or Equal', value: 'LOWER_THAN_OR_EQUAL' },
	{ name: 'Not Any Of', value: 'NOT_ANY_OF' },
	{ name: 'Not Contains Text', value: 'NOT_CONTAINS_TEXT' },
	{ name: 'Not Equals', value: 'NOT_EQUALS' },
	{ name: 'Starts With Text', value: 'STARTS_WITH_TEXT' },
];

/** The clause a constraint lives in, deciding which operator matrix applies. */
export type RuleClause = 'plain' | 'if' | 'then';

/** Operator families shared by several column types. */
const LABEL_SET_OPS = ['ANY_OF', 'NOT_ANY_OF'];
const TEXT_OPS = ['CONTAINS_TEXT', 'NOT_CONTAINS_TEXT', 'STARTS_WITH_TEXT'];
const NUMERIC_RANGE_OPS = [
	'GREATER_THAN',
	'GREATER_THAN_OR_EQUALS',
	'LOWER_THAN',
	'LOWER_THAN_OR_EQUAL',
];

/**
 * Operators each column type supports in an always-on validation rule
 * (no `if` clause). Empty array = the type cannot carry a plain rule at all
 * ("Column type X is not supported for rule type nonConditionalRule").
 * Verified live per type × operator, 2026-07-17. Notable divergences from
 * the docs: long_text/dropdown/email/phone/link/country work (undocumented),
 * NOT_EQUALS works on numbers and date, and timeline/location do NOT work
 * despite being "required"-capable.
 */
export const PLAIN_RULE_OPERATORS: Record<string, readonly string[]> = {
	status: LABEL_SET_OPS,
	dropdown: LABEL_SET_OPS,
	rating: LABEL_SET_OPS,
	numbers: ['NOT_EQUALS', ...NUMERIC_RANGE_OPS],
	date: ['NOT_EQUALS', ...NUMERIC_RANGE_OPS, 'BETWEEN'],
	text: TEXT_OPS,
	long_text: TEXT_OPS,
	email: TEXT_OPS,
	phone: TEXT_OPS,
	link: TEXT_OPS,
	country: TEXT_OPS,
	checkbox: [],
	people: [],
	timeline: [],
	location: [],
	week: [],
	hour: [],
	tags: [],
	file: [],
	world_clock: [],
	vote: [],
	color_picker: [],
	time_tracking: [],
	dependency: [],
};

/**
 * Operators each column type supports in a conditional rule's `if` clause.
 * IS_NOT_EMPTY is broadly available; EQUALS additionally works on numbers
 * and date (the docs only mention numbers). Verified live 2026-07-17.
 */
export const IF_CLAUSE_OPERATORS: Record<string, readonly string[]> = {
	status: [...LABEL_SET_OPS, 'IS_NOT_EMPTY'],
	dropdown: [...LABEL_SET_OPS, 'IS_NOT_EMPTY'],
	rating: [...LABEL_SET_OPS, 'IS_NOT_EMPTY'],
	numbers: ['EQUALS', 'NOT_EQUALS', 'IS_NOT_EMPTY', ...NUMERIC_RANGE_OPS],
	date: ['EQUALS', 'NOT_EQUALS', 'IS_NOT_EMPTY', ...NUMERIC_RANGE_OPS, 'BETWEEN'],
	text: ['IS_NOT_EMPTY', ...TEXT_OPS],
	long_text: ['IS_NOT_EMPTY', ...TEXT_OPS],
	email: ['IS_NOT_EMPTY', ...TEXT_OPS],
	phone: ['IS_NOT_EMPTY', ...TEXT_OPS],
	link: ['IS_NOT_EMPTY', ...TEXT_OPS],
	country: ['IS_NOT_EMPTY', ...TEXT_OPS],
	checkbox: ['IS_NOT_EMPTY'],
	people: ['IS_NOT_EMPTY'],
	timeline: ['IS_NOT_EMPTY'],
	location: ['IS_NOT_EMPTY'],
	week: [],
	hour: [],
	tags: [],
	file: [],
	world_clock: [],
	vote: [],
	color_picker: [],
	time_tracking: [],
	dependency: [],
};

/**
 * Operators each column type supports in a conditional rule's `then` clause.
 * IS_EMPTY exists only here, and only on status/dropdown/checkbox/people.
 * Verified live 2026-07-17.
 */
export const THEN_CLAUSE_OPERATORS: Record<string, readonly string[]> = {
	status: [...LABEL_SET_OPS, 'IS_EMPTY', 'IS_NOT_EMPTY'],
	dropdown: [...LABEL_SET_OPS, 'IS_EMPTY', 'IS_NOT_EMPTY'],
	rating: [...LABEL_SET_OPS, 'IS_NOT_EMPTY'],
	numbers: ['EQUALS', 'NOT_EQUALS', 'IS_NOT_EMPTY', ...NUMERIC_RANGE_OPS],
	date: ['NOT_EQUALS', 'IS_NOT_EMPTY', ...NUMERIC_RANGE_OPS, 'BETWEEN'],
	text: ['IS_NOT_EMPTY', ...TEXT_OPS],
	long_text: ['IS_NOT_EMPTY', ...TEXT_OPS],
	email: ['IS_NOT_EMPTY', ...TEXT_OPS],
	phone: ['IS_NOT_EMPTY', ...TEXT_OPS],
	link: ['IS_NOT_EMPTY', ...TEXT_OPS],
	country: ['IS_NOT_EMPTY', ...TEXT_OPS],
	checkbox: ['IS_EMPTY', 'IS_NOT_EMPTY'],
	people: ['IS_EMPTY', 'IS_NOT_EMPTY'],
	timeline: ['IS_NOT_EMPTY'],
	location: ['IS_NOT_EMPTY'],
	week: [],
	hour: [],
	tags: [],
	file: [],
	world_clock: [],
	vote: [],
	color_picker: [],
	time_tracking: [],
	dependency: [],
};

const MATRIX_BY_CLAUSE: Record<RuleClause, Record<string, readonly string[]>> = {
	plain: PLAIN_RULE_OPERATORS,
	if: IF_CLAUSE_OPERATORS,
	then: THEN_CLAUSE_OPERATORS,
};

/**
 * Operator options narrowed to what the column type supports in the given
 * clause. Unknown types get the full list (allow > wrongly block; the
 * API's BAD_REQUEST messages are descriptive).
 */
export function getRuleOperatorOptions(
	clause: RuleClause,
	columnType: string | undefined,
): INodePropertyOptions[] {
	const supported = columnType ? MATRIX_BY_CLAUSE[clause][columnType] : undefined;
	if (!supported) return RULE_OPERATOR_OPTIONS;
	return RULE_OPERATOR_OPTIONS.filter((option) => supported.includes(option.value as string));
}

/** Column types that can appear in the given clause at all. */
export function getRuleCapableColumnTypes(clause: RuleClause): Set<string> {
	return new Set(
		Object.entries(MATRIX_BY_CLAUSE[clause])
			.filter(([, ops]) => ops.length > 0)
			.map(([type]) => type),
	);
}

/** Operators that take no compare_value (omit the field entirely). */
const NO_VALUE_RULE_OPERATORS = new Set(['IS_EMPTY', 'IS_NOT_EMPTY']);

/** Operators whose compare_value is a list (comma-separated in the UI). */
const MULTI_VALUE_RULE_OPERATORS = new Set(['ANY_OF', 'NOT_ANY_OF', 'BETWEEN']);

/** Column types matched by label index (resolved from label text). */
const LABEL_RULE_COLUMN_TYPES = new Set(['status', 'dropdown']);

/** Column types whose compare values are numeric. */
const NUMERIC_RULE_COLUMN_TYPES = new Set(['numbers', 'rating']);

/**
 * Date-family types: every operator except BETWEEN requires the
 * ["EXACT", "<date>"] compare_value shape — the API rejects a bare date
 * with "first value must be EXACT" (verified live).
 */
const DATE_RULE_COLUMN_TYPES = new Set(['date', 'timeline']);

export interface RuleConstraintInput {
	columnId: string;
	operator: string;
	value?: string;
}

export interface RuleColumnMeta {
	id: string;
	title?: string;
	type: string;
	settings_str?: string;
}

/** One compiled constraint of a rule clause, as the GraphQL input expects it. */
export interface CompiledRuleConstraint extends IDataObject {
	operator: string;
	column_id: string;
	compare_value?: Array<string | number>;
}

function convertRuleEntry(
	entry: string,
	column: RuleColumnMeta | undefined,
): string | number {
	const isNumeric = /^-?\d+(\.\d+)?$/.test(entry);
	if (column && LABEL_RULE_COLUMN_TYPES.has(column.type)) {
		if (isNumeric) return Number(entry);
		const index = parseLabelIndexes(column.settings_str)[entry.toLowerCase()];
		return index !== undefined ? index : entry;
	}
	if (column && NUMERIC_RULE_COLUMN_TYPES.has(column.type) && isNumeric) {
		return Number(entry);
	}
	return entry;
}

/**
 * Compiles one UI constraint row into a RuleConstraintInput object.
 * - Status/dropdown label text resolves to label indexes (the API matches by
 *   index; rating values stay numeric).
 * - Date/timeline values get the required ["EXACT", ...] prefix on every
 *   operator except BETWEEN (unless the user already supplied it).
 * - IS_EMPTY / IS_NOT_EMPTY omit compare_value entirely.
 */
export function compileRuleConstraint(
	row: RuleConstraintInput,
	columns: RuleColumnMeta[],
): CompiledRuleConstraint {
	const column = columns.find((candidate) => candidate.id === row.columnId);

	if (NO_VALUE_RULE_OPERATORS.has(row.operator)) {
		return { operator: row.operator, column_id: row.columnId };
	}

	// Date-family values also split on commas so an explicit "EXACT, <date>"
	// input keeps working (the EXACT prefix is otherwise added below).
	const splitEntries =
		MULTI_VALUE_RULE_OPERATORS.has(row.operator) ||
		(column !== undefined && DATE_RULE_COLUMN_TYPES.has(column.type));
	const entries = splitEntries
		? String(row.value ?? '')
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => entry !== '')
		: [String(row.value ?? '').trim()];

	let compareValue = entries.map((entry) => convertRuleEntry(entry, column));

	if (
		column &&
		DATE_RULE_COLUMN_TYPES.has(column.type) &&
		row.operator !== 'BETWEEN' &&
		compareValue[0] !== 'EXACT'
	) {
		compareValue = ['EXACT', ...compareValue];
	}

	return { operator: row.operator, column_id: row.columnId, compare_value: compareValue };
}

export interface CompiledRuleClause extends IDataObject {
	operator: string;
	groups: CompiledRuleConstraint[];
}

/** Compiles a whole clause (if or then) from UI rows. */
export function compileRuleClause(
	rows: RuleConstraintInput[],
	columns: RuleColumnMeta[],
	matchOperator: 'AND' | 'OR' = 'AND',
): CompiledRuleClause {
	return {
		operator: matchOperator,
		groups: rows.map((row) => compileRuleConstraint(row, columns)),
	};
}

export interface UnsupportedRuleConstraint {
	clause: RuleClause;
	columnId: string;
	columnType: string;
	operator: string;
	supported: readonly string[];
}

/**
 * Execute-time guard: finds constraints whose operator the column type does
 * not support in its clause (the dropdown's server-side counterpart — n8n
 * keeps stale operator selections when the column changes, and
 * expression-mode column IDs bypass the dropdown). Unknown column types
 * pass through — the API's own error is descriptive enough.
 */
export function findUnsupportedRuleConstraints(
	clause: RuleClause,
	rows: RuleConstraintInput[],
	columns: RuleColumnMeta[],
): UnsupportedRuleConstraint[] {
	const matrix = MATRIX_BY_CLAUSE[clause];
	const columnsById = new Map(columns.map((column) => [column.id, column]));
	const offending: UnsupportedRuleConstraint[] = [];
	for (const row of rows) {
		if (!row.columnId || !row.operator) continue;
		const column = columnsById.get(row.columnId);
		if (!column) continue;
		const supported = matrix[column.type];
		if (supported && !supported.includes(row.operator)) {
			offending.push({
				clause,
				columnId: row.columnId,
				columnType: column.type,
				operator: row.operator,
				supported,
			});
		}
	}
	return offending;
}

/** Friendly error text for constraints the column type rejects. */
export function formatUnsupportedRuleMessage(offending: UnsupportedRuleConstraint[]): string {
	const clauseNames: Record<RuleClause, string> = {
		plain: 'a validation rule',
		if: 'the If condition',
		then: 'the Then constraint',
	};
	const details = offending
		.map((entry) =>
			entry.supported.length === 0
				? `column ${entry.columnId} (type: ${entry.columnType}) cannot be used in ${clauseNames[entry.clause]} at all`
				: `"${entry.operator}" is not supported by column ${entry.columnId} (type: ${entry.columnType}) in ${clauseNames[entry.clause]} — supported operators: ${entry.supported.join(', ')}`,
		)
		.join('; ');
	return `Invalid validation rule. ${details}. The Operator dropdown lists the supported operators once a column is selected.`;
}

/** The raw validations query response shape. */
export interface ValidationsResponse {
	required_column_ids?: string[] | null;
	rules?: Record<string, { if?: IDataObject; then?: IDataObject }> | null;
}

/** One simplified rule row for node output. */
export interface SimplifiedRule extends IDataObject {
	ruleId: string;
	if: IDataObject | null;
	then: IDataObject | null;
}

/**
 * Normalizes the validations query response: required_column_ids always an
 * array, the UUID-keyed rules blob turned into an iterable array. A null
 * response (feature unavailable on the account/plan) yields empty output.
 */
export function simplifyValidations(validations: ValidationsResponse | null | undefined): {
	requiredColumnIds: string[];
	rules: SimplifiedRule[];
} {
	const rules = Object.entries(validations?.rules ?? {}).map(([ruleId, rule]) => ({
		ruleId,
		if: rule.if ?? null,
		then: rule.then ?? null,
	}));
	return {
		requiredColumnIds: validations?.required_column_ids ?? [],
		rules,
	};
}

/**
 * Renders one rule as a short human-readable summary for dropdowns, e.g.
 * `IF col_status any of [1] THEN col_text is not empty`. Column IDs resolve
 * to titles when the board's columns are supplied.
 */
export function summarizeRule(
	rule: { if?: IDataObject | null; then?: IDataObject | null },
	columns: RuleColumnMeta[] = [],
): string {
	const titleById = new Map(columns.map((column) => [column.id, column.title ?? column.id]));

	const renderClause = (clause: IDataObject | null | undefined): string => {
		const groups = (clause?.groups ?? []) as IDataObject[];
		const joiner = clause?.operator === 'OR' ? ' OR ' : ' AND ';
		return groups
			.map((group) => {
				const columnName = titleById.get(group.column_id as string) ?? group.column_id;
				const operator = String(group.operator ?? '')
					.toLowerCase()
					.replace(/_/g, ' ');
				const compare = group.compare_value as unknown[] | undefined;
				const value = compare && compare.length > 0 ? ` [${compare.join(', ')}]` : '';
				return `${columnName} ${operator}${value}`;
			})
			.join(joiner);
	};

	const thenPart = renderClause(rule.then);
	return rule.if ? `IF ${renderClause(rule.if)} THEN ${thenPart}` : thenPart;
}

interface BoardColumnsResponse {
	boards?: Array<{ columns?: RuleColumnMeta[] }>;
}

/** One bounded read of the board's columns (id, title, type, settings). */
export async function fetchRuleColumns(
	client: MondayGraphQLClient,
	boardId: string,
	itemIndex = 0,
): Promise<RuleColumnMeta[]> {
	const data = (await client.execute(
		`query ($ids: [ID!]) {
			boards(ids: $ids) {
				columns { id title type settings_str }
			}
		}`,
		itemIndex,
		{ ids: [boardId] },
	)) as BoardColumnsResponse;
	return data.boards?.[0]?.columns ?? [];
}

async function loadRuleColumns(context: ILoadOptionsFunctions): Promise<RuleColumnMeta[]> {
	const boardId = context.getCurrentNodeParameter('boardId', { extractValue: true }) as string;
	if (!boardId) return [];
	const client = new MondayGraphQLClient(context);
	return fetchRuleColumns(client, boardId);
}

function toColumnOptions(columns: RuleColumnMeta[]): INodePropertyOptions[] {
	return columns.map((column) => ({
		name: `${column.title ?? column.id} (${column.type})`,
		value: column.id,
	}));
}

/**
 * loadOptions: columns add_required_column accepts (13 types, probed live).
 */
export async function getRequirableBoardColumns(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return toColumnOptions(
		(await loadRuleColumns(this)).filter((column) =>
			REQUIRED_CAPABLE_COLUMN_TYPES.has(column.type),
		),
	);
}

/**
 * Reads the sibling `&columnId` parameter of a fixedCollection row, the way
 * getFilterOperators does (n8n throws when the row has no value yet).
 */
function readSiblingColumnId(context: ILoadOptionsFunctions): string | undefined {
	try {
		return context.getCurrentNodeParameter('&columnId') as string;
	} catch {
		return undefined;
	}
}

/** Whether the node's Condition (If) collection currently has an entry. */
function hasIfCondition(context: ILoadOptionsFunctions): boolean {
	try {
		const condition = context.getCurrentNodeParameter('ruleCondition') as
			| { condition?: IDataObject[] | IDataObject }
			| undefined;
		if (!condition) return false;
		const entries = condition.condition;
		if (Array.isArray(entries)) return entries.length > 0;
		return entries !== undefined && Object.keys(entries).length > 0;
	} catch {
		return false;
	}
}

/**
 * loadOptions: columns usable in the If condition of a conditional rule.
 */
export async function getValidationIfColumns(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const capable = getRuleCapableColumnTypes('if');
	return toColumnOptions(
		(await loadRuleColumns(this)).filter((column) => capable.has(column.type)),
	);
}

/**
 * loadOptions: columns usable in the Then clause. Which matrix applies
 * depends on whether an If condition is set (conditional rules support more
 * types/operators than plain validation rules).
 */
export async function getValidationThenColumns(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const clause: RuleClause = hasIfCondition(this) ? 'then' : 'plain';
	const capable = getRuleCapableColumnTypes(clause);
	return toColumnOptions(
		(await loadRuleColumns(this)).filter((column) => capable.has(column.type)),
	);
}

/** loadOptions: operators for the If condition row's picked column. */
export async function getValidationIfOperators(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const columnId = readSiblingColumnId(this);
	if (!columnId) return getRuleOperatorOptions('if', undefined);
	const columns = await loadRuleColumns(this);
	const column = columns.find((candidate) => candidate.id === columnId);
	return getRuleOperatorOptions('if', column?.type);
}

/** loadOptions: operators for a Then constraint row's picked column. */
export async function getValidationThenOperators(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const clause: RuleClause = hasIfCondition(this) ? 'then' : 'plain';
	const columnId = readSiblingColumnId(this);
	if (!columnId) return getRuleOperatorOptions(clause, undefined);
	const columns = await loadRuleColumns(this);
	const column = columns.find((candidate) => candidate.id === columnId);
	return getRuleOperatorOptions(clause, column?.type);
}

/**
 * loadOptions: the board's current validation rules, labeled with a
 * human-readable summary — for Update Rule / Delete Rule.
 */
export async function getValidationRulesList(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const boardId = this.getCurrentNodeParameter('boardId', { extractValue: true }) as string;
	if (!boardId) return [];
	const client = new MondayGraphQLClient(this);

	const data = await client.execute(
		`query ($id: ID!) {
			validations(id: $id, type: board) { rules }
			boards(ids: [$id]) { columns { id title type } }
		}`,
		0,
		{ id: boardId },
	);

	const validations = data.validations as ValidationsResponse | null;
	const boards = (data.boards ?? []) as Array<{ columns?: RuleColumnMeta[] }>;
	const columns = boards[0]?.columns ?? [];

	return Object.entries(validations?.rules ?? {}).map(([ruleId, rule]) => ({
		name: summarizeRule(rule, columns),
		value: ruleId,
		description: ruleId,
	}));
}

/**
 * loadOptions: the columns currently marked required on the board — for
 * the Remove mode of Set Required Column.
 */
export async function getRequiredColumnsList(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const boardId = this.getCurrentNodeParameter('boardId', { extractValue: true }) as string;
	if (!boardId) return [];
	const client = new MondayGraphQLClient(this);

	const data = await client.execute(
		`query ($id: ID!) {
			validations(id: $id, type: board) { required_column_ids }
			boards(ids: [$id]) { columns { id title type } }
		}`,
		0,
		{ id: boardId },
	);

	const validations = data.validations as ValidationsResponse | null;
	const requiredIds = new Set(validations?.required_column_ids ?? []);
	const boards = (data.boards ?? []) as Array<{ columns?: RuleColumnMeta[] }>;
	const columns = boards[0]?.columns ?? [];

	return toColumnOptions(columns.filter((column) => requiredIds.has(column.id)));
}
