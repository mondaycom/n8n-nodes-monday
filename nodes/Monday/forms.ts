import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';

import { toIso8601 } from './filterOptions';
import { MondayGraphQLClient } from './MondayGraphQLClient';

/**
 * monday.com Workforms API (form query + form mutations). All operations are
 * keyed by the form's string token — there is NO API to list forms account-
 * or board-wide (the `form` query is root-only), so no From-List picker is
 * possible; the node accepts the token or the full form URL instead.
 *
 * Live-verified quirks (test account, API 2026-10, 2026-07-19):
 * - The docs' field table says `builtWithAi` — the live schema field on
 *   ResponseForm is `builtWithAI`.
 * - `is_anonymous` lives at the TOP level of UpdateFormSettingsInput on
 *   2026-10 (the docs still show it under appearance for 2026-07).
 * - A malformed token fails with code InvalidFormToken; a well-formed but
 *   unknown (or inaccessible) token fails with USER_UNAUTHORIZED.
 * - create_form in an inaccessible workspace also returns USER_UNAUTHORIZED.
 * - update_form's questions array does NOT have to contain every question ID
 *   (docs say it must): listed IDs are moved to the front in the given
 *   order, unlisted questions keep their relative order after them.
 * - set_form_password only SETS a password. Removing one goes through
 *   update_form_settings features.password.enabled=false (verified live).
 * - A DEACTIVATED form rejects almost the entire API with code
 *   DeactivatedForm — including the form READ query and update_form; only
 *   activate_form works on it (verified live). Deactivate is therefore
 *   effectively "park the form": reactivate before reading or editing.
 * - Tags cannot be updated on 2026-10 (update_form_tag was removed) —
 *   delete and recreate instead. create_form_tag auto-creates a short_text
 *   column on the response board (returned as columnId).
 */

/** The base URL of the public form page — used to build output URLs. */
export const FORM_PUBLIC_URL_BASE = 'https://forms.monday.com/forms/';

/**
 * Extracts the form token from a raw token or a full form URL. Returns null
 * when nothing usable is found (e.g. a shortened wkf.ms link, which cannot
 * be resolved server-side).
 */
export function extractFormToken(input: string): string | null {
	const trimmed = (input ?? '').trim();
	if (trimmed === '') return null;

	// Shortened links don't carry the token; only the full URL does.
	if (/(^|\/\/)wkf\.ms\//i.test(trimmed)) return null;

	const urlMatch = trimmed.match(/forms\.monday\.com\/forms\/([a-z0-9]+)/i);
	if (urlMatch) return urlMatch[1];

	if (/^[a-z0-9]+$/i.test(trimmed)) return trimmed;
	return null;
}

/**
 * The FormQuestionType enum of the pinned API version (introspected live
 * 2026-07-19) — 24 values.
 */
export const FORM_QUESTION_TYPE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Boolean (Checkbox)', value: 'Boolean' },
	{ name: 'Connected Boards', value: 'ConnectedBoards' },
	{ name: 'Country', value: 'Country' },
	{ name: 'Date', value: 'Date' },
	{ name: 'Date Range', value: 'DateRange' },
	{ name: 'Display Text', value: 'DISPLAY_TEXT' },
	{ name: 'Email', value: 'Email' },
	{ name: 'File', value: 'File' },
	{ name: 'Hour', value: 'HOUR' },
	{ name: 'Link', value: 'Link' },
	{ name: 'Location', value: 'Location' },
	{ name: 'Long Text', value: 'LongText' },
	{ name: 'Multi Select', value: 'MultiSelect' },
	{ name: 'Name', value: 'Name' },
	{ name: 'Number', value: 'Number' },
	{ name: 'Page Block', value: 'PAGE_BLOCK' },
	{ name: 'People', value: 'People' },
	{ name: 'Phone', value: 'Phone' },
	{ name: 'Rating', value: 'Rating' },
	{ name: 'Short Text', value: 'ShortText' },
	{ name: 'Signature', value: 'Signature' },
	{ name: 'Single Select', value: 'SingleSelect' },
	{ name: 'Subitems', value: 'Subitems' },
	{ name: 'Updates', value: 'Updates' },
];

/** The question sub-selection shared by every form read. */
export const FORM_QUESTION_FIELDS = `
	id
	title
	type
	required
	visible
	description
	options { label }
	settings {
		checkedByDefault
		defaultCurrentDate
		display
		includeTime
		limit
		locationAutofilled
		optionsOrder
		prefixAutofilled
		prefill { enabled lookup source }
		prefixPredefined { enabled prefix }
		skipValidation
		label_limit_count_enabled
		default_answer
	}
	show_if_rules
`;

/**
 * The full field selection of the `form` query (every documented field,
 * verified live 2026-07-19 — note builtWithAI's capitalization).
 */
export const FORM_FIELDS = `
	id
	token
	title
	description
	active
	isAnonymous
	ownerId
	type
	builtWithAI
	accessibility { language logoAltText }
	appearance {
		primaryColor
		showProgressBar
		hideBranding
		background { type value }
		layout { alignment direction }
		logo { position size url }
		submitButton { text }
		text { color font size }
	}
	features {
		isInternal
		reCaptchaChallenge
		password { enabled }
		requireLogin { enabled redirectToLogin }
		responseLimit { enabled limit }
		shortenedLink { enabled url }
		draftSubmission { enabled }
		closeDate { enabled date }
		preSubmissionView { enabled title description startButton { text } }
		afterSubmissionView {
			title
			description
			allowResubmit
			allowViewSubmission
			allowEditSubmission
			showSuccessImage
			redirectAfterSubmission { enabled redirectUrl }
		}
		monday { includeNameQuestion includeUpdateQuestion itemGroupId syncQuestionAndColumnsTitles }
	}
	questions { ${FORM_QUESTION_FIELDS} }
	tags { id name columnId }
`;

/** Reads and extracts the node's Form Token parameter inside loadOptions. */
function getFormTokenFromContext(context: ILoadOptionsFunctions): string | null {
	const raw = context.getCurrentNodeParameter('formToken') as string | undefined;
	return extractFormToken(raw ?? '');
}

/**
 * loadOptions for the Question picker (Update Question / Delete Question),
 * dependent on the Form Token parameter. A form's question list is bounded
 * by the form itself — one call, no pagination needed.
 */
export async function getFormQuestionsList(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const formToken = getFormTokenFromContext(this);
	if (!formToken) return [];

	const client = new MondayGraphQLClient(this);
	const data = await client.execute(
		'query ($formToken: String!) { form(formToken: $formToken) { questions { id title type } } }',
		0,
		{ formToken },
	);
	const questions = (((data.form ?? {}) as IDataObject).questions ?? []) as Array<{
		id: string;
		title?: string;
		type?: string;
	}>;
	return questions.map((question) => ({
		name: `${question.title || question.id} (${question.type ?? 'unknown'})`,
		value: question.id,
	}));
}

/**
 * loadOptions for the Tag picker (Delete Tag), dependent on the Form Token
 * parameter. Tags are bounded by the form — one call.
 */
export async function getFormTagsList(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const formToken = getFormTokenFromContext(this);
	if (!formToken) return [];

	const client = new MondayGraphQLClient(this);
	const data = await client.execute(
		'query ($formToken: String!) { form(formToken: $formToken) { tags { id name } } }',
		0,
		{ formToken },
	);
	const tags = (((data.form ?? {}) as IDataObject).tags ?? []) as Array<{
		id: string;
		name?: string;
	}>;
	return tags.map((tag) => ({ name: tag.name || tag.id, value: tag.id }));
}

/** Splits a comma-separated list into trimmed non-empty entries. */
export function splitCsvList(value: string): string[] {
	return (value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
}

export interface QuestionInputResult {
	question?: IDataObject;
	error?: string;
}

/**
 * Compiles the Create Question parameters into a CreateQuestionInput object.
 * Pure so validation is unit-testable. `settingsJson` (already parsed) is
 * merged last as the raw escape hatch for type-specific settings.
 */
export function buildCreateQuestionInput(
	title: string,
	type: string,
	fields: IDataObject,
): QuestionInputResult {
	if (!title.trim()) {
		return { error: 'Question Title must not be empty' };
	}
	if (!type) {
		return { error: 'Question Type is required' };
	}

	const question: IDataObject = { title: title.trim(), type };

	if (typeof fields.description === 'string' && fields.description !== '') {
		question.description = fields.description;
	}
	if (typeof fields.required === 'boolean') question.required = fields.required;
	if (typeof fields.visible === 'boolean') question.visible = fields.visible;

	const optionLabels = splitCsvList((fields.optionLabels as string) ?? '');
	if (optionLabels.length > 0) {
		question.options = optionLabels.map((label) => ({ label }));
	}

	if (typeof fields.insertAfterQuestionId === 'string' && fields.insertAfterQuestionId !== '') {
		question.insert_after_question_id = fields.insertAfterQuestionId;
	}
	if (typeof fields.existingColumnId === 'string' && fields.existingColumnId !== '') {
		question.existing_column_id = fields.existingColumnId;
	}

	const settings = fields.settings as IDataObject | undefined;
	if (settings && Object.keys(settings).length > 0) {
		question.settings = settings;
	}

	return { question };
}

/**
 * Compiles the Update Question fields into an UpdateQuestionInput object.
 * `existingType` comes from a read of the form — the API requires `type` on
 * every update and rejects a type different from the question's current one.
 */
export function buildUpdateQuestionInput(
	existingType: string,
	fields: IDataObject,
): QuestionInputResult {
	const question: IDataObject = { type: existingType };
	let hasChange = false;

	if (typeof fields.title === 'string' && fields.title !== '') {
		question.title = fields.title;
		hasChange = true;
	}
	if (typeof fields.description === 'string' && fields.description !== '') {
		question.description = fields.description;
		hasChange = true;
	}
	if (typeof fields.required === 'boolean') {
		question.required = fields.required;
		hasChange = true;
	}
	if (typeof fields.visible === 'boolean') {
		question.visible = fields.visible;
		hasChange = true;
	}

	const optionLabels = splitCsvList((fields.optionLabels as string) ?? '');
	if (optionLabels.length > 0) {
		question.options = optionLabels.map((label) => ({ label }));
		hasChange = true;
	}

	const settings = fields.settings as IDataObject | undefined;
	if (settings && Object.keys(settings).length > 0) {
		question.settings = settings;
		hasChange = true;
	}

	if (!hasChange) {
		return { error: 'Add at least one field to update in Update Fields' };
	}
	return { question };
}

/** Deep-merges `override` into `base` (plain objects only; arrays replace). */
export function deepMergeObjects(base: IDataObject, override: IDataObject): IDataObject {
	const result: IDataObject = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const existing = result[key];
		if (
			value !== null &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			existing !== null &&
			typeof existing === 'object' &&
			!Array.isArray(existing)
		) {
			result[key] = deepMergeObjects(existing as IDataObject, value as IDataObject);
		} else {
			result[key] = value;
		}
	}
	return result;
}

export interface FormSettingsResult {
	settings?: IDataObject;
	error?: string;
}

/**
 * Compiles the typed Update Settings fields (plus the Raw Settings JSON
 * escape hatch, which wins on conflicts) into an UpdateFormSettingsInput
 * object. Pure and unit-tested.
 */
export function buildFormSettingsInput(
	fields: IDataObject,
	rawSettings?: IDataObject,
): FormSettingsResult {
	const appearance: IDataObject = {};
	const features: IDataObject = {};
	const accessibility: IDataObject = {};
	const settings: IDataObject = {};

	if (typeof fields.anonymousResponses === 'boolean') {
		// Top-level on 2026-10 (docs still show it under appearance).
		settings.is_anonymous = fields.anonymousResponses;
	}
	if (typeof fields.language === 'string' && fields.language !== '') {
		accessibility.language = fields.language;
	}
	if (typeof fields.primaryColor === 'string' && fields.primaryColor !== '') {
		appearance.primaryColor = fields.primaryColor;
	}
	if (typeof fields.showProgressBar === 'boolean') {
		appearance.showProgressBar = fields.showProgressBar;
	}
	if (typeof fields.hideBranding === 'boolean') {
		appearance.hideBranding = fields.hideBranding;
	}
	if (typeof fields.submitButtonText === 'string' && fields.submitButtonText !== '') {
		appearance.submitButton = { text: fields.submitButtonText };
	}
	if (typeof fields.requireLogin === 'boolean') {
		features.requireLogin = { enabled: fields.requireLogin };
	}
	if (typeof fields.reCaptcha === 'boolean') {
		features.reCaptchaChallenge = fields.reCaptcha;
	}
	if (fields.responseLimit !== undefined && fields.responseLimit !== '') {
		const limit = Number(fields.responseLimit);
		if (!Number.isInteger(limit) || limit < 0) {
			return { error: 'Response Limit must be a non-negative integer (0 disables the limit)' };
		}
		features.responseLimit = limit === 0 ? { enabled: false } : { enabled: true, limit };
	}
	if (typeof fields.allowDraftSubmissions === 'boolean') {
		features.draftSubmission = { enabled: fields.allowDraftSubmissions };
	}
	if (typeof fields.closeDate === 'string' && fields.closeDate !== '') {
		// toIso8601: the dateTime picker emits naive local datetimes; the
		// settings API stores the date string as-is, so normalize to UTC ISO.
		features.closeDate = { enabled: true, date: toIso8601(fields.closeDate) };
	}
	if (typeof fields.redirectUrlAfterSubmission === 'string' && fields.redirectUrlAfterSubmission !== '') {
		features.afterSubmissionView = {
			redirectAfterSubmission: { enabled: true, redirectUrl: fields.redirectUrlAfterSubmission },
		};
	}

	if (Object.keys(appearance).length > 0) settings.appearance = appearance;
	if (Object.keys(features).length > 0) settings.features = features;
	if (Object.keys(accessibility).length > 0) settings.accessibility = accessibility;

	const merged =
		rawSettings && Object.keys(rawSettings).length > 0
			? deepMergeObjects(settings, rawSettings)
			: settings;

	if (Object.keys(merged).length === 0) {
		return { error: 'Add at least one setting to update (typed field or Raw Settings JSON)' };
	}
	return { settings: merged };
}

/**
 * Friendlier description for form API failures, or null when the error
 * isn't one this module knows how to explain. NodeApiError stores the raw
 * monday error object on `errorResponse` (non-Error inputs) — check both.
 */
export function describeFormError(error: unknown): string | null {
	interface RawMondayError {
		extensions?: { code?: string };
		error_code?: string;
	}
	const candidate = error as { errorResponse?: RawMondayError; cause?: RawMondayError };
	const raw = candidate?.errorResponse ?? candidate?.cause;
	const code = raw?.extensions?.code ?? raw?.error_code;
	if (code === 'InvalidFormToken') {
		return (
			'The form token is malformed. Use the alphanumeric token from the form\u2019s URL \u2014 ' +
			'it appears right after /forms/ in https://forms.monday.com/forms/<token> (shortened wkf.ms links do not contain it).'
		);
	}
	if (code === 'USER_UNAUTHORIZED') {
		return (
			'monday.com rejected the request as unauthorized. This usually means the form token does not exist, ' +
			'or the API user has no access to the board associated with the form (or, on Create, to the target workspace).'
		);
	}
	if (code === 'DeactivatedForm') {
		return (
			'This form is deactivated, and monday.com blocks all API operations on a deactivated form \u2014 ' +
			'including reading it. Run the Activate or Deactivate operation with the Activate action first, then retry.'
		);
	}
	return null;
}
