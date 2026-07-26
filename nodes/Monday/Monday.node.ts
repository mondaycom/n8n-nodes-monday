import { randomBytes } from 'node:crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	UserError,
	sleep,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeProperties,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';
import {
	AGGREGATE_DATE_GROUPING_OPTIONS,
	AGGREGATE_FUNCTION_OPTIONS,
	AggregateInputError,
	buildAggregateQueryPlan,
	parseAggregateResults,
	type AggregateApiResponse,
	type AggregateCalculationRow,
	type AggregateQueryPlan,
} from './aggregate';
import {
	ARTICLE_BLOCK_FIELDS,
	ARTICLE_METADATA_FIELDS,
	buildPublishArticleVariables,
	describeArticleError,
	KB_SNIPPET_FIELDS,
} from './articles';
import {
	buildAccountSearchPlan,
	flattenSearchResults,
	SEARCH_OPERATION_ENTITY,
	SEARCH_OPERATION_VALUES,
	SEARCH_STRATEGY_OPTIONS,
	SEARCH_TIMELINE_KIND_OPTIONS,
	SEARCH_TIMELINE_PRODUCT_OPTIONS,
	type AccountSearchFilters,
} from './accountSearch';
import { buildAgentResponse, extractAgentMentionContext } from './agentWebhook';
import { fetchAuditLogs, getAuditEventsList } from './auditLogs';
import { boardResourceLocator, isRealBoard, searchBoards } from './boardLocator';
import {
	BULK_IMPORT_POLL_INTERVAL_MS,
	BULK_IMPORT_TERMINAL_STATES,
	buildBulkImportCsv,
	BulkImportInputError,
	MAX_BACKFILL_ROWS,
	MAX_INGEST_ROWS,
	parseReportRows,
	summarizeJobStatus,
	type RawItemsJobStatus,
} from './bulkImport';
import {
	extractMappedValues,
	fetchColumns,
	fetchColumnTypes,
	getBulkImportColumnFields,
	getColumnFields,
	resolveSubitemBoardId,
} from './columnMapper';
import {
	buildDropdownColumnDefaults,
	buildStatusColumnDefaults,
	buildTypeSettingsDefaults,
	CREATABLE_COLUMN_TYPES,
	dropdownSettingsToInputRows,
	nextStatusLabelIndex,
	placeStatusLabelRow,
	resolveAfterColumnId,
	STATUS_COLOR_OPTIONS,
	statusSettingsToInputRows,
	validateCustomColumnId,
	type ExistingLabel,
	type StatusLabelPosition,
	type StatusLabelRow,
} from './columnDefaults';
import {
	ALL_COLUMN_FILES,
	getAggregateGroupByColumns,
	getAggregateMinMaxColumns,
	getAggregateNumericColumns,
	getBoardColumns,
	getBoardDocColumns,
	getBoardFileColumns,
	getBoardLabelColumns,
	getBulkImportMatchColumns,
	getClearableBoardColumns,
	getColumnLabels,
	getFilterableBoardColumns,
	getFilterOperators,
	getItemColumnFiles,
	getItemUpdatesList,
	getTargetBoardColumns,
} from './columnOptions';
import { buildColumnValues } from './columnValueMappers';
import {
	buildAssignOwnersMutation,
	buildDepartmentFieldSelection,
	DEPARTMENT_FIELDS,
	describeDepartmentError,
	getDepartmentsList,
} from './departments';
import {
	buildTextBlockContent,
	DOC_BLOCK_FIELDS,
	DOC_BLOCK_TYPE_OPTIONS,
	DOC_FIELDS,
	docResourceLocator,
	normalizeBlockContentJson,
	parseJsonField,
	resolveDocId,
	searchDocs,
	type DocLocatorValue,
} from './docs';
import {
	buildDirectoryQueryParams,
	describeDirectoryError,
	DIRECTORY_FILTER_ATTRIBUTE_OPTIONS,
	DIRECTORY_UPDATE_ATTRIBUTE_OPTIONS,
	fetchAllDirectoryResources,
	type DirectoryFilterRow,
} from './directoryResources';
import {
	buildTimelineItemInput,
	CUSTOM_ACTIVITY_COLOR_OPTIONS,
	CUSTOM_ACTIVITY_ICON_OPTIONS,
	fetchTimelineItems,
	getCustomActivitiesList,
	TIMELINE_ITEM_FIELDS,
} from './emailsActivities';
import {
	buildFilterRules,
	findUnsupportedOperatorRules,
	formatUnsupportedOperatorMessage,
	type FilterRuleInput,
} from './itemFilters';
import {
	BATTERY_VALUE_FRAGMENT,
	buildAllGroupsRule,
	COLUMN_VALUES_CALCULATED_ARG,
	fetchBoardGroupIds,
	formatBatteryText,
	getBoardHierarchyType,
	LINKED_VALUE_DETAIL_FRAGMENTS,
	LINKED_VALUE_FRAGMENTS,
	MULTI_LEVEL_AGGREGATE_NOTE,
	validateRollupFunction,
	type BatteryEntry,
} from './multiLevel';
import { findRollupStatusRuleColumns } from './itemFilters';
import { DEFAULT_LIMIT, MONDAY_API_VERSION, MONDAY_PLATFORM_AGENT_URL } from './constants';
import { ensureNodeError } from './errors';
import {
	getArticleWorkspaceFolders,
	getBoardList,
	getCreateBoardWorkspaceFolders,
	getCreateFolderParentList,
	getDocImportWorkspaceFolders,
	getDocWorkspaceFolders,
	getFolderList,
	getFormWorkspaceFolders,
	getMoveDestinationFolderList,
	getProjectWorkspaceFolders,
	getUpdateFolderParentList,
	getWorkspaceFolders,
	getWorkspaces,
	normalizeIdList,
	toIso8601,
} from './filterOptions';
import {
	buildUpdateFolderArgs,
	FOLDER_ATTRIBUTE_NONE,
	FOLDER_COLOR_OPTIONS,
	FOLDER_FIELDS,
	FOLDER_FONT_WEIGHT_OPTIONS,
	FOLDER_ICON_OPTIONS,
	FOLDERS_API_MAX_PAGE_SIZE,
	type CurrentFolderState,
	type FolderUpdateChanges,
} from './folders';
import {
	buildCreateQuestionInput,
	buildFormSettingsInput,
	buildUpdateQuestionInput,
	describeFormError,
	extractFormToken,
	FORM_FIELDS,
	FORM_PUBLIC_URL_BASE,
	FORM_QUESTION_FIELDS,
	FORM_QUESTION_TYPE_OPTIONS,
	getFormQuestionsList,
	getFormTagsList,
	splitCsvList,
} from './forms';
import {
	buildMeetingFieldSelection,
	buildMeetingsFilters,
	fetchAllMeetings,
	MEETING_ACCESS_FILTER_OPTIONS,
	meetingResourceLocator,
	searchMeetings,
} from './notetaker';
import {
	DEFAULT_CREATE_WAIT_TIMEOUT_SECONDS,
	snapshotRecentBoardIds,
	waitForCreatedBoard,
	waitForProjectBoards,
} from './portfolio';
import {
	getBoardGroups,
	getTargetBoardGroups,
	groupResourceLocator,
	searchGroups,
} from './groupLocator';
import { itemResourceLocator, searchItems } from './itemLocator';
import {
	extractWorkspaceId,
	searchWorkspaces,
	workspaceResourceLocator,
} from './workspaceLocator';
import {
	buildUserRowsProperty,
	extractUserLocatorId,
	extractUserRowIds,
	getTeamsList,
	searchUsers,
	searchUsersAndTeams,
	splitUserTeamIds,
	userResourceLocator,
} from './userLocator';
import { MondayGraphQLClient, type MondayRequestInfo } from './MondayGraphQLClient';
import { fetchAllByCursor, fetchAllPaged } from './pagination';
import {
	compileRuleClause,
	fetchRuleColumns,
	findUnsupportedRuleConstraints,
	formatUnsupportedRuleMessage,
	getRequirableBoardColumns,
	getRequiredColumnsList,
	getValidationIfColumns,
	getValidationIfOperators,
	getValidationRulesList,
	getValidationThenColumns,
	getValidationThenOperators,
	simplifyValidations,
	type RuleConstraintInput,
	type ValidationsResponse,
} from './validations';
import { getApiVersions } from './versionOptions';
import {
	buildHierarchyAttributes,
	buildWorkspaceObjectRows,
	buildWorkspaceObjectTree,
	describePositionReferenceError,
	mapLeftPaneBoardRow,
	mapLeftPaneFolderRow,
	POSITION_REFERENCE_TYPE_OPTIONS,
	resolveDocObjectId,
	type HierarchyPosition,
	type LeftPaneBoardRow,
	type LeftPaneFolderRow,
	type WorkspaceObjectRow,
} from './workspaceObjects';

/** Fields every board read (Get and Get Many) returns. */
const BOARD_BASE_FIELDS = [
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
];

/** Structural fields only Board: Get returns — too heavy for a list. */
const BOARD_STRUCTURE_FIELDS = [
	'owners { id name email }',
	'groups { id title color position }',
	'columns { id title type settings_str }',
];

/**
 * The opt-in "Include Complete Board Data" field set. Each of these adds
 * complexity cost and latency per board, so they stay behind the toggle.
 */
const BOARD_COMPLETE_FIELDS = [
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
];

/**
 * The extended-data toggle shared by Board: Get and Board: Get Many. Its
 * description is the user-facing warning that the extra fields aren't free.
 */
const INCLUDE_COMPLETE_BOARD_DATA_OPTION: INodeProperties = {
	displayName: 'Include Complete Board Data',
	name: 'includeCompleteData',
	type: 'boolean',
	default: false,
	description:
		'Whether to also return subscribers, team subscribers, tags, permissions, access level, items limit, top group, hierarchy type, source board ID, communication value, and board metadata. Turning this on increases the complexity cost and latency of the query — noticeably so on Get Many with high limits.',
};

/** Builds the GraphQL field selection for the board read operations. */
export function buildBoardFieldSelection(options: {
	includeStructure?: boolean;
	includeCompleteData?: boolean;
}): string {
	return [
		...BOARD_BASE_FIELDS,
		...(options.includeStructure ? BOARD_STRUCTURE_FIELDS : []),
		...(options.includeCompleteData ? BOARD_COMPLETE_FIELDS : []),
	].join('\n');
}

/**
 * The request-metadata output shape shared by Get Rate Limits and the
 * GraphQL operation's Include Request Info option. Everything here comes
 * from response headers — the complexity budget lives in the RateLimit /
 * RateLimit-Policy headers (complexityMinute), so the `complexity` GraphQL
 * query is never needed.
 */
export function buildRequestInfoOutput(
	requestInfo: MondayRequestInfo,
	requestedApiVersion: string,
): IDataObject {
	return {
		rateLimit: requestInfo.rateLimit ?? null,
		rateLimitPolicy: requestInfo.rateLimitPolicy ?? null,
		apiVersionRequested: requestedApiVersion,
		apiVersionReturned: requestInfo.apiVersion ?? null,
		requestId: requestInfo.requestId ?? null,
		statusCode: requestInfo.statusCode ?? null,
	};
}

/**
 * The group-color palette create_group accepts (hex values from the API
 * docs; arbitrary hex strings are rejected). n8n dropdowns can't render
 * color swatches, so each name carries the nearest colored-circle emoji
 * (grouping the palette by hue, same convention as STATUS_COLOR_OPTIONS)
 * and the description carries the exact hex.
 */
const GROUP_COLOR_OPTIONS = [
	{ name: '⚪ Grey', value: '#c4c4c4', description: '#c4c4c4' },
	{ name: '⚫ Trolley Grey', value: '#808080', description: '#808080' },
	{ name: '🔴 Dark Pink', value: '#ff158a', description: '#ff158a' },
	{ name: '🔴 Dark Red', value: '#bb3354', description: '#bb3354' },
	{ name: '🔴 Red', value: '#e2445c', description: '#e2445c' },
	{ name: '🔵 Blue', value: '#579bfc', description: '#579bfc' },
	{ name: '🔵 Dark Blue', value: '#0086c0', description: '#0086c0' },
	{ name: '🔵 Light Blue', value: '#66ccff', description: '#66ccff' },
	{ name: '🟠 Dark Orange', value: '#ff642e', description: '#ff642e' },
	{ name: '🟠 Orange', value: '#fdab3d', description: '#fdab3d' },
	{ name: '🟡 Mustard', value: '#cab641', description: '#cab641' },
	{ name: '🟡 Yellow', value: '#ffcb00', description: '#ffcb00' },
	{ name: '🟢 Dark Green', value: '#037f4c', description: '#037f4c' },
	{ name: '🟢 Green', value: '#00c875', description: '#00c875' },
	{ name: '🟢 Lime Green', value: '#9cd326', description: '#9cd326' },
	{ name: '🟣 Dark Purple', value: '#784bd1', description: '#784bd1' },
	{ name: '🟣 Light Pink', value: '#ff5ac4', description: '#ff5ac4' },
	{ name: '🟣 Purple', value: '#a25ddc', description: '#a25ddc' },
	{ name: '🟤 Brown', value: '#7f5347', description: '#7f5347' },
];

/**
 * The palette update_group accepts. Unlike create_group it takes color NAMES,
 * not hexes (a hex fails with "Input color is not in colors options" —
 * verified live 2026-07-15). The list is the documented 18 names; note
 * "turquoise" is the create palette's Light Blue (#66ccff), and create's
 * Mustard (#cab641) has no update name at all.
 */
const GROUP_UPDATE_COLOR_OPTIONS = [
	{ name: '⚪ Grey', value: 'grey', description: '#c4c4c4' },
	{ name: '⚫ Trolley Grey', value: 'trolley-grey', description: '#808080' },
	{ name: '🔴 Dark Pink', value: 'dark-pink', description: '#ff158a' },
	{ name: '🔴 Dark Red', value: 'dark-red', description: '#bb3354' },
	{ name: '🔴 Red', value: 'red', description: '#e2445c' },
	{ name: '🔵 Blue', value: 'blue', description: '#579bfc' },
	{ name: '🔵 Dark Blue', value: 'dark-blue', description: '#0086c0' },
	{ name: '🔵 Turquoise (Light Blue)', value: 'turquoise', description: '#66ccff' },
	{ name: '🟠 Dark Orange', value: 'dark-orange', description: '#ff642e' },
	{ name: '🟠 Orange', value: 'orange', description: '#fdab3d' },
	{ name: '🟡 Yellow', value: 'yellow', description: '#ffcb00' },
	{ name: '🟢 Dark Green', value: 'dark-green', description: '#037f4c' },
	{ name: '🟢 Green', value: 'green', description: '#00c875' },
	{ name: '🟢 Lime Green', value: 'lime-green', description: '#9cd326' },
	{ name: '🟣 Dark Purple', value: 'dark-purple', description: '#784bd1' },
	{ name: '🟣 Light Pink', value: 'light-pink', description: '#ff5ac4' },
	{ name: '🟣 Purple', value: 'purple', description: '#a25ddc' },
	{ name: '🟤 Brown', value: 'brown', description: '#7f5347' },
];

// Resource dropdown entries. Two names are intentionally plural because they
// are verbatim monday.com product names, not style mistakes: "AI & Agent
// Actions" (plural per PM naming decision, 2026-07-19) and "Emails &
// Activities" (the product name of the CRM timeline app). n8n's singular-name
// lint only inspects inline option arrays, so keeping the list in a module
// constant preserves the product naming.
const RESOURCE_OPTIONS: INodePropertyOptions[] = [
	// Groups the AI ops with the agent-interaction reply op.
	{ name: 'AI & Agent Actions', value: 'ai' },
	{ name: 'Article', value: 'article' },
	// Account security events (logins, exports, deletions, ...).
	{ name: 'Audit Log', value: 'auditLog' },
	{ name: 'Board', value: 'board' },
	// The value stays 'group' so workflows saved before the rename keep working.
	{ name: 'Board Group', value: 'group' },
	{ name: 'Column', value: 'column' },
	{ name: 'Department', value: 'department' },
	{ name: 'Directory Resource', value: 'directoryResource' },
	// monday docs (workdocs).
	{ name: 'Doc', value: 'doc' },
	{ name: 'Emails & Activities', value: 'emailsActivities' },
	{ name: 'File', value: 'file' },
	// Folders plus left-pane object actions (list/move boards,
	// docs, dashboards, folders). The value stays 'folder'.
	{ name: 'Folder & Object', value: 'folder' },
	{ name: 'Form', value: 'form' },
	{ name: 'GraphQL', value: 'graphql' },
	{ name: 'Item', value: 'item' },
	// Notetaker meetings (recordings, summaries, transcripts).
	{ name: 'Meeting', value: 'meeting' },
	{ name: 'Notification', value: 'notification' },
	// One combined category for the portfolio/project API pair
	// (product decision 2026-07-19).
	{ name: 'Portfolio & Project', value: 'portfolio' },
	{ name: 'Team', value: 'team' },
	{ name: 'Update', value: 'update' },
	{ name: 'User', value: 'user' },
	{ name: 'Validation', value: 'validation' },
	{ name: 'Workspace', value: 'workspace' },
];

// GraphQL operation entries. "GraphQL" is the technology's trademark casing;
// n8n's sentence-case lint would rewrite it to "graph ql" but only inspects
// inline option arrays, so the list lives in a module constant.
const GRAPHQL_OPERATION_OPTIONS: INodePropertyOptions[] = [
	{
		name: 'Execute Query',
		value: 'graphql',
		action: 'Execute a GraphQL query',
		description: 'Run an arbitrary authorized GraphQL query or mutation',
	},
	{
		name: 'Get Rate Limits',
		value: 'getLimits',
		action: 'Get rate limits',
		description:
			'Return the account API budget: remaining rate limits (including the complexity budget), quota policy, and the API version in use',
	},
];

export class Monday implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'monday.com (official)',
		name: 'monday',
		icon: { light: 'file:monday.svg', dark: 'file:monday.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the monday.com API',
		defaults: { name: 'monday.com (official)' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'mondayApi',
				required: true,
				// Respond to Agent Chat replies over the open webhook HTTP
				// response (sendResponse) — it never calls the monday API, so
				// it needs no credential. Hiding it here makes the credential
				// optional for that operation only. Respond to Agent Mention
				// DOES call the API (create_update) and keeps the credential.
				displayOptions: { hide: { operation: ['respondToAgentChat'] } },
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: RESOURCE_OPTIONS,
				default: 'item',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['article'] } },
				options: [
					{
						name: 'Create',
						value: 'createArticle',
						action: 'Create an article',
						description:
							'Create a knowledge base article as a draft in a workspace (requires the Knowledge Base feature)',
					},
					{
						name: 'Delete',
						value: 'deleteArticle',
						action: 'Delete an article',
						description: 'Permanently delete a knowledge base article',
					},
					{
						name: 'Get Blocks',
						value: 'getArticleBlocks',
						action: 'Get article blocks',
						description:
							'Return the content blocks of a published knowledge base article, one block per result',
					},
					{
						name: 'Get Many',
						value: 'getArticles',
						action: 'Get many articles',
						description: 'Return published knowledge base articles by their object IDs',
					},
					{
						name: 'Publish',
						value: 'publishArticle',
						action: 'Publish an article',
						description:
							'Publish a draft knowledge base article and set its visibility and subscribers',
					},
					{
						name: 'Search Knowledge Base',
						value: 'searchKnowledgeBase',
						action: 'Search the knowledge base',
						description:
							'AI-powered search across the account\u2019s knowledge base \u2014 returns a generated answer plus the source snippets',
					},
				],
				default: 'createArticle',
			},
			// ---- Audit Log resource ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['auditLog'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAuditLogs',
						action: 'Get many audit logs',
						description:
							'Return the account\u2019s security audit log events \u2014 logins, exports, deletions, and more (Enterprise plans only, requires an account admin\u2019s token)',
					},
				],
				default: 'getAuditLogs',
			},
			{
				displayName: 'Filters',
				name: 'auditLogFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { operation: ['getAuditLogs'] } },
				options: [
					{
						// Event names are the values; the list is bounded (~95 entries).
						displayName: 'Event Names or IDs',
						name: 'events',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getAuditEventsList' },
						default: [],
						description:
							'Only return these event types (the IDs are event names). Expressions accept an array or a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'From Date',
						name: 'startTime',
						type: 'dateTime',
						default: '',
						description: 'Only return events from this time onward',
					},
					{
						displayName: 'IP Address',
						name: 'ipAddress',
						type: 'string',
						default: '',
						placeholder: 'e.g. 192.0.2.10',
						description: 'Only return events from this IP address (exact match)',
					},
					{
						displayName: 'To Date',
						name: 'endTime',
						type: 'dateTime',
						default: '',
						description: 'Only return events up to this time',
					},
					{
						displayName: 'User',
						name: 'userId',
						type: 'resourceLocator',
						default: { mode: 'list', value: '' },
						description: 'Only return events by this user',
						modes: [
							// The linter misreads resourceLocator mode entries nested in a
							// collection as node parameters; modes carry no `default` field.
							// eslint-disable-next-line @n8n/community-nodes/require-param-default
							{
								displayName: 'From List',
								name: 'list',
								type: 'list',
								typeOptions: { searchListMethod: 'searchUsers', searchable: true },
							},
							// eslint-disable-next-line @n8n/community-nodes/require-param-default
							{
								displayName: 'By ID',
								name: 'id',
								type: 'string',
								placeholder: 'e.g. 12345678',
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'auditLogOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getAuditLogs'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account\u2019s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description:
							'Which page of results to fetch (page size = limit, newest events first). Increment it across runs to walk further back in time.',
					},
				],
			},
			// ---- Article parameters ----
			{
				displayName: 'Article Name',
				name: 'articleName',
				type: 'string',
				default: '',
				description: 'The display name of the new article. Leave empty for an untitled draft.',
				displayOptions: { show: { operation: ['createArticle'] } },
			},
			{
				...workspaceResourceLocator,
				name: 'articleWorkspaceId',
				required: true,
				description: 'The workspace to create the article in',
				displayOptions: { show: { operation: ['createArticle'] } },
			},
			{
				// Shared by every operation addressing one existing article. No
				// picker is possible: the articles query returns published
				// articles only and requires object_ids — drafts cannot be
				// enumerated (verified against the 2026-10 schema).
				displayName: 'Article Object ID',
				name: 'articleObjectId',
				type: 'string',
				default: '',
				required: true,
				description:
					'The article\u2019s object ID \u2014 from the Create operation\u2019s output, the Get Many operation, or the article URL in monday.com',
				displayOptions: {
					show: { operation: ['publishArticle', 'deleteArticle', 'getArticleBlocks'] },
				},
			},
			{
				displayName: 'Privacy',
				name: 'articlePrivacyKind',
				type: 'options',
				options: [
					{
						name: 'Private',
						value: 'PRIVATE',
						description: 'Visible only to the article\u2019s subscribers',
					},
					{
						name: 'Public',
						value: 'PUBLIC',
						description: 'Visible to everyone in the workspace',
					},
				],
				default: 'PUBLIC',
				required: true,
				description: 'Who can see the published article',
				displayOptions: { show: { operation: ['publishArticle'] } },
			},
			buildUserRowsProperty({
				displayName: 'Subscribers to Add',
				name: 'articleAddSubscribers',
				includeTeams: true,
				description:
					'The users and/or teams to add as subscribers of the private article. In expression mode, pass a comma-separated string of user IDs and/or <code>team:&lt;ID&gt;</code> values.',
				displayOptions: {
					show: { operation: ['publishArticle'], articlePrivacyKind: ['PRIVATE'] },
				},
			}),
			buildUserRowsProperty({
				displayName: 'Subscribers to Remove',
				name: 'articleRemoveSubscribers',
				includeTeams: true,
				description:
					'The users and/or teams to remove from the article\u2019s subscribers. In expression mode, pass a comma-separated string of user IDs and/or <code>team:&lt;ID&gt;</code> values.',
				displayOptions: {
					show: { operation: ['publishArticle'], articlePrivacyKind: ['PRIVATE'] },
				},
			}),
			{
				displayName: 'Article Object IDs',
				name: 'articleObjectIds',
				type: 'string',
				default: '',
				required: true,
				description:
					'The object IDs of the articles to return, comma-separated \u2014 from the Create operation\u2019s output or the article URLs in monday.com. Only published articles are returned.',
				displayOptions: { show: { operation: ['getArticles'] } },
			},
			{
				displayName: 'Search Query',
				name: 'kbSearchQuery',
				type: 'string',
				default: '',
				required: true,
				description: 'The natural-language question to answer from the knowledge base',
				displayOptions: { show: { operation: ['searchKnowledgeBase'] } },
			},
			{
				displayName: 'Options',
				name: 'createArticleOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createArticle'] } },
				options: [
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'folderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getArticleWorkspaceFolders',
							loadOptionsDependsOn: ['articleWorkspaceId.value'],
						},
						default: '',
						description:
							'The folder to place the article under. Select a workspace first \u2014 the list shows that workspace\u2019s folders. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'publishArticleOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['publishArticle'] } },
				options: [
					{
						displayName: 'Folder ID',
						name: 'folderId',
						type: 'string',
						default: '',
						description:
							'The folder to file the published article under. The article keeps its current location when unset.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'getArticlesOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getArticles'] } },
				options: [
					{
						displayName: 'Include Blocks',
						name: 'includeBlocks',
						type: 'boolean',
						default: false,
						description:
							'Whether to include each article\u2019s first page of content blocks in the output. Use the Get Blocks operation to page through all blocks of an article.',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account\u2019s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description: 'The 1-based page of articles to return',
					},
					{
						displayName: 'Workspace Names or IDs',
						name: 'workspaceIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getWorkspaces' },
						default: [],
						description:
							'Only return articles from these workspaces. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'getArticleBlocksOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getArticleBlocks'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account\u2019s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description: 'The 1-based page of blocks to return',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'kbSearchOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['searchKnowledgeBase'] } },
				options: [
					{
						displayName: 'Snippet Limit',
						name: 'snippetLimit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 50 },
						default: 5,
						description:
							'Max number of knowledge base snippets considered when generating the answer (API default: 5)',
					},
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['doc'] } },
				options: [
					{
						name: 'Add Content',
						value: 'addDocContent',
						action: 'Add content to a doc',
						description: 'Append markdown content to a doc — it is converted into doc blocks',
					},
					{
						name: 'Create',
						value: 'createDoc',
						action: 'Create a doc',
						description: 'Create a doc in a workspace, or inside a doc column of a board item',
					},
					{
						name: 'Create Block',
						value: 'createDocBlock',
						action: 'Create a doc block',
						description: 'Add a single content block to a doc',
					},
					{
						name: 'Delete',
						value: 'deleteDoc',
						action: 'Delete a doc',
						description: 'Permanently delete a doc',
					},
					{
						name: 'Delete Blocks',
						value: 'deleteDocBlocks',
						action: 'Delete doc blocks',
						description:
							'Permanently delete one or more blocks from a doc (all-or-nothing: one unknown block ID fails the whole request)',
					},
					{
						name: 'Duplicate',
						value: 'duplicateDoc',
						action: 'Duplicate a doc',
						description: 'Create an exact copy of a doc, optionally including its updates',
					},
					{
						name: 'Export as Markdown',
						value: 'exportDocAsMarkdown',
						action: 'Export a doc as markdown',
						description: 'Return the doc’s content (or selected blocks) as a markdown string',
					},
					{
						name: 'Get',
						value: 'getDoc',
						action: 'Get a doc',
						description: 'Return a single doc’s metadata, optionally with its content blocks',
					},
					{
						name: 'Get Blocks',
						value: 'getDocBlocks',
						action: 'Get doc blocks',
						description: 'Return the content blocks of a doc, one block per result',
					},
					{
						name: 'Get Many',
						value: 'getDocs',
						action: 'Get many docs',
						description: 'Return docs of the account, optionally filtered by workspace or IDs',
					},
					{
						name: 'Import From HTML',
						value: 'importDocFromHtml',
						action: 'Import a doc from HTML',
						description: 'Create a new doc by converting HTML content into doc blocks',
					},
					{
						name: 'Rename',
						value: 'renameDoc',
						action: 'Rename a doc',
						description: 'Change the name of a doc (the only doc attribute the API can update)',
					},
					{
						name: 'Search',
						value: 'searchDocsAccount',
						action: 'Search docs',
						description: 'Find monday docs account-wide by keyword and semantic relevance',
					},
					{
						name: 'Update Block',
						value: 'updateDocBlock',
						action: 'Update a doc block',
						description: 'Replace the content of an existing doc block',
					},
				],
				default: 'createDoc',
			},
			// ---- Doc: shared locator ----
			{
				...docResourceLocator,
				displayOptions: {
					show: {
						operation: [
							'addDocContent',
							'createDocBlock',
							'deleteDoc',
							'duplicateDoc',
							'exportDocAsMarkdown',
							'getDoc',
							'getDocBlocks',
							'renameDoc',
						],
					},
				},
			},
			// ---- Doc: Create ----
			{
				displayName: 'Create In',
				name: 'docLocation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Board Item',
						value: 'board',
						description:
							'A doc inside a doc column of a board item — created untitled (use Rename to name it)',
					},
					{
						name: 'Workspace',
						value: 'workspace',
						description: 'A standalone doc in a workspace (optionally inside a folder)',
					},
				],
				default: 'workspace',
				description: 'Where the new doc lives',
				displayOptions: { show: { operation: ['createDoc'] } },
			},
			{
				displayName: 'Doc Name',
				name: 'docName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new doc',
				displayOptions: { show: { operation: ['createDoc'], docLocation: ['workspace'] } },
			},
			{
				...workspaceResourceLocator,
				name: 'docWorkspaceId',
				required: true,
				description: 'The workspace to create the doc in',
				displayOptions: { show: { operation: ['createDoc'], docLocation: ['workspace'] } },
			},
			{
				...boardResourceLocator,
				displayOptions: { show: { operation: ['createDoc'], docLocation: ['board'] } },
			},
			{
				// The column ID string is the value; "Name or ID" suffix per lint.
				displayName: 'Doc Column Name or ID',
				name: 'docColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardDocColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The doc column to create the doc in. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['createDoc'], docLocation: ['board'] } },
			},
			{
				...itemResourceLocator,
				displayOptions: { show: { operation: ['createDoc'], docLocation: ['board'] } },
			},
			{
				displayName: 'Options',
				name: 'createDocOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createDoc'], docLocation: ['workspace'] } },
				options: [
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'folderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getDocWorkspaceFolders',
							loadOptionsDependsOn: ['docWorkspaceId.value'],
						},
						default: '',
						description:
							'The folder to create the doc in. Select a workspace first — the list shows that workspace’s folders. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Kind',
						name: 'kind',
						type: 'options',
						options: [
							{ name: 'Private', value: 'private' },
							{ name: 'Public', value: 'public' },
							{ name: 'Shareable', value: 'share' },
						],
						default: 'private',
						description: 'The doc’s access level (the API default is private)',
					},
				],
			},
			// ---- Doc: Rename ----
			{
				displayName: 'New Name',
				name: 'docNewName',
				type: 'string',
				default: '',
				required: true,
				description: 'The doc’s new name',
				displayOptions: { show: { operation: ['renameDoc'] } },
			},
			// ---- Doc: Duplicate / Delete ----
			{
				displayName: 'Include Updates',
				name: 'docDuplicateWithUpdates',
				type: 'boolean',
				default: false,
				description: 'Whether the copy also includes the doc’s updates (comments)',
				displayOptions: { show: { operation: ['duplicateDoc'] } },
			},
			{
				displayName: 'Deleting a doc removes it and all of its content. This cannot be undone via the API.',
				name: 'deleteDocNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['deleteDoc'] } },
			},
			// ---- Doc: Get ----
			{
				displayName: 'Options',
				name: 'getDocOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getDoc'] } },
				options: [
					{
						displayName: 'Include Blocks',
						name: 'includeBlocks',
						type: 'boolean',
						default: false,
						description:
							'Whether to include the doc’s first 100 content blocks in the output. Use the Get Blocks operation to page through longer docs.',
					},
				],
			},
			// ---- Doc: Get Many ----
			{
				displayName: 'Options',
				name: 'getDocsOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getDocs'] } },
				options: [
					{
						displayName: 'Doc IDs',
						name: 'docIds',
						type: 'string',
						default: '',
						description:
							'Comma-separated doc IDs to return. Both internal IDs (from this node’s output) and URL/object IDs work — each kind is resolved automatically.',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Order By',
						name: 'orderBy',
						type: 'options',
						options: [
							{ name: 'Created At (Newest First)', value: 'created_at' },
							{ name: 'Last Used (Most Recent First)', value: 'used_at' },
						],
						default: 'created_at',
						description:
							'How to order the docs. Ignored by the API when Doc IDs are provided.',
					},
					{
						displayName: 'Workspace Names or IDs',
						name: 'workspaceIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getWorkspaces' },
						default: [],
						description:
							'Only return docs of these workspaces. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			// ---- Doc: Get Blocks ----
			{
				displayName: 'Options',
				name: 'getDocBlocksOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getDocBlocks'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
				],
			},
			// ---- Doc: Add Content ----
			{
				displayName: 'Markdown',
				name: 'docMarkdown',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				description:
					'The markdown content to append. Headings, bold/italic, lists, quotes, and code are converted into the matching doc block types.',
				displayOptions: { show: { operation: ['addDocContent'] } },
			},
			{
				displayName: 'Options',
				name: 'addDocContentOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['addDocContent'] } },
				options: [
					{
						displayName: 'After Block ID',
						name: 'afterBlockId',
						type: 'string',
						default: '',
						description:
							'Insert the content after this block (block IDs come from Get Blocks). Left unset, the content is appended at the end of the doc.',
					},
				],
			},
			// ---- Doc: Export as Markdown ----
			{
				displayName: 'Options',
				name: 'exportDocOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['exportDocAsMarkdown'] } },
				options: [
					{
						displayName: 'Block IDs',
						name: 'blockIds',
						type: 'string',
						default: '',
						description:
							'Comma-separated block IDs to export (from Get Blocks). Left unset, the whole doc is exported.',
					},
				],
			},
			// ---- Doc: Import From HTML ----
			{
				displayName: 'HTML',
				name: 'docHtml',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				description:
					'The HTML content to convert. Supported block types: styled text, titles, lists, tables, quotes, code, dividers, and emoji.',
				displayOptions: { show: { operation: ['importDocFromHtml'] } },
			},
			{
				...workspaceResourceLocator,
				name: 'docImportWorkspaceId',
				required: true,
				description: 'The workspace to create the doc in',
				displayOptions: { show: { operation: ['importDocFromHtml'] } },
			},
			{
				displayName: 'Options',
				name: 'importDocOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['importDocFromHtml'] } },
				options: [
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'folderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getDocImportWorkspaceFolders',
							loadOptionsDependsOn: ['docImportWorkspaceId.value'],
						},
						default: '',
						description:
							'The folder to create the doc in. Select a workspace first — the list shows that workspace’s folders. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Kind',
						name: 'kind',
						type: 'options',
						options: [
							{ name: 'Private', value: 'private' },
							{ name: 'Public', value: 'public' },
							{ name: 'Shareable', value: 'share' },
						],
						default: 'private',
						description: 'The doc’s access level (the API default is private)',
					},
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						description:
							'The new doc’s title. Left unset, it is inferred from the HTML content.',
					},
				],
			},
			// ---- Doc: Create Block / Update Block ----
			{
				displayName: 'Block Type',
				name: 'docBlockType',
				type: 'options',
				options: DOC_BLOCK_TYPE_OPTIONS,
				default: 'normal_text',
				description:
					'The type of block to create. Text-like types take plain text below; table, layout, image, video, and notice box need Raw JSON content.',
				displayOptions: { show: { operation: ['createDocBlock'] } },
			},
			{
				displayName: 'Block ID',
				name: 'docBlockId',
				type: 'string',
				default: '',
				required: true,
				description: 'The ID of the block to update (block IDs come from Get Blocks)',
				displayOptions: { show: { operation: ['updateDocBlock'] } },
			},
			{
				displayName: 'Content Mode',
				name: 'docBlockContentMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Raw JSON',
						value: 'json',
						description:
							'The full block content object (deltaFormat, alignment, table dimensions, image URLs, ...) as JSON',
					},
					{
						name: 'Text',
						value: 'text',
						description: 'Plain text — wrapped into the block content format automatically',
					},
				],
				default: 'text',
				description: 'How to provide the block’s content',
				displayOptions: { show: { operation: ['createDocBlock', 'updateDocBlock'] } },
			},
			{
				displayName: 'Text',
				name: 'docBlockText',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'The block’s text content',
				displayOptions: {
					show: {
						operation: ['createDocBlock', 'updateDocBlock'],
						docBlockContentMode: ['text'],
					},
				},
			},
			{
				displayName: 'Content (JSON)',
				name: 'docBlockContentJson',
				type: 'json',
				default: '{\n  "deltaFormat": [{ "insert": "Block text" }]\n}',
				description:
					'The block content object. Same shape as the content field returned by Get Blocks — e.g. tables need column_count and row_count, notice boxes take a theme.',
				displayOptions: {
					show: {
						operation: ['createDocBlock', 'updateDocBlock'],
						docBlockContentMode: ['json'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'createDocBlockOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createDocBlock'] } },
				options: [
					{
						displayName: 'After Block ID',
						name: 'afterBlockId',
						type: 'string',
						default: '',
						description:
							'Place the new block below this block. Left unset, the block is added at the top of the doc.',
					},
					{
						displayName: 'Parent Block ID',
						name: 'parentBlockId',
						type: 'string',
						default: '',
						description: 'Create the block nested under this block (e.g. inside a table cell or layout)',
					},
				],
			},
			// ---- Doc: Delete Blocks ----
			{
				displayName: 'Block IDs',
				name: 'docBlockIds',
				type: 'string',
				default: '',
				required: true,
				description:
					'Comma-separated IDs of the blocks to delete (from Get Blocks). The request is all-or-nothing: one unknown ID fails it entirely and nothing is deleted.',
				displayOptions: { show: { operation: ['deleteDocBlocks'] } },
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['file'] } },
				options: [
					{
						name: 'Add to File Column',
						value: 'addFileToColumn',
						action: 'Add a file to a file column',
						description: 'Upload a binary file from the workflow into an item’s file column',
					},
					{
						name: 'Download',
						value: 'downloadFile',
						action: 'Download a file',
						description: 'Download an asset (file) into the workflow as binary data',
					},
					{
						name: 'Get Many',
						value: 'getAssets',
						action: 'Get many files',
						description:
							'Return the metadata of assets (files) — by ID, from a board item, or from a file column',
					},
				],
				default: 'addFileToColumn',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['update'] } },
				options: [
					{
						name: 'Add File',
						value: 'addFileToUpdate',
						action: 'Add a file to an update',
						description: 'Upload a binary file from the workflow as an attachment on an update',
					},
					{
						name: 'Create',
						value: 'createUpdate',
						action: 'Create an update',
						description: 'Post an update on an item, or a reply to an existing update',
					},
					{
						name: 'Get Many',
						value: 'getUpdates',
						action: 'Get many updates',
						description: 'Return updates of one item, or account-wide',
					},
					{
						name: 'Search',
						value: 'searchUpdatesAccount',
						action: 'Search updates',
						description: 'Find updates account-wide by keywords in their body text',
					},
				],
				default: 'createUpdate',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['emailsActivities'] } },
				options: [
					{
						name: 'Create Custom Activity',
						value: 'createCustomActivity',
						action: 'Create a custom activity',
						description:
							'Create a new custom activity type for the Emails & Activities timeline',
					},
					{
						name: 'Create Timeline Item',
						value: 'createTimelineItem',
						action: 'Create a timeline item',
						description: 'Log an activity on the Emails & Activities timeline of an item',
					},
					{
						name: 'Delete Custom Activity',
						value: 'deleteCustomActivity',
						action: 'Delete a custom activity',
						description:
							'Permanently delete a custom activity type (built-in activity types cannot be deleted)',
					},
					{
						name: 'Delete Timeline Item',
						value: 'deleteTimelineItem',
						action: 'Delete a timeline item',
						description: 'Delete a timeline item from the Emails & Activities timeline of an item',
					},
					{
						name: 'Get Many Custom Activities',
						value: 'getCustomActivities',
						action: 'Get many custom activities',
						description:
							'Return the custom activity types of the account (the API returns up to 50)',
					},
					{
						name: 'Get Many Timeline Items',
						value: 'getTimelineItems',
						action: 'Get many timeline items',
						description:
							'Return the Emails & Activities timeline of an item (only entries created via the API are visible)',
					},
					{
						name: 'Get Timeline Item',
						value: 'getTimelineItem',
						action: 'Get a timeline item',
						description: 'Return a single Emails & Activities timeline item by its ID',
					},
					{
						name: 'Search Timeline Items',
						value: 'searchTimelineItemsAccount',
						action: 'Search timeline items',
						description:
							'Find Emails & Activities timeline entries by keyword — only timeline items created via the API are searchable',
					},
				],
				default: 'createTimelineItem',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['column'] } },
				options: [
					{
						name: 'Add Label',
						value: 'addColumnLabel',
						action: 'Add a label to a column',
						description: 'Add a new label to an existing status or dropdown column',
					},
					{
						name: 'Create',
						value: 'createColumn',
						action: 'Create a board column',
						description: 'Create a new column on a board, with typed per-type settings',
					},
					{
						// Tags live under Column actions (product decision 2026-07-19):
						// tag values are written through tags columns.
						name: 'Create or Get Tag',
						value: 'createOrGetTag',
						action: 'Create or get a tag',
						description:
							'Return the tag with this name, creating it if it does not exist yet — for writing into tags columns',
					},
					{
						name: 'Delete',
						value: 'deleteColumn',
						action: 'Delete a column',
						description: 'Permanently delete a column from a board, including its values',
					},
					{
						name: 'Get Many',
						value: 'getColumns',
						action: 'Get many columns',
						description:
							'Return the column schema of a board (IDs, types, settings) for use in expressions',
					},
					{
						name: 'Update',
						value: 'updateColumn',
						action: 'Update a column',
						description:
							'Change the title, description, width, or settings of an existing column',
					},
					{
						name: 'Update Label',
						value: 'updateColumnLabel',
						action: 'Update a label of a column',
						description:
							'Rename, recolor, deactivate, or otherwise modify a label of a status or dropdown column',
					},
				],
				default: 'createColumn',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['group'] } },
				options: [
					{
						name: 'Archive or Delete',
						value: 'archiveOrDeleteGroup',
						action: 'Archive or delete a board group',
						description: 'Archive a group (recoverable, the default) or permanently delete it',
					},
					{
						name: 'Create',
						value: 'createGroup',
						action: 'Create a board group',
						description: 'Create a new group on a board',
					},
					{
						name: 'Duplicate',
						value: 'duplicateGroup',
						action: 'Duplicate a board group',
						description: 'Create a copy of a group with its items on the same board',
					},
					{
						name: 'Get Many',
						value: 'getGroups',
						action: 'Get many board groups',
						description: 'Return the groups of a board',
					},
					{
						name: 'Update',
						value: 'updateGroup',
						action: 'Update a board group',
						description: 'Change the title, color, or position of an existing group',
					},
				],
				default: 'getGroups',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['board'] } },
				options: [
					{
						name: 'Aggregate Item Data',
						value: 'aggregateBoardData',
						action: 'Aggregate item data on a board',
						description:
							'Calculate counts, sums, averages and more across a board’s items, optionally grouped like a pivot table — on monday’s servers, without fetching the items',
					},
					{
						name: 'Archive or Delete',
						value: 'archiveOrDeleteBoard',
						action: 'Archive or delete a board',
						description: 'Archive a board (recoverable, the default) or permanently delete it',
					},
					{
						name: 'Create',
						value: 'createBoard',
						action: 'Create a board',
						description: 'Create a new board, optionally in a specific workspace or from a template',
					},
					{
						name: 'Duplicate',
						value: 'duplicateBoard',
						action: 'Duplicate a board',
						description: 'Create a copy of a board: structure only, or including items and updates',
					},
					{
						name: 'Get',
						value: 'getBoard',
						action: 'Get a board',
						description: 'Return a single board with its groups and column schema',
					},
					{
						name: 'Get Many',
						value: 'getBoards',
						action: 'Get many boards',
						description: 'Return a page of boards, with optional filters',
					},
					{
						name: 'List Activity Logs',
						value: 'getActivityLogs',
						action: 'List board activity logs',
						description: 'Return the activity log events of a board, with optional filters',
					},
					{
						name: 'List Subscribers',
						value: 'getBoardSubscribers',
						action: 'List board subscribers',
						description: 'Return the users and teams subscribed to (or owning) a board',
					},
					{
						name: 'Search',
						value: 'searchBoardsAccount',
						action: 'Search boards',
						description: 'Find boards account-wide by keyword and semantic relevance',
					},
					{
						name: 'Update Subscribers',
						value: 'updateBoardSubscribers',
						action: 'Update board subscribers',
						description:
							'Add users and/or teams to a board as subscribers or owners — or remove them',
					},
				],
				default: 'getBoard',
			},
			{
				displayName: 'Board Name',
				name: 'boardName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new board',
				displayOptions: { show: { operation: ['createBoard'] } },
			},
			{
				displayName: 'Board Kind',
				name: 'boardKind',
				type: 'options',
				options: [
					{ name: 'Private', value: 'private' },
					{ name: 'Public', value: 'public' },
					{ name: 'Shareable', value: 'share' },
				],
				default: 'public',
				required: true,
				description:
					'Who can see the board: public = everyone in the account, private = invited members, shareable = including guests',
				displayOptions: { show: { operation: ['createBoard'] } },
			},
			{
				displayName: 'Options',
				name: 'createBoardOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createBoard'] } },
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'The description of the new board',
					},
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'folderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getCreateBoardWorkspaceFolders',
							loadOptionsDependsOn: ['createBoardOptions.workspaceId.value'],
						},
						default: '',
						description:
							'The folder to create the board in. Select a workspace first — the list shows that workspace’s folders. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					buildUserRowsProperty({
						displayName: 'Owners',
						name: 'ownerIds',
						includeTeams: true,
						description:
							'The users and/or teams to set as board owners. The creating user is always an owner. In expression mode, pass a comma-separated string of user IDs and/or <code>team:&lt;ID&gt;</code> values.',
					}),
					buildUserRowsProperty({
						displayName: 'Subscribers',
						name: 'subscriberIds',
						includeTeams: true,
						description:
							'The users and/or teams to subscribe to the board. In expression mode, pass a comma-separated string of user IDs and/or <code>team:&lt;ID&gt;</code> values.',
					}),
					{
						displayName: 'Template ID',
						name: 'templateId',
						type: 'string',
						default: '',
						description:
							'Create the board from this board template. monday has no API to list templates, so copy the numeric ID from the template’s Template Center URL (enable Developer mode in monday.labs to see IDs). The template must be accessible to the API user.',
					},
					{
						...workspaceResourceLocator,
						description:
							'The workspace to create the board in. To use the account’s Main workspace, leave this unset — the API does not list it as a selectable workspace. Picking a workspace here also loads its folders into the Folder option.',
					},
				],
			},
			// ---- Folder & Object resource ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['folder'] } },
				options: [
					{
						name: 'Create Folder',
						value: 'createFolder',
						action: 'Create a folder',
						description:
							'Create a folder in a workspace (optionally nested in another folder) to organize boards, docs, and dashboards',
					},
					{
						name: 'Delete Folder',
						value: 'deleteFolder',
						action: 'Delete a folder',
						description:
							'Permanently delete a folder INCLUDING everything inside it — contained boards and sub-folders are deleted too',
					},
					{
						name: 'Get Many Folders',
						value: 'getFolders',
						action: 'Get many folders',
						description:
							'Return the folders of one or more workspaces (sub-folders included as their own rows)',
					},
					{
						name: 'Get Many Objects',
						value: 'getWorkspaceObjects',
						action: 'Get many workspace objects',
						description:
							'Return the objects in a workspace’s left pane — boards, docs, workflows, and folders — as a flat list or a nested folder tree',
					},
					{
						name: 'Move Object',
						value: 'moveObject',
						action: 'Move a workspace object',
						description:
							'Reposition a board, dashboard, doc, or folder in the left pane, and/or move it into a folder or another workspace',
					},
					{
						name: 'Update Folder',
						value: 'updateFolder',
						action: 'Update a folder',
						description:
							'Rename, restyle, re-nest, or move a folder to another workspace — attributes you don’t change are preserved',
					},
				],
				default: 'getFolders',
			},
			// ---- Folder: Create ----
			{
				displayName: 'Folder Name',
				name: 'folderName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new folder',
				displayOptions: { show: { operation: ['createFolder'] } },
			},
			{
				displayName: 'Options',
				name: 'createFolderOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createFolder'] } },
				options: [
					{
						displayName: 'Color',
						name: 'color',
						type: 'options',
						options: FOLDER_COLOR_OPTIONS,
						default: FOLDER_ATTRIBUTE_NONE,
						description: 'The folder’s color in the left-side menu',
					},
					{
						displayName: 'Custom Icon',
						name: 'customIcon',
						type: 'options',
						options: FOLDER_ICON_OPTIONS,
						default: FOLDER_ATTRIBUTE_NONE,
						description: 'The folder’s icon in the left-side menu',
					},
					{
						displayName: 'Font Weight',
						name: 'fontWeight',
						type: 'options',
						options: FOLDER_FONT_WEIGHT_OPTIONS,
						default: FOLDER_ATTRIBUTE_NONE,
						description: 'The font weight of the folder’s name in the left-side menu',
					},
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Parent Folder Name or ID',
						name: 'parentFolderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getCreateFolderParentList',
							loadOptionsDependsOn: ['createFolderOptions.workspaceId.value'],
						},
						default: '',
						description:
							'Nest the new folder inside this folder. The list shows the folders of the selected workspace (or the Main workspace when none is selected). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						...workspaceResourceLocator,
						description:
							'The workspace to create the folder in. To use the account’s Main workspace, leave this unset — the API does not list it as a selectable workspace.',
					},
				],
			},
			// ---- Folder: Get Many ----
			{
				displayName: 'Options',
				name: 'getFoldersOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getFolders'] } },
				options: [
					{
						displayName: 'Folder IDs',
						name: 'folderIds',
						type: 'string',
						default: '',
						description:
							'Comma-separated folder IDs to return. When set, only these folders are returned.',
					},
					{
						displayName: 'Include Boards',
						name: 'includeBoards',
						type: 'boolean',
						default: false,
						description:
							'Whether to include each folder’s boards (the children field — boards only, not dashboards or sub-folders) in the output',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'The API serves folders in pages of 100 — limits above that take one extra request per 100 folders',
					},
					{
						displayName: 'Workspace Names or IDs',
						name: 'workspaceIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getWorkspaces' },
						default: [],
						description:
							'Only return folders of these workspaces. Leave empty for all folders visible to the API user; the account’s Main workspace is always queryable but never listed here — target it by leaving this empty. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			// ---- Folder: Update / Delete ----
			{
				...workspaceResourceLocator,
				name: 'folderWorkspaceId',
				description:
					'The workspace containing the folder — it scopes the Folder dropdown below. Leave unset for the account’s Main workspace.',
				displayOptions: { show: { operation: ['updateFolder', 'deleteFolder'] } },
			},
			{
				// The folder ID string is the value; "Name or ID" suffix per lint.
				displayName: 'Folder Name or ID',
				name: 'folderId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getFolderList',
					loadOptionsDependsOn: ['folderWorkspaceId.value'],
				},
				default: '',
				required: true,
				description:
					'The folder to operate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['updateFolder', 'deleteFolder'] } },
			},
			{
				displayName:
					'Deleting a folder also deletes everything inside it: contained boards and sub-folders end up deleted. This cannot be undone via the API.',
				name: 'deleteFolderNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['deleteFolder'] } },
			},
			{
				displayName: 'Update Fields',
				name: 'updateFolderFields',
				type: 'collection',
				placeholder: 'Add field',
				default: {},
				displayOptions: { show: { operation: ['updateFolder'] } },
				options: [
					{
						displayName: 'Color',
						name: 'color',
						type: 'options',
						options: FOLDER_COLOR_OPTIONS,
						default: FOLDER_ATTRIBUTE_NONE,
						description:
							'The folder’s new color. "None (Default)" clears it back to the default.',
					},
					{
						displayName: 'Custom Icon',
						name: 'customIcon',
						type: 'options',
						options: FOLDER_ICON_OPTIONS,
						default: FOLDER_ATTRIBUTE_NONE,
						description: 'The folder’s new icon. "None (Default)" clears it back to the default.',
					},
					{
						displayName: 'Font Weight',
						name: 'fontWeight',
						type: 'options',
						options: FOLDER_FONT_WEIGHT_OPTIONS,
						default: FOLDER_ATTRIBUTE_NONE,
						description:
							'The new font weight of the folder’s name. "None (Default)" clears it back to the default.',
					},
					{
						...workspaceResourceLocator,
						displayName: 'Move to Workspace',
						description:
							'Move the folder (and its contents) to this workspace. Unless a new parent folder is also picked, the folder lands at the target workspace’s root.',
					},
					{
						displayName: 'New Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'The folder’s new name',
					},
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Parent Folder Name or ID',
						name: 'parentFolderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getUpdateFolderParentList',
							loadOptionsDependsOn: ['folderWorkspaceId.value', 'folderId'],
						},
						default: '',
						description:
							'Nest the folder inside this folder, or pick "No Parent (Workspace Root)" to un-nest it. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			// ---- Folder & Object: Get Many Objects ----
			{
				...workspaceResourceLocator,
				name: 'objectsWorkspaceId',
				description:
					'The workspace whose objects to return. Leave unset for the account’s Main workspace — the API does not list it as a selectable workspace.',
				displayOptions: { show: { operation: ['getWorkspaceObjects'] } },
			},
			{
				displayName: 'Output Structure',
				name: 'objectsOutputStructure',
				type: 'options',
				options: [
					{
						name: 'List',
						value: 'list',
						description: 'One row per object, with its containing folder in folderId',
					},
					{
						name: 'Tree',
						value: 'tree',
						description:
							'One row per root-level object, with folder contents nested in children',
					},
				],
				default: 'list',
				description:
					'How to shape the output. The monday API exposes no left-pane sibling ORDER, so rows are sorted folders-first by name; dashboards cannot be listed at all.',
				displayOptions: { show: { operation: ['getWorkspaceObjects'] } },
			},
			{
				displayName: 'Options',
				name: 'getObjectsOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getWorkspaceObjects'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Applies to boards, docs, and workflows. Folders are always fully listed (up to 1,000).',
					},
					{
						displayName: 'Object Types',
						name: 'objectTypes',
						type: 'multiOptions',
						options: [
							{ name: 'Boards', value: 'board' },
							{ name: 'Docs', value: 'doc' },
							{ name: 'Folders', value: 'folder' },
							{ name: 'Workflows & Custom Objects', value: 'customObject' },
						],
						default: [],
						description:
							'Only return these object types; leave empty for all. In Tree output, folders are always included as the tree structure. Dashboards are not available — the monday API cannot list them.',
					},
				],
			},
			// ---- Folder & Object: Move Object ----
			{
				displayName: 'Object Type',
				name: 'moveObjectType',
				type: 'options',
				options: [
					{ name: 'Board', value: 'board' },
					{ name: 'Dashboard (Overview)', value: 'dashboard' },
					{ name: 'Doc', value: 'doc' },
					{ name: 'Folder', value: 'folder' },
				],
				default: 'board',
				description: 'The type of object to move',
				displayOptions: { show: { operation: ['moveObject'] } },
			},
			{
				...boardResourceLocator,
				description: 'The board to move',
				displayOptions: { show: { operation: ['moveObject'], moveObjectType: ['board'] } },
			},
			{
				...docResourceLocator,
				description: 'The doc to move',
				displayOptions: { show: { operation: ['moveObject'], moveObjectType: ['doc'] } },
			},
			{
				displayName: 'Dashboard ID',
				name: 'dashboardId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. 12345678',
				description:
					'The dashboard (overview) ID — the number in the dashboard’s URL. The monday API cannot list dashboards, so the ID must be provided directly.',
				displayOptions: { show: { operation: ['moveObject'], moveObjectType: ['dashboard'] } },
			},
			{
				...workspaceResourceLocator,
				name: 'folderWorkspaceId',
				description:
					'The workspace containing the folder — it scopes the Folder dropdown below. Leave unset for the account’s Main workspace.',
				displayOptions: { show: { operation: ['moveObject'], moveObjectType: ['folder'] } },
			},
			{
				// The folder ID string is the value; "Name or ID" suffix per lint.
				displayName: 'Folder Name or ID',
				name: 'folderId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getFolderList',
					loadOptionsDependsOn: ['folderWorkspaceId.value'],
				},
				default: '',
				required: true,
				description:
					'The folder to move. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['moveObject'], moveObjectType: ['folder'] } },
			},
			{
				displayName: 'New Position',
				name: 'movePosition',
				type: 'collection',
				placeholder: 'Add position',
				default: {},
				description:
					'Where to place the object in the left pane, relative to a reference object. Positioning next to a reference at the workspace root also pulls the object out of its folder; to place it inside a folder, set the Destination folder too.',
				displayOptions: { show: { operation: ['moveObject'] } },
				options: [
					{
						displayName: 'Placement',
						name: 'placement',
						type: 'options',
						options: [
							{ name: 'After Reference Object', value: 'after' },
							{ name: 'Before Reference Object', value: 'before' },
						],
						default: 'after',
						description: 'Whether to place the object after or before the reference object',
					},
					{
						displayName: 'Reference Object ID',
						name: 'objectId',
						type: 'string',
						default: '',
						placeholder: 'e.g. 1234567890',
						description:
							'The ID of the object to position relative to — a board or doc object ID, folder ID, or dashboard ID',
					},
					{
						displayName: 'Reference Object Type',
						name: 'objectType',
						type: 'options',
						options: POSITION_REFERENCE_TYPE_OPTIONS,
						default: 'Board',
						description: 'What kind of object the reference is',
					},
				],
			},
			{
				displayName: 'Destination',
				name: 'moveDestination',
				type: 'collection',
				placeholder: 'Add destination',
				default: {},
				description:
					'The folder and/or workspace to move the object into. For a folder object, the destination folder becomes its new parent.',
				displayOptions: { show: { operation: ['moveObject'] } },
				options: [
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'folderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getMoveDestinationFolderList',
							loadOptionsDependsOn: ['moveDestination.workspaceId.value'],
						},
						default: '',
						description:
							'Move the object into this folder. The list shows the folders of the destination workspace (or the Main workspace when none is selected). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						...workspaceResourceLocator,
						description: 'Move the object to this workspace',
					},
				],
			},
			// ---- Workspace resource ----
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['workspace'] } },
				options: [
					{
						name: 'Search',
						value: 'searchWorkspacesAccount',
						action: 'Search workspaces',
						description: 'Find workspaces account-wide by keyword and semantic relevance',
					},
				],
				default: 'searchWorkspacesAccount',
			},
			// ---- Search params, shared by the per-resource Search ops ----
			// One Search op per entity type, living on its home resource
			// (product decision 2026-07-19; replaced first a combined
			// multi-entity op, then a standalone Search resource). The
			// params below key off the operation values, which are unique
			// across resources.
			{
				displayName: 'Query',
				name: 'searchQuery',
				type: 'string',
				default: '',
				required: true,
				description: 'The text to search for — matched by keyword and semantic relevance',
				displayOptions: { show: { operation: SEARCH_OPERATION_VALUES } },
			},
			{
				displayName: 'Include Live Data',
				name: 'includeLiveData',
				type: 'boolean',
				default: false,
				description:
					'Whether to also resolve each result to its latest full entity from the core API (adds latency). The search index itself is fast but can be slightly stale. liveData is null when the entity was deleted, is inaccessible, or was not yet re-indexed.',
				displayOptions: { show: { operation: SEARCH_OPERATION_VALUES } },
			},
			{
				displayName: 'Options',
				name: 'searchOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: SEARCH_OPERATION_VALUES } },
				options: [
					{
						displayName: 'Board Names or IDs',
						name: 'boardIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getBoardList' },
						default: [],
						description:
							'Only return results from these boards. The list shows only the 500 most recently used boards; for boards beyond that window, pass explicit IDs via an expression (an array or a comma-separated string). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: {
							show: {
								'/operation': [
									'searchItemsAccount',
									'searchBoardsAccount',
									'searchUpdatesAccount',
									'searchTimelineItemsAccount',
								],
							},
						},
					},
					{
						displayName: 'Created After',
						name: 'createdAfter',
						type: 'dateTime',
						default: '',
						description: 'Only return results created after this time',
					},
					{
						displayName: 'Created Before',
						name: 'createdBefore',
						type: 'dateTime',
						default: '',
						description: 'Only return results created before this time',
					},
					buildUserRowsProperty({
						displayName: 'Creators',
						name: 'creatorIds',
						description:
							'Only return updates authored by these users. Expressions accept an array or a comma-separated string of user IDs.',
						displayOptions: { show: { '/operation': ['searchUpdatesAccount'] } },
					}),
					{
						displayName: 'Item IDs',
						name: 'itemIds',
						type: 'string',
						default: '',
						description:
							'Only return timeline items belonging to these items (comma-separated item IDs)',
						displayOptions: { show: { '/operation': ['searchTimelineItemsAccount'] } },
					},
					{
						// Named searchLimit (not the node-wide `limit` convention) on
						// purpose: search is hard-capped at 20 results by the API, so
						// the standard 50 default cannot apply.
						displayName: 'Limit',
						name: 'searchLimit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 20 },
						default: 10,
						description:
							'Max number of results to return. The API hard-caps search at 20 results with no pagination — results are the top matches by relevance.',
					},
					{
						displayName: 'Strategy',
						name: 'strategy',
						type: 'options',
						options: SEARCH_STRATEGY_OPTIONS,
						default: 'BALANCED',
						description:
							'The trade-off between search quality and response time. Update and timeline item search always use keyword matching regardless of strategy.',
					},
					{
						displayName: 'Timeline Item Product',
						name: 'timelineProductKind',
						type: 'options',
						options: SEARCH_TIMELINE_PRODUCT_OPTIONS,
						default: 'crm',
						description:
							'Only return timeline items originating from this monday.com product',
						displayOptions: { show: { '/operation': ['searchTimelineItemsAccount'] } },
					},
					{
						displayName: 'Timeline Item Type',
						name: 'timelineType',
						type: 'options',
						options: SEARCH_TIMELINE_KIND_OPTIONS,
						default: 'email',
						description: 'Only return timeline items of this kind',
						displayOptions: { show: { '/operation': ['searchTimelineItemsAccount'] } },
					},
					{
						displayName: 'Updated After',
						name: 'updatedAfter',
						type: 'dateTime',
						default: '',
						description: 'Only return results updated after this time',
					},
					{
						displayName: 'Updated Before',
						name: 'updatedBefore',
						type: 'dateTime',
						default: '',
						description: 'Only return results updated before this time',
					},
					{
						displayName: 'Workspace Names or IDs',
						name: 'workspaceIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getWorkspaces' },
						default: [],
						description:
							'Only return results from these workspaces. Expressions accept an array or a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: {
							show: {
								'/operation': [
									'searchItemsAccount',
									'searchBoardsAccount',
									'searchDocsAccount',
									'searchWorkspacesAccount',
									'searchTimelineItemsAccount',
								],
							},
						},
					},
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['item'] } },
				options: [
					{
						name: 'Archive or Delete',
						value: 'archiveOrDeleteItem',
						action: 'Archive or delete an item',
						description:
							'Archive items (recoverable, the default) or permanently delete them — one picked item or up to 50 by ID',
					},
					{
						name: 'Bulk Import',
						value: 'bulkImport',
						action: 'Bulk import items',
						description:
							'Create or upsert up to 10,000 items in one asynchronous CSV import job — all input items become one job',
					},
					{
						name: 'Clear Column Values',
						value: 'clearColumnValues',
						action: 'Clear column values',
						description:
							'Reset the selected columns of up to 10 items back to empty/default values',
					},
					{
						name: 'Create',
						value: 'createItem',
						action: 'Create an item',
						description:
							'Create a new item on a board — or a subitem under a parent item — with column values',
					},
					{
						name: 'Duplicate',
						value: 'duplicateItem',
						action: 'Duplicate an item',
						description: 'Create a copy of an item on the same board, optionally with its updates',
					},
					{
						name: 'Get',
						value: 'getItem',
						action: 'Get an item',
						description: 'Return a single item with its column values',
					},
					{
						name: 'Get Bulk Import Status',
						value: 'getBulkImportStatus',
						action: 'Get bulk import status',
						description:
							'Check an asynchronous bulk import job by its job ID, optionally with the per-row report',
					},
					{
						name: 'Get Column Value',
						value: 'getColumnValue',
						action: 'Get a column value',
						description: 'Return one column of an item: parsed text plus the raw API value',
					},
					{
						name: 'Get Many',
						value: 'getItems',
						action: 'Get many items',
						description: 'Return items on a board, optionally filtered to specific groups',
					},
					{
						name: 'List Subscribers',
						value: 'getItemSubscribers',
						action: 'List item subscribers',
						description: 'Return the users subscribed to an item',
					},
					{
						name: 'Move',
						value: 'moveItem',
						action: 'Move an item',
						description: 'Move an item to another group, or to another board with column mapping',
					},
					{
						name: 'Search',
						value: 'searchItemsAccount',
						action: 'Search items',
						description: 'Find items account-wide by keyword and semantic relevance',
					},
					{
						name: 'Update',
						value: 'updateItem',
						action: 'Update an item',
						description: 'Update column values of an existing item (including its name)',
					},
				],
				default: 'getItems',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['user'] } },
				options: [
					{
						name: 'Get',
						value: 'getUser',
						action: 'Get a user',
						description: 'Return a single user profile',
					},
					{
						name: 'Get Current',
						value: 'getMe',
						action: 'Get the current user',
						description: 'Return the account of the authenticated user',
					},
					{
						name: 'Get Many',
						value: 'getUsers',
						action: 'Get many users',
						description: 'Return users, searchable by name/email server-side',
					},
					{
						name: 'List Activity Logs',
						value: 'getUserActivityLogs',
						action: 'List user activity logs',
						description:
							'Return the activity log events of a user across boards, with optional filters',
					},
					{
						name: 'Search',
						value: 'searchUsersAccount',
						action: 'Search users',
						description: 'Find users account-wide by name or email',
					},
				],
				default: 'getMe',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['directoryResource'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getDirectoryResources',
						action: 'Get many directory resources',
						description:
							'Return resources from the account\u2019s Resource Directory, filterable by attributes (Enterprise plans only)',
					},
					{
						name: 'Update Attributes',
						value: 'updateDirectoryResourceAttributes',
						action: 'Update directory resource attributes',
						description:
							'Assign a job role, location, or skills to one or more directory resources (Enterprise plans only). Skills are added to the existing set \u2014 the API cannot remove attribute values.',
					},
				],
				default: 'getDirectoryResources',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['department'] } },
				options: [
					{
						name: 'Assign Members',
						value: 'assignDepartmentMembers',
						action: 'Assign department members',
						description:
							'Assign users to a department as members. A user belongs to at most one department \u2014 users already in another department are moved.',
					},
					{
						name: 'Assign Owners',
						value: 'assignDepartmentOwners',
						action: 'Assign department owners',
						description:
							'Assign users as owners of a department. Owners need not be members, and a user can own several departments.',
					},
					{
						name: 'Clear Users\u2019 Department',
						value: 'clearUsersDepartment',
						action: 'Clear users from their department',
						description:
							'Remove users from whatever department each of them is currently a member of',
					},
					{
						name: 'Create',
						value: 'createDepartment',
						action: 'Create a department',
						description: 'Create a department for grouping account users (Enterprise plans only)',
					},
					{
						name: 'Delete',
						value: 'deleteDepartment',
						action: 'Delete a department',
						description: 'Permanently delete a department from the account',
					},
					{
						name: 'Get Many',
						value: 'getDepartments',
						action: 'Get many departments',
						description:
							'Return the account\u2019s departments, optionally with their members and owners (Enterprise plans only)',
					},
					{
						name: 'Unassign Owners',
						value: 'unassignDepartmentOwners',
						action: 'Unassign department owners',
						description: 'Remove users from a department\u2019s owners',
					},
					{
						name: 'Update',
						value: 'updateDepartment',
						action: 'Update a department',
						description: 'Rename a department or change its reserved seats',
					},
				],
				default: 'getDepartments',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['meeting'] } },
				options: [
					{
						name: 'Get',
						value: 'getMeeting',
						action: 'Get a meeting',
						description:
							'Return one Notetaker meeting — recording metadata, summary, topics, action items, and optionally the transcript',
					},
					{
						name: 'Get Many',
						value: 'getMeetings',
						action: 'Get many meetings',
						description:
							'Return Notetaker meetings with completed recordings, searchable by title or participant',
					},
				],
				default: 'getMeetings',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['form'] } },
				options: [
					{
						name: 'Activate or Deactivate',
						value: 'activateOrDeactivateForm',
						action: 'Activate or deactivate a form',
						description:
							'Open the form for new submissions (activate) or hide it and block submissions (deactivate)',
					},
					{
						name: 'Create',
						value: 'createForm',
						action: 'Create a form',
						description:
							'Create a new WorkForm together with the board that stores its responses',
					},
					{
						name: 'Create Question',
						value: 'createFormQuestion',
						action: 'Create a form question',
						description: 'Add a new question to a form',
					},
					{
						name: 'Create Tag',
						value: 'createFormTag',
						action: 'Create a form tag',
						description:
							'Add a tracking tag to a form for categorization and analytics (creates a matching column on the response board)',
					},
					{
						name: 'Delete Question',
						value: 'deleteFormQuestion',
						action: 'Delete a form question',
						description: 'Permanently delete a question from a form — this cannot be undone',
					},
					{
						name: 'Delete Tag',
						value: 'deleteFormTag',
						action: 'Delete a form tag',
						description:
							'Permanently delete a tracking tag from a form, optionally with its response-board column',
					},
					{
						name: 'Get',
						value: 'getForm',
						action: 'Get a form',
						description:
							'Return the full configuration of a form: settings, appearance, questions, and tags',
					},
					{
						name: 'Set or Remove Password',
						value: 'setFormPassword',
						action: 'Set or remove a form password',
						description: 'Enable password protection with a new password, or turn it off',
					},
					{
						name: 'Shorten URL',
						value: 'shortenFormUrl',
						action: 'Shorten a form URL',
						description: 'Generate a shortened share URL (wkf.ms) for a form',
					},
					{
						name: 'Update',
						value: 'updateForm',
						action: 'Update a form',
						description: 'Change the title, description, or question order of a form',
					},
					{
						name: 'Update Question',
						value: 'updateFormQuestion',
						action: 'Update a form question',
						description:
							'Change the title, description, requiredness, visibility, options, or settings of a question',
					},
					{
						name: 'Update Settings',
						value: 'updateFormSettings',
						action: 'Update form settings',
						description:
							'Change the features, appearance, and accessibility settings of a form',
					},
				],
				default: 'getForm',
			},
			{
				// There is no API to list forms (the form query is root-only by
				// token), so a From-List picker is impossible — the token or the
				// full form URL is the input for every form operation. The token
				// is a public URL fragment rather than a secret, but n8n's
				// verification lint requires masking on token-named fields.
				displayName: 'Form Token',
				name: 'formToken',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				placeholder: 'e.g. abc123def456 or https://forms.monday.com/forms/abc123def456',
				description:
					'The form’s unique token, or the full form URL (the token is the part right after /forms/). Shortened wkf.ms links do not contain the token — open one in a browser to reveal the full URL. Find it via Share form on the form.',
				displayOptions: {
					show: {
						resource: ['form'],
					},
					hide: {
						operation: ['createForm'],
					},
				},
			},
			{
				...workspaceResourceLocator,
				name: 'formWorkspaceId',
				required: true,
				description: 'The workspace to create the form in',
				displayOptions: { show: { operation: ['createForm'] } },
			},
			{
				displayName: 'Options',
				name: 'createFormOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createForm'] } },
				options: [
					{
						displayName: 'Board Kind',
						name: 'boardKind',
						type: 'options',
						options: [
							{ name: 'Private', value: 'private' },
							{ name: 'Public', value: 'public' },
							{ name: 'Shareable', value: 'share' },
						],
						default: 'public',
						description: 'Who can see the board that stores the form responses',
					},
					{
						displayName: 'Board Name',
						name: 'destinationName',
						type: 'string',
						default: '',
						description:
							'The name of the board created to store the form responses (the form itself starts as "New Form" — rename it with the Update operation)',
					},
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'destinationFolderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getFormWorkspaceFolders',
							loadOptionsDependsOn: ['formWorkspaceId.value'],
						},
						default: '',
						description:
							'The folder to create the form in — the list shows the selected workspace’s folders. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					buildUserRowsProperty({
						displayName: 'Owners',
						name: 'ownerIds',
						includeTeams: true,
						description:
							'The users and/or teams to set as owners of the response board. In expression mode, pass a comma-separated string of user IDs and/or <code>team:&lt;ID&gt;</code> values.',
					}),
					buildUserRowsProperty({
						displayName: 'Subscribers',
						name: 'subscriberIds',
						includeTeams: true,
						description:
							'The users and/or teams to subscribe to the response board. In expression mode, pass a comma-separated string of user IDs and/or <code>team:&lt;ID&gt;</code> values.',
					}),
				],
			},
			{
				displayName: 'Action',
				name: 'formActiveAction',
				type: 'options',
				options: [
					{
						name: 'Activate',
						value: 'activate',
						description: 'Make the form visible and accept new submissions',
					},
					{
						name: 'Deactivate',
						value: 'deactivate',
						description:
							'Hide the form and block new submissions. A deactivated form rejects all other API operations (including Get) until it is activated again.',
					},
				],
				default: 'activate',
				description: 'Whether to activate or deactivate the form',
				displayOptions: { show: { operation: ['activateOrDeactivateForm'] } },
			},
			{
				displayName: 'Update Fields',
				name: 'updateFormFields',
				type: 'collection',
				placeholder: 'Add field',
				default: {},
				displayOptions: { show: { operation: ['updateForm'] } },
				options: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'The new form description, displayed below the title',
					},
					{
						displayName: 'Question Order',
						name: 'questionOrder',
						type: 'string',
						default: '',
						placeholder: 'e.g. q1, q3, q2',
						description:
							'Comma-separated question IDs in the desired display order. Listed questions move to the front in this order; unlisted ones keep their relative order after them. Get the IDs from the Get operation.',
					},
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'The new form title (must be at least one character)',
					},
				],
			},
			{
				displayName: 'Settings',
				name: 'formSettingsFields',
				type: 'collection',
				placeholder: 'Add setting',
				default: {},
				displayOptions: { show: { operation: ['updateFormSettings'] } },
				options: [
					{
						displayName: 'Allow Draft Submissions',
						name: 'allowDraftSubmissions',
						type: 'boolean',
						default: false,
						description: 'Whether responders can save incomplete responses as drafts',
					},
					{
						displayName: 'Anonymous Responses',
						name: 'anonymousResponses',
						type: 'boolean',
						default: false,
						description: 'Whether responses are collected anonymously',
					},
					{
						displayName: 'Close Date',
						name: 'closeDate',
						type: 'dateTime',
						default: '',
						description:
							'When the form automatically stops accepting responses. To remove a close date, use Raw Settings (JSON) with <code>{"features":{"closeDate":{"enabled":false}}}</code>.',
					},
					{
						displayName: 'Hide monday.com Branding',
						name: 'hideBranding',
						type: 'boolean',
						default: false,
						description: 'Whether monday.com branding is hidden on the form',
					},
					{
						displayName: 'Language',
						name: 'language',
						type: 'string',
						default: '',
						placeholder: 'e.g. en, es, fr',
						description: 'The language code for the form’s interface text',
					},
					{
						displayName: 'Primary Color',
						name: 'primaryColor',
						type: 'color',
						default: '',
						description: 'The HEX color of the primary theme color used in the form',
					},
					{
						displayName: 'Raw Settings (JSON)',
						name: 'rawSettings',
						type: 'json',
						default: '',
						description:
							'An UpdateFormSettingsInput object merged over the typed fields (raw values win) — the escape hatch for settings without a typed field, e.g. logo, background, layout, welcome and thank-you screens. See the <a href="https://developer.monday.com/api-reference/reference/forms-other-types#updateformsettingsinput">monday.com docs</a>.',
					},
					{
						displayName: 'Redirect URL After Submission',
						name: 'redirectUrlAfterSubmission',
						type: 'string',
						default: '',
						description:
							'The URL responders are redirected to after successfully submitting the form',
					},
					{
						displayName: 'Require CAPTCHA',
						name: 'reCaptcha',
						type: 'boolean',
						default: false,
						description: 'Whether reCAPTCHA verification is enabled to prevent spam submissions',
					},
					{
						displayName: 'Require Login',
						name: 'requireLogin',
						type: 'boolean',
						default: false,
						description: 'Whether responders must log in to monday.com before submitting',
					},
					{
						displayName: 'Response Limit',
						name: 'responseLimit',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description:
							'The maximum number of responses the form accepts. Set to 0 to disable the limit.',
					},
					{
						displayName: 'Show Progress Bar',
						name: 'showProgressBar',
						type: 'boolean',
						default: false,
						description: 'Whether an indicator showing the form’s completion progress is displayed',
					},
					{
						displayName: 'Submit Button Text',
						name: 'submitButtonText',
						type: 'string',
						default: '',
						description: 'The custom text displayed on the form’s submit button',
					},
				],
			},
			{
				displayName: 'Action',
				name: 'formPasswordAction',
				type: 'options',
				options: [
					{
						name: 'Remove Password',
						value: 'remove',
						description: 'Turn password protection off',
					},
					{
						name: 'Set Password',
						value: 'set',
						description: 'Enable password protection and set the password',
					},
				],
				default: 'set',
				description: 'Whether to set a new password or remove the existing one',
				displayOptions: { show: { operation: ['setFormPassword'] } },
			},
			{
				displayName: 'Password',
				name: 'formPassword',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				required: true,
				description: 'The password responders must enter to access the form',
				displayOptions: {
					show: { operation: ['setFormPassword'], formPasswordAction: ['set'] },
				},
			},
			{
				displayName: 'Question Title',
				name: 'formQuestionTitle',
				type: 'string',
				default: '',
				required: true,
				description: 'The question text displayed to responders',
				displayOptions: { show: { operation: ['createFormQuestion'] } },
			},
			{
				displayName: 'Question Type',
				name: 'formQuestionType',
				type: 'options',
				// The FormQuestionType enum values mix PascalCase and SCREAMING_CASE
				// in the live schema — the values here are exact.
				options: FORM_QUESTION_TYPE_OPTIONS,
				default: 'ShortText',
				required: true,
				description:
					'The question type — determines input behavior and validation. The type cannot be changed after creation.',
				displayOptions: { show: { operation: ['createFormQuestion'] } },
			},
			{
				// Question picker for Update/Delete Question, dependent on the
				// Form Token parameter. Questions are bounded by the form.
				displayName: 'Question Name or ID',
				name: 'formQuestionId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getFormQuestionsList',
					loadOptionsDependsOn: ['formToken'],
				},
				default: '',
				required: true,
				description:
					'The question to modify. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['updateFormQuestion', 'deleteFormQuestion'] } },
			},
			{
				displayName: 'Options',
				name: 'createFormQuestionOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createFormQuestion'] } },
				options: [
					{
						displayName: 'Choices',
						name: 'optionLabels',
						type: 'string',
						default: '',
						placeholder: 'e.g. Small, Medium, Large',
						description:
							'Comma-separated labels for choice-based questions (Single Select / Multi Select)',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'Additional context, instructions, or examples shown under the question',
					},
					{
						displayName: 'Existing Column ID',
						name: 'existingColumnId',
						type: 'string',
						default: '',
						description:
							'The ID of an existing board column to link this question to, instead of creating a new column',
					},
					{
						displayName: 'Insert After Question ID',
						name: 'insertAfterQuestionId',
						type: 'string',
						default: '',
						description:
							'The ID of the question after which this new question is inserted (default: at the end)',
					},
					{
						displayName: 'Required',
						name: 'required',
						type: 'boolean',
						default: false,
						description: 'Whether the question must be answered to submit the form',
					},
					{
						displayName: 'Settings (JSON)',
						name: 'settingsJson',
						type: 'json',
						default: '',
						description:
							'A FormQuestionSettingsInput object with type-specific settings, e.g. <code>{"includeTime": true}</code> for date questions or <code>{"prefixPredefined": {"enabled": true, "prefix": "US"}}</code> for phone questions. See the <a href="https://developer.monday.com/api-reference/reference/forms-other-types#formquestionsettingsinput">monday.com docs</a>.',
					},
					{
						displayName: 'Visible',
						name: 'visible',
						type: 'boolean',
						default: true,
						description:
							'Whether the question is shown to responders. Hidden questions stay in the form structure.',
					},
				],
			},
			{
				displayName: 'Update Fields',
				name: 'updateFormQuestionFields',
				type: 'collection',
				placeholder: 'Add field',
				default: {},
				displayOptions: { show: { operation: ['updateFormQuestion'] } },
				options: [
					{
						displayName: 'Choices',
						name: 'optionLabels',
						type: 'string',
						default: '',
						placeholder: 'e.g. Small, Medium, Large',
						description:
							'Comma-separated labels replacing the options of a choice-based question (Single Select / Multi Select)',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'The new description shown under the question',
					},
					{
						displayName: 'Required',
						name: 'required',
						type: 'boolean',
						default: false,
						description: 'Whether the question must be answered to submit the form',
					},
					{
						displayName: 'Settings (JSON)',
						name: 'settingsJson',
						type: 'json',
						default: '',
						description:
							'A FormQuestionSettingsInput object with type-specific settings — see the <a href="https://developer.monday.com/api-reference/reference/forms-other-types#formquestionsettingsinput">monday.com docs</a>',
					},
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'The new question text',
					},
					{
						displayName: 'Visible',
						name: 'visible',
						type: 'boolean',
						default: true,
						description:
							'Whether the question is shown to responders. Hidden questions stay in the form structure.',
					},
				],
			},
			{
				displayName: 'Tag Name',
				name: 'formTagName',
				type: 'string',
				default: '',
				required: true,
				description:
					'The tag’s name — must be unique within the form. Tags cannot be renamed after creation: delete and recreate instead.',
				displayOptions: { show: { operation: ['createFormTag'] } },
			},
			{
				// Tag picker for Delete Tag, dependent on the Form Token parameter.
				displayName: 'Tag Name or ID',
				name: 'formTagId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getFormTagsList',
					loadOptionsDependsOn: ['formToken'],
				},
				default: '',
				required: true,
				description:
					'The tag to delete. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['deleteFormTag'] } },
			},
			{
				displayName: 'Options',
				name: 'deleteFormTagOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['deleteFormTag'] } },
				options: [
					{
						displayName: 'Delete Associated Column',
						name: 'deleteAssociatedColumn',
						type: 'boolean',
						default: false,
						description:
							'Whether to also delete the response-board column that was created with the tag',
					},
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['graphql'] } },
				options: GRAPHQL_OPERATION_OPTIONS,
				default: 'graphql',
			},
			{
				...boardResourceLocator,
				displayOptions: {
					show: {
						operation: [
							'getBoard',
							'aggregateBoardData',
							'getItems',
							'createItem',
							'updateItem',
							'bulkImport',
							'clearColumnValues',
							'getItem',
							'getColumnValue',
							'getItemSubscribers',
							'moveItem',
							'duplicateItem',
							'archiveOrDeleteBoard',
							'duplicateBoard',
							'updateBoardSubscribers',
							'getBoardSubscribers',
							'getActivityLogs',
							'createGroup',
							'getGroups',
							'archiveOrDeleteGroup',
							'duplicateGroup',
							'updateGroup',
							'createColumn',
							'getColumns',
							'updateColumn',
							'deleteColumn',
							'addColumnLabel',
							'updateColumnLabel',
							'createUpdate',
							'addFileToColumn',
							'createSubitem',
							'createTimelineItem',
							'getTimelineItems',
						],
					},
				},
			},
			{
				...itemResourceLocator,
				displayOptions: {
					show: {
						operation: [
							'updateItem',
							'getItem',
							'getColumnValue',
							'getItemSubscribers',
							'moveItem',
							'duplicateItem',
							'createUpdate',
							'addFileToColumn',
							'createTimelineItem',
							'getTimelineItems',
						],
					},
				},
			},
			{
				...groupResourceLocator,
				displayOptions: {
					show: { operation: ['archiveOrDeleteGroup', 'duplicateGroup', 'updateGroup'] },
				},
			},
			{
				// Single (picked item) vs bulk (ID list) input for the unified
				// Archive or Delete operation. Item IDs are globally unique, so
				// bulk mode needs no board picker.
				displayName: 'Items to Process',
				name: 'itemsMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Multiple Items',
						value: 'multiple',
						description: 'Provide a list of item IDs — processed in one batched request',
					},
					{
						name: 'Single Item',
						value: 'single',
						description: 'Pick one item on a board',
					},
				],
				default: 'single',
				description: 'Whether to process one picked item or a list of item IDs',
				displayOptions: { show: { operation: ['archiveOrDeleteItem'] } },
			},
			{
				// Dedicated board/item pickers for Archive or Delete: hidden in
				// bulk mode. This MUST be a hide rule, not show: { itemsMode:
				// ['single'] } — display evaluation reads raw workflow values
				// without falling back to parameter defaults, so legacy saved
				// workflows (which never set itemsMode) would fail a show rule
				// and lose their pickers ("Could not find property" at runtime).
				...boardResourceLocator,
				displayOptions: {
					show: { operation: ['archiveOrDeleteItem', 'archiveItem', 'deleteItem'] },
					hide: { itemsMode: ['multiple'] },
				},
			},
			{
				...itemResourceLocator,
				displayOptions: {
					show: { operation: ['archiveOrDeleteItem', 'archiveItem', 'deleteItem'] },
					hide: { itemsMode: ['multiple'] },
				},
			},
			{
				displayName: 'Item IDs',
				name: 'bulkItemIds',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. 1234567890, 1234567891',
				description:
					'Comma-separated IDs of the items to archive or delete (up to 50 per execution). Feed it from a Get Many operation with an expression.',
				displayOptions: { show: { operation: ['archiveOrDeleteItem'], itemsMode: ['multiple'] } },
			},
			{
				displayName:
					'The batch is not atomic: if one item ID fails, the other items in the list are still archived or deleted',
				name: 'bulkArchiveOrDeleteNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['archiveOrDeleteItem'], itemsMode: ['multiple'] } },
			},
			{
				// One selector shared by every Archive or Delete operation
				// (Item / Board / Group). Archive is the safe default; Delete
				// is explicit and clearly marked permanent.
				displayName: 'Action',
				name: 'archiveOrDeleteAction',
				type: 'options',
				options: [
					{
						name: 'Archive',
						value: 'archive',
						description: 'Move to the archive — recoverable from monday.com',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete permanently — this cannot be undone',
					},
				],
				default: 'archive',
				description: 'Whether to archive (recoverable) or permanently delete',
				displayOptions: {
					show: {
						operation: ['archiveOrDeleteItem', 'archiveOrDeleteBoard', 'archiveOrDeleteGroup'],
					},
				},
			},
			{
				displayName: 'Duplicate Type',
				name: 'duplicateType',
				type: 'options',
				options: [
					{
						name: 'Structure and Items',
						value: 'duplicate_board_with_pulses',
						description: 'Copy groups, columns, and all items',
					},
					{
						name: 'Structure Only',
						value: 'duplicate_board_with_structure',
						description: 'Copy groups and columns, without items',
					},
					{
						name: 'Structure, Items and Updates',
						value: 'duplicate_board_with_pulses_and_updates',
						description: 'Copy groups, columns, items, and their updates',
					},
				],
				default: 'duplicate_board_with_structure',
				required: true,
				description: 'How much of the board to copy',
				displayOptions: { show: { operation: ['duplicateBoard'] } },
			},
			{
				displayName: 'Options',
				name: 'duplicateBoardOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['duplicateBoard'] } },
				options: [
					{
						displayName: 'Board Name',
						name: 'boardName',
						type: 'string',
						default: '',
						description: 'The name of the new board; left unset, monday derives one from the original',
					},
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'folderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getWorkspaceFolders',
							loadOptionsDependsOn: ['duplicateBoardOptions.workspaceId.value'],
						},
						default: '',
						description:
							'The folder to create the duplicate in. Select a workspace first — the list shows that workspace’s folders. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Keep Subscribers',
						name: 'keepSubscribers',
						type: 'boolean',
						default: false,
						description: 'Whether to copy the original board’s subscribers to the new board',
					},
					{
						...workspaceResourceLocator,
						description:
							'The workspace to create the duplicate in; left unset, it stays in the original board’s workspace. Picking a workspace here also loads its folders into the Folder option.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'duplicateGroupOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['duplicateGroup'] } },
				options: [
					{
						displayName: 'Group Title',
						name: 'groupTitle',
						type: 'string',
						default: '',
						description: 'The title of the new group; left unset, monday derives one from the original',
					},
					{
						displayName: 'Position',
						name: 'groupPosition',
						type: 'options',
						options: [
							{ name: 'After Group', value: 'after' },
							{ name: 'At Bottom', value: 'bottom' },
							{ name: 'At Top', value: 'top' },
							{ name: 'Before Group', value: 'before' },
						],
						default: 'top',
						description:
							'Where to place the duplicated group on the board; left unset, monday puts it right below the original group. Placements other than "At Top" cost one extra repositioning call.',
					},
					{
						displayName: 'Position: Relative To Group Name or ID',
						name: 'positionGroupId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getBoardGroups',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: '',
						description:
							'The existing group the duplicate is placed before or after (used with Position "After Group" / "Before Group"). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: { show: { groupPosition: ['after', 'before'] } },
					},
				],
			},
			{
				// Add vs Remove used to be two operations; merged into one with
				// a mode selector (product decision 2026-07-19, no back compat).
				displayName: 'Action',
				name: 'subscribersAction',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Add',
						value: 'add',
						description: 'Add the users/teams to the board as subscribers or owners',
					},
					{
						name: 'Remove',
						value: 'remove',
						description: 'Remove the users/teams from the board',
					},
				],
				default: 'add',
				description: 'Whether to add the selected users/teams to the board or remove them',
				displayOptions: { show: { operation: ['updateBoardSubscribers'] } },
			},
			buildUserRowsProperty({
				displayName: 'Users',
				name: 'subscriberUserIds',
				description:
					'The users to add or remove. In expression mode, pass user IDs as a comma-separated string.',
				displayOptions: { show: { operation: ['updateBoardSubscribers'] } },
			}),
			{
				displayName: 'Team Names or IDs',
				name: 'subscriberTeamIds',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getTeamsList' },
				default: [],
				description:
					'The teams to add or remove. In expression mode, pass team IDs as a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['updateBoardSubscribers'] } },
			},
			{
				displayName: 'Add As',
				name: 'subscriberKind',
				type: 'options',
				options: [
					{ name: 'Owner', value: 'owner' },
					{ name: 'Subscriber', value: 'subscriber' },
				],
				default: 'subscriber',
				description: 'Whether the users/teams become plain subscribers or board owners',
				displayOptions: {
					show: { operation: ['updateBoardSubscribers'], subscribersAction: ['add'] },
				},
			},
			{
				displayName: 'Update Fields',
				name: 'updateSubscribersOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: {
					show: { operation: ['updateBoardSubscribers'], subscribersAction: ['add'] },
				},
				options: [
					{
						displayName: 'Mode',
						name: 'mode',
						type: 'options',
						options: [
							{
								name: 'Append',
								value: 'append',
								description: 'Add the selected users/teams on top of the current subscribers',
							},
							{
								name: 'Replace',
								value: 'replace',
								description:
									'Make the selected users/teams the only subscribers: current ones not in the selection are removed (the user running the workflow is never removed)',
							},
						],
						default: 'append',
						description: 'How the selection is applied to the board’s current subscribers',
					},
				],
			},
			{
				displayName: 'Include User Subscribers',
				name: 'includeSubscribers',
				type: 'boolean',
				default: true,
				description: 'Whether to return the users subscribed to the board',
				displayOptions: { show: { operation: ['getBoardSubscribers'] } },
			},
			{
				displayName: 'Include User Owners',
				name: 'includeOwners',
				type: 'boolean',
				default: true,
				description: 'Whether to return the users who own the board',
				displayOptions: { show: { operation: ['getBoardSubscribers'] } },
			},
			{
				displayName: 'Include Team Subscribers',
				name: 'includeTeamSubscribers',
				type: 'boolean',
				default: true,
				description:
					'Whether to return the teams subscribed to the board. Limitation: only the first 1,000 team subscribers are returned.',
				displayOptions: { show: { operation: ['getBoardSubscribers'] } },
			},
			{
				displayName: 'Include Team Owners',
				name: 'includeTeamOwners',
				type: 'boolean',
				default: true,
				description:
					'Whether to return the teams that own the board. Limitation: only the first 1,000 team owners are returned.',
				displayOptions: { show: { operation: ['getBoardSubscribers'] } },
			},
			{
				displayName: 'Filters',
				name: 'activityLogFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { operation: ['getActivityLogs'] } },
				options: [
					{
						displayName: 'Column Names or IDs',
						name: 'columnIds',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getBoardColumns',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: [],
						description:
							'Only return events on these columns. Expressions accept an array or a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'From',
						name: 'from',
						type: 'dateTime',
						default: '',
						description: 'Only return events from this time onward',
					},
					{
						displayName: 'Group Names or IDs',
						name: 'groupIds',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getBoardGroups',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: [],
						description:
							'Only return events in these groups. Expressions accept an array or a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Item IDs',
						name: 'itemIds',
						type: 'string',
						default: '',
						description: 'Only return events on these items (comma-separated IDs)',
					},
					{
						displayName: 'To',
						name: 'to',
						type: 'dateTime',
						default: '',
						description: 'Only return events up to this time',
					},
					buildUserRowsProperty({
						displayName: 'Users',
						name: 'userIds',
						description:
							'Only return events by these users. Expressions accept an array or a comma-separated string of user IDs.',
					}),
				],
			},
			{
				displayName: 'Options',
				name: 'activityLogOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getActivityLogs'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description:
							'Which page of results to fetch (page size = limit). Increment it across runs to walk through long histories.',
					},
				],
			},
			{
				displayName: 'Column Name or ID',
				name: 'updateColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The column to update. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['updateColumn'] } },
			},
			{
				displayName: 'Column Name or ID',
				name: 'deleteColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The column to permanently delete — its values on all items are lost. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['deleteColumn'] } },
			},
			{
				displayName: 'New Title',
				name: 'newColumnTitle',
				type: 'string',
				default: '',
				description: 'The new title for the column; leave empty to keep the current title',
				displayOptions: { show: { operation: ['updateColumn'] } },
			},
			{
				displayName: 'New Description',
				name: 'newColumnDescription',
				type: 'string',
				default: '',
				description:
					'The new description for the column; leave empty to keep the current description',
				displayOptions: { show: { operation: ['updateColumn'] } },
			},
			{
				displayName: 'Update Fields',
				name: 'updateColumnOptions',
				type: 'collection',
				placeholder: 'Add field',
				default: {},
				displayOptions: { show: { operation: ['updateColumn'] } },
				options: [
					{
						displayName: 'Rollup Function (Multi-Level Boards)',
						name: 'rollupFunction',
						type: 'options',
						options: [
							{ name: 'Count Labels (Status)', value: 'COUNT_KEYS' },
							{ name: 'Max (Numbers, Date)', value: 'MAX' },
							{ name: 'Min (Numbers, Date)', value: 'MIN' },
							{ name: 'Min & Max Span (Timeline)', value: 'MIN_MAX' },
							{ name: 'None — Disable Rollup', value: 'NONE' },
							{ name: 'Sum (Numbers)', value: 'SUM' },
						],
						default: 'NONE',
						description:
							'How the column calculates its value on parent items from their children, on multi-level boards. Each function only works on the column types in its parentheses; None turns the rollup off. Not supported on classic boards.',
					},
					{
						displayName: 'Settings (JSON)',
						name: 'settingsJson',
						type: 'json',
						default: '{}',
						description:
							'Column settings to change, in the API format (same shape as the settings returned by Get Many). Merged into the current settings at the top level — only the keys you send change, but a sent nested object (e.g. a numbers column\'s "unit") replaces that object entirely. To edit status/dropdown labels, prefer the Add Label / Update Label operations.',
					},
					{
						displayName: 'Width',
						name: 'width',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 120,
						description: 'The column width in pixels',
					},
				],
			},
			{
				displayName: 'Column Kind',
				name: 'labelColumnKind',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Dropdown', value: 'dropdown' },
					{ name: 'Status', value: 'status' },
				],
				default: 'status',
				description: 'The kind of column to edit labels on',
				displayOptions: { show: { operation: ['addColumnLabel', 'updateColumnLabel'] } },
			},
			{
				displayName: 'Column Name or ID',
				name: 'labelColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardLabelColumns',
					loadOptionsDependsOn: ['boardId.value', 'labelColumnKind'],
				},
				default: '',
				required: true,
				description:
					'The status/dropdown column to edit labels on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['addColumnLabel', 'updateColumnLabel'] } },
			},
			{
				displayName: 'Label Name',
				name: 'newLabelName',
				type: 'string',
				default: '',
				required: true,
				description: 'The text of the new label',
				displayOptions: { show: { operation: ['addColumnLabel'] } },
			},
			{
				displayName: 'Color',
				name: 'newLabelColor',
				type: 'options',
				options: STATUS_COLOR_OPTIONS,
				default: 'working_orange',
				description: 'The color of the new label, from monday’s status palette',
				displayOptions: { show: { operation: ['addColumnLabel'], labelColumnKind: ['status'] } },
			},
			{
				displayName: 'Options',
				name: 'addColumnLabelOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['addColumnLabel'], labelColumnKind: ['status'] } },
				options: [
					{
						displayName: 'Counts as Done',
						name: 'isDone',
						type: 'boolean',
						default: false,
						description: 'Whether items with this label count as done (e.g. for battery views)',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'Optional label description, shown in the status tooltip',
					},
					{
						displayName: 'Position',
						name: 'labelPosition',
						type: 'options',
						options: [
							{ name: 'After Label', value: 'after' },
							{ name: 'At Beginning', value: 'first' },
							{ name: 'At End', value: 'last' },
							{ name: 'Before Label', value: 'before' },
						],
						default: 'last',
						description:
							'Where to place the new label in the column’s label order; left unset, it goes at the end',
					},
					{
						displayName: 'Position: Relative To Label Name or ID',
						name: 'positionLabelId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getColumnLabels',
							loadOptionsDependsOn: ['boardId.value', 'labelColumnKind', 'labelColumnId'],
						},
						default: '',
						description:
							'The existing label the new label is placed before or after (used with Position "After Label" / "Before Label"). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: { show: { labelPosition: ['after', 'before'] } },
					},
				],
			},
			{
				displayName: 'Label Name or ID',
				name: 'existingLabelId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getColumnLabels',
					loadOptionsDependsOn: ['boardId.value', 'labelColumnKind', 'labelColumnId'],
				},
				default: '',
				required: true,
				description:
					'The label to modify (by its label ID). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['updateColumnLabel'] } },
			},
			{
				displayName: 'Changes',
				name: 'labelChanges',
				type: 'collection',
				placeholder: 'Add change',
				default: {},
				description: 'What to change on the label. Anything not set keeps its current value.',
				displayOptions: { show: { operation: ['updateColumnLabel'] } },
				options: [
					{
						displayName: 'Color',
						name: 'color',
						type: 'options',
						options: STATUS_COLOR_OPTIONS,
						default: 'working_orange',
						description: 'The new color (status columns only)',
						displayOptions: { show: { '/labelColumnKind': ['status'] } },
					},
					{
						displayName: 'Counts as Done',
						name: 'isDone',
						type: 'boolean',
						default: false,
						description:
							'Whether items with this label count as done (status columns only, e.g. for battery views)',
						displayOptions: { show: { '/labelColumnKind': ['status'] } },
					},
					{
						displayName: 'Deactivated',
						name: 'isDeactivated',
						type: 'boolean',
						default: false,
						description:
							'Whether the label is deactivated. Deactivating hides it from pickers — this is how labels are "deleted"; setting it back to false reactivates the label.',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'The new label description (status columns only)',
						displayOptions: { show: { '/labelColumnKind': ['status'] } },
					},
					{
						displayName: 'New Name',
						name: 'newName',
						type: 'string',
						default: '',
						description:
							'The new label text. Existing item values follow the rename (labels are tracked by ID).',
					},
					{
						displayName: 'Position',
						name: 'labelPosition',
						type: 'options',
						options: [
							{ name: 'After Label', value: 'after' },
							{ name: 'At Beginning', value: 'first' },
							{ name: 'At End', value: 'last' },
							{ name: 'Before Label', value: 'before' },
						],
						default: 'last',
						description: 'Where to move the label in the column’s label order (status columns only)',
						displayOptions: { show: { '/labelColumnKind': ['status'] } },
					},
					{
						displayName: 'Position: Relative To Label Name or ID',
						name: 'positionLabelId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getColumnLabels',
							loadOptionsDependsOn: ['boardId.value', 'labelColumnKind', 'labelColumnId'],
						},
						default: '',
						description:
							'The existing label this label is moved before or after (used with Position "After Label" / "Before Label"). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: {
							show: { '/labelColumnKind': ['status'], labelPosition: ['after', 'before'] },
						},
					},
				],
			},
			{
				displayName: 'Source',
				name: 'assetsSource',
				type: 'options',
				options: [
					{
						name: 'By Asset IDs',
						value: 'assetIds',
						description: 'Look up assets directly by their IDs',
					},
					{
						name: 'By Board Column',
						value: 'boardColumn',
						description: 'Return the files in one file column, for one item or the whole board',
					},
					{
						name: 'By Board Item',
						value: 'boardItem',
						description: 'Return the files attached to one item — columns, updates, or both',
					},
				],
				default: 'assetIds',
				description: 'Where to take the files from',
				displayOptions: { show: { operation: ['getAssets'] } },
			},
			{
				displayName: 'Asset IDs',
				name: 'assetIds',
				type: 'string',
				default: '',
				required: true,
				description:
					'The IDs of the assets to return, comma-separated — e.g. from a file column value’s files array or an update’s assets',
				displayOptions: { show: { operation: ['getAssets'], assetsSource: ['assetIds'] } },
			},
			{
				...boardResourceLocator,
				displayOptions: {
					show: { operation: ['getAssets'], assetsSource: ['boardItem', 'boardColumn'] },
				},
			},
			{
				...itemResourceLocator,
				displayOptions: { show: { operation: ['getAssets'], assetsSource: ['boardItem'] } },
			},
			{
				displayName: 'Return Files From',
				name: 'itemAssetsScope',
				type: 'options',
				options: [
					{
						name: 'All',
						value: 'all',
						description: 'Every file on the item — file columns and update attachments',
					},
					{
						name: 'File Columns',
						value: 'columns',
						description: 'Only files stored in the item’s file columns',
					},
					{
						name: 'Updates',
						value: 'updates',
						description: 'Only files attached to the item’s updates',
					},
				],
				default: 'all',
				description: 'Which of the item’s files to return',
				displayOptions: { show: { operation: ['getAssets'], assetsSource: ['boardItem'] } },
			},
			{
				displayName: 'File Column Names or IDs',
				name: 'itemFileColumnIds',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getBoardFileColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: [],
				description:
					'Limit to specific file columns; leave empty for all file columns. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						operation: ['getAssets'],
						assetsSource: ['boardItem'],
						itemAssetsScope: ['columns'],
					},
				},
			},
			{
				displayName: 'File Column Name or ID',
				name: 'fileColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardFileColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The file column to return files from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['getAssets'], assetsSource: ['boardColumn'] } },
			},
			{
				...itemResourceLocator,
				required: false,
				description:
					'Only return files from this item — leave empty to scan the whole board for files in the column',
				displayOptions: { show: { operation: ['getAssets'], assetsSource: ['boardColumn'] } },
			},
			{
				displayName: 'Options',
				name: 'getAssetsOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: {
					show: { operation: ['getAssets'], assetsSource: ['boardItem', 'boardColumn'] },
				},
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'A whole-board column scan pages through the board’s items until this many files are found — on large boards with few files this can take many requests and complexity budget',
					},
				],
			},
			{
				displayName: 'Update ID',
				name: 'updateId',
				type: 'string',
				default: '',
				required: true,
				description: 'The ID of the update to attach the file to',
				displayOptions: { show: { operation: ['addFileToUpdate'] } },
			},
			{
				displayName: 'Tag Name',
				name: 'tagName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the tag to get or create. Tag names are case sensitive.',
				displayOptions: { show: { operation: ['createOrGetTag'] } },
			},
			{
				displayName: 'Options',
				name: 'tagOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createOrGetTag'] } },
				options: [
					{
						// The board ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Private Board Name or ID',
						name: 'boardId',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getBoardList' },
						default: '',
						description:
							'Only needed for tags on private or shareable boards; leave unset for public-board tags. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				// The team ID string is the value; list is bounded (teams, not users).
				displayName: 'Team Name or ID',
				name: 'teamId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTeamsList' },
				default: '',
				required: true,
				description:
					'The team to operate on (for Get Members: limited to the first 1,000 team members). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['getTeam', 'getTeamMembers'] } },
			},
			{
				displayName:
					'monday.com waits at most 30 seconds for the reply (including everything the workflow does before this node) — keep the path from the trigger to this node fast.',
				name: 'respondToAgentTimeoutNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['respondToAgentChat'] } },
			},
			{
				displayName: 'Reply Text',
				name: 'replyText',
				type: 'string',
				default: '',
				required: true,
				description:
					"The reply shown in the agent chat. Usually an expression referencing an earlier node's output, e.g. an AI node's answer.",
				displayOptions: { show: { operation: ['respondToAgentChat'] } },
			},
			{
				displayName: 'Options',
				name: 'respondToAgentChatOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['respondToAgentChat'] } },
				options: [
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						options: [
							{
								name: 'Auto',
								value: 'auto',
								description:
									'Follow the stream flag the trigger received (SSE unless the request asked for JSON). Requires the trigger item\'s "stream" field to reach this node\'s input.',
							},
							{
								name: 'SSE Stream',
								value: 'sse',
								description: 'Always reply as a server-sent-events stream (the agent chat default)',
							},
							{
								name: 'JSON Message',
								value: 'json',
								description: 'Always reply as a single JSON { message } object',
							},
						],
						default: 'auto',
						description: 'The wire format of the reply',
					},
				],
			},
			{
				displayName:
					"Connect this operation to the Mention output of the monday.com Trigger's Agent Interaction event (directly, or through nodes that keep the trigger's fields). The board, item, and update to reply to are read from the event data automatically — no IDs to configure.",
				name: 'respondToAgentMentionNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['respondToAgentMention'] } },
			},
			{
				displayName: 'Reply Text',
				name: 'mentionReplyText',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				description:
					'The text of the reply posted on the update where the agent was mentioned. Supports HTML tags: &lt;b&gt; (bold), &lt;i&gt; (italic), &lt;u&gt; (underline), &lt;a&gt; (links), &lt;br&gt; (line breaks). Do not use @ symbols for mentions; use Mention Users/Teams options instead.',
				displayOptions: { show: { operation: ['respondToAgentMention'] } },
			},
			{
				displayName: 'Options',
				name: 'respondToAgentMentionOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['respondToAgentMention'] } },
				options: [
					buildUserRowsProperty({
						displayName: 'Mention Users',
						name: 'mentionUserIds',
						description:
							'Users to mention and notify in the reply. In expression mode, pass user IDs as a comma-separated string.',
					}),
					{
						displayName: 'Mention Team Names or IDs',
						name: 'mentionTeamIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getTeamsList' },
						default: [],
						description:
							'Teams to mention and notify in the reply. In expression mode, pass team IDs as a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The prompt to run against the monday-hosted AI model',
				displayOptions: { show: { operation: ['runPrompt'] } },
			},
			{
				displayName: 'Options',
				name: 'runPromptOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['runPrompt'] } },
				options: [
					{
						displayName: 'Max Tokens',
						name: 'maxTokens',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 500,
						description: 'The maximum number of tokens to generate',
					},
					{
						displayName: 'Model',
						name: 'model',
						type: 'options',
						options: [
							{ name: 'Fast', value: 'MONDAY_FAST' },
							{ name: 'Standard', value: 'MONDAY_STANDARD' },
							{ name: 'Powerful', value: 'MONDAY_POWERFUL' },
						],
						default: 'MONDAY_STANDARD',
						description:
							'The AI model tier to use; left unset, monday picks a default. Higher tiers consume more monday AI credits.',
					},
					{
						displayName: 'System Prompt',
						name: 'systemPrompt',
						type: 'string',
						typeOptions: { rows: 2 },
						default: '',
						description: 'An optional system prompt that sets context or instructions for the model',
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
						default: 0.7,
						description: 'Sampling temperature — lower is more deterministic',
					},
				],
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The user message to send to the monday.com Platform Agent',
				displayOptions: { show: { operation: ['runAgent'] } },
			},
			{
				displayName: 'Options',
				name: 'runAgentOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['runAgent'] } },
				options: [
					{
						displayName: 'Context ID',
						name: 'contextId',
						type: 'string',
						default: '',
						description:
							'A stable identifier for the conversation session — reuse the same value on follow-up runs so the agent recalls prior turns (e.g. an item ID, or the contextId output field of a previous Run Platform Agent node). Leave empty to start a new session: a random 32-character hex context ID is generated automatically and returned in the output.',
					},
				],
			},
			{
				...itemResourceLocator,
				displayName: 'Parent Item',
				description: 'The item to create the subitem under',
				displayOptions: { show: { operation: ['createSubitem'] } },
			},
			{
				displayName: 'File Column Name or ID',
				name: 'fileColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardFileColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The file column to add the file to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['addFileToColumn'] } },
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'The name of the input binary field containing the file to upload',
				displayOptions: { show: { operation: ['addFileToColumn', 'addFileToUpdate'] } },
			},
			{
				displayName: 'Source',
				name: 'downloadSource',
				type: 'options',
				options: [
					{
						name: 'By Asset ID',
						value: 'assetId',
						description: 'Download an asset directly by its ID',
					},
					{
						name: 'By File Column',
						value: 'fileColumn',
						description: 'Pick the file from an item’s file column',
					},
				],
				default: 'assetId',
				description: 'How to choose the file to download',
				displayOptions: { show: { operation: ['downloadFile'] } },
			},
			{
				displayName: 'Asset ID',
				name: 'assetId',
				type: 'string',
				default: '',
				required: true,
				description:
					'The ID of the asset to download — e.g. from a column value’s files array, an update’s assets, or the output of Add to File Column',
				displayOptions: { show: { operation: ['downloadFile'], downloadSource: ['assetId'] } },
			},
			{
				...boardResourceLocator,
				displayOptions: { show: { operation: ['downloadFile'], downloadSource: ['fileColumn'] } },
			},
			{
				displayName: 'File Column Name or ID',
				name: 'fileColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardFileColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The file column to download from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['downloadFile'], downloadSource: ['fileColumn'] } },
			},
			{
				...itemResourceLocator,
				description: 'The item to download the file from',
				displayOptions: { show: { operation: ['downloadFile'], downloadSource: ['fileColumn'] } },
			},
			{
				displayName: 'File Name or ID',
				name: 'columnFileId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getItemColumnFiles',
					loadOptionsDependsOn: ['boardId.value', 'itemId.value', 'fileColumnId'],
				},
				default: '__all__',
				required: true,
				description:
					'The file to download, or All Files in Column to download every file (one output item per file). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['downloadFile'], downloadSource: ['fileColumn'] } },
			},
			{
				displayName: 'Put Output File in Field',
				name: 'downloadBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'The name of the output binary field to put the downloaded file in',
				displayOptions: { show: { operation: ['downloadFile'] } },
			},
			{
				...boardResourceLocator,
				displayOptions: { show: { operation: ['getUpdates'], updatesScope: ['item'] } },
			},
			{
				...itemResourceLocator,
				displayOptions: { show: { operation: ['getUpdates'], updatesScope: ['item'] } },
			},
			{
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
					'The column to read the value from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['getColumnValue'] } },
			},
			{
				displayName: 'Scope',
				name: 'updatesScope',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Account',
						value: 'account',
						description: 'The most recent updates across the whole account',
					},
					{
						name: 'Item',
						value: 'item',
						description: 'Updates posted on one item',
					},
				],
				default: 'item',
				displayOptions: { show: { operation: ['getUpdates'] } },
			},
			{
				displayName: 'Update Text',
				name: 'updateBody',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				description:
					'The text of the update. Supports HTML tags: &lt;b&gt; (bold), &lt;i&gt; (italic), &lt;u&gt; (underline), &lt;a&gt; (links), &lt;br&gt; (line breaks). Some HTML attributes and styles may be stripped by the API. Maximum length limit unknown. Do not use @ symbols for mentions; use Mention Users/Teams options instead.',
				displayOptions: { show: { operation: ['createUpdate'] } },
			},
			{
				displayName: 'Options',
				name: 'createUpdateOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createUpdate'] } },
				options: [
					buildUserRowsProperty({
						displayName: 'Mention Users',
						name: 'mentionUserIds',
						description:
							'Users to mention and notify in the update. In expression mode, pass user IDs as a comma-separated string.',
					}),
					{
						displayName: 'Mention Team Names or IDs',
						name: 'mentionTeamIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getTeamsList' },
						default: [],
						description:
							'Teams to mention and notify in the update. In expression mode, pass team IDs as a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Reply to Update ID',
						name: 'parentId',
						type: 'string',
						default: '',
						description: 'Post this as a reply to an existing update instead of a new thread',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'getUpdatesOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getUpdates'] } },
				options: [
					{
						displayName: 'Include Assets',
						name: 'includeAssets',
						type: 'boolean',
						default: false,
						description: 'Whether to include files attached to each update',
					},
					{
						displayName: 'Include Replies',
						name: 'includeReplies',
						type: 'boolean',
						default: false,
						description: 'Whether to include the replies of each update',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description:
							'Which page of results to fetch (page size = limit). Increment it across runs to walk through long histories.',
					},
				],
			},
			{
				displayName: 'Custom Activity Name or ID',
				name: 'customActivityId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getCustomActivitiesList' },
				default: '',
				required: true,
				description:
					'The activity type this entry is logged as. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['createTimelineItem', 'deleteCustomActivity'] } },
			},
			{
				displayName: 'Title',
				name: 'timelineItemTitle',
				type: 'string',
				default: '',
				required: true,
				description: 'The title of the timeline entry (up to 255 characters)',
				displayOptions: { show: { operation: ['createTimelineItem'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'timelineItemFields',
				type: 'collection',
				placeholder: 'Add field',
				default: {},
				displayOptions: { show: { operation: ['createTimelineItem'] } },
				options: [
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description:
							'The body of the timeline entry. Supports basic HTML formatting (e.g. &lt;br&gt;, &lt;b&gt;).',
					},
					{
						displayName: 'End Time',
						name: 'timeRangeEnd',
						type: 'dateTime',
						default: '',
						description:
							'When the activity ended. Must be set together with Start Time — the pair is shown as the activity’s time range.',
					},
					{
						displayName: 'Location',
						name: 'location',
						type: 'string',
						default: '',
						description: 'A free-text location for the activity (not validated as an address)',
					},
					{
						displayName: 'Phone',
						name: 'phone',
						type: 'string',
						default: '',
						description:
							'A free-text phone number for the activity (not validated as a phone number)',
					},
					{
						displayName: 'Start Time',
						name: 'timeRangeStart',
						type: 'dateTime',
						default: '',
						description:
							'When the activity started. Must be set together with End Time — the pair is shown as the activity’s time range.',
					},
					{
						displayName: 'Summary',
						name: 'summary',
						type: 'string',
						default: '',
						description: 'A short summary of the timeline entry (up to 255 characters)',
					},
					{
						displayName: 'Timestamp',
						name: 'timestamp',
						type: 'dateTime',
						default: '',
						description:
							'When the activity happened. Left empty, the moment of execution is used. When Start/End Time are set, monday displays the entry at the start time instead.',
					},
					{
						displayName: 'URL',
						name: 'url',
						type: 'string',
						default: '',
						description: 'A URL to attach to the timeline entry',
					},
				],
			},
			{
				displayName: 'Timeline Item ID',
				name: 'timelineItemId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. f06ba628-513f-495d-9f8a-7afa86a9f5e3',
				description:
					'The UUID of the timeline item, as returned by Create Timeline Item or Get Many Timeline Items',
				displayOptions: { show: { operation: ['getTimelineItem', 'deleteTimelineItem'] } },
			},
			{
				displayName: 'Options',
				name: 'getTimelineItemsOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getTimelineItems'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Skip Connected Items',
						name: 'skipConnectedItems',
						type: 'boolean',
						default: false,
						description:
							'Whether to leave out timeline entries that come from connected items (e.g. activities logged on a linked contact)',
					},
				],
			},
			{
				displayName: 'Activity Name',
				name: 'customActivityName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new custom activity type',
				displayOptions: { show: { operation: ['createCustomActivity'] } },
			},
			{
				displayName: 'Color',
				name: 'customActivityColor',
				type: 'options',
				options: CUSTOM_ACTIVITY_COLOR_OPTIONS,
				default: 'SLATE_BLUE',
				description: 'The color shown on timeline entries of this activity type',
				displayOptions: { show: { operation: ['createCustomActivity'] } },
			},
			{
				displayName: 'Icon',
				name: 'customActivityIcon',
				type: 'options',
				options: CUSTOM_ACTIVITY_ICON_OPTIONS,
				default: 'NOTEBOOK',
				description: 'The icon shown on timeline entries of this activity type',
				displayOptions: { show: { operation: ['createCustomActivity'] } },
			},
			{
				displayName: 'Filters',
				name: 'customActivityFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { operation: ['getCustomActivities'] } },
				options: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Return only the custom activity with this exact name',
					},
				],
			},
			{
				displayName: 'Column Title',
				name: 'columnTitle',
				type: 'string',
				default: '',
				required: true,
				description: 'The title of the new column',
				displayOptions: { show: { operation: ['createColumn'] } },
			},
			{
				displayName: 'Column Type',
				name: 'columnType',
				type: 'options',
				options: CREATABLE_COLUMN_TYPES,
				default: 'text',
				required: true,
				description:
					'The type of column to create. Types needing complex settings (connect boards, mirror, formula) are not listed — use the GraphQL operation for those.',
				displayOptions: { show: { operation: ['createColumn'] } },
			},
			{
				displayName: 'Labels',
				name: 'statusLabels',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true, sortable: true },
				placeholder: 'Add Label',
				default: {},
				description:
					'The status labels to create, in display order. Left empty, monday creates its default labels (Working on it / Done / Stuck).',
				displayOptions: { show: { operation: ['createColumn'], columnType: ['status'] } },
				options: [
					{
						displayName: 'Label',
						name: 'label',
						values: [
							{
								displayName: 'Name',
								name: 'label',
								type: 'string',
								default: '',
								required: true,
								description: 'The label text',
							},
							{
								displayName: 'Color',
								name: 'color',
								type: 'options',
								options: STATUS_COLOR_OPTIONS,
								default: 'working_orange',
								description: 'The label color, from monday’s status palette',
							},
							{
								displayName: 'Description',
								name: 'description',
								type: 'string',
								default: '',
								description: 'Optional label description, shown in the status tooltip',
							},
							{
								displayName: 'Counts as Done',
								name: 'isDone',
								type: 'boolean',
								default: false,
								description: 'Whether items with this label count as done (e.g. for battery views)',
							},
						],
					},
				],
			},
			{
				displayName: 'Labels',
				name: 'dropdownLabels',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true, sortable: true },
				placeholder: 'Add Label',
				default: {},
				description:
					'The dropdown options to create, in display order. Left empty, the dropdown starts without options.',
				displayOptions: { show: { operation: ['createColumn'], columnType: ['dropdown'] } },
				options: [
					{
						displayName: 'Label',
						name: 'label',
						values: [
							{
								displayName: 'Name',
								name: 'label',
								type: 'string',
								default: '',
								required: true,
								description: 'The option text',
							},
						],
					},
				],
			},
			{
				displayName: 'Type Settings',
				name: 'columnTypeSettings',
				type: 'collection',
				placeholder: 'Add setting',
				default: {},
				description:
					'Settings specific to the selected column type. Anything not set keeps monday’s default.',
				displayOptions: {
					show: {
						operation: ['createColumn'],
						columnType: [
							'checkbox',
							'color_picker',
							'date',
							'dependency',
							'dropdown',
							'email',
							'file',
							'hour',
							'link',
							'long_text',
							'numbers',
							'people',
							'phone',
							'rating',
							'status',
							'text',
							'timeline',
							'vote',
							'week',
							'world_clock',
						],
					},
				},
				options: [
					{
						displayName: 'Allow Linking Multiple Items',
						name: 'allowMultipleItems',
						type: 'boolean',
						default: true,
						description:
							'Whether one item can depend on several items. Applied via a follow-up settings update — the API ignores this setting during column creation.',
						displayOptions: { show: { '/columnType': ['dependency'] } },
					},
					{
						displayName: 'Calculation Type',
						name: 'calcType',
						type: 'options',
						options: [
							{ name: 'Earliest to Latest', value: 'earliestToLatest' },
							{ name: 'Earliest', value: 'earliest' },
							{ name: 'Latest', value: 'latest' },
						],
						default: 'earliestToLatest',
						description: 'How the footer summarizes the column’s dates',
						displayOptions: { show: { '/columnType': ['date'] } },
					},
					{
						displayName: 'CC Item Email Address',
						name: 'ccPulse',
						type: 'boolean',
						default: false,
						description: 'Whether to CC the item’s email address on emails sent from the column',
						displayOptions: { show: { '/columnType': ['email'] } },
					},
					{
						displayName: 'Color (Hex)',
						name: 'color',
						type: 'color',
						default: '',
						description: 'The display color, as a hex code (e.g. #fdab3d)',
						displayOptions: {
							show: { '/columnType': ['checkbox', 'color_picker', 'rating', 'vote', 'week'] },
						},
					},
					{
						displayName: 'Color Method',
						name: 'colorMethod',
						type: 'options',
						options: [
							{ name: 'Hex', value: 'hex' },
							{ name: 'RGB', value: 'rgb' },
						],
						default: 'hex',
						description: 'How the picked color is stored',
						displayOptions: { show: { '/columnType': ['color_picker'] } },
					},
					{
						displayName: 'Custom Unit',
						name: 'customUnit',
						type: 'string',
						default: '',
						description: 'The custom unit symbol, when Unit Symbol is set to "custom"',
						displayOptions: { show: { '/columnType': ['numbers'] } },
					},
					{
						displayName: 'Date Format',
						name: 'dateFormat',
						type: 'string',
						default: '',
						description: 'Date display format override (e.g. DD/MM/YYYY)',
						displayOptions: { show: { '/columnType': ['date'] } },
					},
					{
						displayName: 'Default Link Text',
						name: 'defaultText',
						type: 'string',
						default: '',
						description: 'Text displayed for links added without their own display text',
						displayOptions: { show: { '/columnType': ['link'] } },
					},
					{
						displayName: 'Disable Auto Title',
						name: 'disableAutoTitle',
						type: 'boolean',
						default: false,
						description: 'Whether to prevent automatic generation of a link title from the URL',
						displayOptions: { show: { '/columnType': ['link'] } },
					},
					{
						displayName: 'End Working Hours',
						name: 'endWorkingHours',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 23 },
						default: 17,
						description: 'End of working hours (0-23), highlighted in the clock display',
						displayOptions: { show: { '/columnType': ['world_clock'] } },
					},
					{
						displayName: 'Hide Footer',
						name: 'hideFooter',
						type: 'boolean',
						default: false,
						description: 'Whether to hide the column’s footer summary row',
						displayOptions: {
							show: {
								'/columnType': [
									'checkbox',
									'date',
									'file',
									'link',
									'long_text',
									'numbers',
									'text',
									'timeline',
								],
							},
						},
					},
					{
						displayName: 'Hour Format',
						name: 'hourFormat',
						type: 'options',
						options: [
							{ name: '24-Hour', value: '24H' },
							{ name: '12-Hour', value: '12H' },
						],
						default: '24H',
						description: 'Time display format',
						displayOptions: { show: { '/columnType': ['hour'] } },
					},
					{
						displayName: 'Include Item Name in Email Subject',
						name: 'includePulseInSubject',
						type: 'boolean',
						default: false,
						description: 'Whether emails sent from the column include the item name in the subject',
						displayOptions: { show: { '/columnType': ['email'] } },
					},
					{
						displayName: 'Limit Label Selection',
						name: 'limitSelect',
						type: 'boolean',
						default: false,
						description: 'Whether to limit how many labels can be selected per item',
						displayOptions: { show: { '/columnType': ['dropdown'] } },
					},
					{
						displayName: 'Max Labels Selectable',
						name: 'labelLimitCount',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description: 'Maximum number of labels selectable when Limit Label Selection is on',
						displayOptions: { show: { '/columnType': ['dropdown'] } },
					},
					{
						displayName: 'Max People',
						name: 'maxPeopleAllowed',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description: 'Maximum number of people assignable per item (0 = unlimited)',
						displayOptions: { show: { '/columnType': ['people'] } },
					},
					{
						displayName: 'Max Rating',
						name: 'ratingLimit',
						type: 'number',
						typeOptions: { minValue: 3, maxValue: 10 },
						default: 5,
						description: 'The rating scale maximum (3-10)',
						displayOptions: { show: { '/columnType': ['rating'] } },
					},
					{
						displayName: 'Numeric Only Date Format',
						name: 'useNumericOnlyFormat',
						type: 'boolean',
						default: false,
						description: 'Whether to display dates in a numeric-only format',
						displayOptions: { show: { '/columnType': ['date'] } },
					},
					{
						displayName: 'Precision',
						name: 'precision',
						type: 'options',
						options: [
							{ name: '0 Decimal Places', value: 0 },
							{ name: '1 Decimal Place', value: 1 },
							{ name: '2 Decimal Places', value: 2 },
							{ name: '3 Decimal Places', value: 3 },
							{ name: '4 Decimal Places', value: 4 },
							{ name: '5 Decimal Places', value: 5 },
							{ name: 'Automatic', value: -1 },
						],
						default: -1,
						description: 'Number of decimal places to display',
						displayOptions: { show: { '/columnType': ['numbers'] } },
					},
					{
						displayName: 'Rating Symbol',
						name: 'ratingSymbol',
						type: 'options',
						options: [
							{ name: 'Stars', value: 'stars' },
							{ name: 'Hearts', value: 'hearts' },
						],
						default: 'stars',
						description: 'The symbol used to render the rating',
						displayOptions: { show: { '/columnType': ['rating'] } },
					},
					{
						displayName: 'Rollup Function (Multi-Level Boards)',
						name: 'rollupFunction',
						type: 'options',
						options: [
							{ name: 'Board Default', value: '' },
							{ name: 'Count Labels (Status)', value: 'COUNT_KEYS' },
							{ name: 'Max (Numbers, Date)', value: 'MAX' },
							{ name: 'Min (Numbers, Date)', value: 'MIN' },
							{ name: 'Min & Max Span (Timeline)', value: 'MIN_MAX' },
							{ name: 'None — Disable Rollup', value: 'NONE' },
							{ name: 'Sum (Numbers)', value: 'SUM' },
						],
						default: '',
						description:
							'How the column calculates its value on parent items from their children, on multi-level boards (where these column types roll up by default — pick None to opt out). Each function only works on the column types in its parentheses. Not supported on classic boards.',
						displayOptions: { show: { '/columnType': ['numbers', 'date', 'timeline', 'status'] } },
					},
					{
						displayName: 'Show Country Flag',
						name: 'showFlag',
						type: 'boolean',
						default: true,
						description: 'Whether to display the country flag next to the phone number',
						displayOptions: { show: { '/columnType': ['phone'] } },
					},
					{
						displayName: 'Show Current Year',
						name: 'showCurrentYear',
						type: 'boolean',
						default: false,
						description: 'Whether to show the year for dates in the current year',
						displayOptions: { show: { '/columnType': ['date'] } },
					},
					{
						displayName: 'Show Milestone Option',
						name: 'showMilestone',
						type: 'boolean',
						default: false,
						description: 'Whether to show the "set as milestone" option on timeline values',
						displayOptions: { show: { '/columnType': ['timeline'] } },
					},
					{
						displayName: 'Show Time by Default',
						name: 'showTimeByDefault',
						type: 'boolean',
						default: false,
						description: 'Whether new date values include a time by default',
						displayOptions: { show: { '/columnType': ['date'] } },
					},
					{
						displayName: 'Show UTC Offset',
						name: 'showUtcOffset',
						type: 'boolean',
						default: false,
						description: 'Whether to show the UTC offset alongside the time',
						displayOptions: { show: { '/columnType': ['world_clock'] } },
					},
					{
						displayName: 'Show Week Day',
						name: 'showWeekDay',
						type: 'boolean',
						default: false,
						description: 'Whether to show the day of the week next to dates',
						displayOptions: { show: { '/columnType': ['date'] } },
					},
					{
						displayName: 'Show Week Number',
						name: 'showWeekNumber',
						type: 'boolean',
						default: false,
						description: 'Whether to show week numbers',
						displayOptions: { show: { '/columnType': ['date', 'timeline'] } },
					},
					{
						displayName: 'Show Weekends',
						name: 'showWeekends',
						type: 'boolean',
						default: true,
						description: 'Whether weekends are included in the display',
						displayOptions: { show: { '/columnType': ['date', 'timeline'] } },
					},
					{
						displayName: 'Start Working Hours',
						name: 'startWorkingHours',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 23 },
						default: 9,
						description: 'Start of working hours (0-23), highlighted in the clock display',
						displayOptions: { show: { '/columnType': ['world_clock'] } },
					},
					{
						displayName: 'Time Display Format',
						name: 'clockFormat',
						type: 'string',
						default: '',
						placeholder: 'e.g. HH:mm',
						description: 'Time display format string (e.g. HH:mm or hh:mm A)',
						displayOptions: { show: { '/columnType': ['world_clock'] } },
					},
					{
						displayName: 'Time Format',
						name: 'timeFormat',
						type: 'string',
						default: '',
						description: 'Time display format override for date values',
						displayOptions: { show: { '/columnType': ['date'] } },
					},
					{
						displayName: 'Unit Direction',
						name: 'unitDirection',
						type: 'options',
						options: [
							{ name: 'Left', value: 'left' },
							{ name: 'Right', value: 'right' },
						],
						default: 'left',
						description: 'Position of the unit symbol relative to the value',
						displayOptions: { show: { '/columnType': ['numbers'] } },
					},
					{
						displayName: 'Unit Symbol',
						name: 'unitSymbol',
						type: 'string',
						default: '',
						placeholder: 'e.g. $, %, or custom',
						description:
							'The unit symbol shown with values (e.g. $, %). Set to "custom" and fill Custom Unit for a symbol of your own.',
						displayOptions: { show: { '/columnType': ['numbers'] } },
					},
				],
			},
			{
				displayName: 'Options',
				name: 'createColumnOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createColumn'] } },
				options: [
					{
						displayName: 'Column ID',
						name: 'customColumnId',
						type: 'string',
						default: '',
						description:
							'A custom ID for the new column (e.g. "work_status"); left unset, monday generates one. Up to 24 characters: lowercase letters, digits and underscores, not starting with a digit. Must be unique on the board (IDs of deleted columns stay reserved) and can never be changed after creation.',
					},
					{
						displayName: 'Defaults (JSON)',
						name: 'defaultsJson',
						type: 'json',
						default: '{}',
						description:
							'Raw column settings in the API format, for full control (overrides Labels and Type Settings). See <a href="https://developer.monday.com/api-reference/reference/columns#create-a-column">the API reference</a>.',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'The description of the new column',
					},
					{
						displayName: 'Position',
						name: 'columnPosition',
						type: 'options',
						options: [
							{ name: 'After Column', value: 'after' },
							{ name: 'At Beginning', value: 'start' },
							{ name: 'At End', value: 'end' },
							{ name: 'Before Column', value: 'before' },
						],
						default: 'end',
						description:
							'Where to place the new column on the board. "At Beginning" means right after the Name column, which is always first.',
					},
					{
						displayName: 'Position: Relative To Column Name or ID',
						name: 'positionColumnId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getBoardColumns',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: '',
						description:
							'The existing column the new column is placed before or after (used with Position "After Column" / "Before Column"). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: { show: { columnPosition: ['after', 'before'] } },
					},
				],
			},
			{
				displayName: 'Group Name',
				name: 'groupName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new group',
				displayOptions: { show: { operation: ['createGroup'] } },
			},
			{
				displayName: 'Options',
				name: 'createGroupOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createGroup'] } },
				options: [
					{
						displayName: 'Color',
						name: 'groupColor',
						type: 'options',
						options: GROUP_COLOR_OPTIONS,
						default: '',
						description: 'The color of the new group; left unset, monday picks one',
					},
					{
						displayName: 'Position',
						name: 'groupPosition',
						type: 'options',
						options: [
							{ name: 'After Group', value: 'after' },
							{ name: 'At Bottom', value: 'bottom' },
							{ name: 'At Top', value: 'top' },
							{ name: 'Before Group', value: 'before' },
						],
						default: 'top',
						description:
							'Where to place the new group on the board; left unset, monday puts it at the top',
					},
					{
						displayName: 'Position: Relative To Group Name or ID',
						name: 'positionGroupId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getBoardGroups',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: '',
						description:
							'The existing group the new group is placed before or after (used with Position "After Group" / "Before Group"). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: { show: { groupPosition: ['after', 'before'] } },
					},
				],
			},
			{
				displayName: 'Update Fields',
				name: 'updateGroupFields',
				type: 'collection',
				placeholder: 'Add field',
				default: {},
				description:
					'The group attributes to change. Each field is applied as its own change in one request, in order (title, color, position) — if one fails, fields before it may already be applied.',
				displayOptions: { show: { operation: ['updateGroup'] } },
				options: [
					{
						displayName: 'Color',
						name: 'groupColor',
						type: 'options',
						options: GROUP_UPDATE_COLOR_OPTIONS,
						default: 'blue',
						description:
							'The new color of the group. The API accepts only this named palette here; the create palette’s Mustard has no update equivalent.',
					},
					{
						displayName: 'New Title',
						name: 'newTitle',
						type: 'string',
						default: '',
						description: 'The new title of the group',
					},
					{
						displayName: 'Position',
						name: 'groupPosition',
						type: 'options',
						options: [
							{ name: 'After Group', value: 'after' },
							{ name: 'At Bottom', value: 'bottom' },
							{ name: 'At Top', value: 'top' },
							{ name: 'Before Group', value: 'before' },
						],
						default: 'top',
						description:
							'Where to move the group on the board. "At Top" / "At Bottom" cost one extra read to find the current first/last group.',
					},
					{
						displayName: 'Position: Relative To Group Name or ID',
						name: 'positionGroupId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getBoardGroups',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: '',
						description:
							'The existing group this group is moved before or after (used with Position "After Group" / "Before Group"). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
						displayOptions: { show: { groupPosition: ['after', 'before'] } },
					},
				],
			},
			{
				displayName: 'Options',
				name: 'getGroupsOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getGroups'] } },
				options: [
					{
						displayName: 'Group Names or IDs',
						name: 'groupIds',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getBoardGroups',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: [],
						description:
							'Only return these groups; selecting none returns all groups of the board. Expressions accept an array or a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['notification'] } },
				options: [
					{
						name: 'Create',
						value: 'createNotification',
						action: 'Create a notification',
						description: 'Send an in-app (bell) notification to a user',
					},
				],
				default: 'createNotification',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['team'] } },
				options: [
					{
						name: 'Get',
						value: 'getTeam',
						action: 'Get a team',
						description: 'Return a single team with its owners',
					},
					{
						name: 'Get Many',
						value: 'getTeams',
						action: 'Get many teams',
						description: 'Return all teams of the account',
					},
					{
						name: 'Get Members',
						value: 'getTeamMembers',
						action: 'Get team members',
						description: 'Return the users belonging to a team, one output item per user',
					},
				],
				default: 'getTeams',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['ai'] } },
				options: [
					{
						name: 'Respond to Agent Chat (Beta)',
						value: 'respondToAgentChat',
						action: 'Respond to an agent chat message',
						description:
							"Return the reply shown in the agent chat. Use with the Chat output of the monday.com Trigger's Agent Interaction event — the reply is sent over the open webhook response, no credential needed.",
					},
					{
						name: 'Respond to Agent Mention (Beta)',
						value: 'respondToAgentMention',
						action: 'Respond to an agent mention',
						description:
							"Post a threaded reply on the update where the agent was @mentioned. Use with the Mention output of the monday.com Trigger's Agent Interaction event — the board, item, and update to reply to are read from the trigger's event data automatically.",
					},
					{
						name: 'Run monday.com AI',
						value: 'runPrompt',
						action: 'Run a prompt on monday AI',
						description:
							'Run a single prompt against a monday-hosted AI model and return the generated text (consumes monday AI credits)',
					},
					{
						name: 'Run Platform Agent',
						value: 'runAgent',
						action: 'Run the platform agent',
						description:
							'Send a prompt to the monday.com Platform Agent and return its text reply, with optional conversation continuity via a context ID',
					},
				],
				default: 'runPrompt',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['portfolio'] } },
				options: [
					{
						name: 'Connect Project',
						value: 'connectProjectToPortfolio',
						action: 'Connect a project to a portfolio',
						description:
							'Link an existing project board into a portfolio board (Enterprise plans only)',
					},
					{
						name: 'Create Portfolio',
						value: 'createPortfolio',
						action: 'Create a portfolio',
						description:
							'Create a new portfolio board for a consolidated overview of multiple projects (Enterprise plans only)',
					},
					{
						name: 'Create Project',
						value: 'createProject',
						action: 'Create a project',
						description:
							'Create a new project board, optionally connecting it to a portfolio (Enterprise plans only)',
					},
				],
				default: 'createPortfolio',
			},
			// ---- Portfolio: Create ----
			{
				displayName: 'Portfolio Name',
				name: 'portfolioName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new portfolio board',
				displayOptions: { show: { operation: ['createPortfolio'] } },
			},
			{
				displayName: 'Privacy',
				name: 'portfolioPrivacy',
				type: 'options',
				options: [
					{ name: 'Private', value: 'private' },
					{ name: 'Shareable', value: 'share' },
				],
				default: 'private',
				required: true,
				description:
					'Who can see the portfolio board: private = invited members, shareable = including guests. The API does not support public portfolios.',
				displayOptions: { show: { operation: ['createPortfolio'] } },
			},
			{
				displayName: 'Options',
				name: 'createPortfolioOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createPortfolio'] } },
				options: [
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description:
							'An HTTPS URL monday POSTs the created portfolio board ID to once creation completes (payload: is_success, process_id, portfolio_id) — for example an n8n Webhook trigger URL. Creation is asynchronous; the mutation itself never returns the board ID.',
					},
					{
						displayName: 'Wait for Portfolio Board',
						name: 'waitForBoard',
						type: 'boolean',
						default: true,
						description:
							'Whether to wait until the portfolio board is actually created (it appears a few seconds after the API accepts the request) and return its ID and URL. When off, only the acceptance result is returned — the board ID is not.',
					},
					{
						displayName: 'Wait Timeout (Seconds)',
						name: 'waitTimeout',
						type: 'number',
						typeOptions: { minValue: 10, maxValue: 600 },
						default: DEFAULT_CREATE_WAIT_TIMEOUT_SECONDS,
						description:
							'How long to wait for the portfolio board to appear. The node polls every 5 seconds (default: 60 seconds, min: 10, max: 600). If the board does not appear within this timeout, the node errors and the creation request continues asynchronously on monday.com — you can find the board by name or retry. Typical creation takes ~10 seconds.',
					},
					{
						...workspaceResourceLocator,
						description:
							'The workspace to create the portfolio board in. To use the account’s Main workspace, leave this unset — the API does not list it as a selectable workspace.',
					},
				],
			},
			// ---- Project: Create ----
			{
				displayName: 'Project Name',
				name: 'projectName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new project board',
				displayOptions: { show: { operation: ['createProject'] } },
			},
			{
				displayName: 'Board Kind',
				name: 'projectKind',
				type: 'options',
				options: [
					{ name: 'Private', value: 'private' },
					{ name: 'Public', value: 'public' },
				],
				default: 'public',
				required: true,
				description:
					'Who can see the project board: public = everyone in the account, private = invited members. The API does not support shareable project boards.',
				displayOptions: { show: { operation: ['createProject'] } },
			},
			{
				displayName: 'Connect to Portfolio',
				name: 'connectToPortfolio',
				type: 'boolean',
				default: false,
				description:
					'Whether to connect the new project to an existing portfolio board right after creation',
				displayOptions: { show: { operation: ['createProject'] } },
			},
			{
				...boardResourceLocator,
				displayName: 'Portfolio Board',
				name: 'portfolioBoardId',
				description: 'The portfolio board to connect the new project to',
				displayOptions: { show: { operation: ['createProject'], connectToPortfolio: [true] } },
			},
			{
				displayName: 'Options',
				name: 'createProjectOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createProject'] } },
				options: [
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description:
							'An HTTPS URL monday POSTs the created project board ID to once creation completes (payload: is_success, process_id, project_id) — for example an n8n Webhook trigger URL. Creation is asynchronous; the mutation itself never returns the board ID.',
					},
					{
						displayName: 'Enable Resource Planner',
						name: 'resourcePlanner',
						type: 'boolean',
						default: false,
						description:
							'Whether to enable the Resource Planner companion on the new project. Cannot be combined with a template ID.',
					},
					{
						// The folder ID string is the value; "Name or ID" suffix per lint.
						displayName: 'Folder Name or ID',
						name: 'folderId',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getProjectWorkspaceFolders',
							loadOptionsDependsOn: ['createProjectOptions.workspaceId.value'],
						},
						default: '',
						description:
							'The folder to create the project in. Select a workspace first — the list shows that workspace’s folders. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Template ID',
						name: 'templateId',
						type: 'string',
						default: '',
						description:
							'Create the project from this solution template. Cannot be combined with Enable Resource Planner. monday has no API to list templates, so copy the numeric ID from the template’s Template Center URL (enable Developer mode in monday.labs to see IDs).',
					},
					{
						displayName: 'Wait for Project Boards',
						name: 'waitForBoards',
						type: 'boolean',
						default: true,
						description:
							'Whether to wait until the project boards are actually created (they appear a few seconds after the API accepts the request) and return their IDs and URLs. monday creates two boards: the multi-level task board (the project itself) and a classic project-overview companion board with the same name. Always on when Connect to Portfolio is enabled — the connection needs the created board ID.',
					},
					{
						displayName: 'Wait Timeout (Seconds)',
						name: 'waitTimeout',
						type: 'number',
						typeOptions: { minValue: 10, maxValue: 600 },
						default: DEFAULT_CREATE_WAIT_TIMEOUT_SECONDS,
						description:
							'How long to wait for the project boards to appear. The node polls every 5 seconds (default: 60 seconds, min: 10, max: 600). If the boards do not appear within this timeout, the node errors and the creation request continues asynchronously on monday.com — you can find the boards by name or retry. Typical creation takes ~10 seconds.',
					},
					{
						...workspaceResourceLocator,
						description:
							'The workspace to create the project in. To use the account’s Main workspace, leave this unset — the API does not list it as a selectable workspace. Picking a workspace here also loads its folders into the Folder option.',
					},
				],
			},
			// ---- Portfolio: Connect Project ----
			{
				...boardResourceLocator,
				displayName: 'Project Board',
				name: 'projectBoardId',
				description:
					'The project board to connect — the multi-level task board created with the project, not the classic project-overview companion board',
				displayOptions: { show: { operation: ['connectProjectToPortfolio'] } },
			},
			{
				...boardResourceLocator,
				displayName: 'Portfolio Board',
				name: 'portfolioBoardId',
				description: 'The portfolio board to connect the project to',
				displayOptions: { show: { operation: ['connectProjectToPortfolio'] } },
			},
			{
				displayName: 'Options',
				name: 'connectPortfolioOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['connectProjectToPortfolio'] } },
				options: [
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description:
							'An HTTPS URL monday POSTs the result to once the connection completes (payload: is_success, process_id, portfolio_item_id). Without it the result returns synchronously.',
					},
				],
			},
			{
				...userResourceLocator,
				displayOptions: { show: { operation: ['getUser', 'getUserActivityLogs'] } },
			},
			buildUserRowsProperty({
				displayName: 'Users',
				name: 'notificationUserIds',
				description:
					'The users to notify — up to 30 per run, sent in one batched request. In expression mode, pass user IDs as a comma-separated string.',
				displayOptions: { show: { operation: ['createNotification'] } },
			}),
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				default: '',
				required: true,
				description:
					'The notification text. It also arrives by email if the user has notification emails enabled.',
				displayOptions: { show: { operation: ['createNotification'] } },
			},
			{
				displayName: 'Target',
				name: 'notificationTarget',
				type: 'options',
				options: [
					{
						name: 'Board',
						value: 'board',
						description: 'The notification links to a board',
					},
					{
						name: 'Item',
						value: 'item',
						description: 'The notification links to an item',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'The notification links to an update or a reply',
					},
				],
				default: 'item',
				description: 'What the notification links to when clicked',
				displayOptions: { show: { operation: ['createNotification'] } },
			},
			{
				...boardResourceLocator,
				description: 'The board the notification links to (or the board holding the item/update)',
				displayOptions: { show: { operation: ['createNotification'] } },
			},
			{
				...itemResourceLocator,
				description: 'The item the notification links to (or the item holding the update)',
				displayOptions: {
					show: { operation: ['createNotification'], notificationTarget: ['item', 'update'] },
				},
			},
			{
				displayName: 'Update Name or ID',
				name: 'notificationUpdateId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getItemUpdatesList',
					loadOptionsDependsOn: ['itemId.value'],
				},
				default: '',
				required: true,
				description:
					'The update the notification links to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: { operation: ['createNotification'], notificationTarget: ['update'] },
				},
			},
			{
				displayName: 'Options',
				name: 'getUserOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getUser'] } },
				options: [
					{
						displayName: 'Include Extended Info',
						name: 'includeExtendedInfo',
						type: 'boolean',
						default: false,
						description:
							'Whether to also return the extended profile: account ID, activation date, birthday, country, language, invitation method, email confirmation, serial number, UTC offset, out-of-office status, user config, and every photo size',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'userFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { operation: ['getUsers'] } },
				options: [
					{
						displayName: 'Emails',
						name: 'emails',
						type: 'string',
						default: '',
						description: 'Only return users with these email addresses (comma-separated)',
					},
					{
						displayName: 'Kind',
						name: 'kind',
						type: 'options',
						options: [
							{ name: 'All', value: 'all' },
							{ name: 'Guests Only', value: 'guests' },
							{ name: 'Non-Guests Only', value: 'non_guests' },
							{ name: 'Non-Pending Only', value: 'non_pending' },
						],
						default: 'all',
						description: 'Only return users of this kind',
					},
					{
						displayName: 'Search',
						name: 'name',
						type: 'string',
						default: '',
						description:
							'Only return users whose name or email matches this text (matched server-side — use it instead of fetching everyone and filtering in n8n)',
					},
					{
						displayName: 'User IDs',
						name: 'userIds',
						type: 'string',
						default: '',
						description: 'Only return these users (comma-separated IDs)',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getUsers'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Newest First',
						name: 'newestFirst',
						type: 'boolean',
						default: false,
						description: 'Whether to return the most recently created users first',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description:
							'Which page of results to fetch (page size = limit). Increment it across runs to walk through large accounts.',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'userActivityLogFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { operation: ['getUserActivityLogs'] } },
				options: [
					{
						displayName: 'Board Names or IDs',
						name: 'boardIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getBoardList' },
						default: [],
						description:
							'Only return events on these boards. The list shows only the 500 most recently used boards; for boards beyond that window, pass explicit IDs via an expression (an array or a comma-separated string). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Event Types',
						name: 'eventTypes',
						type: 'string',
						default: '',
						placeholder: 'e.g. update_column_value, create_pulse',
						description:
							'Only return these event types (comma-separated). Event names match the `event` field of activity log output rows.',
					},
					{
						displayName: 'From',
						name: 'from',
						type: 'dateTime',
						default: '',
						description: 'Only return events from this time onward',
					},
					{
						displayName: 'To',
						name: 'to',
						type: 'dateTime',
						default: '',
						description: 'Only return events up to this time',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'userActivityLogOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getUserActivityLogs'] } },
				options: [
					{
						displayName: 'Include Cursor',
						name: 'includeCursor',
						type: 'boolean',
						default: false,
						description:
							'Whether to append one final output item { nextCursor } after the events. Feed it into Starting Cursor (in this node or another one) to fetch the next page; null means no more events.',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Starting Cursor',
						name: 'startingCursor',
						type: 'string',
						default: '',
						description:
							'Resume fetching from this cursor (returned by a previous run with Include Cursor on) instead of starting from the most recent event',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'directoryFilters',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Filter',
				default: {},
				description:
					'Server-side attribute filters \u2014 far cheaper than fetching the whole directory and filtering in n8n',
				displayOptions: { show: { operation: ['getDirectoryResources'] } },
				options: [
					{
						displayName: 'Filter',
						name: 'rules',
						values: [
							{
								displayName: 'Attribute',
								name: 'attribute',
								type: 'options',
								options: DIRECTORY_FILTER_ATTRIBUTE_OPTIONS,
								default: 'NAME',
								description: 'The Resource Directory attribute to filter on',
							},
							{
								displayName: 'Contains',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'Only return resources whose attribute contains this text (case-insensitive, matched server-side)',
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getDirectoryResources'] } },
				options: [
					{
						displayName: 'Include Cursor',
						name: 'includeCursor',
						type: 'boolean',
						default: false,
						description:
							'Whether to append one final output item { nextCursor } after the resources. Feed it into Starting Cursor (in this node or another one) to fetch the next page; null means no more resources.',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account\u2019s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Match',
						name: 'filtersMatch',
						type: 'options',
						options: [
							{ name: 'All Filters (AND)', value: 'and' },
							{ name: 'Any Filter (OR)', value: 'or' },
						],
						default: 'and',
						description: 'How multiple filters combine',
					},
					{
						displayName: 'Starting Cursor',
						name: 'startingCursor',
						type: 'string',
						default: '',
						description:
							'Continue fetching from a cursor returned by a previous run. When set, filters are ignored \u2014 the cursor already encodes the query.',
					},
				],
			},
			{
				displayName: 'Attribute',
				name: 'directoryAttribute',
				type: 'options',
				options: DIRECTORY_UPDATE_ATTRIBUTE_OPTIONS,
				default: 'SKILLS',
				required: true,
				description: 'Which attribute to set on the resources',
				displayOptions: { show: { operation: ['updateDirectoryResourceAttributes'] } },
			},
			{
				displayName: 'Resource IDs',
				name: 'directoryResourceIds',
				type: 'string',
				default: '',
				required: true,
				description:
					'The directory resources to update (comma-separated IDs). Get IDs from the Get Many operation \u2014 they are directory resource IDs, not user IDs.',
				displayOptions: { show: { operation: ['updateDirectoryResourceAttributes'] } },
			},
			{
				displayName: 'Values',
				name: 'directoryValues',
				type: 'string',
				default: '',
				required: true,
				description:
					'The value(s) to assign, comma-separated for Skills. Skills are ADDED to the resource\u2019s existing set (duplicates ignored); Job Role and Location hold a single value that gets overwritten. Values must already exist in the account\u2019s Resource Directory \u2014 the API can neither create new attribute values nor remove assigned ones.',
				displayOptions: { show: { operation: ['updateDirectoryResourceAttributes'] } },
			},
			{
				displayName: 'Department Name or ID',
				name: 'departmentId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getDepartmentsList' },
				default: '',
				required: true,
				description:
					'The department to operate on. Departments are a bounded, admin-managed collection, so the full list is safe to load. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						operation: [
							'assignDepartmentMembers',
							'assignDepartmentOwners',
							'unassignDepartmentOwners',
							'updateDepartment',
							'deleteDepartment',
						],
					},
				},
			},
			buildUserRowsProperty({
				displayName: 'Users',
				name: 'departmentUserIds',
				description:
					'The users to operate on. Each entry searches the account server-side; in expression mode, pass user IDs as a comma-separated string.',
				displayOptions: {
					show: {
						operation: [
							'assignDepartmentMembers',
							'assignDepartmentOwners',
							'unassignDepartmentOwners',
							'clearUsersDepartment',
						],
					},
				},
			}),
			{
				displayName: 'Name',
				name: 'departmentName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new department',
				displayOptions: { show: { operation: ['createDepartment'] } },
			},
			{
				displayName: 'Options',
				name: 'createDepartmentOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createDepartment'] } },
				options: [
					{
						displayName: 'Reserved Seats',
						name: 'reservedSeats',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description: 'The number of seats to reserve for the department',
					},
				],
			},
			{
				displayName: 'Update Fields',
				name: 'departmentUpdateFields',
				type: 'collection',
				placeholder: 'Add field',
				default: {},
				displayOptions: { show: { operation: ['updateDepartment'] } },
				options: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'The new name of the department',
					},
					{
						displayName: 'Reserved Seats',
						name: 'reservedSeats',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description: 'The number of seats to reserve for the department',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'getDepartmentsOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getDepartments'] } },
				options: [
					{
						displayName: 'Department IDs',
						name: 'departmentIds',
						type: 'string',
						default: '',
						description:
							'Only return these departments (comma-separated IDs). The API fails the whole request when any of the IDs does not exist.',
					},
					{
						displayName: 'Include Members',
						name: 'includeMembers',
						type: 'boolean',
						default: false,
						description:
							'Whether to include each department\u2019s members (one user object per member \u2014 costly on departments with many members)',
					},
					{
						displayName: 'Include Owners',
						name: 'includeOwners',
						type: 'boolean',
						default: false,
						description: 'Whether to include each department\u2019s owners',
					},
				],
			},
			{
				...meetingResourceLocator,
				displayOptions: { show: { operation: ['getMeeting'] } },
			},
			{
				displayName: 'Options',
				name: 'getMeetingOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getMeeting'] } },
				options: [
					{
						displayName: 'Include Action Items',
						name: 'includeActionItems',
						type: 'boolean',
						default: true,
						description: 'Whether to return the action items captured from the meeting',
					},
					{
						displayName: 'Include Topics',
						name: 'includeTopics',
						type: 'boolean',
						default: true,
						description: 'Whether to return the discussion topics and their talking points',
					},
					{
						displayName: 'Include Transcript',
						name: 'includeTranscript',
						type: 'boolean',
						default: false,
						description:
							'Whether to return the full transcript (speaker, text, and timing per segment). Long meetings produce thousands of segments — leave off unless you need the raw text.',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'meetingFilters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { operation: ['getMeetings'] } },
				options: [
					{
						displayName: 'Access',
						name: 'access',
						type: 'options',
						options: MEETING_ACCESS_FILTER_OPTIONS,
						default: 'OWN',
						description:
							'Which meetings to return by access level. Without this filter the API returns only meetings you own.',
					},
					{
						displayName: 'Meeting IDs',
						name: 'meetingIds',
						type: 'string',
						default: '',
						description: 'Only return these meetings (comma-separated IDs)',
					},
					{
						displayName: 'Search',
						name: 'search',
						type: 'string',
						default: '',
						description:
							'Only return meetings whose title, participant name, or participant email matches this text (matched server-side)',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getMeetings'] } },
				options: [
					{
						displayName: 'Include Action Items',
						name: 'includeActionItems',
						type: 'boolean',
						default: false,
						description: 'Whether to return each meeting\u2019s action items',
					},
					{
						displayName: 'Include Cursor',
						name: 'includeCursor',
						type: 'boolean',
						default: false,
						description:
							'Whether to append one final output item { nextCursor } after the meetings. Feed it into Starting Cursor (in this node or another one) to fetch the next page; null means no more meetings.',
					},
					{
						displayName: 'Include Topics',
						name: 'includeTopics',
						type: 'boolean',
						default: false,
						description: 'Whether to return each meeting\u2019s discussion topics and talking points',
					},
					{
						displayName: 'Include Transcript',
						name: 'includeTranscript',
						type: 'boolean',
						default: false,
						description:
							'Whether to return each meeting\u2019s full transcript. Long meetings produce thousands of segments per meeting — prefer the Get operation for single-meeting transcripts.',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account\u2019s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Starting Cursor',
						name: 'startingCursor',
						type: 'string',
						default: '',
						description:
							'Continue fetching from a cursor returned by a previous run. When set, filters are ignored \u2014 the cursor already encodes the query.',
					},
				],
			},
			{
				displayName: 'Move To',
				name: 'moveDestination',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Another Board',
						value: 'board',
						description: 'Move the item to a group on a different board, with optional column mapping',
					},
					{
						name: 'Group on the Same Board',
						value: 'group',
						description: 'Move the item to another group of its board',
					},
				],
				default: 'group',
				displayOptions: { show: { operation: ['moveItem'] } },
			},
			{
				displayName: 'Target Group Name or ID',
				name: 'targetGroupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardGroups',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The group to move the item to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['moveItem'], moveDestination: ['group'] } },
			},
			{
				...boardResourceLocator,
				displayName: 'Target Board',
				name: 'targetBoardId',
				description: 'The board to move the item to',
				displayOptions: { show: { operation: ['moveItem'], moveDestination: ['board'] } },
			},
			{
				displayName: 'Target Board Group Name or ID',
				name: 'targetBoardGroupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTargetBoardGroups',
					loadOptionsDependsOn: ['targetBoardId.value'],
				},
				default: '',
				required: true,
				description:
					'The group on the target board to move the item to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['moveItem'], moveDestination: ['board'] } },
			},
			{
				// No include-updates toggle here on purpose (roadmap item 12570922790):
				// move_item_to_board has no with_updates argument on any API version
				// (2026-10 / 2027-01 / dev, introspected 2026-07-19) because updates
				// belong to the item and always move with it — verified live.
				displayName:
					"The item's updates (and their attachments) always move with the item — no toggle needed. Only column values can be lost: map them below.",
				name: 'moveToBoardUpdatesNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['moveItem'], moveDestination: ['board'] } },
			},
			{
				displayName: 'Columns Mapping',
				name: 'columnsMappingUi',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Column Mapping',
				default: {},
				description:
					'How source columns map to target-board columns. Unmapped columns lose their values on cross-board moves.',
				displayOptions: { show: { operation: ['moveItem'], moveDestination: ['board'] } },
				options: [
					{
						displayName: 'Mapping',
						name: 'mappings',
						values: [
							{
								displayName: 'Source Column Name or ID',
								name: 'source',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getBoardColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The column on the item\'s current board. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Target Column Name or ID',
								name: 'target',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getTargetBoardColumns',
									loadOptionsDependsOn: ['targetBoardId.value'],
								},
								default: '',
								description:
									'The column on the target board that receives the value. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'moveOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['moveItem'], moveDestination: ['board'] } },
				options: [
					{
						displayName: 'Columns Mapping (JSON)',
						name: 'columnsMapping',
						type: 'json',
						default: '[]',
						description:
							'How source columns map to target-board columns, as [{"source": "columnId", "target": "columnId"}] — an expression-friendly alternative to the Columns Mapping rows above. Ignored when any mapping rows are configured.',
					},
				],
			},
			{
				displayName: 'Include Updates',
				name: 'withUpdates',
				type: 'boolean',
				default: false,
				description: 'Whether the duplicate should include the item’s updates',
				displayOptions: { show: { operation: ['duplicateItem'] } },
			},
			{
				// Top-level item vs subitem for the unified Create operation.
				// Legacy saved workflows (operation createSubitem, or createItem
				// without this key) keep working: the execute path treats a
				// missing createAs as 'item', and the dependent pickers below
				// use hide rules (see the itemsMode comment) so their absence
				// of the key leaves the right pickers visible.
				displayName: 'Create As',
				name: 'createAs',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Subitem',
						value: 'subitem',
						description:
							'Create the item under a parent item — on multi-level boards the parent can itself be a subitem',
					},
					{
						name: 'Top-Level Item',
						value: 'item',
						description: 'Create the item in a group on the board',
					},
				],
				default: 'item',
				description: 'Whether to create a top-level item or a subitem under a parent item',
				displayOptions: { show: { operation: ['createItem'] } },
			},
			{
				...itemResourceLocator,
				displayName: 'Parent Item',
				description:
					'The item to create the subitem under. On classic boards subitems get the subitem board\'s own columns; on multi-level boards all levels share the parent board\'s columns and the parent can be a subitem itself (up to 5 levels).',
				displayOptions: { show: { operation: ['createItem'], createAs: ['subitem'] } },
			},
			{
				displayName:
					'On multi-level boards, creating the first subitem turns the parent\'s rollup columns (numbers, date, timeline, status with rollup enabled) into calculated values — the parent\'s existing values in those columns move down to the new subitem so the rollup still shows them, and writing to those columns on the parent silently has no effect from then on. Other column types are unaffected',
				name: 'createSubitemMultiLevelNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['createItem'], createAs: ['subitem'] } },
			},
			{
				displayName: 'Item Name',
				name: 'name',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the new item',
				displayOptions: { show: { operation: ['createItem', 'createSubitem'] } },
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
				description:
					'The group to create the item in; leave empty for the board\'s top group. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				// Hide (not show) on createAs so legacy workflows without the
				// key keep their group picker — see the itemsMode comment.
				displayOptions: { show: { operation: ['createItem'] }, hide: { createAs: ['subitem'] } },
			},
			{
				displayName: 'Column Values',
				name: 'columnValuesMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Map Columns',
						value: 'mapper',
						description: 'Pick columns and enter friendly values per column type',
					},
					{
						name: 'Raw JSON',
						value: 'json',
						description: 'Provide the API-format column_values JSON directly',
					},
				],
				default: 'mapper',
				displayOptions: { show: { operation: ['createItem', 'updateItem', 'createSubitem'] } },
			},
			{
				displayName: 'Columns',
				name: 'columns',
				type: 'resourceMapper',
				noDataExpression: true,
				default: { mappingMode: 'defineBelow', value: null },
				typeOptions: {
					loadOptionsDependsOn: ['boardId.value', 'operation'],
					resourceMapper: {
						resourceMapperMethod: 'getColumnFields',
						mode: 'add',
						fieldWords: { singular: 'column', plural: 'columns' },
						addAllFields: false,
						supportAutoMap: false,
					},
				},
				displayOptions: {
					show: {
						operation: ['createItem', 'updateItem', 'createSubitem'],
						columnValuesMode: ['mapper'],
					},
				},
			},
			{
				displayName: 'Column Values (JSON)',
				name: 'columnValuesJson',
				type: 'json',
				default: '{}',
				description:
					'Column values in the monday API format, keyed by column ID (e.g. {"status": {"label": "Done"}}). See <a href="https://developer.monday.com/api-reference/reference/column-types-reference">the column types reference</a>.',
				displayOptions: {
					show: {
						operation: ['createItem', 'updateItem', 'createSubitem'],
						columnValuesMode: ['json'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'createOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['createItem', 'updateItem', 'createSubitem'] } },
				options: [
					{
						displayName: 'Create Labels If Missing',
						name: 'createLabelsIfMissing',
						type: 'boolean',
						default: false,
						description:
							'Whether to create status/dropdown labels that do not exist yet (requires board owner permissions)',
					},
				],
			},
			{
				displayName: 'Item IDs',
				name: 'clearItemIds',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. 1234567890, 1234567891',
				description:
					'Comma-separated IDs of the items to clear (up to 10 per execution). Feed it from a Get Many operation with an expression.',
				displayOptions: { show: { operation: ['clearColumnValues'] } },
			},
			{
				displayName: 'Columns to Clear',
				name: 'clearColumnIds',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getClearableBoardColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: [],
				required: true,
				description:
					'The columns to reset to their empty/default value on every selected item (up to 10). Read-only columns (formula, mirror, etc.) cannot be cleared. In expression mode, pass a comma-separated string of column IDs. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['clearColumnValues'] } },
			},
			{
				displayName:
					'Clearing is permanent and not atomic: if some items in the batch fail, the others are still cleared. The output reports success or failure per item; without "Continue On Fail" a partial failure stops the run with an error naming the failed IDs. Re-running the batch is safe — clearing is idempotent.',
				name: 'clearColumnValuesNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['clearColumnValues'] } },
			},
			{
				displayName:
					'All input items become ONE import job: in Map Columns mode every incoming item is one CSV row (up to 10,000 per job). The import runs asynchronously on monday\'s side — with Wait for Completion the node polls every 10 seconds until the job finishes.',
				name: 'bulkImportNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['bulkImport'] } },
			},
			{
				displayName: 'Group Name or ID',
				name: 'bulkImportGroupId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBoardGroups',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				description:
					'The group newly created items are added to; leave empty for the board\'s top group. With Upsert/Skip matching, matching is board-wide — this only places NEW items. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['bulkImport'] } },
			},
			{
				displayName: 'Import Type',
				name: 'bulkImportType',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Backfill (Admin Only)',
						value: 'backfill',
						description:
							'One-time initial board seeding: requires an account admin token, never triggers automations, writes nothing to the activity log, always creates new items. Up to 20,000 rows per job.',
					},
					{
						name: 'Ingest (Recommended)',
						value: 'ingest',
						description:
							'Behaves like normal board activity: automations fire, the activity log records changes, Upsert/Skip matching available. Up to 10,000 rows per job.',
					},
				],
				default: 'ingest',
				description: 'Which import mutation to use',
				displayOptions: { show: { operation: ['bulkImport'] } },
			},
			{
				displayName: 'Data Source',
				name: 'bulkImportSource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'CSV File',
						value: 'file',
						description:
							'Upload a ready CSV from a binary field — header must be name (or name.l1…name.l5 for multi-level hierarchy files) plus exact column IDs',
					},
					{
						name: 'Map Columns',
						value: 'mapped',
						description: 'Build the CSV from the input items via a column mapping',
					},
				],
				default: 'mapped',
				description: 'Where the import rows come from',
				displayOptions: { show: { operation: ['bulkImport'] } },
			},
			{
				displayName: 'Columns',
				name: 'bulkImportColumns',
				type: 'resourceMapper',
				noDataExpression: true,
				default: { mappingMode: 'defineBelow', value: null },
				typeOptions: {
					loadOptionsDependsOn: ['boardId.value'],
					resourceMapper: {
						resourceMapperMethod: 'getBulkImportColumnFields',
						mode: 'add',
						fieldWords: { singular: 'column', plural: 'columns' },
						addAllFields: false,
						supportAutoMap: false,
					},
				},
				displayOptions: {
					show: { operation: ['bulkImport'], bulkImportSource: ['mapped'] },
				},
			},
			{
				displayName: 'Input Binary Field',
				name: 'bulkImportBinaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'The name of the input binary field containing the CSV file to import',
				displayOptions: {
					show: { operation: ['bulkImport'], bulkImportSource: ['file'] },
				},
			},
			{
				displayName: 'On Match',
				name: 'bulkImportOnMatch',
				type: 'options',
				options: [
					{
						name: 'Always Create',
						value: 'none',
						description: 'Every row creates a new item',
					},
					{
						name: 'Skip',
						value: 'SKIP',
						description: 'Skip rows whose match value already exists on the board',
					},
					{
						name: 'Upsert',
						value: 'UPSERT',
						description:
							'Update the existing item when the match column value already exists on the board, otherwise create. Empty cells preserve the existing value; a cell containing exactly &lt;NULL&gt; clears it.',
					},
				],
				default: 'none',
				description:
					'How to handle rows whose match column value already exists on the board. Not available for multi-level hierarchy files (they always create).',
				displayOptions: { show: { operation: ['bulkImport'], bulkImportType: ['ingest'] } },
			},
			{
				displayName: 'Match Column Name or ID',
				name: 'bulkImportMatchColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getBulkImportMatchColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The column existing items are matched on (board-wide). If several rows share a match value, only the last row is applied; if several items match, the most recently created one is updated. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: { operation: ['bulkImport'], bulkImportType: ['ingest'], bulkImportOnMatch: ['UPSERT', 'SKIP'] },
				},
			},
			{
				displayName: 'Wait for Completion',
				name: 'bulkImportWait',
				type: 'boolean',
				default: true,
				description:
					'Whether to wait for the import job to finish (polling every 10 seconds, up to Max Wait Time) and return its result. When off, save the job ID and poll manually with Get Bulk Import Status every 10 seconds.',
				displayOptions: { show: { operation: ['bulkImport'] } },
			},
			{
				displayName: 'Options',
				name: 'bulkImportOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['bulkImport'] } },
				options: [
					{
						displayName: 'Include Row Results',
						name: 'includeRowResults',
						type: 'boolean',
						default: false,
						description:
							'Whether to also output one item per imported row from monday\'s import report (serial number, status, item ID, error) — useful for routing failed rows. Requires Wait for Completion.',
					},
					{
						displayName: 'Max Wait Time',
						name: 'maxWaitTime',
						type: 'number',
						typeOptions: { minValue: 30 },
						default: 1800,
						description:
							'How long to wait for the job to finish, in seconds, before giving up with an error (the job itself keeps running on monday\'s side)',
					},
				],
			},
			{
				displayName: 'Job ID',
				name: 'bulkImportJobId',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
				description: 'The job ID returned by a Bulk Import run. Poll every 10 seconds. Note: if the import report is ready, the report URL expires after 10 minutes.',
				displayOptions: { show: { operation: ['getBulkImportStatus'] } },
			},
			{
				displayName: 'Options',
				name: 'bulkImportStatusOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getBulkImportStatus'] } },
				options: [
					{
						displayName: 'Include Row Results',
						name: 'includeRowResults',
						type: 'boolean',
						default: false,
						description:
							'Whether to also output one item per imported row from monday\'s import report (serial number, status, item ID, error), when the report is ready',
					},
				],
			},
			{
				// The name stays `simplify` (n8n's standard toggle param); only the label
				// is more specific, since it flattens column values, not the whole record.
				displayName: 'Simplify Column Values Response',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description:
					'Whether to return a flattened item (column values keyed by column title) instead of the raw API shape',
				displayOptions: { show: { operation: ['getItem'] } },
			},
			{
				displayName: 'Options',
				name: 'getItemOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getItem'] } },
				options: [
					{
						displayName: 'Include All Item Info',
						name: 'includeAllItemInfo',
						type: 'boolean',
						default: false,
						description:
							'Whether to also return the item’s creator, email address (for creating updates by email), relative link, and subscribers',
					},
					{
						displayName: 'Include Subitems',
						name: 'includeSubitems',
						type: 'boolean',
						default: false,
						description: 'Whether to include the item’s subitems (ID, name, state)',
					},
					{
						displayName: 'Include Updates',
						name: 'includeUpdates',
						type: 'boolean',
						default: false,
						description: 'Whether to include the item’s updates (body, creator, created time)',
					},
					{
						displayName: 'Select Column Names or IDs',
						name: 'columnIds',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getBoardColumns',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: [],
						description:
							'Only return these columns; selecting none returns all columns. Limiting the columns reduces the query’s complexity cost and payload size — especially on big boards. In expression mode, pass a comma-separated string of column IDs. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'getBoardOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getBoard'] } },
				options: [INCLUDE_COMPLETE_BOARD_DATA_OPTION],
			},
			{
				displayName: 'Calculations',
				name: 'aggregateCalculations',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Calculation',
				default: { calculations: [{ function: 'countItems' }] },
				description: 'What to calculate across the board’s items',
				displayOptions: { show: { operation: ['aggregateBoardData'] } },
				options: [
					{
						displayName: 'Calculation',
						name: 'calculations',
						values: [
							{
								// "Calculation" (not "Function") keeps this first under the
								// lint's alphabetical ordering — where it belongs in the UI.
								displayName: 'Calculation',
								name: 'function',
								type: 'options',
								options: AGGREGATE_FUNCTION_OPTIONS,
								default: 'countItems',
								description: 'The calculation to run',
							},
							{
								displayName: 'Column Name or ID',
								name: 'numericColumnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getAggregateNumericColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The numbers or rating column to calculate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
								displayOptions: { show: { function: ['sum', 'average', 'median'] } },
							},
							{
								displayName: 'Column Name or ID',
								name: 'minMaxColumnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getAggregateMinMaxColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The numbers, rating, or date column to calculate on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
								displayOptions: { show: { function: ['min', 'max'] } },
							},
							{
								displayName: 'Column Name or ID',
								name: 'anyColumnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getBoardColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The column whose values to count. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
								displayOptions: { show: { function: ['countValues', 'countUnique'] } },
							},
							{
								displayName: 'Output Field Name',
								name: 'outputName',
								type: 'string',
								default: '',
								description:
									'What to call this calculation in the output. Left empty, a name like "sum_budget" is generated from the function and column.',
							},
						],
					},
				],
			},
			{
				displayName: 'Group By',
				name: 'aggregateGroupBy',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Grouping',
				default: {},
				description:
					'Split the results into one row per value of these columns, like the rows of a pivot table. Without a grouping you get a single totals row for the whole board.',
				displayOptions: { show: { operation: ['aggregateBoardData'] } },
				options: [
					{
						displayName: 'Grouping',
						name: 'groups',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getAggregateGroupByColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The column to group by — status and dropdown values come back as label text, and "Board Group" groups by the board\'s groups. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Date Grouping',
								name: 'dateGrouping',
								type: 'options',
								options: AGGREGATE_DATE_GROUPING_OPTIONS,
								default: 'none',
								description:
									'For date columns only: bucket the dates by day, week, month, quarter, or year — the output shows the first day of each bucket. Ignored for other column types.',
							},
						],
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'aggregateFilters',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Filter',
				default: {},
				description:
					'Only aggregate the items that match these column-value filters (applied server-side)',
				displayOptions: { show: { operation: ['aggregateBoardData'] } },
				options: [
					{
						displayName: 'Filter',
						name: 'rules',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getFilterableBoardColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The column to filter on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Operator Name or ID',
								name: 'operator',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getFilterOperators',
									loadOptionsDependsOn: ['boardId.value', '&columnId'],
								},
								default: 'any_of',
								description:
									'How to compare — only the operators the selected column type supports are listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'The value to compare against. Comma-separated list for Any Of / Not Any Of / Between / Contains Terms. Status and dropdown labels can be given by name (e.g. "Done") — they are resolved to label indexes automatically.',
								displayOptions: { hide: { operator: ['is_empty', 'is_not_empty'] } },
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'aggregateOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['aggregateBoardData'] } },
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'One result row per group combination — raise this when grouping by a column with many distinct values',
					},
					{
						displayName: 'Match',
						name: 'filtersMatch',
						type: 'options',
						options: [
							{ name: 'All Filters (AND)', value: 'and' },
							{ name: 'Any Filter (OR)', value: 'or' },
						],
						default: 'and',
						description: 'How multiple filters combine',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { operation: ['getBoards'] } },
				options: [
					{
						displayName: 'Board Kind',
						name: 'boardKind',
						type: 'options',
						options: [
							{ name: 'Private', value: 'private' },
							{ name: 'Public', value: 'public' },
							{ name: 'Shareable', value: 'share' },
						],
						default: 'public',
						description: 'Only return boards of this kind',
					},
					{
						displayName: 'Board Names or IDs',
						name: 'boardIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getBoardList' },
						default: [],
						description:
							'Only return these boards. The list shows only the 500 most recently used boards (searchable by name, but only within that window); for boards beyond it, pass explicit IDs via an expression (an array or a comma-separated string). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Order By',
						name: 'orderBy',
						type: 'options',
						options: [
							{ name: 'Created At', value: 'created_at' },
							{ name: 'Last Used', value: 'used_at' },
						],
						default: 'used_at',
						description: 'Property to order the results by',
					},
					{
						displayName: 'State',
						name: 'state',
						type: 'options',
						options: [
							{ name: 'Active', value: 'active' },
							{ name: 'All', value: 'all' },
							{ name: 'Archived', value: 'archived' },
							{ name: 'Deleted', value: 'deleted' },
						],
						default: 'active',
						description: 'Only return boards in this state',
					},
					{
						displayName: 'Workspace Names or IDs',
						name: 'workspaceIds',
						type: 'multiOptions',
						typeOptions: { loadOptionsMethod: 'getWorkspaces' },
						default: [],
						description:
							'Only return boards in these workspaces — searchable by name. Expressions accept an array or a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getBoards'] } },
				options: [
					INCLUDE_COMPLETE_BOARD_DATA_OPTION,
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
						description:
							'Which page of results to fetch (page size = limit). Increment it across runs to walk through large accounts.',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'itemFilters',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Filter',
				default: {},
				description:
					'Server-side column-value filters (items_page query params) — far cheaper than fetching everything and filtering in n8n',
				displayOptions: { show: { operation: ['getItems'] } },
				options: [
					{
						displayName: 'Filter',
						name: 'rules',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getFilterableBoardColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The column to filter on. Status columns that roll up child values (multi-level boards) are not filterable — the API returns unreliable results for them. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Operator Name or ID',
								name: 'operator',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getFilterOperators',
									loadOptionsDependsOn: ['boardId.value', '&columnId'],
								},
								default: 'any_of',
								description:
									'How to compare — only the operators the selected column type supports are listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'The value to compare against. Comma-separated list for Any Of / Not Any Of / Between / Contains Terms. Status and dropdown labels can be given by name (e.g. "Done") — they are resolved to label indexes automatically.',
								displayOptions: { hide: { operator: ['is_empty', 'is_not_empty'] } },
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['getItems'] } },
				options: [
					{
						displayName: 'Include Column Names or IDs',
						name: 'columnIds',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getBoardColumns',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: [],
						description:
							'Only return these columns; selecting none includes all columns. The item name is always included. On large boards limiting columns keeps payload and API complexity down. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Include Cursor',
						name: 'includeCursor',
						type: 'boolean',
						default: false,
						description:
							'Whether to append one final output item { nextCursor } after the items. Feed it into Starting Cursor (in this node or another one) to fetch the next page; null means no more items.',
					},
					{
						displayName: 'Include Group Names or IDs',
						name: 'groupIds',
						type: 'multiOptions',
						typeOptions: {
							loadOptionsMethod: 'getBoardGroups',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: [],
						description:
							'Only return items from these groups; selecting none includes the whole board. Expressions accept an array or a comma-separated string. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Include Subitems (Multi-Level Boards)',
						name: 'includeSubitems',
						type: 'boolean',
						default: false,
						description:
							'Whether to return the board\'s subitems too (multi-level boards) as a flat list — every row gains a parent_item, null on top-level items. Filters then match subitems as well. Has no effect on classic boards, and cannot be combined with Sort By Column (the API ignores sorting in this mode).',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 1000 },
						default: 50,
						description: 'Max number of results to return',
						hint: 'Higher limits consume more of your account’s API complexity budget per run — see the Get Rate Limits operation',
					},
					{
						displayName: 'Match',
						name: 'filtersMatch',
						type: 'options',
						options: [
							{ name: 'All Filters (AND)', value: 'and' },
							{ name: 'Any Filter (OR)', value: 'or' },
						],
						default: 'and',
						description:
							'How multiple filters combine. Applies to every rule, including the group filter.',
					},
					{
						displayName: 'Sort By Column Name or ID',
						name: 'sortBy',
						type: 'options',
						typeOptions: {
							loadOptionsMethod: 'getBoardColumns',
							loadOptionsDependsOn: ['boardId.value'],
						},
						default: '',
						description:
							'Sort results server-side by this column. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Sort Direction',
						name: 'sortDirection',
						type: 'options',
						options: [
							{ name: 'Ascending', value: 'asc' },
							{ name: 'Descending', value: 'desc' },
						],
						default: 'asc',
						description: 'Used together with Sort By Column',
					},
					{
						displayName: 'Starting Cursor',
						name: 'startingCursor',
						type: 'string',
						default: '',
						description:
							'Continue fetching from a cursor returned by a previous run (valid for 60 minutes). When set, filters, groups, and sorting are ignored — the cursor already encodes the query.',
					},
				],
			},
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				typeOptions: { rows: 5 },
				default: '{\n  me {\n    id\n    name\n  }\n}',
				description: 'The GraphQL query or mutation to execute',
				displayOptions: { show: { operation: ['graphql'] } },
			},
			{
				displayName: 'Variables',
				name: 'variables',
				type: 'json',
				default: '{}',
				description:
					'GraphQL variables for the query, as a JSON object (e.g. {"boardId": [123]}). Reference them in the query with $variableName. Prefer variables over string-interpolating values into the query.',
				displayOptions: { show: { operation: ['graphql'] } },
			},
			{
				displayName: 'Options',
				name: 'graphqlOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: { show: { operation: ['graphql'] } },
				options: [
					{
						displayName: 'API Version Name or ID',
						name: 'apiVersion',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getApiVersions' },
						default: MONDAY_API_VERSION,
						description:
							'Which monday.com API version to run this request against; the list shows each version\'s lifecycle (current, release candidate, maintenance). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Include Request Info',
						name: 'includeRequestInfo',
						type: 'boolean',
						default: false,
						description:
							'Whether to add a requestInfo object to the output with the remaining rate limits, quota policy, requested and returned API version, request ID, and HTTP status code',
					},
				],
			},

			// ---------------------------------------------------------------
			// Validation resource (board validations: required columns + rules)
			// Pro/Enterprise-only feature; API version 2026-07+ (node pin covers it).
			// ---------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['validation'] } },
				options: [
					{
						name: 'Create Rule',
						value: 'createValidationRule',
						action: 'Create a validation rule',
						description:
							'Add a validation rule constraining column values, optionally gated behind a condition',
					},
					{
						name: 'Delete Rule',
						value: 'deleteValidationRule',
						action: 'Delete a validation rule',
						description: 'Remove a validation rule from the board',
					},
					{
						name: 'Get',
						value: 'getValidations',
						action: 'Get board validations',
						description: 'Return the board’s required columns and validation rules',
					},
					{
						name: 'Set Required Column',
						value: 'setRequiredColumn',
						action: 'Set a required column',
						description: 'Mark an existing column as required, or remove the requirement',
					},
					{
						name: 'Update Rule',
						value: 'updateValidationRule',
						action: 'Update a validation rule',
						description: 'Replace an existing validation rule’s definition',
					},
				],
				default: 'getValidations',
			},
			{
				...boardResourceLocator,
				displayOptions: {
					show: {
						operation: [
							'getValidations',
							'setRequiredColumn',
							'createValidationRule',
							'updateValidationRule',
							'deleteValidationRule',
						],
					},
				},
			},
			{
				displayName:
					'Board validations are available on monday.com Pro and Enterprise plans and require permission to edit column settings on the board',
				name: 'validationsPlanNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						operation: [
							'setRequiredColumn',
							'createValidationRule',
							'updateValidationRule',
							'deleteValidationRule',
						],
					},
				},
			},
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description:
					'Whether to return a normalized object (requiredColumnIds array plus one entry per rule with its ID) instead of the raw API response. When the API returns no validations (none configured, or the plan lacks the feature) the simplified output is empty arrays plus a notice instead of null.',
				displayOptions: { show: { operation: ['getValidations'] } },
			},
			{
				displayName: 'Mode',
				name: 'requiredColumnMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Add',
						value: 'add',
						description: 'Make an existing column required for new items',
					},
					{
						name: 'Remove',
						value: 'remove',
						description: 'Remove a column’s required designation (the column itself is kept)',
					},
				],
				default: 'add',
				description: 'Whether to add or remove the required designation',
				displayOptions: { show: { operation: ['setRequiredColumn'] } },
			},
			{
				displayName: 'Column Name or ID',
				name: 'requiredColumnId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getRequirableBoardColumns',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The column to mark required — only the column types monday supports as required are listed (status, dropdown, numbers, date, timeline, people, text, long text, email, phone, link, rating, country, location). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['setRequiredColumn'], requiredColumnMode: ['add'] } },
			},
			{
				displayName: 'Column Name or ID',
				name: 'requiredColumnRemoveId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getRequiredColumnsList',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The column whose required designation to remove — only currently required columns are listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: { operation: ['setRequiredColumn'], requiredColumnMode: ['remove'] },
				},
			},
			{
				displayName: 'Rule Name or ID',
				name: 'ruleId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getValidationRulesList',
					loadOptionsDependsOn: ['boardId.value'],
				},
				default: '',
				required: true,
				description:
					'The validation rule to modify, shown as a summary of its condition and constraints (the value is the rule\'s UUID). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { operation: ['updateValidationRule', 'deleteValidationRule'] } },
			},
			{
				displayName:
					'Updating replaces the whole rule — the condition and constraints set here become the rule’s full new definition (partial updates are not supported by the API)',
				name: 'updateRuleNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { operation: ['updateValidationRule'] } },
			},
			{
				displayName: 'Rule Definition',
				name: 'ruleDefinitionMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Builder',
						value: 'builder',
						description: 'Compose the rule from column, operator, and value fields',
					},
					{
						name: 'Raw JSON',
						value: 'json',
						description: 'Provide the full rule definition as JSON (escape hatch)',
					},
				],
				default: 'builder',
				description: 'How to define the rule',
				displayOptions: { show: { operation: ['createValidationRule', 'updateValidationRule'] } },
			},
			{
				displayName: 'Condition (If)',
				name: 'ruleCondition',
				type: 'fixedCollection',
				default: {},
				placeholder: 'Add Condition',
				description:
					'Optional: only enforce the constraints when this condition is met (e.g. "if Status is Done"). Without a condition the rule always applies — and monday allows exactly ONE always-on rule per column, with a single constraint.',
				displayOptions: {
					show: {
						operation: ['createValidationRule', 'updateValidationRule'],
						ruleDefinitionMode: ['builder'],
					},
				},
				options: [
					{
						displayName: 'Condition',
						name: 'condition',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getValidationIfColumns',
									loadOptionsDependsOn: ['boardId.value'],
								},
								default: '',
								description:
									'The column the condition checks. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Operator Name or ID',
								name: 'operator',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getValidationIfOperators',
									loadOptionsDependsOn: ['boardId.value', '&columnId'],
								},
								default: 'ANY_OF',
								description:
									'How to compare — only the operators the selected column type supports in a condition are listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'The value to compare against. Comma-separated list for Any Of / Not Any Of / Between. Status and dropdown labels can be given by name (e.g. "Done") — they resolve to label indexes automatically. Dates use YYYY-MM-DD.',
								displayOptions: { hide: { operator: ['IS_EMPTY', 'IS_NOT_EMPTY'] } },
							},
						],
					},
				],
			},
			{
				displayName: 'Constraints (Then)',
				name: 'ruleConstraints',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				placeholder: 'Add Constraint',
				description:
					'What must hold for items on the board. Without a condition exactly one constraint is allowed; with a condition multiple constraints can be enforced together.',
				displayOptions: {
					show: {
						operation: ['createValidationRule', 'updateValidationRule'],
						ruleDefinitionMode: ['builder'],
					},
				},
				options: [
					{
						displayName: 'Constraint',
						name: 'constraints',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getValidationThenColumns',
									loadOptionsDependsOn: ['boardId.value', 'ruleCondition'],
								},
								default: '',
								description:
									'The column the constraint applies to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Operator Name or ID',
								name: 'operator',
								type: 'options',
								typeOptions: {
									loadOptionsMethod: 'getValidationThenOperators',
									loadOptionsDependsOn: ['boardId.value', '&columnId', 'ruleCondition'],
								},
								default: 'IS_NOT_EMPTY',
								description:
									'What the column value must satisfy — only the operators the selected column type supports are listed (conditional rules support more than always-on rules). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'The value to compare against. Comma-separated list for Any Of / Not Any Of / Between. Status and dropdown labels can be given by name (e.g. "Done") — they resolve to label indexes automatically. Dates use YYYY-MM-DD.',
								displayOptions: { hide: { operator: ['IS_EMPTY', 'IS_NOT_EMPTY'] } },
							},
						],
					},
				],
			},
			{
				displayName: 'Rule (JSON)',
				name: 'ruleJson',
				type: 'json',
				default: '{\n  "then": {\n    "operator": "AND",\n    "groups": [\n      { "operator": "IS_NOT_EMPTY", "column_id": "" }\n    ]\n  }\n}',
				description:
					'The full rule definition as the API\'s ValidationRuleInput: a required "then" clause and an optional "if" clause, each { "operator": "AND"|"OR", "groups": [{ "operator", "column_id", "compare_value" }] }. Values are sent as-is (no label resolution). See <a href="https://developer.monday.com/api-reference/docs/validation-rules-guide">the validation rules guide</a>.',
				displayOptions: {
					show: {
						operation: ['createValidationRule', 'updateValidationRule'],
						ruleDefinitionMode: ['json'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'ruleOptions',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: {
					show: {
						operation: ['createValidationRule', 'updateValidationRule'],
						ruleDefinitionMode: ['builder'],
					},
				},
				options: [
					{
						displayName: 'Combine Constraints With',
						name: 'thenMatch',
						type: 'options',
						options: [
							{ name: 'All Constraints (AND)', value: 'AND' },
							{ name: 'Any Constraint (OR)', value: 'OR' },
						],
						default: 'AND',
						description:
							'How multiple Then constraints combine — only relevant for conditional rules with more than one constraint',
					},
				],
			},
		],
		usableAsTool: true,
	};

	methods = {
		listSearch: {
			searchBoards,
			searchDocs,
			searchGroups,
			searchItems,
			searchMeetings,
			searchUsers,
			searchUsersAndTeams,
			searchWorkspaces,
		},
		loadOptions: {
			getAggregateGroupByColumns,
			getAggregateMinMaxColumns,
			getAggregateNumericColumns,
			getApiVersions,
			getArticleWorkspaceFolders,
			getAuditEventsList,
			getBoardColumns,
			getBoardDocColumns,
			getBoardFileColumns,
			getBoardLabelColumns,
			getBulkImportMatchColumns,
			getClearableBoardColumns,
			getColumnLabels,
			getCreateBoardWorkspaceFolders,
			getCreateFolderParentList,
			getCustomActivitiesList,
			getDepartmentsList,
			getDocImportWorkspaceFolders,
			getDocWorkspaceFolders,
			getFilterableBoardColumns,
			getFilterOperators,
			getFolderList,
			getFormQuestionsList,
			getFormTagsList,
			getFormWorkspaceFolders,
			getBoardGroups,
			getItemColumnFiles,
			getItemUpdatesList,
			getBoardList,
			getMoveDestinationFolderList,
			getProjectWorkspaceFolders,
			getRequirableBoardColumns,
			getRequiredColumnsList,
			getTargetBoardColumns,
			getTargetBoardGroups,
			getTeamsList,
			getUpdateFolderParentList,
			getValidationIfColumns,
			getValidationIfOperators,
			getValidationRulesList,
			getValidationThenColumns,
			getValidationThenOperators,
			getWorkspaceFolders,
			getWorkspaces,
		},
		resourceMapping: {
			getBulkImportColumnFields,
			getColumnFields,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// API version is pinned node-wide (constants.ts), not per credential.
		const client = new MondayGraphQLClient(this);

		const operation = this.getNodeParameter('operation', 0) as string;

		// Account-level, parameterless reads: run ONCE per execution, not once
		// per input item — per-item runs would just duplicate identical output.
		if (operation === 'getMe' || operation === 'getLimits' || operation === 'getTeams') {
			try {
				if (operation === 'getMe') {
					const data = await client.execute('{ me { id name email url } }', 0);
					returnData.push({ json: data, pairedItem: { item: 0 } });
				} else if (operation === 'getTeams') {
					const data = await client.execute(
						'query { teams { id name is_guest picture_url owners { id name } } }',
						0,
					);
					for (const team of (data.teams ?? []) as IDataObject[]) {
						returnData.push({ json: team, pairedItem: { item: 0 } });
					}
				} else {
					// All the budget info (incl. complexity) comes from the response
					// headers — the query itself is just the cheapest valid request.
					const { requestInfo } = await client.executeWithInfo('query { version { value } }', 0);
					returnData.push({
						json: buildRequestInfoOutput(requestInfo, MONDAY_API_VERSION),
						pairedItem: { item: 0 },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: 0 },
					});
				} else {
					throw ensureNodeError(this.getNode(), error);
				}
			}
			return [returnData];
		}

		// Respond to Agent Chat answers the deferred webhook request of the
		// monday.com Trigger's Agent Interaction event. The HTTP response
		// channel can only be written once — run once per execution, then
		// pass the input through so the workflow can keep working after the
		// reply was sent (e.g. logging or follow-up mutations).
		if (operation === 'respondToAgentChat') {
			try {
				const replyText = this.getNodeParameter('replyText', 0) as string;
				const respondOptions = this.getNodeParameter('respondToAgentChatOptions', 0, {}) as {
					responseFormat?: string;
				};
				const format = respondOptions.responseFormat ?? 'auto';

				let wantsStream = true;
				if (format === 'json') wantsStream = false;
				else if (format === 'auto') {
					// The trigger emits stream:false when monday asked for a plain
					// JSON reply; if the field didn't survive intermediate nodes,
					// SSE is the correct default.
					wantsStream = items[0]?.json?.stream !== false;
				}

				this.sendResponse(buildAgentResponse(replyText, wantsStream));
			} catch (error) {
				if (this.continueOnFail()) {
					return [
						items.map((item, index) => ({
							json: { error: (error as Error).message },
							pairedItem: { item: index },
						})),
					];
				}
				throw new NodeOperationError(this.getNode(), error as Error);
			}
			return [items];
		}

		// Bulk Import consumes ALL input items into ONE import job (in mapped
		// mode each input item is one CSV row) — run once per execution.
		if (operation === 'bulkImport') {
			try {
				const rows = await bulkImportItems.call(this, client, items.length);
				returnData.push(...rows);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: 0 },
					});
				} else {
					throw ensureNodeError(this.getNode(), error);
				}
			}
			return [returnData];
		}

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'createItem') {
					const data = await createItem.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createSubitem') {
					const data = await createSubitem.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'updateItem') {
					const data = await updateItem.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'clearColumnValues') {
					const rows = await clearColumnValues.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getItem') {
					const data = await getItem.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getColumnValue') {
					const data = await getColumnValue.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getBulkImportStatus') {
					const rows = await getBulkImportJobStatus.call(this, client, i);
					returnData.push(...rows);
					continue;
				}

				if (operation === 'moveItem') {
					const data = await moveItem.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'duplicateItem') {
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const itemId = this.getNodeParameter('itemId', i, undefined, {
						extractValue: true,
					}) as string;
					const withUpdates = this.getNodeParameter('withUpdates', i, false) as boolean;
					const data = await client.execute(
						`mutation ($boardId: ID!, $itemId: ID!, $withUpdates: Boolean) {
							duplicate_item(board_id: $boardId, item_id: $itemId, with_updates: $withUpdates) {
								id
								name
								url
								state
								board { id name }
								group { id title }
							}
						}`,
						i,
						{ boardId, itemId, withUpdates },
					);
					returnData.push({
						json: (data.duplicate_item ?? {}) as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				// 'archiveItem'/'deleteItem' are the legacy operation values from
				// before the ops were unified — old workflow JSON still runs.
				if (
					operation === 'archiveOrDeleteItem' ||
					operation === 'archiveItem' ||
					operation === 'deleteItem'
				) {
					const action = resolveArchiveOrDeleteAction.call(this, operation, i);
					const itemsMode = this.getNodeParameter('itemsMode', i, 'single') as string;
					if (operation === 'archiveOrDeleteItem' && itemsMode === 'multiple') {
						const rows = await archiveOrDeleteManyItems.call(this, client, i, action);
						for (const row of rows) {
							returnData.push({ json: row, pairedItem: { item: i } });
						}
						continue;
					}
					const itemId = this.getNodeParameter('itemId', i, undefined, {
						extractValue: true,
					}) as string;
					const mutation =
						action === 'archive'
							? 'mutation ($itemId: ID!) { archive_item(item_id: $itemId) { id name state } }'
							: 'mutation ($itemId: ID!) { delete_item(item_id: $itemId) { id name state } }';
					const data = await client.execute(mutation, i, { itemId });
					const payload = (data.archive_item ?? data.delete_item ?? {}) as IDataObject;
					returnData.push({ json: { ...payload, action }, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'archiveOrDeleteBoard') {
					const action = resolveArchiveOrDeleteAction.call(this, operation, i);
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const mutation =
						action === 'archive'
							? 'mutation ($boardId: ID!) { archive_board(board_id: $boardId) { id name state } }'
							: 'mutation ($boardId: ID!) { delete_board(board_id: $boardId) { id name state } }';
					const data = await client.execute(mutation, i, { boardId });
					const payload = (data.archive_board ?? data.delete_board ?? {}) as IDataObject;
					returnData.push({ json: { ...payload, action }, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'archiveOrDeleteGroup') {
					const action = resolveArchiveOrDeleteAction.call(this, operation, i);
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const groupId = this.getNodeParameter('groupId', i, undefined, {
						extractValue: true,
					}) as string;
					const mutation =
						action === 'archive'
							? `mutation ($boardId: ID!, $groupId: String!) {
									archive_group(board_id: $boardId, group_id: $groupId) { id title archived }
								}`
							: `mutation ($boardId: ID!, $groupId: String!) {
									delete_group(board_id: $boardId, group_id: $groupId) { id title deleted }
								}`;
					const data = await client.execute(mutation, i, { boardId, groupId });
					const payload = (data.archive_group ?? data.delete_group ?? {}) as IDataObject;
					returnData.push({ json: { ...payload, action }, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'duplicateBoard') {
					const data = await duplicateBoard.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'duplicateGroup') {
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const groupId = this.getNodeParameter('groupId', i, undefined, {
						extractValue: true,
					}) as string;
					const options = this.getNodeParameter('duplicateGroupOptions', i, {}) as IDataObject;
					const position = (options.groupPosition as string) || '';
					const anchorGroupId = (options.positionGroupId as string) || '';
					if ((position === 'after' || position === 'before') && !anchorGroupId) {
						throw new NodeOperationError(
							this.getNode(),
							'Select the group the duplicate should be placed before or after (Position: Relative To Group)',
							{ itemIndex: i },
						);
					}
					const data = await client.execute(
						`mutation ($boardId: ID!, $groupId: String!, $addToTop: Boolean, $groupTitle: String) {
							duplicate_group(
								board_id: $boardId,
								group_id: $groupId,
								add_to_top: $addToTop,
								group_title: $groupTitle
							) {
								id
								title
								color
								position
								archived
							}
						}`,
						i,
						{
							boardId,
							groupId,
							// duplicate_group has no relative positioning; only "top" maps to an
							// argument. The other placements reposition with update_group below.
							addToTop: position === 'top' ? true : null,
							groupTitle: (options.groupTitle as string) || null,
						},
					);
					let group = (data.duplicate_group ?? {}) as IDataObject;
					const newGroupId = group.id as string | undefined;

					if (newGroupId && (position === 'after' || position === 'before' || position === 'bottom')) {
						let anchor = anchorGroupId;
						if (position === 'bottom') {
							const groupsData = await client.execute(
								`query ($ids: [ID!]) {
									boards(ids: $ids) {
										groups { id position }
									}
								}`,
								i,
								{ ids: [boardId] },
							);
							const boards = (groupsData.boards ?? []) as Array<{
								groups?: Array<{ id: string; position: string }>;
							}>;
							anchor = findEdgeGroupId(boards[0]?.groups ?? [], newGroupId, 'bottom') ?? '';
						}
						if (anchor) {
							const moved = await client.execute(
								`mutation ($boardId: ID!, $groupId: String!, $attribute: GroupAttributes!, $anchor: String!) {
									update_group(
										board_id: $boardId,
										group_id: $groupId,
										group_attribute: $attribute,
										new_value: $anchor
									) {
										id
										title
										color
										position
										archived
									}
								}`,
								i,
								{
									boardId,
									groupId: newGroupId,
									attribute:
										position === 'before' ? 'relative_position_before' : 'relative_position_after',
									anchor,
								},
							);
							group = { ...group, ...((moved.update_group ?? {}) as IDataObject) };
						}
					}

					returnData.push({
						json: group,
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'updateBoardSubscribers') {
					const data = await changeBoardSubscribers.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getBoardSubscribers') {
					const rows = await getBoardSubscribers.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getItemSubscribers') {
					const itemId = this.getNodeParameter('itemId', i, undefined, {
						extractValue: true,
					}) as string;
					const data = await client.execute(
						`query ($ids: [ID!]) {
							items(ids: $ids) {
								id
								name
								subscribers { id name email }
							}
						}`,
						i,
						{ ids: [itemId] },
					);
					const item = ((data.items ?? []) as Array<IDataObject & { subscribers?: IDataObject[] }>)[0];
					if (!item) {
						throw new NodeOperationError(this.getNode(), `Item ${itemId} not found`, {
							itemIndex: i,
						});
					}
					for (const subscriber of item.subscribers ?? []) {
						returnData.push({
							json: { ...subscriber, itemId: item.id, itemName: item.name },
							pairedItem: { item: i },
						});
					}
					continue;
				}

				if (operation === 'getActivityLogs') {
					const rows = await getActivityLogs.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getAuditLogs') {
					const rows = await getManyAuditLogs.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'aggregateBoardData') {
					const rows = await aggregateBoardData.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getColumns') {
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const data = await client.execute(
						`query ($ids: [ID!]) {
							boards(ids: $ids) {
								columns {
									id title type description settings_str
									capabilities { calculated { function calculated_type } }
								}
							}
						}`,
						i,
						{ ids: [boardId] },
					);
					const columns =
						((data.boards ?? []) as Array<{ columns?: IDataObject[] }>)[0]?.columns ?? [];
					for (const column of columns) {
						returnData.push({ json: formatColumnSchemaRow(column), pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'updateColumn') {
					const data = await updateColumn.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'deleteColumn') {
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const columnId = this.getNodeParameter('deleteColumnId', i) as string;
					// API quirk (verified live 2026-07-19): delete_column returns
					// null on success (unknown IDs still error) — echo the inputs
					// so the output row is useful downstream.
					await client.execute(
						`mutation ($boardId: ID!, $columnId: String!) {
							delete_column(board_id: $boardId, column_id: $columnId) { id }
						}`,
						i,
						{ boardId, columnId },
					);
					returnData.push({
						json: { id: columnId, boardId, deleted: true },
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'addColumnLabel') {
					const data = await addColumnLabel.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'updateColumnLabel') {
					const data = await updateColumnLabel.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getAssets') {
					const assets = await getManyAssets.call(this, client, i);
					for (const asset of assets) {
						returnData.push({ json: asset, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'addFileToUpdate') {
					const item = await addFileToUpdate.call(this, client, i);
					returnData.push(item);
					continue;
				}

				if (operation === 'createOrGetTag') {
					const tagName = this.getNodeParameter('tagName', i) as string;
					const tagOptions = this.getNodeParameter('tagOptions', i, {}) as IDataObject;
					const data = await client.execute(
						`mutation ($tagName: String, $boardId: ID) {
							create_or_get_tag(tag_name: $tagName, board_id: $boardId) {
								id
								name
								color
							}
						}`,
						i,
						{ tagName, boardId: (tagOptions.boardId as string) || null },
					);
					returnData.push({
						json: (data.create_or_get_tag ?? {}) as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'getTeam' || operation === 'getTeamMembers') {
					const teamId = this.getNodeParameter('teamId', i) as string;
					const data = await client.execute(
						`query ($ids: [ID!]) {
							teams(ids: $ids) {
								id
								name
								is_guest
								picture_url
								owners { id name }
								users { id name email title kind status }
							}
						}`,
						i,
						{ ids: [teamId] },
					);
					const team = ((data.teams ?? []) as Array<IDataObject & { users?: IDataObject[] }>)[0];
					if (!team) {
						throw new NodeOperationError(this.getNode(), `Team ${teamId} not found`, {
							itemIndex: i,
						});
					}
					if (operation === 'getTeam') {
						returnData.push({ json: team, pairedItem: { item: i } });
					} else {
						for (const user of team.users ?? []) {
							returnData.push({
								json: { ...user, teamId: team.id, teamName: team.name },
								pairedItem: { item: i },
							});
						}
					}
					continue;
				}

				if (operation === 'runPrompt') {
					const prompt = this.getNodeParameter('prompt', i) as string;
					const options = this.getNodeParameter('runPromptOptions', i, {}) as IDataObject;
					const config = buildRunPromptConfig(options);
					// run_prompt exists from API version 2026-10 — covered by the pin.
					const data = await client.execute(
						`mutation ($prompt: String!, $config: RunPromptConfigInput) {
							run_prompt(prompt: $prompt, config: $config) { content }
						}`,
						i,
						{ prompt, config },
					);
					returnData.push({
						json: { content: ((data.run_prompt ?? {}) as IDataObject).content ?? null },
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'runAgent') {
					const data = await runPlatformAgent.call(this, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'addFileToColumn') {
					const item = await addFileToColumn.call(this, client, i);
					returnData.push(item);
					continue;
				}

				if (operation === 'downloadFile') {
					const items = await downloadFile.call(this, client, i);
					returnData.push(...items);
					continue;
				}

				if (operation === 'createUpdate') {
					const itemId = this.getNodeParameter('itemId', i, undefined, {
						extractValue: true,
					}) as string;
					const body = this.getNodeParameter('updateBody', i) as string;
					const updateOptions = this.getNodeParameter('createUpdateOptions', i, {}) as IDataObject;
					const parentId = (updateOptions.parentId as string) || null;
					const mentions = buildMentionsList(
						updateOptions.mentionUserIds,
						updateOptions.mentionTeamIds,
					);

					const data = await client.execute(
						`mutation ($itemId: ID!, $body: String!, $parentId: ID, $mentions: [UpdateMention!]) {
							create_update(item_id: $itemId, body: $body, parent_id: $parentId, mentions_list: $mentions) {
								id
								body
								text_body
								created_at
								item_id
								creator { id name }
							}
						}`,
						i,
						{ itemId, body, parentId, mentions: mentions.length > 0 ? mentions : null },
					);
					returnData.push({
						json: (data.create_update ?? {}) as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				// Respond to Agent Mention is Update: Create with the targeting
				// abstracted away: item and parent update come from the mention
				// event data the trigger emitted, not from parameters.
				if (operation === 'respondToAgentMention') {
					const context = extractAgentMentionContext(
						items[i].json as unknown as Record<string, unknown>,
					);
					if (!context.itemId) {
						throw new NodeOperationError(
							this.getNode(),
							'No agent mention found in the input data',
							{
								itemIndex: i,
								description:
									"Connect this operation to the Mention output of the monday.com Trigger's Agent Interaction event, or make sure the trigger's payload fields (payload.itemId, payload.updateId) reach this node's input. To post an update with manually chosen IDs, use Update → Create instead.",
							},
						);
					}
					const body = this.getNodeParameter('mentionReplyText', i) as string;
					const mentionOptions = this.getNodeParameter(
						'respondToAgentMentionOptions',
						i,
						{},
					) as IDataObject;
					const mentions = buildMentionsList(
						mentionOptions.mentionUserIds,
						mentionOptions.mentionTeamIds,
					);

					// Threaded reply on the mention update; if the payload had no
					// updateId, fall back to a new top-level update on the item.
					const data = await client.execute(
						`mutation ($itemId: ID!, $body: String!, $parentId: ID, $mentions: [UpdateMention!]) {
							create_update(item_id: $itemId, body: $body, parent_id: $parentId, mentions_list: $mentions) {
								id
								body
								text_body
								created_at
								item_id
								creator { id name }
							}
						}`,
						i,
						{
							itemId: context.itemId,
							body,
							parentId: context.updateId,
							mentions: mentions.length > 0 ? mentions : null,
						},
					);
					returnData.push({
						json: (data.create_update ?? {}) as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'getUpdates') {
					const rows = await getManyUpdates.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'createColumn') {
					const data = await createColumn.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createGroup') {
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const groupName = this.getNodeParameter('groupName', i) as string;
					const groupOptions = this.getNodeParameter('createGroupOptions', i, {}) as IDataObject;

					const varDefs = ['$boardId: ID!', '$groupName: String!'];
					const args = ['board_id: $boardId', 'group_name: $groupName'];
					const variables: Record<string, unknown> = { boardId, groupName };
					if (groupOptions.groupColor) {
						varDefs.push('$groupColor: String');
						args.push('group_color: $groupColor');
						variables.groupColor = groupOptions.groupColor;
					}
					const positionArgs = buildGroupPositionArgs(
						groupOptions.groupPosition as string,
						groupOptions.positionGroupId as string,
					);
					if (positionArgs === 'missing-anchor') {
						throw new NodeOperationError(
							this.getNode(),
							'Select the group the new group should be placed before or after (Position: Relative To Group)',
							{ itemIndex: i },
						);
					}
					if (positionArgs.method) {
						args.push(`position_relative_method: ${positionArgs.method}`);
					}
					if (positionArgs.relativeTo) {
						varDefs.push('$relativeTo: String');
						args.push('relative_to: $relativeTo');
						variables.relativeTo = positionArgs.relativeTo;
					}

					const data = await client.execute(
						`mutation (${varDefs.join(', ')}) {
							create_group(${args.join(', ')}) {
								id
								title
								color
								position
								archived
							}
						}`,
						i,
						variables,
					);
					returnData.push({
						json: (data.create_group ?? {}) as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'updateGroup') {
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const groupId = this.getNodeParameter('groupId', i, undefined, {
						extractValue: true,
					}) as string;
					const fields = this.getNodeParameter('updateGroupFields', i, {}) as IDataObject;
					const newTitle = (fields.newTitle as string) || '';
					const groupColor = (fields.groupColor as string) || '';
					const position = (fields.groupPosition as string) || '';
					const anchorGroupId = (fields.positionGroupId as string) || '';

					if (!newTitle && !groupColor && !position) {
						throw new NodeOperationError(
							this.getNode(),
							'Set at least one field to update (New Title, Color, or Position)',
							{ itemIndex: i },
						);
					}
					if ((position === 'after' || position === 'before') && !anchorGroupId) {
						throw new NodeOperationError(
							this.getNode(),
							'Select the group this group should be moved before or after (Position: Relative To Group)',
							{ itemIndex: i },
						);
					}

					const updates: Parameters<typeof buildUpdateGroupMutation>[0] = [];
					if (newTitle) updates.push({ attribute: 'title', value: newTitle });
					if (groupColor) updates.push({ attribute: 'color', value: groupColor });
					if (position === 'after' || position === 'before') {
						updates.push({
							attribute:
								position === 'before' ? 'relative_position_before' : 'relative_position_after',
							value: anchorGroupId,
						});
					} else if (position === 'top' || position === 'bottom') {
						const groupsData = await client.execute(
							`query ($ids: [ID!]) {
								boards(ids: $ids) {
									groups { id position }
								}
							}`,
							i,
							{ ids: [boardId] },
						);
						const boards = (groupsData.boards ?? []) as Array<{
							groups?: Array<{ id: string; position: string }>;
						}>;
						const anchor = findEdgeGroupId(boards[0]?.groups ?? [], groupId, position);
						// No anchor means this is the board's only group — it's already
						// at both edges, so there is nothing to move.
						if (anchor) {
							updates.push({
								attribute:
									position === 'top' ? 'relative_position_before' : 'relative_position_after',
								value: anchor,
							});
						}
					}

					let group: IDataObject = {};
					if (updates.length > 0) {
						const { query, variables } = buildUpdateGroupMutation(updates);
						const data = await client.execute(query, i, { boardId, groupId, ...variables });
						// Aliases run in order, so merging in order leaves the final state.
						for (let u = 0; u < updates.length; u++) {
							group = { ...group, ...((data[`u${u}`] ?? {}) as IDataObject) };
						}
					} else {
						const data = await client.execute(
							`query ($ids: [ID!], $groupIds: [String]) {
								boards(ids: $ids) {
									groups(ids: $groupIds) {
										id
										title
										color
										position
										archived
									}
								}
							}`,
							i,
							{ ids: [boardId], groupIds: [groupId] },
						);
						const boards = (data.boards ?? []) as Array<{ groups?: IDataObject[] }>;
						group = boards[0]?.groups?.[0] ?? {};
					}
					returnData.push({ json: group, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getGroups') {
					const boardId = this.getNodeParameter('boardId', i, undefined, {
						extractValue: true,
					}) as string;
					const groupOptions = this.getNodeParameter('getGroupsOptions', i, {}) as IDataObject;
					const groupIds = normalizeIdList(groupOptions.groupIds);

					const data = await client.execute(
						`query ($boardId: [ID!], $groupIds: [String]) {
							boards(ids: $boardId) {
								groups(ids: $groupIds) {
									id
									title
									color
									position
									archived
								}
							}
						}`,
						i,
						{ boardId: [boardId], groupIds: groupIds.length > 0 ? groupIds : null },
					);
					const groups = ((data.boards ?? []) as Array<{ groups?: IDataObject[] }>)[0]?.groups ?? [];
					for (const group of groups) {
						returnData.push({ json: group, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'createTimelineItem') {
					const itemId = this.getNodeParameter('itemId', i, undefined, {
						extractValue: true,
					}) as string;
					const customActivityId = this.getNodeParameter('customActivityId', i) as string;
					const title = this.getNodeParameter('timelineItemTitle', i) as string;
					const fields = this.getNodeParameter('timelineItemFields', i, {}) as IDataObject;

					const input = buildTimelineItemInput(title, fields);
					if (input.error) {
						throw new NodeOperationError(this.getNode(), input.error, { itemIndex: i });
					}

					// created_at is deliberately NOT selected: resolving it on the
					// mutation return reliably 500s (verified live 2026-07-17,
					// error path ["create_timeline_item","created_at"]) — and the
					// item IS created before that failure, so retrying would
					// duplicate it. Use Get Timeline Item for the full record.
					const data = await client.execute(
						`mutation ($itemId: ID!, $customActivityId: String!, $title: String!, $timestamp: ISO8601DateTime!, $summary: String, $content: String, $location: String, $phone: String, $url: String, $timeRange: TimelineItemTimeRange) {
							create_timeline_item(item_id: $itemId, custom_activity_id: $customActivityId, title: $title, timestamp: $timestamp, summary: $summary, content: $content, location: $location, phone: $phone, url: $url, time_range: $timeRange) {
								id
								title
								content
								custom_activity_id
							}
						}`,
						i,
						{ itemId, customActivityId, ...input.variables },
					);
					returnData.push({
						json: { ...((data.create_timeline_item ?? {}) as IDataObject), itemId },
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'getTimelineItem') {
					const timelineItemId = this.getNodeParameter('timelineItemId', i) as string;
					const data = await client.execute(
						`query ($id: ID!) {
							timeline_item(id: $id) { ${TIMELINE_ITEM_FIELDS} }
						}`,
						i,
						{ id: timelineItemId },
					);
					const timelineItem = data.timeline_item as IDataObject | null;
					if (!timelineItem) {
						throw new NodeOperationError(
							this.getNode(),
							`Timeline item ${timelineItemId} not found. Note that only timeline items created via the API are visible — activities logged by users in the monday.com UI cannot be read.`,
							{ itemIndex: i },
						);
					}
					returnData.push({ json: timelineItem, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getTimelineItems') {
					const itemId = this.getNodeParameter('itemId', i, undefined, {
						extractValue: true,
					}) as string;
					const options = this.getNodeParameter('getTimelineItemsOptions', i, {}) as IDataObject;
					const rows = await fetchTimelineItems(client, i, itemId, {
						limit: (options.limit as number) ?? DEFAULT_LIMIT,
						skipConnectedItems: options.skipConnectedItems === true,
					});
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'deleteTimelineItem') {
					const timelineItemId = this.getNodeParameter('timelineItemId', i) as string;
					const data = await client.execute(
						`mutation ($id: String!) {
							delete_timeline_item(id: $id) { id title }
						}`,
						i,
						{ id: timelineItemId },
					);
					returnData.push({
						json: (data.delete_timeline_item ?? { id: timelineItemId }) as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'getCustomActivities') {
					const filters = this.getNodeParameter('customActivityFilters', i, {}) as IDataObject;
					const data = await client.execute(
						`query ($name: String) {
							custom_activity(name: $name) { id name type color icon_id }
						}`,
						i,
						{ name: (filters.name as string) || null },
					);
					for (const activity of (data.custom_activity ?? []) as IDataObject[]) {
						returnData.push({ json: activity, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'createCustomActivity') {
					const name = this.getNodeParameter('customActivityName', i) as string;
					const color = this.getNodeParameter('customActivityColor', i) as string;
					const iconId = this.getNodeParameter('customActivityIcon', i) as string;
					const data = await client.execute(
						`mutation ($name: String!, $color: CustomActivityColor!, $iconId: CustomActivityIcon!) {
							create_custom_activity(name: $name, color: $color, icon_id: $iconId) {
								id
								name
								color
								icon_id
								type
							}
						}`,
						i,
						{ name, color, iconId },
					);
					returnData.push({
						json: (data.create_custom_activity ?? {}) as IDataObject,
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'deleteCustomActivity') {
					const customActivityId = this.getNodeParameter('customActivityId', i) as string;
					// Selecting `id` in the return fields of delete_custom_activity
					// triggers a 500 from the API (verified live 2026-07-17) — ask
					// for `name` only and echo the input ID instead.
					const data = await client.execute(
						`mutation ($id: String!) {
							delete_custom_activity(id: $id) { name }
						}`,
						i,
						{ id: customActivityId },
					);
					returnData.push({
						json: {
							id: customActivityId,
							name: ((data.delete_custom_activity ?? {}) as IDataObject).name ?? null,
						},
						pairedItem: { item: i },
					});
					continue;
				}

				if (operation === 'createNotification') {
					const rows = await createNotifications.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getUser') {
					const userId = this.getNodeParameter('userId', i, undefined, {
						extractValue: true,
					}) as string;
					const getUserOptions = this.getNodeParameter('getUserOptions', i, {}) as IDataObject;
					const data = await client.execute(
						`query ($ids: [ID!]) {
							users(ids: $ids) { ${buildUserFieldSelection(getUserOptions.includeExtendedInfo === true)} }
						}`,
						i,
						{ ids: [userId] },
					);
					const user = ((data.users ?? []) as IDataObject[])[0];
					if (!user) {
						throw new NodeOperationError(this.getNode(), `User ${userId} not found`, {
							itemIndex: i,
						});
					}
					returnData.push({ json: user, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getUsers') {
					const rows = await getManyUsers.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getUserActivityLogs') {
					const rows = await getUserActivityLogs.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getDirectoryResources') {
					const rows = await getManyDirectoryResources.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getMeeting') {
					const data = await getMeeting.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getMeetings') {
					const rows = await getManyMeetings.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (SEARCH_OPERATION_ENTITY[operation] !== undefined) {
					const rows = await searchAcrossAccount.call(this, client, i, operation);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'updateDirectoryResourceAttributes') {
					const data = await updateDirectoryResourceAttributes.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getDepartments') {
					const rows = await getManyDepartments.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'createDepartment' || operation === 'updateDepartment') {
					const data = await upsertDepartment.call(this, client, i, operation);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'deleteDepartment') {
					const data = await deleteDepartment.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'assignDepartmentMembers') {
					const rows = await assignDepartmentMembers.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'assignDepartmentOwners') {
					const rows = await assignDepartmentOwners.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'unassignDepartmentOwners') {
					const rows = await unassignDepartmentOwners.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'clearUsersDepartment') {
					const rows = await clearUsersDepartment.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'createArticle') {
					const data = await createArticle.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'publishArticle') {
					const data = await publishArticle.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'deleteArticle') {
					const data = await deleteArticle.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getArticles') {
					const rows = await getManyArticles.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getArticleBlocks') {
					const rows = await getArticleBlocks.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'searchKnowledgeBase') {
					const data = await searchKnowledgeBase.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (
					operation === 'createForm' ||
					operation === 'getForm' ||
					operation === 'updateForm' ||
					operation === 'updateFormSettings' ||
					operation === 'activateOrDeactivateForm' ||
					operation === 'setFormPassword' ||
					operation === 'shortenFormUrl' ||
					operation === 'createFormQuestion' ||
					operation === 'updateFormQuestion' ||
					operation === 'deleteFormQuestion' ||
					operation === 'createFormTag' ||
					operation === 'deleteFormTag'
				) {
					const data = await executeFormOperation.call(this, client, i, operation);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createBoard') {
					const data = await createBoard.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createDoc') {
					const data = await createDoc.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getDoc') {
					const data = await getDoc.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getDocs') {
					const rows = await getManyDocs.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getDocBlocks') {
					const rows = await getDocBlocks.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'addDocContent') {
					const data = await addDocContent.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'exportDocAsMarkdown') {
					const data = await exportDocAsMarkdown.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'importDocFromHtml') {
					const data = await importDocFromHtml.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'renameDoc') {
					const data = await renameDoc.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'duplicateDoc') {
					const data = await duplicateDoc.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'deleteDoc') {
					const data = await deleteDoc.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createDocBlock' || operation === 'updateDocBlock') {
					const data = await upsertDocBlock.call(this, client, i, operation);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'deleteDocBlocks') {
					const rows = await deleteDocBlocks.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'createFolder') {
					const data = await createFolder.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getFolders') {
					const rows = await getManyFolders.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'updateFolder') {
					const data = await updateFolder.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'deleteFolder') {
					const data = await deleteFolder.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getWorkspaceObjects') {
					const rows = await getWorkspaceObjects.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'moveObject') {
					const data = await moveWorkspaceObject.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getValidations') {
					const data = await getValidations.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'setRequiredColumn') {
					const data = await setRequiredColumn.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createValidationRule' || operation === 'updateValidationRule') {
					const data = await upsertValidationRule.call(this, client, i, operation);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'deleteValidationRule') {
					const data = await deleteValidationRule.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createPortfolio') {
					const data = await createPortfolio.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'createProject') {
					const data = await createProject.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'connectProjectToPortfolio') {
					const data = await connectProjectToPortfolio.call(this, client, i);
					returnData.push({ json: data, pairedItem: { item: i } });
					continue;
				}

				if (operation === 'getBoards') {
					const rows = await getManyBoards.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getItems') {
					const rows = await getManyItems.call(this, client, i);
					for (const row of rows) {
						returnData.push({ json: row, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'graphql') {
					const query = this.getNodeParameter('query', i) as string;
					const graphqlVariables = parseGraphqlVariables.call(this, i);
					const graphqlOptions = this.getNodeParameter('graphqlOptions', i, {}) as {
						apiVersion?: string;
						includeRequestInfo?: boolean;
					};

					if (graphqlOptions.apiVersion || graphqlOptions.includeRequestInfo) {
						const { data, requestInfo } = await client.executeWithInfo(query, i, graphqlVariables, {
							apiVersion: graphqlOptions.apiVersion,
						});
						const json = graphqlOptions.includeRequestInfo
							? {
									...data,
									requestInfo: buildRequestInfoOutput(
										requestInfo,
										graphqlOptions.apiVersion ?? MONDAY_API_VERSION,
									),
								}
							: data;
						returnData.push({ json, pairedItem: { item: i } });
					} else {
						const data = await client.execute(query, i, graphqlVariables);
						returnData.push({ json: data, pairedItem: { item: i } });
					}
					continue;
				}

				if (operation === 'getBoard') {
					const board = await getSingleBoard.call(this, client, i);
					returnData.push({ json: board, pairedItem: { item: i } });
					continue;
				}

				const query = this.getNodeParameter('query', i) as string;
				const data = await client.execute(query, i);

				returnData.push({
					json: data,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw ensureNodeError(this.getNode(), error);
			}
		}

		return [returnData];
	}
}

/**
 * Parses the GraphQL operation's Variables parameter. The json field yields
 * a string when typed by hand and an object when set via an expression.
 */
/**
 * Builds create_update's mentions_list from the Mention Users / Mention
 * Teams options. Users come from a searchable rows collection (or an
 * array/CSV via expressions); teams from a bounded multiOptions dropdown.
 */
export function buildMentionsList(
	userIds: unknown,
	teamIds: unknown,
): Array<{ id: string; type: string }> {
	return [
		...extractUserRowIds(userIds).map((id) => ({ id, type: 'User' })),
		...normalizeIdList(teamIds).map((id) => ({ id, type: 'Team' })),
	];
}

export function parseGraphqlVariables(
	this: IExecuteFunctions,
	itemIndex: number,
): Record<string, unknown> | undefined {
	const raw = this.getNodeParameter('variables', itemIndex, '{}');
	if (raw === null || raw === undefined || raw === '') return undefined;
	if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;

	let parsed: unknown;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch {
			parsed = undefined;
		}
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(
			this.getNode(),
			'Variables must be a valid JSON object, e.g. {"boardId": [123]}',
			{ itemIndex },
		);
	}
	const asObject = parsed as Record<string, unknown>;
	return Object.keys(asObject).length > 0 ? asObject : undefined;
}

/**
 * Maps the Group: Create Position option to create_group's positioning
 * arguments. Verified live (2026-07): `after_at` without `relative_to` puts
 * the group at the top of the board, `before_at` without `relative_to` at the
 * bottom; with `relative_to` they mean below/above that group. No option set
 * means no arguments — the API default is the top of the board.
 */
export function buildGroupPositionArgs(
	position: string | undefined,
	anchorGroupId: string | undefined,
): { method?: 'after_at' | 'before_at'; relativeTo?: string } | 'missing-anchor' {
	if (!position) return {};
	if (position === 'top') return { method: 'after_at' };
	if (position === 'bottom') return { method: 'before_at' };
	if (!anchorGroupId) return 'missing-anchor';
	return { method: position === 'before' ? 'before_at' : 'after_at', relativeTo: anchorGroupId };
}

/**
 * Finds the top-most (lowest numeric position) or bottom-most (highest)
 * group of a board, excluding the given group — the anchor a group is
 * repositioned before/after for the "At Top" / "At Bottom" placements.
 */
export function findEdgeGroupId(
	groups: Array<{ id: string; position: string }>,
	excludeGroupId: string,
	edge: 'top' | 'bottom',
): string | undefined {
	let found: { id: string; position: number } | undefined;
	for (const group of groups) {
		if (group.id === excludeGroupId) continue;
		const value = Number.parseFloat(group.position);
		if (!Number.isFinite(value)) continue;
		if (!found || (edge === 'bottom' ? value > found.position : value < found.position)) {
			found = { id: group.id, position: value };
		}
	}
	return found?.id;
}

/**
 * Builds one aliased request applying each update_group attribute change in
 * order (update_group takes exactly one attribute per mutation). NOT atomic:
 * a failing alias doesn't roll back or stop the others (verified live) — the
 * UI description warns about this.
 */
export function buildUpdateGroupMutation(
	updates: Array<{ attribute: 'title' | 'color' | GroupRepositionAttribute; value: string }>,
): { query: string; variables: Record<string, string> } {
	const variables: Record<string, string> = {};
	const varDefs = ['$boardId: ID!', '$groupId: String!'];
	const aliases = updates.map((update, index) => {
		varDefs.push(`$value${index}: String!`);
		variables[`value${index}`] = update.value;
		return `u${index}: update_group(board_id: $boardId, group_id: $groupId, group_attribute: ${update.attribute}, new_value: $value${index}) { id title color position archived }`;
	});
	return {
		query: `mutation (${varDefs.join(', ')}) {\n${aliases.join('\n')}\n}`,
		variables,
	};
}

type GroupRepositionAttribute = 'relative_position_after' | 'relative_position_before';

/**
 * Resolves the archive-vs-delete choice for the unified Archive or Delete
 * operations. Legacy operation values (archiveItem/deleteItem) map directly;
 * the unified value reads the Action parameter (default: archive — the safe
 * choice by design).
 */
export function resolveArchiveOrDeleteAction(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): 'archive' | 'delete' {
	if (operation === 'archiveItem') return 'archive';
	if (operation === 'deleteItem') return 'delete';
	const action = this.getNodeParameter('archiveOrDeleteAction', itemIndex, 'archive') as string;
	return action === 'delete' ? 'delete' : 'archive';
}

/**
 * Board: Duplicate — duplicate_board. The API wraps the result in a
 * BoardDuplication object ({ board, is_async }); large boards may be
 * duplicated asynchronously, in which case is_async is true and the board
 * may still be filling up when the response returns.
 */
async function duplicateBoard(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const duplicateType = this.getNodeParameter('duplicateType', itemIndex) as string;
	const options = this.getNodeParameter('duplicateBoardOptions', itemIndex, {}) as IDataObject;

	const varDefs = ['$boardId: ID!', '$duplicateType: DuplicateBoardType!'];
	const args = ['board_id: $boardId', 'duplicate_type: $duplicateType'];
	const variables: Record<string, unknown> = { boardId, duplicateType };

	if (options.boardName) {
		varDefs.push('$boardName: String');
		args.push('board_name: $boardName');
		variables.boardName = options.boardName;
	}
	// Resource locator nested in a collection — see extractWorkspaceId.
	const duplicateWorkspaceId = extractWorkspaceId(options.workspaceId);
	if (duplicateWorkspaceId) {
		varDefs.push('$workspaceId: ID');
		args.push('workspace_id: $workspaceId');
		variables.workspaceId = duplicateWorkspaceId;
	}
	if (options.folderId) {
		varDefs.push('$folderId: ID');
		args.push('folder_id: $folderId');
		variables.folderId = options.folderId;
	}
	if (options.keepSubscribers === true) {
		args.push('keep_subscribers: true');
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			duplicate_board(${args.join(', ')}) {
				is_async
				board {
					id
					name
					state
					board_kind
					url
					workspace { id name }
				}
			}
		}`,
		itemIndex,
		variables,
	);

	const duplication = (data.duplicate_board ?? {}) as IDataObject & { board?: IDataObject };
	return { ...(duplication.board ?? {}), isAsync: duplication.is_async ?? false };
}

/**
 * Computes what Replace mode must remove: current members (users and teams,
 * both roles — owners are a subset of subscribers in the API) that are not in
 * the desired selection. The executing user is never removed — the API
 * silently keeps their ownership anyway (verified live), so removing them
 * would only produce a confusing half-applied state.
 */
export function buildReplacePlan(
	current: {
		subscribers?: SubscriberEntity[];
		owners?: SubscriberEntity[];
		team_subscribers?: SubscriberEntity[];
		team_owners?: SubscriberEntity[];
	},
	desiredUserIds: string[],
	desiredTeamIds: string[],
	executingUserId: string,
): { removeUserIds: string[]; removeTeamIds: string[]; keptExecutingUser: boolean } {
	const desiredUsers = new Set(desiredUserIds);
	const desiredTeams = new Set(desiredTeamIds);

	const currentUserIds = new Set<string>();
	for (const user of [...(current.subscribers ?? []), ...(current.owners ?? [])]) {
		if (user.id) currentUserIds.add(String(user.id));
	}
	const currentTeamIds = new Set<string>();
	for (const team of [...(current.team_subscribers ?? []), ...(current.team_owners ?? [])]) {
		if (team.id) currentTeamIds.add(String(team.id));
	}

	let keptExecutingUser = false;
	const removeUserIds: string[] = [];
	for (const id of currentUserIds) {
		if (desiredUsers.has(id)) continue;
		if (id === executingUserId) {
			keptExecutingUser = true;
			continue;
		}
		removeUserIds.push(id);
	}
	const removeTeamIds = [...currentTeamIds].filter((id) => !desiredTeams.has(id));

	return { removeUserIds, removeTeamIds, keptExecutingUser };
}

/**
 * Board: Update Subscribers — one operation with an Add/Remove Action
 * selector. Add = add_users_to_board/add_teams_to_board (with
 * subscriber-vs-owner kind), Remove = delete_subscribers_from_board/
 * delete_teams_from_board. Users and teams each need their own mutation;
 * all selections run in one request via aliases. Add supports two modes:
 * Append (default — just add) and Replace (read current membership, delete
 * everyone not selected, then add — re-adding an existing member with a
 * different kind changes their role, verified live).
 */
async function changeBoardSubscribers(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const userIds = extractUserRowIds(this.getNodeParameter('subscriberUserIds', itemIndex, {}));
	const teamIds = normalizeIdList(this.getNodeParameter('subscriberTeamIds', itemIndex, []));

	if (userIds.length === 0 && teamIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Select at least one user or team', {
			itemIndex,
		});
	}

	const action = this.getNodeParameter('subscribersAction', itemIndex, 'add') as string;
	const removing = action === 'remove';
	// The explicit fallbacks matter: params hidden by the Action selector
	// have no stored value in the workflow JSON.
	const kind = removing
		? undefined
		: (this.getNodeParameter('subscriberKind', itemIndex, 'subscriber') as string);
	const options = removing
		? {}
		: (this.getNodeParameter('updateSubscribersOptions', itemIndex, {}) as IDataObject);
	const replacing = options.mode === 'replace';

	// Replace needs the current membership (to diff) and the executing user
	// (never removed — the API silently preserves their ownership anyway).
	let replacePlan: ReturnType<typeof buildReplacePlan> | undefined;
	if (replacing) {
		const current = await client.execute(
			`query ($ids: [ID!]) {
				me { id }
				boards(ids: $ids) {
					subscribers { id }
					owners { id }
					team_subscribers { id }
					team_owners { id }
				}
			}`,
			itemIndex,
			{ ids: [boardId] },
		);
		const board = ((current.boards ?? []) as Array<Parameters<typeof buildReplacePlan>[0]>)[0];
		if (!board) {
			throw new NodeOperationError(this.getNode(), `Board ${boardId} not found`, { itemIndex });
		}
		const meId = String(((current.me ?? {}) as IDataObject).id ?? '');
		replacePlan = buildReplacePlan(board, userIds, teamIds, meId);
	}

	const varDefs = ['$boardId: ID!'];
	const selections: string[] = [];
	const variables: Record<string, unknown> = { boardId };

	// Deletions go first: top-level mutation fields run serially, so the adds
	// below see the post-removal state.
	if (replacePlan && replacePlan.removeUserIds.length > 0) {
		varDefs.push('$removeUserIds: [ID!]!');
		variables.removeUserIds = replacePlan.removeUserIds;
		selections.push(
			'removedUsers: delete_subscribers_from_board(board_id: $boardId, user_ids: $removeUserIds) { id name email }',
		);
	}
	if (replacePlan && replacePlan.removeTeamIds.length > 0) {
		varDefs.push('$removeTeamIds: [ID!]!');
		variables.removeTeamIds = replacePlan.removeTeamIds;
		selections.push(
			'removedTeams: delete_teams_from_board(board_id: $boardId, team_ids: $removeTeamIds) { id name }',
		);
	}
	if (userIds.length > 0) {
		varDefs.push('$userIds: [ID!]!');
		variables.userIds = userIds;
		selections.push(
			removing
				? 'users: delete_subscribers_from_board(board_id: $boardId, user_ids: $userIds) { id name email }'
				: `users: add_users_to_board(board_id: $boardId, user_ids: $userIds, kind: ${kind}) { id name email }`,
		);
	}
	if (teamIds.length > 0) {
		varDefs.push('$teamIds: [ID!]!');
		variables.teamIds = teamIds;
		selections.push(
			removing
				? 'teams: delete_teams_from_board(board_id: $boardId, team_ids: $teamIds) { id name }'
				: `teams: add_teams_to_board(board_id: $boardId, team_ids: $teamIds, kind: ${kind}) { id name }`,
		);
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			${selections.join('\n')}
		}`,
		itemIndex,
		variables,
	);

	return {
		boardId,
		action: removing ? 'removed' : replacing ? 'replaced' : 'added',
		...(kind ? { kind } : {}),
		users: (data.users ?? []) as IDataObject[],
		teams: (data.teams ?? []) as IDataObject[],
		...(replacePlan
			? {
					removedUsers: (data.removedUsers ?? []) as IDataObject[],
					removedTeams: (data.removedTeams ?? []) as IDataObject[],
					keptExecutingUser: replacePlan.keptExecutingUser,
				}
			: {}),
	};
}

interface SubscriberEntity extends IDataObject {
	id?: string;
	name?: string;
	email?: string;
}

/**
 * Shapes the Board: List Subscribers output — one row per user/team, with
 * `type` (user/team) and `role` (subscriber/owner). A user who is both an
 * owner and a subscriber appears once per role.
 */
export function buildSubscriberRows(board: {
	subscribers?: SubscriberEntity[];
	owners?: SubscriberEntity[];
	team_subscribers?: SubscriberEntity[];
	team_owners?: SubscriberEntity[];
}): IDataObject[] {
	const rows: IDataObject[] = [];
	for (const user of board.owners ?? []) {
		rows.push({ type: 'user', role: 'owner', ...user });
	}
	for (const user of board.subscribers ?? []) {
		rows.push({ type: 'user', role: 'subscriber', ...user });
	}
	for (const team of board.team_owners ?? []) {
		rows.push({ type: 'team', role: 'owner', ...team });
	}
	for (const team of board.team_subscribers ?? []) {
		rows.push({ type: 'team', role: 'subscriber', ...team });
	}
	return rows;
}

/**
 * The user field set for board subscriber/owner rows. Users have no
 * pagination arguments on these connections — the API returns the full list.
 */
const SUBSCRIBER_USER_FIELDS = '{ id name email kind status title }';

/**
 * Team subscriber/owner connections ARE paginated (API default: first 25,
 * which silently truncated larger accounts before this was found). One page
 * of 1,000 is requested; the cap is documented on the toggles as a
 * limitation.
 */
export const TEAM_SUBSCRIBERS_LIMIT = 1000;
const SUBSCRIBER_TEAM_FIELDS = `(limit: ${TEAM_SUBSCRIBERS_LIMIT}, page: 1) { id name is_guest picture_url }`;

/**
 * Builds the boards(ids:) field selection for List Subscribers from the four
 * include toggles — only toggled-on connections are queried (each one adds
 * complexity cost).
 */
export function buildSubscribersSelection(include: {
	subscribers: boolean;
	owners: boolean;
	teamSubscribers: boolean;
	teamOwners: boolean;
}): string {
	const selections: string[] = [];
	if (include.subscribers) selections.push(`subscribers ${SUBSCRIBER_USER_FIELDS}`);
	if (include.owners) selections.push(`owners ${SUBSCRIBER_USER_FIELDS}`);
	if (include.teamSubscribers) selections.push(`team_subscribers${SUBSCRIBER_TEAM_FIELDS}`);
	if (include.teamOwners) selections.push(`team_owners${SUBSCRIBER_TEAM_FIELDS}`);
	return selections.join('\n\t\t\t\t');
}

/** Board: List Subscribers — users and teams, subscribers and owners. */
async function getBoardSubscribers(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const include = {
		subscribers: this.getNodeParameter('includeSubscribers', itemIndex, true) as boolean,
		owners: this.getNodeParameter('includeOwners', itemIndex, true) as boolean,
		teamSubscribers: this.getNodeParameter('includeTeamSubscribers', itemIndex, true) as boolean,
		teamOwners: this.getNodeParameter('includeTeamOwners', itemIndex, true) as boolean,
	};
	const selection = buildSubscribersSelection(include);
	if (!selection) {
		throw new NodeOperationError(
			this.getNode(),
			'Turn on at least one of the Include toggles — with all four off there is nothing to return',
			{ itemIndex },
		);
	}
	const data = await client.execute(
		`query ($ids: [ID!]) {
			boards(ids: $ids) {
				${selection}
			}
		}`,
		itemIndex,
		{ ids: [boardId] },
	);
	const board = ((data.boards ?? []) as Array<Parameters<typeof buildSubscriberRows>[0]>)[0];
	if (!board) {
		throw new NodeOperationError(this.getNode(), `Board ${boardId} not found`, { itemIndex });
	}
	return buildSubscriberRows(board);
}

interface ActivityLogRow extends IDataObject {
	id?: string;
	event?: string;
	entity?: string;
	data?: string | null;
	user_id?: string;
	account_id?: string;
	created_at?: string;
}

/**
 * Shapes one activity log event: the `data` field arrives as a JSON string
 * (parsed here for the user), and `created_at` is a 17-digit UNIX timestamp
 * in ten-millionths of a second (converted to ISO in `createdAt`).
 */
export function formatActivityLogRow(row: ActivityLogRow): IDataObject {
	let parsedData: unknown = row.data ?? null;
	if (typeof row.data === 'string') {
		const parsed = safeJsonParse(row.data);
		if (parsed !== undefined) parsedData = parsed;
	}
	let createdAt: string | null = null;
	if (row.created_at) {
		const numeric = Number(row.created_at);
		if (!Number.isNaN(numeric) && numeric > 0) {
			createdAt = new Date(numeric / 10000).toISOString();
		}
	}
	return {
		id: row.id ?? null,
		event: row.event ?? null,
		entity: row.entity ?? null,
		userId: row.user_id ?? null,
		accountId: row.account_id ?? null,
		createdAt,
		createdAtRaw: row.created_at ?? null,
		data: parsedData as IDataObject,
	};
}

/**
 * Board: List Activity Logs — boards(ids:){ activity_logs(...) } with
 * date-range and entity filters, limit/page under Options.
 */
async function getActivityLogs(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const filters = this.getNodeParameter('activityLogFilters', itemIndex, {}) as IDataObject;
	const options = this.getNodeParameter('activityLogOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const page = (options.page as number) ?? 1;

	const varDefs = ['$ids: [ID!]', '$limit: Int!', '$page: Int!'];
	const args = ['limit: $limit', 'page: $page'];
	const variables: Record<string, unknown> = { ids: [boardId], limit, page };

	if (filters.from) {
		varDefs.push('$from: ISO8601DateTime');
		args.push('from: $from');
		variables.from = toIso8601(filters.from);
	}
	if (filters.to) {
		varDefs.push('$to: ISO8601DateTime');
		args.push('to: $to');
		variables.to = toIso8601(filters.to);
	}
	const userIds = extractUserRowIds(filters.userIds);
	if (userIds.length > 0) {
		varDefs.push('$userIds: [ID!]');
		args.push('user_ids: $userIds');
		variables.userIds = userIds;
	}
	const columnIds = normalizeIdList(filters.columnIds);
	if (columnIds.length > 0) {
		varDefs.push('$columnIds: [String!]');
		args.push('column_ids: $columnIds');
		variables.columnIds = columnIds;
	}
	const groupIds = normalizeIdList(filters.groupIds);
	if (groupIds.length > 0) {
		varDefs.push('$groupIds: [String!]');
		args.push('group_ids: $groupIds');
		variables.groupIds = groupIds;
	}
	const itemIds = normalizeIdList(filters.itemIds);
	if (itemIds.length > 0) {
		varDefs.push('$itemIds: [ID!]');
		args.push('item_ids: $itemIds');
		variables.itemIds = itemIds;
	}

	const data = await client.execute(
		`query (${varDefs.join(', ')}) {
			boards(ids: $ids) {
				activity_logs(${args.join(', ')}) {
					id
					event
					entity
					data
					user_id
					account_id
					created_at
				}
			}
		}`,
		itemIndex,
		variables,
	);

	const logs =
		((data.boards ?? []) as Array<{ activity_logs?: ActivityLogRow[] }>)[0]?.activity_logs ?? [];
	return logs.map(formatActivityLogRow);
}

/** Per-request page size for the user activity log cursor loop. */
const USER_ACTIVITY_LOGS_PAGE_SIZE = 100;
/** Hard stop for the cursor loop, matching the pagination helpers' cap. */
const USER_ACTIVITY_LOGS_MAX_PAGES = 1000;

/**
 * User: List Activity Logs — users(ids:){ activity_logs(...) }, available
 * from API 2026-10. Cursor-paginated (newest first); board, event-type and
 * time-range filters. Verified live 2026-07-19: filters and cursor can be
 * sent together, so resumed pages keep the filters. Rows share the board
 * activity log shape (17-digit created_at → ISO via formatActivityLogRow).
 */
async function getUserActivityLogs(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const userId = this.getNodeParameter('userId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const filters = this.getNodeParameter('userActivityLogFilters', itemIndex, {}) as IDataObject;
	const options = this.getNodeParameter('userActivityLogOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const includeCursor = options.includeCursor === true;
	let cursor: string | null = (((options.startingCursor ?? '') as string) || '').trim() || null;

	const varDefs = ['$ids: [ID!]', '$limit: Int'];
	const args = ['limit: $limit'];
	const baseVariables: Record<string, unknown> = { ids: [userId] };

	// The from/to arguments are plain String in the schema; ISO 8601 works.
	if (filters.from) {
		varDefs.push('$from: String');
		args.push('from: $from');
		baseVariables.from = toIso8601(filters.from);
	}
	if (filters.to) {
		varDefs.push('$to: String');
		args.push('to: $to');
		baseVariables.to = toIso8601(filters.to);
	}
	const boardIds = normalizeIdList(filters.boardIds);
	if (boardIds.length > 0) {
		varDefs.push('$boardIds: [ID!]');
		args.push('board_ids: $boardIds');
		baseVariables.boardIds = boardIds;
	}
	const eventTypes = normalizeIdList(filters.eventTypes);
	if (eventTypes.length > 0) {
		varDefs.push('$eventTypes: [String!]');
		args.push('event_types: $eventTypes');
		baseVariables.eventTypes = eventTypes;
	}
	varDefs.push('$cursor: String');
	args.push('cursor: $cursor');

	const query = `query (${varDefs.join(', ')}) {
		users(ids: $ids) {
			activity_logs(${args.join(', ')}) {
				cursor
				logs { id event entity data user_id created_at }
			}
		}
	}`;

	const rows: IDataObject[] = [];
	for (let page = 1; page <= USER_ACTIVITY_LOGS_MAX_PAGES; page++) {
		const pageLimit = Math.min(limit - rows.length, USER_ACTIVITY_LOGS_PAGE_SIZE);
		const data = await client.execute(query, itemIndex, {
			...baseVariables,
			limit: pageLimit,
			cursor,
		});
		const users = (data.users ?? []) as Array<{
			activity_logs?: { cursor?: string | null; logs?: ActivityLogRow[] };
		}>;
		if (users.length === 0) {
			throw new NodeOperationError(this.getNode(), `User ${userId} not found`, { itemIndex });
		}
		const pageResult = users[0]?.activity_logs ?? {};
		const logs = pageResult.logs ?? [];
		rows.push(...logs.map((log) => ({ ...formatActivityLogRow(log), targetUserId: userId })));
		cursor = pageResult.cursor ?? null;
		if (!cursor || logs.length < pageLimit || rows.length >= limit) break;
	}

	return includeCursor ? [...rows, { nextCursor: cursor }] : rows;
}

/**
 * Audit Log: Get Many — audit_logs(...) with event/user/IP/time filters,
 * limit/page under Options. Enterprise-only per the docs (admin token with
 * manage_account_security); fetchAuditLogs handles the API's silent 200-row
 * page cap so Limit works up to 1,000 (see auditLogs.ts).
 */
async function getManyAuditLogs(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const filters = this.getNodeParameter('auditLogFilters', itemIndex, {}) as IDataObject;
	const options = this.getNodeParameter('auditLogOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const page = (options.page as number) ?? 1;

	return await fetchAuditLogs({
		client,
		itemIndex,
		limit,
		page,
		filters: {
			// The User filter is a resourceLocator nested in the collection —
			// extractValue can't reach it, so unwrap manually.
			userId: extractUserLocatorId(filters.userId),
			events: normalizeIdList(filters.events),
			ipAddress: ((filters.ipAddress as string) || '').trim() || undefined,
			startTime: toIso8601(filters.startTime),
			endTime: toIso8601(filters.endTime),
		},
	});
}

/** Hard cap on notification recipients per run — one aliased request. */
export const MAX_NOTIFICATION_RECIPIENTS = 30;

/**
 * Builds the aliased create_notification batch: one mutation field per
 * recipient sharing the target/text variables. Exported for tests.
 */
export function buildCreateNotificationsMutation(
	userIds: string[],
	targetType: 'Project' | 'Post',
): { query: string; varDefs: string[] } {
	const varDefs = ['$targetId: ID!', '$text: String!'];
	const aliases: string[] = [];
	userIds.forEach((userId, index) => {
		varDefs.push(`$user${index}: ID!`);
		aliases.push(
			`notify${index}: create_notification(user_id: $user${index}, target_id: $targetId, text: $text, target_type: ${targetType}) { text }`,
		);
	});
	return {
		query: `mutation (${varDefs.join(', ')}) {\n\t${aliases.join('\n\t')}\n}`,
		varDefs,
	};
}

/**
 * Notification: Create — one aliased request notifying up to 30 users about
 * the same target. The Target selector picks what the notification links to:
 * Item / Board (both target_type Project) or Update (target_type Post), each
 * with its own picker instead of a raw ID field. The API returns only
 * { text }, so recipients/target are echoed per row; per-user failures map
 * back via the error path (the batch is not atomic).
 */
async function createNotifications(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const userIds = [
		...new Set(extractUserRowIds(this.getNodeParameter('notificationUserIds', itemIndex, {}))),
	];
	if (userIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Select at least one user to notify', {
			itemIndex,
		});
	}
	if (userIds.length > MAX_NOTIFICATION_RECIPIENTS) {
		throw new NodeOperationError(
			this.getNode(),
			`Too many recipients: ${userIds.length} selected, but Create Notification handles at most ${MAX_NOTIFICATION_RECIPIENTS} users per run. Split the list across multiple runs.`,
			{ itemIndex },
		);
	}

	const text = this.getNodeParameter('text', itemIndex) as string;
	const target = this.getNodeParameter('notificationTarget', itemIndex, 'item') as string;

	let targetId: string;
	if (target === 'board') {
		targetId = this.getNodeParameter('boardId', itemIndex, undefined, {
			extractValue: true,
		}) as string;
	} else if (target === 'update') {
		targetId = this.getNodeParameter('notificationUpdateId', itemIndex) as string;
	} else {
		targetId = this.getNodeParameter('itemId', itemIndex, undefined, {
			extractValue: true,
		}) as string;
	}
	if (!targetId) {
		throw new NodeOperationError(this.getNode(), `Select the ${target} the notification links to`, {
			itemIndex,
		});
	}
	const targetType: 'Project' | 'Post' = target === 'update' ? 'Post' : 'Project';

	const { query } = buildCreateNotificationsMutation(userIds, targetType);
	const variables: Record<string, unknown> = { targetId, text };
	userIds.forEach((userId, index) => {
		variables[`user${index}`] = userId;
	});

	const { data, errors } = await client.executeBulk(query, itemIndex, variables);

	const failures: Array<{ userId: string; message: string }> = [];
	const rows = userIds.map((userId, index) => {
		const payload = data[`notify${index}`] as IDataObject | null | undefined;
		const base = { userId, target, targetId, targetType };
		if (payload) {
			return { ...base, text: payload.text ?? text, success: true } as IDataObject;
		}
		const failure = errors.find((error) => error.path?.[0] === `notify${index}`);
		const message = failure?.message ?? 'Unknown error';
		failures.push({ userId, message });
		return {
			...base,
			success: false,
			error: message,
			errorCode: failure?.extensions?.code ?? failure?.error_code ?? null,
		} as IDataObject;
	});

	if (failures.length > 0 && !this.continueOnFail()) {
		const detail = failures.map((failure) => `${failure.userId} (${failure.message})`).join(', ');
		throw new NodeOperationError(
			this.getNode(),
			`${failures.length} of ${userIds.length} notifications failed: ${detail}. The other recipients were still notified.`,
			{ itemIndex },
		);
	}

	return rows;
}

/**
 * Shapes one Column: Get Many row — settings_str is parsed into a
 * `settings` object so expressions can address label maps etc. directly.
 * `rollup` carries the calculated capability (multi-level boards): its
 * presence marks a rollup column; null on classic boards and plain columns.
 */
export function formatColumnSchemaRow(column: IDataObject): IDataObject {
	let settings: unknown = null;
	if (typeof column.settings_str === 'string' && column.settings_str !== '') {
		const parsed = safeJsonParse(column.settings_str);
		if (parsed !== undefined) settings = parsed;
	}
	const capabilities = column.capabilities as
		| { calculated?: { function?: string; calculated_type?: string } | null }
		| null
		| undefined;
	return {
		id: column.id ?? null,
		title: column.title ?? null,
		type: column.type ?? null,
		description: column.description ?? null,
		settings: settings as IDataObject,
		rollup: (capabilities?.calculated as IDataObject | undefined) ?? null,
	};
}

/**
 * Pre-flight guard for the Rollup Function option on Column Create/Update
 * (multi-level boards). Validates the picked function against the column
 * type via validateRollupFunction and throws the friendly error instead of
 * letting the API answer with a cryptic 500. No-op when no function is set.
 */
export function assertRollupFunctionAllowed(
	node: ReturnType<IExecuteFunctions['getNode']>,
	itemIndex: number,
	columnType: string,
	rollupFunction: string,
): void {
	if (!rollupFunction) return;
	const validationError = validateRollupFunction(columnType, rollupFunction);
	if (validationError) {
		throw new NodeOperationError(node, validationError, { itemIndex });
	}
}

/**
 * Column: Update — change_column_title and/or change_column_metadata
 * (description). Only the fields the user filled in are changed.
 */
/**
 * Fetches the type, current revision (required by the update mutations for
 * optimistic concurrency), and typed settings of one column, in one call.
 */
async function fetchColumnForEdit(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	boardId: string,
	columnId: string,
): Promise<{ type: string; revision: string; settings: IDataObject }> {
	const data = await client.execute(
		`query ($ids: [ID!]) { boards(ids: $ids) { columns { id type revision settings } } }`,
		itemIndex,
		{ ids: [boardId] },
	);
	const boards = (data.boards ?? []) as Array<{
		columns?: Array<{ id: string; type: string; revision: string; settings?: IDataObject }>;
	}>;
	const column = boards[0]?.columns?.find((candidate) => candidate.id === columnId);
	if (!column) {
		throw new NodeOperationError(
			this.getNode(),
			`Column "${columnId}" was not found on board ${boardId}`,
			{ itemIndex },
		);
	}
	return { type: column.type, revision: column.revision, settings: column.settings ?? {} };
}

async function updateColumn(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const columnId = this.getNodeParameter('updateColumnId', itemIndex) as string;
	const newTitle = (this.getNodeParameter('newColumnTitle', itemIndex, '') as string).trim();
	const newDescription = (
		this.getNodeParameter('newColumnDescription', itemIndex, '') as string
	).trim();
	const options = this.getNodeParameter('updateColumnOptions', itemIndex, {}) as IDataObject;

	let settings: IDataObject | undefined;
	if (options.settingsJson && options.settingsJson !== '{}') {
		const parsed =
			typeof options.settingsJson === 'string'
				? safeJsonParse(options.settingsJson as string)
				: options.settingsJson;
		if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
			throw new NodeOperationError(this.getNode(), 'Settings (JSON) must be a valid JSON object', {
				itemIndex,
			});
		}
		settings = parsed as IDataObject;
	}
	const width = options.width as number | undefined;
	const rollupFunction = (options.rollupFunction as string) || '';

	if (!newTitle && !newDescription && !settings && width === undefined && !rollupFunction) {
		throw new NodeOperationError(
			this.getNode(),
			'Set a new title, description, width, settings, or rollup function for the column',
			{ itemIndex },
		);
	}

	// Settings/width/rollup need the generic update_column mutation, which
	// wants the column's type and current revision — one bounded read. The
	// mutation's settings JSON must be a real object (a JSON string fails
	// validation) and merges with the current settings at the top level
	// (verified live).
	if (settings || width !== undefined || rollupFunction) {
		const column = await fetchColumnForEdit.call(this, client, itemIndex, boardId, columnId);
		assertRollupFunctionAllowed(this.getNode(), itemIndex, column.type, rollupFunction);
		const data = await client.execute(
			`mutation ($boardId: ID!, $columnId: String!, $columnType: ColumnType!, $revision: String!, $title: String, $description: String, $width: Int, $settings: JSON, $capabilities: ColumnCapabilitiesInput) {
				update_column(
					board_id: $boardId,
					id: $columnId,
					column_type: $columnType,
					revision: $revision,
					title: $title,
					description: $description,
					width: $width,
					settings: $settings,
					capabilities: $capabilities
				) { id title type description width settings_str capabilities { calculated { function } } }
			}`,
			itemIndex,
			{
				boardId,
				columnId,
				columnType: column.type,
				revision: column.revision,
				// Unset arguments are OMITTED, not sent as null: update_column
				// schema-validates an explicit settings: null ("must be object")
				// when capabilities is present (verified live). An unprovided
				// nullable variable counts as an omitted argument per GraphQL.
				title: newTitle || undefined,
				description: newDescription || undefined,
				width,
				settings,
				capabilities: rollupFunction ? { calculated: { function: rollupFunction } } : undefined,
			},
		);
		return (data.update_column ?? {}) as IDataObject;
	}

	let result: IDataObject = {};
	if (newTitle) {
		const data = await client.execute(
			`mutation ($boardId: ID!, $columnId: String!, $title: String!) {
				change_column_title(board_id: $boardId, column_id: $columnId, title: $title) {
					id
					title
					description
				}
			}`,
			itemIndex,
			{ boardId, columnId, title: newTitle },
		);
		result = (data.change_column_title ?? {}) as IDataObject;
	}
	if (newDescription) {
		const data = await client.execute(
			`mutation ($boardId: ID!, $columnId: String!, $value: String!) {
				change_column_metadata(
					board_id: $boardId,
					column_id: $columnId,
					column_property: description,
					value: $value
				) {
					id
					title
					description
				}
			}`,
			itemIndex,
			{ boardId, columnId, value: newDescription },
		);
		result = (data.change_column_metadata ?? {}) as IDataObject;
	}
	return result;
}

/** The GraphQL for one full-label-set write, per column kind. */
const LABEL_UPDATE_MUTATIONS: Record<string, string> = {
	status: `mutation ($boardId: ID!, $columnId: String!, $revision: String!, $labels: [UpdateStatusLabelInput!]!) {
		update_status_column(board_id: $boardId, id: $columnId, revision: $revision, settings: { labels: $labels }) {
			id title type settings
		}
	}`,
	dropdown: `mutation ($boardId: ID!, $columnId: String!, $revision: String!, $labels: [UpdateDropdownLabelInput!]!) {
		update_dropdown_column(board_id: $boardId, id: $columnId, revision: $revision, settings: { labels: $labels }) {
			id title type settings
		}
	}`,
};

/**
 * Reads the column being label-edited and validates it matches the picked
 * kind (the update mutations are kind-specific). Returns its labels too —
 * the mutations replace the whole label set, so edits are read-modify-write.
 */
async function readLabelColumn(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	boardId: string,
): Promise<{ columnId: string; kind: string; revision: string; labels: ExistingLabel[] }> {
	const kind = this.getNodeParameter('labelColumnKind', itemIndex) as string;
	const columnId = this.getNodeParameter('labelColumnId', itemIndex) as string;

	const column = await fetchColumnForEdit.call(this, client, itemIndex, boardId, columnId);
	if (column.type !== kind) {
		throw new NodeOperationError(
			this.getNode(),
			`Column "${columnId}" is a ${column.type} column, not a ${kind} column — fix the Column Kind parameter`,
			{ itemIndex },
		);
	}
	const labels = (column.settings.labels ?? []) as ExistingLabel[];
	return { columnId, kind, revision: column.revision, labels };
}

/**
 * Column: Add Label — appends one label to a status/dropdown column via the
 * typed update mutations, re-sending all existing labels (with their ids, so
 * they keep their identity) plus the new one.
 */
async function addColumnLabel(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const labelName = (this.getNodeParameter('newLabelName', itemIndex) as string).trim();
	if (!labelName) {
		throw new NodeOperationError(this.getNode(), 'Label Name must not be empty', { itemIndex });
	}

	const { columnId, kind, revision, labels } = await readLabelColumn.call(
		this,
		client,
		itemIndex,
		boardId,
	);

	let rows: IDataObject[];
	if (kind === 'status') {
		const options = this.getNodeParameter('addColumnLabelOptions', itemIndex, {}) as IDataObject;
		const newRow: IDataObject = {
			label: labelName,
			color: this.getNodeParameter('newLabelColor', itemIndex, 'working_orange') as string,
			index: nextStatusLabelIndex(labels),
		};
		if (options.description) newRow.description = options.description;
		if (options.isDone) newRow.is_done = true;
		const position = (options.labelPosition as StatusLabelPosition) || 'last';
		if (position === 'last') {
			// Plain append — existing labels keep their exact indexes.
			rows = [...statusSettingsToInputRows(labels), newRow];
		} else {
			const placed = placeStatusLabelRow(
				statusSettingsToInputRows(labels),
				newRow,
				position,
				options.positionLabelId ? Number(options.positionLabelId) : undefined,
			);
			if (placed === 'missing-anchor') {
				throw new NodeOperationError(
					this.getNode(),
					'Select the label the new label should be placed before or after (Position: Relative To Label)',
					{ itemIndex },
				);
			}
			rows = placed;
		}
	} else {
		rows = [...dropdownSettingsToInputRows(labels), { label: labelName }];
	}

	const data = await client.execute(LABEL_UPDATE_MUTATIONS[kind], itemIndex, {
		boardId,
		columnId,
		revision,
		labels: rows,
	});
	return (data.update_status_column ?? data.update_dropdown_column ?? {}) as IDataObject;
}

/**
 * Column: Update Label — modifies one label (by id) of a status/dropdown
 * column: rename, recolor, description, counts-as-done, or (de)activation.
 * Unchanged labels are re-sent as-is; only the set fields change.
 */
async function updateColumnLabel(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const labelId = Number(this.getNodeParameter('existingLabelId', itemIndex));
	const changes = this.getNodeParameter('labelChanges', itemIndex, {}) as IDataObject;
	if (Object.keys(changes).length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add at least one change to apply to the label', {
			itemIndex,
		});
	}

	const { columnId, kind, revision, labels } = await readLabelColumn.call(
		this,
		client,
		itemIndex,
		boardId,
	);

	if (!labels.some((label) => label.id === labelId)) {
		throw new NodeOperationError(
			this.getNode(),
			`Label with ID ${labelId} was not found on column "${columnId}"`,
			{ itemIndex },
		);
	}

	let rows = (
		kind === 'status' ? statusSettingsToInputRows(labels) : dropdownSettingsToInputRows(labels)
	).map((row) => {
		if (row.id !== labelId) return row;
		const updated = { ...row };
		if (typeof changes.newName === 'string' && changes.newName.trim() !== '') {
			updated.label = (changes.newName as string).trim();
		}
		if (changes.isDeactivated !== undefined) updated.is_deactivated = changes.isDeactivated;
		if (kind === 'status') {
			if (changes.color) updated.color = changes.color;
			if (changes.description !== undefined) updated.description = changes.description;
			if (changes.isDone !== undefined) updated.is_done = changes.isDone;
		}
		return updated;
	});

	if (kind === 'status' && changes.labelPosition) {
		const target = rows.find((row) => row.id === labelId) as IDataObject;
		const placed = placeStatusLabelRow(
			rows.filter((row) => row.id !== labelId),
			target,
			changes.labelPosition as StatusLabelPosition,
			changes.positionLabelId ? Number(changes.positionLabelId) : undefined,
		);
		if (placed === 'missing-anchor') {
			throw new NodeOperationError(
				this.getNode(),
				'Select the label this label should be moved before or after (Position: Relative To Label) — it must exist on the column and cannot be the moved label itself',
				{ itemIndex },
			);
		}
		rows = placed;
	}

	const data = await client.execute(LABEL_UPDATE_MUTATIONS[kind], itemIndex, {
		boardId,
		columnId,
		revision,
		labels: rows,
	});
	return (data.update_status_column ?? data.update_dropdown_column ?? {}) as IDataObject;
}

/**
 * Update: Add File — add_file_to_update through the /v2/file multipart
 * endpoint, taking the file from an input binary field.
 */
async function addFileToUpdate(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const updateId = (this.getNodeParameter('updateId', itemIndex) as string).trim();
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;

	// The update ID is inlined into the mutation (the file endpoint only
	// supports the $file variable) — enforce numeric to keep the query intact.
	if (!/^\d+$/.test(updateId)) {
		throw new NodeOperationError(this.getNode(), 'Update ID must be a number', { itemIndex });
	}

	const binaryMetadata = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const fileBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

	const data = await client.uploadFile(
		`mutation ($file: File!) {
			add_file_to_update(update_id: ${updateId}, file: $file) {
				id
				name
				url
				public_url
				file_extension
				file_size
			}
		}`,
		fileBuffer,
		binaryMetadata.fileName ?? 'file',
		binaryMetadata.mimeType ?? 'application/octet-stream',
	);

	return {
		json: (data.add_file_to_update ?? {}) as IDataObject,
		pairedItem: { item: itemIndex },
	};
}

/**
 * Builds run_prompt's RunPromptConfigInput from the operation's Options —
 * only fields the user actually set are sent, so API defaults stay in
 * effect. Returns null when no option was set.
 */
export function buildRunPromptConfig(options: IDataObject): IDataObject | null {
	const config: IDataObject = {};
	if (options.model) config.model = options.model;
	if (typeof options.systemPrompt === 'string' && options.systemPrompt.trim() !== '') {
		config.system_prompt = options.systemPrompt;
	}
	if (typeof options.temperature === 'number') config.temperature = options.temperature;
	if (typeof options.maxTokens === 'number') config.max_tokens = options.maxTokens;
	return Object.keys(config).length > 0 ? config : null;
}

/**
 * Picks the Platform Agent session key. The REST API never mints one — it
 * only echoes `contextId` when the client sends it (verified live 2026-07-19).
 * When the user leaves Context ID empty we generate a 32-char hex hash
 * (16 cryptographically random bytes) so the output always carries a value
 * follow-up nodes can pass back via expression.
 */
export function resolvePlatformAgentContextId(userContextId: string): string {
	const trimmed = userContextId.trim();
	return trimmed !== '' ? trimmed : randomBytes(16).toString('hex');
}

/**
 * Normalizes the httpRequestWithAuthentication return value — n8n may hand
 * back the JSON body directly or wrapped under `body` when returnFullResponse
 * is used elsewhere in the stack.
 */
export function parsePlatformAgentHttpBody(raw: unknown): IDataObject {
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw) as IDataObject;
		} catch {
			return {};
		}
	}
	if (raw && typeof raw === 'object') {
		const obj = raw as IDataObject;
		const nested = obj.body ?? obj.data;
		if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
			return nested as IDataObject;
		}
		return obj;
	}
	return {};
}

/** Builds the Run Platform Agent output row — always echoes the sent contextId. */
export function buildPlatformAgentOutput(raw: unknown, sentContextId: string): IDataObject {
	const parsed = parsePlatformAgentHttpBody(raw);
	return {
		response: parsed.response ?? null,
		// The API may omit contextId or return null even when we sent one —
		// the session key the node owns is always what we generated/chose.
		contextId: sentContextId,
	};
}

/**
 * AI: Run Platform Agent — the platform-ai-gateway REST endpoint (not
 * GraphQL): one user message per request, optional contextId for
 * conversation continuity (same ID across runs → the agent recalls prior
 * turns). Auth is the same raw-token Authorization header the credential
 * already sends. Success shape (verified live 2026-07-19):
 * { response, contextId? } — contextId is echoed when it was sent.
 */
async function runPlatformAgent(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const prompt = this.getNodeParameter('prompt', itemIndex) as string;
	const options = this.getNodeParameter('runAgentOptions', itemIndex, {}) as IDataObject;
	const userContextId = typeof options.contextId === 'string' ? options.contextId : '';
	const contextId = resolvePlatformAgentContextId(userContextId);

	if (prompt.trim() === '') {
		throw new NodeOperationError(this.getNode(), 'Prompt is required', {
			itemIndex,
			description: 'Enter the message to send to the monday.com Platform Agent.',
		});
	}

	const body: IDataObject = { prompt, contextId };

	try {
		const raw = await this.helpers.httpRequestWithAuthentication.call(this, 'mondayApi', {
			method: 'POST',
			url: MONDAY_PLATFORM_AGENT_URL,
			body,
			json: true,
		});
		return buildPlatformAgentOutput(raw, contextId);
	} catch (error) {
		// REST error shapes (verified live): 401 {"errors":["Not Authenticated"]},
		// 400 {"message":"Validation error","fields":{...}}.
		const httpError = error as Error & { httpCode?: string | number };
		const statusCode = Number(httpError.httpCode);
		if (statusCode === 401 || statusCode === 403) {
			throw new NodeApiError(this.getNode(), error as unknown as JsonObject, {
				message: 'Authentication failed',
				description:
					'The Platform Agent endpoint rejected the API token. Check your monday.com API token.',
			});
		}
		throw new NodeApiError(this.getNode(), error as unknown as JsonObject, {
			message: 'Platform Agent request failed',
			description: httpError.message,
		});
	}
}

/**
 * Resolves the column_values object shared by Item: Create and Item: Update —
 * either the typed column mapper (friendly per-type inputs) or a raw
 * API-format JSON object. Returns undefined when nothing was set.
 */
async function resolveColumnValues(
	this: IExecuteFunctions,
	itemIndex: number,
	boardId: string,
): Promise<IDataObject | undefined> {
	const mode = this.getNodeParameter('columnValuesMode', itemIndex) as string;

	if (mode === 'json') {
		const raw = this.getNodeParameter('columnValuesJson', itemIndex, '{}');
		if (typeof raw === 'object' && raw !== null) {
			return raw as IDataObject;
		}
		if (typeof raw === 'string' && raw.trim() !== '' && raw.trim() !== '{}') {
			try {
				return JSON.parse(raw) as IDataObject;
			} catch {
				throw new NodeOperationError(
					this.getNode(),
					'Column Values (JSON) must be a valid JSON object keyed by column ID',
					{ itemIndex },
				);
			}
		}
		return undefined;
	}

	const mapped = extractMappedValues(this.getNodeParameter('columns', itemIndex, {}));
	if (Object.keys(mapped).length === 0) return undefined;
	const columnTypes = await fetchColumnTypes(this, boardId, itemIndex);
	return buildColumnValues(mapped, columnTypes);
}

/** Item: Create — create_item with column values from the shared builder. */
async function createItem(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	// Unified Create: Subitem mode routes to create_subitem. Legacy saved
	// workflows have no createAs key and default to a top-level item.
	const createAs = this.getNodeParameter('createAs', itemIndex, 'item') as string;
	if (createAs === 'subitem') {
		return await createSubitem.call(this, client, itemIndex);
	}

	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const name = this.getNodeParameter('name', itemIndex) as string;
	const groupId = this.getNodeParameter('groupId', itemIndex, '') as string;
	const createOptions = this.getNodeParameter('createOptions', itemIndex, {}) as IDataObject;
	const columnValues = await resolveColumnValues.call(this, itemIndex, boardId);

	const data = await client.execute(
		`mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON, $createLabels: Boolean) {
			create_item(
				board_id: $boardId,
				group_id: $groupId,
				item_name: $itemName,
				column_values: $columnValues,
				create_labels_if_missing: $createLabels
			) {
				id
				name
				url
				state
				board { id name }
				group { id title }
				column_values(${COLUMN_VALUES_CALCULATED_ARG}) { id type text value ${BATTERY_VALUE_FRAGMENT} ${LINKED_VALUE_FRAGMENTS} }
			}
		}`,
		itemIndex,
		{
			boardId,
			groupId: groupId || null,
			itemName: name,
			// The API's JSON scalar arrives as a string.
			columnValues: columnValues ? JSON.stringify(columnValues) : null,
			createLabels: createOptions.createLabelsIfMissing === true,
		},
	);

	return (data.create_item ?? {}) as IDataObject;
}

/**
 * Item: Create in Subitem mode (and the legacy Create Subitem operation) —
 * create_subitem under a parent item, through the same column builder as
 * Create. Mapper values are typed against the SUBITEM board, resolved via
 * the parent board's subtasks column — on multi-level boards that resolves
 * to the parent board itself (one shared schema at every depth), and the
 * parent may be a subitem (nesting up to 5 levels).
 */
async function createSubitem(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const parentBoardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const parentItemId = this.getNodeParameter('itemId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const name = this.getNodeParameter('name', itemIndex) as string;
	const createOptions = this.getNodeParameter('createOptions', itemIndex, {}) as IDataObject;

	// Column types must come from the subitem board, not the parent's.
	// Only needed in mapper mode; raw JSON passes through untyped.
	const mode = this.getNodeParameter('columnValuesMode', itemIndex) as string;
	let valuesBoardId = parentBoardId;
	if (mode === 'mapper') {
		const mapped = extractMappedValues(this.getNodeParameter('columns', itemIndex, {}));
		if (Object.keys(mapped).length > 0) {
			const subitemBoardId = await resolveSubitemBoardId(this, parentBoardId, itemIndex);
			if (!subitemBoardId) {
				throw new NodeOperationError(
					this.getNode(),
					'This board has no subitems board yet — create the first subitem without column values, or use Raw JSON',
					{ itemIndex },
				);
			}
			valuesBoardId = subitemBoardId;
		}
	}
	const columnValues = await resolveColumnValues.call(this, itemIndex, valuesBoardId);

	const data = await client.execute(
		`mutation ($parentItemId: ID!, $itemName: String!, $columnValues: JSON, $createLabels: Boolean) {
			create_subitem(
				parent_item_id: $parentItemId,
				item_name: $itemName,
				column_values: $columnValues,
				create_labels_if_missing: $createLabels
			) {
				id
				name
				url
				state
				board { id name }
				group { id title }
				parent_item { id name }
				column_values(${COLUMN_VALUES_CALCULATED_ARG}) { id type text value ${BATTERY_VALUE_FRAGMENT} ${LINKED_VALUE_FRAGMENTS} }
			}
		}`,
		itemIndex,
		{
			parentItemId,
			itemName: name,
			columnValues: columnValues ? JSON.stringify(columnValues) : null,
			createLabels: createOptions.createLabelsIfMissing === true,
		},
	);

	return (data.create_subitem ?? {}) as IDataObject;
}

/**
 * Item: Update — change_multiple_column_values via the same column builder
 * as Create; the mapper additionally exposes the name column for renames.
 */
async function updateItem(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const createOptions = this.getNodeParameter('createOptions', itemIndex, {}) as IDataObject;
	const columnValues = await resolveColumnValues.call(this, itemIndex, boardId);

	if (!columnValues || Object.keys(columnValues).length === 0) {
		throw new NodeOperationError(this.getNode(), 'Set at least one column value to update', {
			itemIndex,
		});
	}

	const data = await client.execute(
		`mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!, $createLabels: Boolean) {
			change_multiple_column_values(
				board_id: $boardId,
				item_id: $itemId,
				column_values: $columnValues,
				create_labels_if_missing: $createLabels
			) {
				id
				name
				url
				state
				board { id name }
				group { id title }
				column_values(${COLUMN_VALUES_CALCULATED_ARG}) { id type text value ${BATTERY_VALUE_FRAGMENT} ${LINKED_VALUE_FRAGMENTS} }
			}
		}`,
		itemIndex,
		{
			boardId,
			itemId,
			columnValues: JSON.stringify(columnValues),
			createLabels: createOptions.createLabelsIfMissing === true,
		},
	);

	return (data.change_multiple_column_values ?? {}) as IDataObject;
}

/** Product cap for Item: Clear Column Values — items and columns per execution. */
export const MAX_CLEAR_ITEMS = 10;
export const MAX_CLEAR_COLUMNS = 10;

/**
 * Builds the single aliased request that clears the given columns on every
 * item: one change_multiple_column_values per item, all in one mutation.
 * Setting a column to null resets it to its empty/default value (verified
 * live for text, numbers, date, link, status, checkbox and file columns).
 * Exported for unit tests.
 */
export function buildClearColumnValuesMutation(
	itemIds: string[],
	columnIds: string[],
): { query: string; variables: Record<string, unknown> } {
	const columnValues = JSON.stringify(
		Object.fromEntries(columnIds.map((columnId) => [columnId, null])),
	);
	const variables: Record<string, unknown> = { boardId: undefined, columnValues };
	const varDefs = ['$boardId: ID!', '$columnValues: JSON!'];
	const aliases: string[] = [];

	itemIds.forEach((itemId, index) => {
		varDefs.push(`$item${index}: ID!`);
		variables[`item${index}`] = itemId;
		aliases.push(
			`item${index}: change_multiple_column_values(board_id: $boardId, item_id: $item${index}, column_values: $columnValues) { id name }`,
		);
	});

	return {
		query: `mutation (${varDefs.join(', ')}) {\n\t${aliases.join('\n\t')}\n}`,
		variables,
	};
}

/**
 * Item: Clear Column Values — resets up to 10 columns on up to 10 items back
 * to their empty/default values in ONE aliased API request. Not atomic: if a
 * later item in the batch fails, earlier aliases may already have executed.
 */
async function clearColumnValues(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const itemIds = normalizeIdList(this.getNodeParameter('clearItemIds', itemIndex));
	const columnIds = normalizeIdList(this.getNodeParameter('clearColumnIds', itemIndex));

	if (itemIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Provide at least one item ID to clear', {
			itemIndex,
		});
	}
	if (itemIds.length > MAX_CLEAR_ITEMS) {
		throw new NodeOperationError(
			this.getNode(),
			`Too many items: ${itemIds.length} provided, but Clear Column Values handles at most ${MAX_CLEAR_ITEMS} per execution. Split the list across multiple runs.`,
			{ itemIndex },
		);
	}
	if (columnIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Select at least one column to clear', {
			itemIndex,
		});
	}
	if (columnIds.length > MAX_CLEAR_COLUMNS) {
		throw new NodeOperationError(
			this.getNode(),
			`Too many columns: ${columnIds.length} selected, but Clear Column Values handles at most ${MAX_CLEAR_COLUMNS} per execution`,
			{ itemIndex },
		);
	}

	const { query, variables } = buildClearColumnValuesMutation(itemIds, columnIds);
	variables.boardId = boardId;
	const { data, errors } = await client.executeBulk(query, itemIndex, variables);

	const failures: Array<{ itemId: string; message: string }> = [];
	const rows = itemIds.map((itemId, index) => {
		const payload = data[`item${index}`] as IDataObject | null | undefined;
		if (payload) {
			return {
				itemId: (payload.id as string) ?? itemId,
				name: payload.name ?? null,
				success: true,
				clearedColumnIds: columnIds,
			} as IDataObject;
		}
		const failure = errors.find((error) => error.path?.[0] === `item${index}`);
		const message = failure?.message ?? 'Unknown error';
		failures.push({ itemId, message });
		return {
			itemId,
			success: false,
			error: message,
			errorCode: failure?.extensions?.code ?? failure?.error_code ?? null,
		} as IDataObject;
	});

	if (failures.length > 0 && !this.continueOnFail()) {
		const detail = failures.map((failure) => `${failure.itemId} (${failure.message})`).join(', ');
		throw new NodeOperationError(
			this.getNode(),
			`${failures.length} of ${itemIds.length} items failed to clear: ${detail}. The other items in the batch were still cleared.`,
			{ itemIndex },
		);
	}

	return rows;
}

/** Selection set for fetch_job_status — shared by the wait loop and the status op. */
const ITEMS_JOB_STATUS_QUERY = `query ($jobId: ID!) {
	fetch_job_status(job_id: $jobId) {
		... on ItemsJobStatus {
			status
			counts { submitted invalid skipped created updated failed }
			progress_percentage
			failure_reason
			failure_message
			fully_imported
			report_created
			report_url
		}
	}
}`;

/** One fetch_job_status poll. */
async function fetchBulkImportJobStatus(
	client: MondayGraphQLClient,
	itemIndex: number,
	jobId: string,
): Promise<RawItemsJobStatus> {
	const data = await client.execute(ITEMS_JOB_STATUS_QUERY, itemIndex, { jobId });
	return (data.fetch_job_status ?? {}) as RawItemsJobStatus;
}

/**
 * Downloads and parses monday's per-row import report. The report URL is a
 * pre-signed S3 GET that expires after 10 minutes — always fetched
 * immediately, never emitted downstream. Rows in mapped mode pair back to
 * the input item they came from (serialNo is the 1-based data-row number).
 */
async function fetchBulkImportReportRows(
	this: IExecuteFunctions,
	jobId: string,
	reportUrl: string,
	pairToInputRows: boolean,
	fallbackItemIndex: number,
	inputItemCount: number,
): Promise<INodeExecutionData[]> {
	const reportText = (await this.helpers.httpRequest({
		url: reportUrl,
	})) as string;

	return parseReportRows(String(reportText)).map((row) => {
		const serialNo = typeof row.serialNo === 'number' ? row.serialNo : undefined;
		const pairedIndex =
			pairToInputRows && serialNo !== undefined && serialNo >= 1 && serialNo <= inputItemCount
				? serialNo - 1
				: fallbackItemIndex;
		return {
			json: { jobId, ...row },
			pairedItem: { item: pairedIndex },
		};
	});
}

/**
 * Item: Bulk Import — one asynchronous CSV import job per execution:
 * start ingest_items/backfill_items, PUT the CSV to the pre-signed URL
 * (valid 10 minutes, so the upload happens immediately), then optionally
 * poll fetch_job_status every 10s until a terminal state.
 */
async function bulkImportItems(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	inputItemCount: number,
): Promise<INodeExecutionData[]> {
	const boardId = this.getNodeParameter('boardId', 0, undefined, {
		extractValue: true,
	}) as string;
	const groupIdParam = this.getNodeParameter('bulkImportGroupId', 0, '') as string;
	const importType = this.getNodeParameter('bulkImportType', 0) as string;
	const source = this.getNodeParameter('bulkImportSource', 0) as string;
	const wait = this.getNodeParameter('bulkImportWait', 0) as boolean;
	const options = this.getNodeParameter('bulkImportOptions', 0, {}) as IDataObject;

	const isBackfill = importType === 'backfill';
	const rowCap = isBackfill ? MAX_BACKFILL_ROWS : MAX_INGEST_ROWS;

	// Assemble the CSV before starting the job — the upload URL only lives
	// 10 minutes, so everything slow happens first.
	let csvBuffer: Buffer;
	let mappedMode = false;
	if (source === 'file') {
		const binaryPropertyName = this.getNodeParameter('bulkImportBinaryPropertyName', 0) as string;
		this.helpers.assertBinaryData(0, binaryPropertyName);
		csvBuffer = await this.helpers.getBinaryDataBuffer(0, binaryPropertyName);
	} else {
		mappedMode = true;
		if (inputItemCount > rowCap) {
			throw new NodeOperationError(
				this.getNode(),
				`Too many rows: ${inputItemCount} input items, but ${isBackfill ? 'backfill' : 'ingest'} accepts at most ${rowCap} rows per job. Split the input into smaller batches.`,
				{ itemIndex: 0 },
			);
		}
		const mappedRows: Array<Record<string, unknown>> = [];
		for (let i = 0; i < inputItemCount; i++) {
			mappedRows.push(extractMappedValues(this.getNodeParameter('bulkImportColumns', i, {})));
		}
		const columns = await fetchColumns(this, boardId, 0);
		const columnTypes = Object.fromEntries(columns.map((column) => [column.id, column.type]));
		try {
			const built = buildBulkImportCsv(
				mappedRows,
				columnTypes,
				columns.map((column) => column.id),
			);
			csvBuffer = Buffer.from(built.csv, 'utf-8');
		} catch (error) {
			if (error instanceof BulkImportInputError) {
				throw new NodeOperationError(this.getNode(), error.message, { itemIndex: 0 });
			}
			// Anything else came from the GraphQL client — already a mapped NodeApiError.
			throw ensureNodeError(this.getNode(), error);
		}
	}

	// group_id is required by the API; empty picker = the board's top group.
	let groupId = groupIdParam;
	if (!groupId) {
		const groupIds = await fetchBoardGroupIds(client, 0, boardId);
		if (groupIds.length === 0) {
			throw new NodeOperationError(this.getNode(), `Board ${boardId} has no groups`, {
				itemIndex: 0,
			});
		}
		groupId = groupIds[0];
	}

	// on_match only exists on ingest_items (backfill always creates).
	const onMatchBehaviour = isBackfill
		? 'none'
		: (this.getNodeParameter('bulkImportOnMatch', 0, 'none') as string);
	let onMatch: IDataObject | null = null;
	if (onMatchBehaviour !== 'none') {
		const matchColumnId = this.getNodeParameter('bulkImportMatchColumnId', 0) as string;
		onMatch = { behaviour: onMatchBehaviour, match_column_id: matchColumnId };
	}

	const startMutation = isBackfill
		? `mutation ($boardId: ID!, $groupId: ID!) {
				backfill_items(board_id: $boardId, group_id: $groupId) { job_id upload_url }
			}`
		: `mutation ($boardId: ID!, $groupId: ID!, $onMatch: OnMatchInput) {
				ingest_items(board_id: $boardId, group_id: $groupId, on_match: $onMatch) { job_id upload_url }
			}`;
	const startVariables: Record<string, unknown> = { boardId, groupId };
	if (!isBackfill) startVariables.onMatch = onMatch;

	const startData = await client.execute(startMutation, 0, startVariables);
	const jobInit = (startData[isBackfill ? 'backfill_items' : 'ingest_items'] ?? {}) as {
		job_id?: string;
		upload_url?: string;
	};
	if (!jobInit.job_id || !jobInit.upload_url) {
		throw new NodeOperationError(
			this.getNode(),
			'monday.com did not return a job ID and upload URL for the import job',
			{ itemIndex: 0 },
		);
	}
	const jobId = jobInit.job_id;

	// Pre-signed S3 PUT: no auth header, and no extra headers at all — an
	// unsigned x-amz-checksum-crc32 header makes S3 reject the upload (403).
	await this.helpers.httpRequest({
		method: 'PUT',
		url: jobInit.upload_url,
		body: csvBuffer,
		headers: { 'Content-Type': 'text/csv' },
	});

	if (!wait) {
		return [
			{
				json: { jobId, status: 'UPLOAD_PENDING', boardId, groupId, importType },
				pairedItem: { item: 0 },
			},
		];
	}

	const maxWaitTimeMs = ((options.maxWaitTime as number) ?? 1800) * 1000;
	const startedAt = Date.now();
	let status = await fetchBulkImportJobStatus(client, 0, jobId);
	while (!BULK_IMPORT_TERMINAL_STATES.has(status.status ?? '')) {
		if (Date.now() - startedAt >= maxWaitTimeMs) {
			throw new NodeOperationError(
				this.getNode(),
				`Import job ${jobId} did not finish within ${maxWaitTimeMs / 1000}s (last status: ${status.status ?? 'unknown'}). The job keeps running on monday's side — check it with the Get Bulk Import Status operation.`,
				{ itemIndex: 0 },
			);
		}
		await sleep(BULK_IMPORT_POLL_INTERVAL_MS);
		status = await fetchBulkImportJobStatus(client, 0, jobId);
	}

	if (status.status === 'FAILED' || status.status === 'REJECTED') {
		const reason = [status.failure_reason, status.failure_message]
			.filter(Boolean)
			.join(' — ');
		throw new NodeOperationError(
			this.getNode(),
			`Import job ${jobId} ${status.status === 'REJECTED' ? 'was rejected' : 'failed'}${reason ? `: ${reason}` : ''}`,
			{ itemIndex: 0 },
		);
	}

	const results: INodeExecutionData[] = [
		{ json: summarizeJobStatus(jobId, status), pairedItem: { item: 0 } },
	];

	if (options.includeRowResults === true && status.report_created && status.report_url) {
		results.push(
			...(await fetchBulkImportReportRows.call(
				this,
				jobId,
				status.report_url,
				mappedMode,
				0,
				inputItemCount,
			)),
		);
	}

	return results;
}

/**
 * Item: Get Bulk Import Status — one fetch_job_status poll for a job ID
 * from a previous Bulk Import run (the no-wait path).
 */
async function getBulkImportJobStatus(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const jobId = (this.getNodeParameter('bulkImportJobId', itemIndex) as string).trim();
	if (!jobId) {
		throw new NodeOperationError(this.getNode(), 'Job ID is required', { itemIndex });
	}
	const options = this.getNodeParameter('bulkImportStatusOptions', itemIndex, {}) as IDataObject;

	const status = await fetchBulkImportJobStatus(client, itemIndex, jobId);
	if (status.status === undefined) {
		throw new NodeOperationError(
			this.getNode(),
			`No import job found for job ID ${jobId}`,
			{ itemIndex },
		);
	}

	const results: INodeExecutionData[] = [
		{ json: summarizeJobStatus(jobId, status), pairedItem: { item: itemIndex } },
	];

	if (options.includeRowResults === true && status.report_created && status.report_url) {
		results.push(
			...(await fetchBulkImportReportRows.call(
				this,
				jobId,
				status.report_url,
				false,
				itemIndex,
				0,
			)),
		);
	}

	return results;
}

/** Product cap for bulk Item: Archive or Delete — item IDs per execution. */
export const MAX_BULK_ARCHIVE_DELETE_ITEMS = 50;

/**
 * Builds the single aliased request that archives or deletes every item in
 * the list: one archive_item/delete_item per ID, all in one mutation. The
 * batch is NOT atomic — a failing alias returns null (with a per-alias error
 * carrying its path) while the other aliases still execute (verified live).
 * Exported for unit tests.
 */
export function buildBulkArchiveOrDeleteMutation(
	action: 'archive' | 'delete',
	itemIds: string[],
): { query: string; variables: Record<string, unknown> } {
	const mutationField = action === 'archive' ? 'archive_item' : 'delete_item';
	const variables: Record<string, unknown> = {};
	const varDefs: string[] = [];
	const aliases: string[] = [];

	itemIds.forEach((itemId, index) => {
		varDefs.push(`$item${index}: ID!`);
		variables[`item${index}`] = itemId;
		aliases.push(`item${index}: ${mutationField}(item_id: $item${index}) { id name state }`);
	});

	return {
		query: `mutation (${varDefs.join(', ')}) {\n\t${aliases.join('\n\t')}\n}`,
		variables,
	};
}

/**
 * Item: Archive or Delete in Multiple Items mode — up to 50 item IDs in ONE
 * aliased API request. Per-ID failures are mapped back to their item via the
 * error path; with continueOnFail they become error rows, otherwise the run
 * fails with a summary that names the failed IDs (the rest were still
 * processed — the batch is not atomic).
 */
async function archiveOrDeleteManyItems(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	action: 'archive' | 'delete',
): Promise<IDataObject[]> {
	const itemIds = [...new Set(normalizeIdList(this.getNodeParameter('bulkItemIds', itemIndex)))];

	if (itemIds.length === 0) {
		throw new NodeOperationError(this.getNode(), `Provide at least one item ID to ${action}`, {
			itemIndex,
		});
	}
	if (itemIds.length > MAX_BULK_ARCHIVE_DELETE_ITEMS) {
		throw new NodeOperationError(
			this.getNode(),
			`Too many items: ${itemIds.length} provided, but Archive or Delete handles at most ${MAX_BULK_ARCHIVE_DELETE_ITEMS} unique item IDs per execution. Split the list across multiple runs.`,
			{ itemIndex },
		);
	}

	const { query, variables } = buildBulkArchiveOrDeleteMutation(action, itemIds);
	const { data, errors } = await client.executeBulk(query, itemIndex, variables);

	const failures: Array<{ itemId: string; message: string }> = [];
	const rows = itemIds.map((itemId, index) => {
		const payload = data[`item${index}`] as IDataObject | null | undefined;
		if (payload) {
			return { ...payload, action } as IDataObject;
		}
		const failure = errors.find((error) => error.path?.[0] === `item${index}`);
		const message = failure?.message ?? 'Unknown error';
		failures.push({ itemId, message });
		return {
			itemId,
			action,
			error: message,
			errorCode: failure?.extensions?.code ?? failure?.error_code ?? null,
		} as IDataObject;
	});

	if (failures.length > 0 && !this.continueOnFail()) {
		const detail = failures.map((failure) => `${failure.itemId} (${failure.message})`).join(', ');
		throw new NodeOperationError(
			this.getNode(),
			`${failures.length} of ${itemIds.length} items failed to ${action}: ${detail}. The other items in the batch were still processed.`,
			{ itemIndex },
		);
	}

	return rows;
}

/**
 * Column types move_item_to_board's columns_mapping cannot include — the
 * API rejects the whole mapping with an opaque "Columns mapping is not in
 * the expected format" error (name and subtasks verified live 2026-07-19;
 * formula per the API docs). These columns are handled by the move itself.
 */
export const MOVE_UNMAPPABLE_COLUMN_TYPES = new Set(['formula', 'name', 'subtasks']);

/**
 * Builds the complete columns_mapping that move_item_to_board requires. The
 * API rejects partial mappings outright, so the configured pairs are
 * validated against both boards' columns and every remaining mappable
 * source column is filled in with target: null — which is what monday's own
 * move dialog submits for unmapped columns (their values are dropped).
 * Exported for unit tests.
 */
export function completeMoveColumnsMapping(
	picked: Array<{ source: string; target?: string | null }>,
	sourceColumns: Array<{ id: string; type: string }>,
	targetColumns: Array<{ id: string; type: string }>,
): Array<{ source: string; target: string | null }> {
	const sourceById = new Map(sourceColumns.map((column) => [column.id, column]));
	const targetIds = new Set(targetColumns.map((column) => column.id));

	const mapping: Array<{ source: string; target: string | null }> = [];
	const mappedSourceIds = new Set<string>();
	for (const pair of picked) {
		const sourceColumn = sourceById.get(pair.source);
		if (!sourceColumn) {
			throw new UserError(`Column "${pair.source}" does not exist on the item's board`);
		}
		if (MOVE_UNMAPPABLE_COLUMN_TYPES.has(sourceColumn.type)) {
			throw new UserError(
				`The "${pair.source}" column (type ${sourceColumn.type}) cannot be mapped — the move handles it automatically`,
			);
		}
		if (mappedSourceIds.has(pair.source)) {
			throw new UserError(`Column "${pair.source}" is mapped more than once`);
		}
		const target = pair.target ?? null;
		if (target !== null && target !== '' && !targetIds.has(target)) {
			throw new UserError(`Column "${target}" does not exist on the target board`);
		}
		mappedSourceIds.add(pair.source);
		mapping.push({ source: pair.source, target: target === '' ? null : target });
	}

	for (const column of sourceColumns) {
		if (!mappedSourceIds.has(column.id) && !MOVE_UNMAPPABLE_COLUMN_TYPES.has(column.type)) {
			mapping.push({ source: column.id, target: null });
		}
	}
	return mapping;
}

/**
 * Item: Move — move_item_to_group within the board, or move_item_to_board
 * with an optional columns_mapping for cross-board moves. The mapping comes
 * from the guided mapper rows when any are configured, otherwise from the
 * raw-JSON escape hatch in Options (which is also what legacy saved
 * workflows use); either way it is completed to the full-board mapping the
 * API demands. Exported for unit tests.
 */
export async function moveItem(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const destination = this.getNodeParameter('moveDestination', itemIndex) as string;

	if (destination === 'group') {
		const targetGroupId = this.getNodeParameter('targetGroupId', itemIndex) as string;
		const data = await client.execute(
			`mutation ($itemId: ID!, $groupId: String!) {
				move_item_to_group(item_id: $itemId, group_id: $groupId) {
					id
					name
					url
					board { id name }
					group { id title }
				}
			}`,
			itemIndex,
			{ itemId, groupId: targetGroupId },
		);
		return (data.move_item_to_group ?? {}) as IDataObject;
	}

	const targetBoardId = this.getNodeParameter('targetBoardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const targetGroupId = this.getNodeParameter('targetBoardGroupId', itemIndex) as string;
	const moveOptions = this.getNodeParameter('moveOptions', itemIndex, {}) as IDataObject;
	const mappingUi = this.getNodeParameter('columnsMappingUi', itemIndex, {}) as {
		mappings?: Array<{ source?: string; target?: string }>;
	};

	let pickedMapping: Array<{ source: string; target: string | null }> | undefined;
	const uiRows = mappingUi.mappings ?? [];
	if (uiRows.length > 0) {
		pickedMapping = uiRows.map((row, rowIndex) => {
			const source = typeof row.source === 'string' ? row.source.trim() : '';
			const target = typeof row.target === 'string' ? row.target.trim() : '';
			if (!source || !target) {
				throw new NodeOperationError(
					this.getNode(),
					`Columns Mapping row ${rowIndex + 1} needs both a source and a target column`,
					{ itemIndex },
				);
			}
			return { source, target };
		});
	} else {
		const rawMapping = moveOptions.columnsMapping;
		if (rawMapping !== undefined && rawMapping !== null && rawMapping !== '') {
			const parsed = typeof rawMapping === 'string' ? safeJsonParse(rawMapping) : rawMapping;
			if (!Array.isArray(parsed)) {
				throw new NodeOperationError(
					this.getNode(),
					'Columns Mapping must be a JSON array of {"source", "target"} pairs',
					{ itemIndex },
				);
			}
			if (parsed.length > 0) {
				pickedMapping = parsed as Array<{ source: string; target: string | null }>;
			}
		}
	}

	// The API rejects partial mappings ("Columns mapping is not in the
	// expected format"), so complete the configured pairs against both
	// boards' real columns before sending.
	let columnsMapping: Array<{ source: string; target: string | null }> | undefined;
	if (pickedMapping) {
		const sourceBoardId = this.getNodeParameter('boardId', itemIndex, undefined, {
			extractValue: true,
		}) as string;
		const boardData = await client.execute(
			`query ($ids: [ID!]) { boards(ids: $ids) { id columns { id type } } }`,
			itemIndex,
			{ ids: [sourceBoardId, targetBoardId] },
		);
		const boards = (boardData.boards ?? []) as Array<{
			id: string;
			columns?: Array<{ id: string; type: string }>;
		}>;
		const sourceColumns = boards.find((board) => board.id === String(sourceBoardId))?.columns ?? [];
		const targetColumns = boards.find((board) => board.id === String(targetBoardId))?.columns ?? [];
		try {
			columnsMapping = completeMoveColumnsMapping(pickedMapping, sourceColumns, targetColumns);
		} catch (error) {
			throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex });
		}
	}

	const data = await client.execute(
		`mutation ($boardId: ID!, $groupId: ID!, $itemId: ID!, $columnsMapping: [ColumnMappingInput!]) {
			move_item_to_board(
				board_id: $boardId,
				group_id: $groupId,
				item_id: $itemId,
				columns_mapping: $columnsMapping
			) {
				id
				name
				url
				board { id name }
				group { id title }
			}
		}`,
		itemIndex,
		{ boardId: targetBoardId, groupId: targetGroupId, itemId, columnsMapping: columnsMapping ?? null },
	);
	return (data.move_item_to_board ?? {}) as IDataObject;
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

interface RawItemColumnValue extends IDataObject {
	text?: string | null;
	column?: { title?: string; settings_str?: string } | null;
	battery_value?: BatteryEntry[] | null;
	display_value?: string | null;
}

/**
 * Flattens column values into { [column title]: text }. Status rollups
 * (BatteryValue, multi-level boards) have no text — their label counts are
 * rendered as "Done: 2, Stuck: 1" via the column's status labels.
 * Linked-item columns (dependency / board_relation / mirror) also have no
 * text — they fall back to display_value, the comma-separated linked item
 * names ("" = no links, flattened to null). Exported for unit tests.
 */
export function flattenItemColumns(columnValues: RawItemColumnValue[]): IDataObject {
	const columns: IDataObject = {};
	for (const columnValue of columnValues) {
		const title = columnValue.column?.title ?? (columnValue.id as string);
		if (columnValue.battery_value) {
			columns[title] = formatBatteryText(
				columnValue.battery_value,
				columnValue.column?.settings_str,
			);
			continue;
		}
		columns[title] = columnValue.text ?? (columnValue.display_value || null);
	}
	return columns;
}

/**
 * Builds the Item: Get query. Column values are scoped to the Select
 * Columns option when set (empty = all columns — the ids argument is only
 * sent when columns were picked, which cuts complexity cost and payload on
 * big boards). Include All Item Info adds the metadata fields the base
 * selection deliberately excludes. Exported for unit tests.
 */
export function buildGetItemQuery(
	itemId: string,
	options: IDataObject,
): { query: string; variables: Record<string, unknown> } {
	const columnIds = normalizeIdList(options.columnIds);
	const scoped = columnIds.length > 0;

	const extraFields = [
		options.includeAllItemInfo === true
			? 'creator { id name email } email relative_link subscribers { id name }'
			: '',
		options.includeSubitems === true ? 'subitems { id name state url parent_item { id name } }' : '',
		options.includeUpdates === true
			? 'updates { id body created_at creator { id name } }'
			: '',
	].join('\n');

	const columnArgs = scoped
		? `ids: $columnIds, ${COLUMN_VALUES_CALCULATED_ARG}`
		: COLUMN_VALUES_CALCULATED_ARG;

	return {
		query: `query ($ids: [ID!]${scoped ? ', $columnIds: [String!]' : ''}) {
			items(ids: $ids) {
				id
				name
				state
				url
				created_at
				updated_at
				board { id name }
				group { id title }
				parent_item { id name }
				column_values(${columnArgs}) {
					id type text value column { title settings_str }
					${BATTERY_VALUE_FRAGMENT}
					${LINKED_VALUE_FRAGMENTS}
				}
				${extraFields}
			}
		}`,
		variables: scoped ? { ids: [itemId], columnIds } : { ids: [itemId] },
	};
}

/**
 * Item: Get — items(ids:) with optional subitems/updates/full metadata, and
 * a Simplify Column Values Response mode that flattens column values into
 * { [column title]: text }. Works at any depth of a multi-level board
 * (subitems are items on the same board); rollup column values are included
 * via the CALCULATED capability.
 */
async function getItem(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const options = this.getNodeParameter('getItemOptions', itemIndex, {}) as IDataObject;

	const { query, variables } = buildGetItemQuery(itemId, options);
	const data = await client.execute(query, itemIndex, variables);

	const item = ((data.items ?? []) as IDataObject[])[0];
	if (!item) {
		throw new NodeOperationError(this.getNode(), `Item ${itemId} not found`, { itemIndex });
	}
	if (!simplify) return item;

	const columns = flattenItemColumns((item.column_values ?? []) as RawItemColumnValue[]);
	const rest = { ...item };
	delete rest.column_values;
	return { ...rest, columns };
}

/** The fields every create-column mutation returns. */
const CREATED_COLUMN_FIELDS = 'id title type description settings_str revision';

/**
 * Resolves the after_column_id argument for the Position option.
 * "Before" needs the board's column order, fetched in one bounded call.
 */
async function resolveColumnPosition(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	boardId: string,
	options: IDataObject,
): Promise<string | undefined> {
	const position = (options.columnPosition as string) || 'end';
	if (position === 'end') return undefined;
	if (position === 'start') return 'name';

	const anchorColumnId = (options.positionColumnId as string) || '';
	if (!anchorColumnId) {
		throw new NodeOperationError(
			this.getNode(),
			'Select the column the new column should be placed before or after (Position: Relative To Column)',
			{ itemIndex },
		);
	}

	let orderedColumnIds: string[] = [];
	if (position === 'before') {
		const data = await client.execute(
			`query ($ids: [ID!]) { boards(ids: $ids) { columns { id } } }`,
			itemIndex,
			{ ids: [boardId] },
		);
		const boards = (data.boards ?? []) as Array<{ columns?: Array<{ id: string }> }>;
		orderedColumnIds = (boards[0]?.columns ?? []).map((column) => column.id);
	}

	const resolved = resolveAfterColumnId(position, anchorColumnId, orderedColumnIds);
	if (resolved === null) {
		throw new NodeOperationError(
			this.getNode(),
			`Column "${anchorColumnId}" was not found on board ${boardId}, so the new column can't be positioned relative to it`,
			{ itemIndex },
		);
	}
	return resolved;
}

/**
 * Column: Add to Board. Status and dropdown label builders go through the
 * typed create_status_column / create_dropdown_column mutations (name, color,
 * is_done, selection limits); every other type compiles its Type Settings
 * collection into the generic create_column defaults JSON, which the API
 * validates against the column type's schema. The Defaults (JSON) option
 * remains the raw escape hatch and takes precedence over both.
 */
async function createColumn(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const title = this.getNodeParameter('columnTitle', itemIndex) as string;
	const columnType = this.getNodeParameter('columnType', itemIndex) as string;
	const typeSettings = this.getNodeParameter('columnTypeSettings', itemIndex, {}) as IDataObject;
	const options = this.getNodeParameter('createColumnOptions', itemIndex, {}) as IDataObject;

	const afterColumnId = await resolveColumnPosition.call(this, client, itemIndex, boardId, options);
	const description = (options.description as string) || null;

	const customColumnId = ((options.customColumnId as string) || '').trim();
	if (customColumnId) {
		const problem = validateCustomColumnId(customColumnId);
		if (problem) {
			throw new NodeOperationError(this.getNode(), `Column ID ${problem}`, {
				itemIndex,
				description: `"${customColumnId}" is not a valid column ID. Use up to 24 characters: lowercase letters, digits and underscores, not starting with a digit.`,
			});
		}
	}

	let rawDefaults: Record<string, unknown> | undefined;
	const rawDefaultsInput = options.defaultsJson;
	if (rawDefaultsInput && rawDefaultsInput !== '{}') {
		const parsed =
			typeof rawDefaultsInput === 'string' ? safeJsonParse(rawDefaultsInput) : rawDefaultsInput;
		if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
			throw new NodeOperationError(this.getNode(), 'Defaults (JSON) must be a valid JSON object', {
				itemIndex,
			});
		}
		rawDefaults = parsed as Record<string, unknown>;
	}

	const baseVariables = {
		boardId,
		title,
		description,
		afterColumnId: afterColumnId ?? null,
		customColumnId: customColumnId || null,
	};

	// Rollup (multi-level boards): sent as the capabilities argument. Only
	// combinations the API supports pass — anything else is a friendly error
	// instead of a cryptic 500.
	const rollupFunction = (typeSettings.rollupFunction as string) || '';
	assertRollupFunctionAllowed(this.getNode(), itemIndex, columnType, rollupFunction);
	const capabilities = rollupFunction ? { calculated: { function: rollupFunction } } : null;

	if (!rawDefaults && columnType === 'status') {
		const rows = ((this.getNodeParameter('statusLabels', itemIndex, {}) as IDataObject).label ??
			[]) as StatusLabelRow[];
		const defaults = buildStatusColumnDefaults(rows);
		if (defaults || capabilities) {
			const data = await client.execute(
				`mutation ($boardId: ID!, $customColumnId: String, $title: String!, $description: String, $afterColumnId: ID, $defaults: CreateStatusColumnSettingsInput, $capabilities: StatusColumnCapabilitiesInput) {
					create_status_column(
						board_id: $boardId,
						id: $customColumnId,
						title: $title,
						description: $description,
						after_column_id: $afterColumnId,
						defaults: $defaults,
						capabilities: $capabilities
					) { ${CREATED_COLUMN_FIELDS} }
				}`,
				itemIndex,
				{ ...baseVariables, defaults: defaults ?? null, capabilities },
			);
			return (data.create_status_column ?? {}) as IDataObject;
		}
	}

	if (!rawDefaults && columnType === 'dropdown') {
		const rows = ((this.getNodeParameter('dropdownLabels', itemIndex, {}) as IDataObject).label ??
			[]) as Array<{ label: string }>;
		const defaults = buildDropdownColumnDefaults(rows, {
			limitSelect: typeSettings.limitSelect as boolean | undefined,
			labelLimitCount: typeSettings.labelLimitCount as number | undefined,
		});
		if (defaults) {
			const data = await client.execute(
				`mutation ($boardId: ID!, $customColumnId: String, $title: String!, $description: String, $afterColumnId: ID, $defaults: CreateDropdownColumnSettingsInput) {
					create_dropdown_column(
						board_id: $boardId,
						id: $customColumnId,
						title: $title,
						description: $description,
						after_column_id: $afterColumnId,
						defaults: $defaults
					) { ${CREATED_COLUMN_FIELDS} }
				}`,
				itemIndex,
				{ ...baseVariables, defaults },
			);
			return (data.create_dropdown_column ?? {}) as IDataObject;
		}
	}

	const defaults = rawDefaults ?? buildTypeSettingsDefaults(columnType, typeSettings);

	let data: IDataObject;
	try {
		data = await client.execute(
			`mutation ($boardId: ID!, $customColumnId: String, $title: String!, $columnType: ColumnType!, $description: String, $afterColumnId: ID, $defaults: JSON, $capabilities: ColumnCapabilitiesInput) {
				create_column(
					board_id: $boardId,
					id: $customColumnId,
					title: $title,
					column_type: $columnType,
					description: $description,
					after_column_id: $afterColumnId,
					defaults: $defaults,
					capabilities: $capabilities
				) { ${CREATED_COLUMN_FIELDS} }
			}`,
			itemIndex,
			{
				...baseVariables,
				columnType,
				// The API's JSON scalar arrives as a string.
				defaults: defaults ? JSON.stringify(defaults) : null,
				capabilities,
			},
		);
	} catch (error) {
		// A board can hold only ONE dependency column; a second create fails
		// with the generic "Cannot add column" (verified live 2026-07-17).
		if (
			columnType === 'dependency' &&
			error instanceof Error &&
			error.message.includes('Cannot add column')
		) {
			throw new NodeOperationError(this.getNode(), 'Cannot add a dependency column', {
				itemIndex,
				description:
					'A board can only have one dependency column — this board most likely already has one. Use the existing column, or delete it first.',
			});
		}
		// Everything the client throws is already a mapped NodeApiError.
		throw ensureNodeError(this.getNode(), error);
	}

	const created = (data.create_column ?? {}) as IDataObject;

	// dependency: create_column silently DISCARDS defaults for this type
	// (verified live 2026-07-17), so Allow Linking Multiple Items is applied
	// via a follow-up update_column. That mutation REPLACES the dependency
	// settings wholesale — boardIds must be re-sent or it is wiped to [],
	// which breaks all value writes on the column (verified live).
	if (
		columnType === 'dependency' &&
		typeof typeSettings.allowMultipleItems === 'boolean' &&
		!rawDefaults &&
		created.id
	) {
		const updated = await client.execute(
			`mutation ($boardId: ID!, $columnId: String!, $revision: String!, $settings: JSON) {
				update_column(
					board_id: $boardId,
					id: $columnId,
					column_type: dependency,
					revision: $revision,
					settings: $settings
				) { ${CREATED_COLUMN_FIELDS} }
			}`,
			itemIndex,
			{
				boardId,
				columnId: created.id,
				revision: created.revision,
				// update_column wants a real JSON object here, not a string —
				// the exact opposite of create_column's defaults (verified live).
				settings: {
					allowMultipleItems: typeSettings.allowMultipleItems,
					boardIds: [Number(boardId)],
				},
			},
		);
		return (updated.update_column ?? created) as IDataObject;
	}

	return created;
}

/**
 * File: Add to File Column — add_file_to_column through the /v2/file
 * multipart endpoint, taking the file from an input binary field.
 */
async function addFileToColumn(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const columnId = this.getNodeParameter('fileColumnId', itemIndex) as string;
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;

	const binaryMetadata = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const fileBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

	// IDs are validated numeric (resource locator / column picker), and the
	// file endpoint rejects variables for anything but the file itself —
	// inline them.
	const data = await client.uploadFile(
		`mutation ($file: File!) {
			add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) {
				id
				name
				url
				public_url
				file_extension
				file_size
			}
		}`,
		fileBuffer,
		binaryMetadata.fileName ?? 'file',
		binaryMetadata.mimeType ?? 'application/octet-stream',
	);

	return {
		json: (data.add_file_to_column ?? {}) as IDataObject,
		pairedItem: { item: itemIndex },
	};
}

/** Asset fields every file read returns. */
const ASSET_FIELDS = `
	id
	name
	url
	public_url
	file_extension
	file_size
	created_at
	uploaded_by { id name }
`;

type AssetRow = IDataObject & { id?: string; name?: string; public_url?: string };

/**
 * File: Download — resolve each asset's short-lived public_url, then fetch
 * it immediately into an n8n binary field. Source is either a direct asset
 * ID or a file pick from an item's file column (where "All Files in Column"
 * yields one output item per file).
 */
async function downloadFile(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const source = this.getNodeParameter('downloadSource', itemIndex, 'assetId') as string;
	const binaryPropertyName = this.getNodeParameter('downloadBinaryPropertyName', itemIndex) as string;

	let assets: AssetRow[];
	if (source === 'fileColumn') {
		const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
			extractValue: true,
		}) as string;
		const columnId = this.getNodeParameter('fileColumnId', itemIndex) as string;
		const fileId = this.getNodeParameter('columnFileId', itemIndex) as string;

		const columnAssets = await fetchItemAssets.call(this, client, itemIndex, itemId, [columnId]);
		assets =
			fileId === ALL_COLUMN_FILES
				? columnAssets
				: columnAssets.filter((asset) => String(asset.id) === String(fileId));
		if (assets.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				fileId === ALL_COLUMN_FILES
					? `Column ${columnId} on item ${itemId} has no files`
					: `File ${fileId} is no longer in column ${columnId} on item ${itemId}`,
				{ itemIndex },
			);
		}
	} else {
		const assetId = this.getNodeParameter('assetId', itemIndex) as string;
		const data = await client.execute(
			`query ($ids: [ID!]!) { assets(ids: $ids) { ${ASSET_FIELDS} } }`,
			itemIndex,
			{ ids: [assetId] },
		);
		assets = (data.assets ?? []) as AssetRow[];
		if (!assets[0]?.public_url) {
			throw new NodeOperationError(this.getNode(), `Asset ${assetId} not found or has no file`, {
				itemIndex,
			});
		}
	}

	const results: INodeExecutionData[] = [];
	for (const asset of assets) {
		if (!asset.public_url) continue;

		// public_url is a pre-signed S3 URL (expires in ~1h) — no auth header.
		const fileContent = (await this.helpers.httpRequest({
			url: asset.public_url,
			encoding: 'arraybuffer',
		})) as Buffer;

		const binaryData = await this.helpers.prepareBinaryData(
			Buffer.from(fileContent),
			(asset.name as string) ?? `asset-${asset.id}`,
		);

		// The pre-signed URL expires within the hour — pointless downstream, drop it.
		const assetJson = { ...asset };
		delete assetJson.public_url;
		results.push({
			json: assetJson,
			binary: { [binaryPropertyName]: binaryData },
			pairedItem: { item: itemIndex },
		});
	}
	return results;
}

/** One item's assets, optionally scoped to specific file columns. */
async function fetchItemAssets(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	itemId: string,
	columnIds?: string[],
): Promise<AssetRow[]> {
	const scoped = columnIds !== undefined && columnIds.length > 0;
	const data = await client.execute(
		`query ($ids: [ID!]${scoped ? ', $columnIds: [String]' : ''}) {
			items(ids: $ids) {
				assets(assets_source: columns${scoped ? ', column_ids: $columnIds' : ''}) { ${ASSET_FIELDS} }
			}
		}`,
		itemIndex,
		scoped ? { ids: [itemId], columnIds } : { ids: [itemId] },
	);
	const items = (data.items ?? []) as Array<{ assets?: AssetRow[] }>;
	if (items.length === 0) {
		throw new NodeOperationError(this.getNode(), `Item ${itemId} not found`, { itemIndex });
	}
	return items[0].assets ?? [];
}

/**
 * File: Get Many — asset metadata by direct IDs, from one board item
 * (all files / file columns / update attachments), or from one file column
 * (one item, or a whole-board scan).
 */
export async function getManyAssets(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const source = this.getNodeParameter('assetsSource', itemIndex, 'assetIds') as string;

	if (source === 'assetIds') {
		const assetIds = normalizeIdList(this.getNodeParameter('assetIds', itemIndex));
		if (assetIds.length === 0) {
			throw new NodeOperationError(this.getNode(), 'Provide at least one asset ID', {
				itemIndex,
			});
		}
		const data = await client.execute(
			`query ($ids: [ID!]!) { assets(ids: $ids) { ${ASSET_FIELDS} } }`,
			itemIndex,
			{ ids: assetIds },
		);
		return (data.assets ?? []) as IDataObject[];
	}

	const options = this.getNodeParameter('getAssetsOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;

	if (source === 'boardItem') {
		const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
			extractValue: true,
		}) as string;
		const scope = this.getNodeParameter('itemAssetsScope', itemIndex, 'all') as string;

		if (scope === 'updates') {
			return (await fetchItemUpdateAssets.call(this, client, itemIndex, itemId, limit)).map(
				(asset) => ({ ...asset, itemId, source: 'updates' }),
			);
		}

		const columnIds =
			scope === 'columns'
				? normalizeIdList(this.getNodeParameter('itemFileColumnIds', itemIndex, []))
				: undefined;
		// scope "all" also covers update attachments (assets_source: all).
		const data = await client.execute(
			`query ($ids: [ID!]${columnIds?.length ? ', $columnIds: [String]' : ''}) {
				items(ids: $ids) {
					assets(assets_source: ${scope === 'columns' ? 'columns' : 'all'}${
						columnIds?.length ? ', column_ids: $columnIds' : ''
					}) { ${ASSET_FIELDS} }
				}
			}`,
			itemIndex,
			columnIds?.length ? { ids: [itemId], columnIds } : { ids: [itemId] },
		);
		const items = (data.items ?? []) as Array<{ assets?: AssetRow[] }>;
		if (items.length === 0) {
			throw new NodeOperationError(this.getNode(), `Item ${itemId} not found`, { itemIndex });
		}
		return (items[0].assets ?? [])
			.slice(0, limit)
			.map((asset) => ({ ...asset, itemId, source: scope }));
	}

	// source === 'boardColumn'
	const columnId = this.getNodeParameter('fileColumnId', itemIndex) as string;
	const itemId = this.getNodeParameter('itemId', itemIndex, '', { extractValue: true }) as string;

	if (itemId) {
		const assets = await fetchItemAssets.call(this, client, itemIndex, itemId, [columnId]);
		return assets.slice(0, limit).map((asset) => ({ ...asset, itemId, columnId }));
	}

	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	return scanBoardColumnAssets.call(this, client, itemIndex, boardId, columnId, limit);
}

/** Update attachments of one item, paging updates until the asset budget fills. */
export async function fetchItemUpdateAssets(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	itemId: string,
	limit: number,
): Promise<AssetRow[]> {
	const pageSize = 100;
	const assets: AssetRow[] = [];
	const seen = new Set<string>();
	let page = 1;

	// Bounded: stops at the asset budget or when the updates run out.
	for (;;) {
		const data = await client.execute(
			`query ($ids: [ID!], $limit: Int!, $page: Int!) {
				items(ids: $ids) {
					updates(limit: $limit, page: $page) {
						id
						assets { ${ASSET_FIELDS} }
					}
				}
			}`,
			itemIndex,
			{ ids: [itemId], limit: pageSize, page },
		);
		const items = (data.items ?? []) as Array<{
			updates?: Array<{ id: string; assets?: AssetRow[] }>;
		}>;
		if (page === 1 && items.length === 0) {
			throw new NodeOperationError(this.getNode(), `Item ${itemId} not found`, { itemIndex });
		}
		const updates = items[0]?.updates ?? [];

		for (const update of updates) {
			for (const asset of update.assets ?? []) {
				const id = String(asset.id);
				// The same asset can be attached to several updates — first one wins.
				if (seen.has(id)) continue;
				seen.add(id);
				assets.push({ ...asset, updateId: update.id });
				if (assets.length >= limit) return assets;
			}
		}

		if (updates.length < pageSize) return assets;
		page += 1;
	}
}

/**
 * Whole-board file column scan: cursor-page through the board's items
 * requesting only the column's assets, and stop as soon as the asset budget
 * is filled. On a sparse board this can page through many items before
 * filling the budget — the Limit option documents that.
 */
export async function scanBoardColumnAssets(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	boardId: string,
	columnId: string,
	limit: number,
): Promise<IDataObject[]> {
	const pageSize = 100;
	const itemFields = `id name assets(assets_source: columns, column_ids: ["${columnId}"]) { ${ASSET_FIELDS} }`;

	const assets: IDataObject[] = [];
	const collect = (items: Array<IDataObject & { assets?: AssetRow[] }>): boolean => {
		for (const item of items) {
			for (const asset of item.assets ?? []) {
				assets.push({ ...asset, itemId: item.id, itemName: item.name, columnId });
				if (assets.length >= limit) return true;
			}
		}
		return false;
	};

	const firstData = await client.execute(
		`query ($ids: [ID!], $limit: Int!) {
			boards(ids: $ids) {
				items_page(limit: $limit) {
					cursor
					items { ${itemFields} }
				}
			}
		}`,
		itemIndex,
		{ ids: [boardId], limit: pageSize },
	);
	const boards = (firstData.boards ?? []) as Array<{
		items_page?: { cursor: string | null; items: Array<IDataObject & { assets?: AssetRow[] }> };
	}>;
	if (boards.length === 0) {
		throw new NodeOperationError(this.getNode(), `Board ${boardId} not found`, { itemIndex });
	}
	let cursor = boards[0].items_page?.cursor ?? null;
	if (collect(boards[0].items_page?.items ?? [])) return assets;

	while (cursor) {
		const data = await client.execute(
			`query ($cursor: String!, $limit: Int!) {
				next_items_page(cursor: $cursor, limit: $limit) {
					cursor
					items { ${itemFields} }
				}
			}`,
			itemIndex,
			{ cursor, limit: pageSize },
		);
		const nextPage = data.next_items_page as unknown as
			| { cursor: string | null; items: Array<IDataObject & { assets?: AssetRow[] }> }
			| undefined;
		if (!nextPage) break;
		if (collect(nextPage.items ?? [])) return assets;
		cursor = nextPage.cursor;
	}

	return assets;
}

/**
 * Update: Get Many — updates(limit, page) account-wide, or the updates
 * connection of one item. Replies and assets are opt-in (they add
 * complexity cost per update).
 */
async function getManyUpdates(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const scope = this.getNodeParameter('updatesScope', itemIndex) as string;
	const options = this.getNodeParameter('getUpdatesOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const page = (options.page as number) ?? 1;

	const extraFields = [
		options.includeReplies === true
			? 'replies { id body text_body created_at creator { id name } }'
			: '',
		options.includeAssets === true ? 'assets { id name url file_extension }' : '',
	].join('\n');
	const updateFields = `
		id
		body
		text_body
		created_at
		updated_at
		item_id
		creator { id name }
		${extraFields}
	`;

	if (scope === 'account') {
		const data = await client.execute(
			`query ($limit: Int!, $page: Int!) {
				updates(limit: $limit, page: $page) { ${updateFields} }
			}`,
			itemIndex,
			{ limit, page },
		);
		return (data.updates ?? []) as IDataObject[];
	}

	const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const data = await client.execute(
		`query ($ids: [ID!], $limit: Int!, $page: Int!) {
			items(ids: $ids) {
				updates(limit: $limit, page: $page) { ${updateFields} }
			}
		}`,
		itemIndex,
		{ ids: [itemId], limit, page },
	);
	return ((data.items ?? []) as Array<{ updates?: IDataObject[] }>)[0]?.updates ?? [];
}

/**
 * Standard user profile, shared by User: Get and User: Get Many. Audited
 * against API 2026-10 (2026-07-19): the deprecated fields are gone from the
 * pinned schema — kind replaces is_admin/is_guest/is_view_only, status
 * replaces enabled/is_pending, photo_url replaces the flat photo_* fields.
 */
const USER_FIELDS = `
	id
	name
	email
	title
	kind
	status
	created_at
	last_activity
	phone
	mobile_phone
	location
	time_zone_identifier
	url
	photo_url { thumb_small }
	teams { id name }
`;

/**
 * Extra profile fields behind the Include Extended Info toggle — everything
 * else the 2026-10 User entity exposes (all verified live 2026-07-19),
 * including the full photo size set and the out-of-office status.
 */
const USER_EXTENDED_FIELDS = `
	account_id
	became_active_at
	birthday
	country_code
	current_language
	invitation_method
	is_deleted
	is_email_confirmed
	serial_number
	utc_hours_diff
	out_of_office { active disable_notifications end_date start_date type }
	user_config { kind role_id visibility }
`;

/** Builds the user field selection; exported for tests. */
export function buildUserFieldSelection(includeExtended: boolean): string {
	if (!includeExtended) return USER_FIELDS;
	// Extended mode also upgrades the photo selection to every size.
	return (
		USER_FIELDS.replace(
			'photo_url { thumb_small }',
			'photo_url { original small thumb thumb_small tiny }',
		) + USER_EXTENDED_FIELDS
	);
}

/**
 * User: Get Many — the users query with server-side filters. The Search
 * filter maps to users(name:), which matches names AND emails server-side —
 * critical on enterprise accounts with 10k+ users. The Kind filter uses the
 * 2026-07+ user_kind/status arguments (the legacy kind: argument degraded
 * partial name matches to exact; user_kind does not — verified live
 * 2026-07-19), so no client-side filtering is needed anymore.
 */
async function getManyUsers(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const page = (options.page as number) ?? 1;
	const filters = this.getNodeParameter('userFilters', itemIndex, {}) as IDataObject;

	const varDefs = ['$limit: Int!', '$page: Int!'];
	const args = ['limit: $limit', 'page: $page'];
	const variables: Record<string, unknown> = { limit, page };

	if (filters.name) {
		varDefs.push('$name: String');
		args.push('name: $name');
		variables.name = filters.name;
	}
	const kind = (filters.kind as string) || 'all';
	if (kind === 'guests') {
		args.push('user_kind: { in: [GUEST] }');
	} else if (kind === 'non_guests') {
		args.push('user_kind: { not_in: [GUEST] }');
	} else if (kind === 'non_pending') {
		args.push('status: [ACTIVE]');
	}
	const emails = normalizeIdList(filters.emails);
	if (emails.length > 0) {
		varDefs.push('$emails: [String!]');
		args.push('emails: $emails');
		variables.emails = emails;
	}
	const userIds = normalizeIdList(filters.userIds);
	if (userIds.length > 0) {
		varDefs.push('$ids: [ID!]');
		args.push('ids: $ids');
		variables.ids = userIds;
	}
	if (options.newestFirst === true) {
		// Replaces the deprecated newest_first: argument.
		args.push('sort: [{ field: CREATED_AT, direction: DESC }]');
	}

	const data = await client.execute(
		`query (${varDefs.join(', ')}) {
			users(${args.join(', ')}) { ${USER_FIELDS} }
		}`,
		itemIndex,
		variables,
	);

	return (data.users ?? []) as IDataObject[];
}

/**
 * Directory Resource: Get Many — get_directory_resources with server-side
 * attribute filters and cursor pagination (Enterprise-only; see
 * directoryResources.ts for the live-verified quirks).
 */
async function getManyDirectoryResources(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const filterRows = (
		this.getNodeParameter('directoryFilters', itemIndex, {}) as {
			rules?: DirectoryFilterRow[];
		}
	).rules;

	const startingCursor = ((options.startingCursor ?? '') as string).trim();
	const includeCursor = options.includeCursor === true;
	const queryParams = buildDirectoryQueryParams(
		filterRows ?? [],
		(options.filtersMatch as string) ?? 'and',
	);

	try {
		const { rows, nextCursor } = await fetchAllDirectoryResources({
			client,
			itemIndex,
			queryParams,
			limit: (options.limit as number) ?? DEFAULT_LIMIT,
			startCursor: startingCursor || undefined,
		});
		return includeCursor ? [...rows, { nextCursor }] : rows;
	} catch (error) {
		const friendly = describeDirectoryError(error);
		if (friendly) {
			throw new NodeOperationError(this.getNode(), 'Resource Directory request failed', {
				itemIndex,
				description: friendly,
			});
		}
		// Anything else is already a mapped NodeApiError from the client.
		throw ensureNodeError(this.getNode(), error);
	}
}

/**
 * Search: one request against the entity's field on the cross-entity
 * `search` root query. Which entity type is searched follows from the
 * operation (SEARCH_OPERATION_ENTITY). Scale-safe by design: server-side
 * relevance search, hard-capped at 20 results, no pagination (see
 * accountSearch.ts for the verified API contract).
 */
async function searchAcrossAccount(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const entity = SEARCH_OPERATION_ENTITY[operation];
	const searchText = (this.getNodeParameter('searchQuery', itemIndex) as string).trim();
	const includeLiveData = this.getNodeParameter('includeLiveData', itemIndex, false) === true;
	const options = this.getNodeParameter('searchOptions', itemIndex, {}) as IDataObject;

	if (!searchText) {
		throw new NodeOperationError(this.getNode(), 'Query is required', {
			itemIndex,
			description: 'Provide the text to search for.',
		});
	}

	const filters: AccountSearchFilters = {
		boardIds: normalizeIdList(options.boardIds),
		workspaceIds: normalizeIdList(options.workspaceIds),
		creatorIds: extractUserRowIds(options.creatorIds),
		itemIds: normalizeIdList(options.itemIds),
		timelineType: options.timelineType as string | undefined,
		timelineProductKind: options.timelineProductKind as string | undefined,
		createdAfter: toIso8601(options.createdAfter),
		createdBefore: toIso8601(options.createdBefore),
		updatedAfter: toIso8601(options.updatedAfter),
		updatedBefore: toIso8601(options.updatedBefore),
	};

	const plan = buildAccountSearchPlan(
		searchText,
		[entity],
		includeLiveData,
		(options.searchLimit as number) ?? 10,
		options.strategy as string | undefined,
		filters,
	);

	const data = await client.execute(plan.query, itemIndex, plan.variables);
	return flattenSearchResults(data.search as IDataObject | undefined, [entity], includeLiveData);
}

/**
 * Meeting: Get — one Notetaker meeting via the ids filter. access: ALL so
 * meetings shared with the user (not just owned) resolve by ID — the API
 * defaults to OWN, which would silently hide shared meetings.
 */
async function getMeeting(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const meetingId = this.getNodeParameter('meetingId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const options = this.getNodeParameter('getMeetingOptions', itemIndex, {}) as IDataObject;

	const { rows } = await fetchAllMeetings({
		client,
		itemIndex,
		filters: { ids: [meetingId], access: 'ALL' },
		fieldSelection: buildMeetingFieldSelection({
			// Single-meeting reads default to the rich view; only the
			// potentially huge transcript is opt-in.
			topics: options.includeTopics !== false,
			actionItems: options.includeActionItems !== false,
			transcript: options.includeTranscript === true,
		}),
		limit: 1,
	});

	const meeting = rows[0];
	if (!meeting) {
		throw new NodeOperationError(this.getNode(), `Meeting ${meetingId} not found`, {
			itemIndex,
			description:
				'The Notetaker API only returns meetings with a completed recording that you own or that are shared with you.',
		});
	}
	return meeting;
}

/**
 * Meeting: Get Many — notetaker.meetings with server-side search and cursor
 * pagination. Topics/action items/transcript are opt-in per the scale rules
 * (transcripts especially can run to thousands of segments per meeting).
 */
async function getManyMeetings(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const filters = this.getNodeParameter('meetingFilters', itemIndex, {}) as IDataObject;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const startingCursor = ((options.startingCursor ?? '') as string).trim();
	const includeCursor = options.includeCursor === true;

	const { rows, nextCursor } = await fetchAllMeetings({
		client,
		itemIndex,
		filters: buildMeetingsFilters({
			ids: normalizeIdList(filters.meetingIds ?? ''),
			search: filters.search as string | undefined,
			access: filters.access as string | undefined,
		}),
		fieldSelection: buildMeetingFieldSelection({
			topics: options.includeTopics === true,
			actionItems: options.includeActionItems === true,
			transcript: options.includeTranscript === true,
		}),
		limit: (options.limit as number) ?? DEFAULT_LIMIT,
		startCursor: startingCursor || undefined,
	});

	return includeCursor ? [...rows, { nextCursor }] : rows;
}

/**
 * Directory Resource: Update Attributes — one bulk mutation for all IDs.
 * The API returns only { success }, so the inputs are echoed for downstream
 * use. Semantics (all verified live 2026-07-17): SKILLS values are APPENDED
 * to the existing set with dedupe — not replaced; JOB_ROLE/LOCATION hold one
 * value that gets overwritten. Removing/clearing is impossible: values: []
 * returns success: true but silently changes nothing, and values: [""] is
 * rejected with INVALID_INPUT — hence the empty-values guard below.
 */
async function updateDirectoryResourceAttributes(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const attribute = this.getNodeParameter('directoryAttribute', itemIndex) as string;
	const values = normalizeIdList(this.getNodeParameter('directoryValues', itemIndex, ''));
	const resourceIds = normalizeIdList(this.getNodeParameter('directoryResourceIds', itemIndex));

	if (resourceIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one resource ID is required', {
			itemIndex,
			description:
				'Provide the directory resource IDs to update (from the Get Many operation), comma-separated.',
		});
	}

	if (values.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one value is required', {
			itemIndex,
			description:
				'The monday.com API cannot clear or remove Resource Directory attribute values — an empty values list is accepted but silently changes nothing. Provide the value(s) to assign.',
		});
	}

	try {
		const data = await client.execute(
			`mutation ($attribute: DirectoryResourceAttribute!, $values: [String!]!, $resourceIds: [ID!]!) {
				update_directory_resources_attributes(attribute: $attribute, values: $values, resource_ids: $resourceIds) {
					success
				}
			}`,
			itemIndex,
			{ attribute, values, resourceIds },
		);
		return {
			success:
				((data.update_directory_resources_attributes ?? {}) as IDataObject).success === true,
			attribute,
			values,
			resourceIds,
		};
	} catch (error) {
		const friendly = describeDirectoryError(error);
		if (friendly) {
			throw new NodeOperationError(this.getNode(), 'Resource Directory update failed', {
				itemIndex,
				description: friendly,
			});
		}
		// Anything else is already a mapped NodeApiError from the client.
		throw ensureNodeError(this.getNode(), error);
	}
}

/**
 * Re-throws a departments API failure with a friendly explanation when the
 * error is one departments.ts knows how to explain (plan gating, deleted
 * department); anything else propagates as the client's already-mapped
 * NodeApiError.
 */
function rethrowDepartmentError(
	context: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): never {
	const friendly = describeDepartmentError(error);
	if (friendly) {
		throw new NodeOperationError(context.getNode(), 'Departments request failed', {
			itemIndex,
			description: friendly,
		});
	}
	// Anything else is already a mapped NodeApiError from the client.
	throw error;
}

/**
 * Reads and dedupes the Users selection of the department operations.
 * Dropdown values are plain user IDs; expression mode may pass a CSV.
 */
function getDepartmentUserIds(context: IExecuteFunctions, itemIndex: number): string[] {
	const userIds = [
		...new Set(extractUserRowIds(context.getNodeParameter('departmentUserIds', itemIndex, {}))),
	];
	if (userIds.length === 0) {
		throw new NodeOperationError(context.getNode(), 'Select at least one user', { itemIndex });
	}
	return userIds;
}

/**
 * Department: Get Many — the departments query (Enterprise-only). No
 * pagination exists (departments are a bounded, admin-managed collection);
 * members/owners ride behind opt-in toggles because each member is a full
 * User object.
 */
async function getManyDepartments(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = this.getNodeParameter('getDepartmentsOptions', itemIndex, {}) as IDataObject;
	const ids = normalizeIdList((options.departmentIds as string) ?? '');
	const selection = buildDepartmentFieldSelection(
		options.includeMembers === true,
		options.includeOwners === true,
	);

	try {
		const data = await client.execute(
			`query ($ids: [ID!]) {
				departments(ids: $ids) { ${selection} }
			}`,
			itemIndex,
			{ ids: ids.length > 0 ? ids : null },
		);
		return (data.departments ?? []) as IDataObject[];
	} catch (error) {
		rethrowDepartmentError(this, error, itemIndex);
	}
}

/**
 * Department: Create / Update — create_department and update_department
 * share the same data input (name + reserved_seats). Update requires at
 * least one field; assigned_seats is read-only (derived from members).
 */
async function upsertDepartment(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	operation: 'createDepartment' | 'updateDepartment',
): Promise<IDataObject> {
	const payload: IDataObject = {};
	let query: string;
	const variables: Record<string, unknown> = {};

	if (operation === 'createDepartment') {
		payload.name = this.getNodeParameter('departmentName', itemIndex) as string;
		const options = this.getNodeParameter('createDepartmentOptions', itemIndex, {}) as IDataObject;
		if (options.reservedSeats !== undefined) {
			payload.reserved_seats = options.reservedSeats as number;
		}
		query = `mutation ($data: CreateDepartmentDataInput!) {
			create_department(data: $data) { ${DEPARTMENT_FIELDS} }
		}`;
	} else {
		const fields = this.getNodeParameter('departmentUpdateFields', itemIndex, {}) as IDataObject;
		if (typeof fields.name === 'string' && fields.name.trim() !== '') {
			payload.name = fields.name.trim();
		}
		if (fields.reservedSeats !== undefined) {
			payload.reserved_seats = fields.reservedSeats as number;
		}
		if (Object.keys(payload).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Set at least one field to update', {
				itemIndex,
				description: 'Add Name or Reserved Seats under Update Fields.',
			});
		}
		variables.departmentId = this.getNodeParameter('departmentId', itemIndex) as string;
		query = `mutation ($departmentId: ID!, $data: UpdateDepartmentOptionsInput) {
			update_department(department_id: $departmentId, data: $data) { ${DEPARTMENT_FIELDS} }
		}`;
	}
	variables.data = payload;

	try {
		const data = await client.execute(query, itemIndex, variables);
		const key = operation === 'createDepartment' ? 'create_department' : 'update_department';
		return (data[key] ?? {}) as IDataObject;
	} catch (error) {
		rethrowDepartmentError(this, error, itemIndex);
	}
}

/** Department: Delete — permanent; members simply end up without a department. */
async function deleteDepartment(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const departmentId = this.getNodeParameter('departmentId', itemIndex) as string;
	try {
		const data = await client.execute(
			`mutation ($departmentId: ID!) {
				delete_department(department_id: $departmentId) { ${DEPARTMENT_FIELDS} }
			}`,
			itemIndex,
			{ departmentId },
		);
		return { ...((data.delete_department ?? {}) as IDataObject), deleted: true };
	} catch (error) {
		rethrowDepartmentError(this, error, itemIndex);
	}
}

/**
 * Department: Assign Members. One mutation for all users; the API reports
 * per-user results in-band (successful_users / failed_users) — and SILENTLY
 * DROPS unknown user IDs from both lists (verified live 2026-07-19), so the
 * request is diffed against the response to surface those as failures.
 * A user already in another department is MOVED here without an error.
 */
async function assignDepartmentMembers(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const departmentId = this.getNodeParameter('departmentId', itemIndex) as string;
	const userIds = getDepartmentUserIds(this, itemIndex);

	let result: IDataObject;
	try {
		const data = await client.execute(
			`mutation ($departmentId: ID!, $userIds: [ID!]!) {
				assign_department_members(department_id: $departmentId, user_ids: $userIds) {
					successful_users { id name }
					failed_users { id name }
				}
			}`,
			itemIndex,
			{ departmentId, userIds },
		);
		result = (data.assign_department_members ?? {}) as IDataObject;
	} catch (error) {
		rethrowDepartmentError(this, error, itemIndex);
	}

	const successful = (result.successful_users ?? []) as IDataObject[];
	const failed = (result.failed_users ?? []) as IDataObject[];
	const successIds = new Set(successful.map((user) => String(user.id)));
	const failedIds = new Set(failed.map((user) => String(user.id)));

	const failures: string[] = [];
	const rows = userIds.map((userId) => {
		if (successIds.has(userId)) {
			const user = successful.find((entry) => String(entry.id) === userId);
			return { userId, name: user?.name ?? null, departmentId, success: true } as IDataObject;
		}
		failures.push(userId);
		const error = failedIds.has(userId)
			? 'The user could not be assigned'
			: 'Unknown user ID — the API silently ignored it';
		return { userId, departmentId, success: false, error } as IDataObject;
	});

	if (failures.length > 0 && !this.continueOnFail()) {
		throw new NodeOperationError(
			this.getNode(),
			`${failures.length} of ${userIds.length} users could not be assigned to department ${departmentId}: ${failures.join(', ')}. The other users were still assigned.`,
			{ itemIndex },
		);
	}

	return rows;
}

/**
 * Department: Assign Owners — assign_department_owner takes ONE user per
 * call, so multiple owners go out as one aliased request (per-alias errors;
 * the batch is NOT atomic — verified live 2026-07-19).
 */
async function assignDepartmentOwners(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const departmentId = this.getNodeParameter('departmentId', itemIndex) as string;
	const userIds = getDepartmentUserIds(this, itemIndex);

	const query = buildAssignOwnersMutation(userIds);
	const variables: Record<string, unknown> = { departmentId };
	userIds.forEach((userId, index) => {
		variables[`user${index}`] = userId;
	});

	let data: IDataObject;
	let errors: Awaited<ReturnType<MondayGraphQLClient['executeBulk']>>['errors'];
	try {
		({ data, errors } = await client.executeBulk(query, itemIndex, variables));
	} catch (error) {
		rethrowDepartmentError(this, error, itemIndex);
	}

	const failures: Array<{ userId: string; message: string }> = [];
	const rows = userIds.map((userId, index) => {
		const payload = data[`owner${index}`] as IDataObject | null | undefined;
		if (payload) {
			const owner = (payload.owner ?? {}) as IDataObject;
			return { userId, name: owner.name ?? null, departmentId, success: true } as IDataObject;
		}
		const failure = errors.find((error) => error.path?.[0] === `owner${index}`);
		const message = failure?.message ?? 'Unknown error';
		failures.push({ userId, message });
		return {
			userId,
			departmentId,
			success: false,
			error: message,
			errorCode: failure?.extensions?.code ?? failure?.error_code ?? null,
		} as IDataObject;
	});

	if (failures.length > 0 && !this.continueOnFail()) {
		const detail = failures.map((failure) => `${failure.userId} (${failure.message})`).join(', ');
		throw new NodeOperationError(
			this.getNode(),
			`${failures.length} of ${userIds.length} owners could not be assigned to department ${departmentId}: ${detail}. The other owners were still assigned.`,
			{ itemIndex },
		);
	}

	return rows;
}

/**
 * Department: Unassign Owners — idempotent (users who are not owners are
 * echoed back without an error, verified live 2026-07-19).
 */
async function unassignDepartmentOwners(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const departmentId = this.getNodeParameter('departmentId', itemIndex) as string;
	const userIds = getDepartmentUserIds(this, itemIndex);

	try {
		const data = await client.execute(
			`mutation ($departmentId: ID!, $userIds: [ID!]!) {
				unassign_department_owners(department_id: $departmentId, user_ids: $userIds) {
					unassigned_users { id name }
				}
			}`,
			itemIndex,
			{ departmentId, userIds },
		);
		const unassigned = (((data.unassign_department_owners ?? {}) as IDataObject)
			.unassigned_users ?? []) as IDataObject[];
		return unassigned.map((user) => ({
			userId: user.id,
			name: user.name ?? null,
			departmentId,
			unassigned: true,
		}));
	} catch (error) {
		rethrowDepartmentError(this, error, itemIndex);
	}
}

/**
 * Department: Clear Users' Department — no department ID: each user is
 * removed from whatever department they are currently in. Unknown user IDs
 * behave inconsistently on the API side (sometimes NOT_FOUND, sometimes
 * silently echoed) — a NOT_FOUND here therefore names the offending user.
 */
async function clearUsersDepartment(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const userIds = getDepartmentUserIds(this, itemIndex);

	try {
		const data = await client.execute(
			`mutation ($userIds: [ID!]!) {
				clear_users_department(user_ids: $userIds) {
					cleared_users { id name }
				}
			}`,
			itemIndex,
			{ userIds },
		);
		const cleared = (((data.clear_users_department ?? {}) as IDataObject).cleared_users ??
			[]) as IDataObject[];
		return cleared.map((user) => ({
			userId: user.id,
			name: user.name ?? null,
			cleared: true,
		}));
	} catch (error) {
		rethrowDepartmentError(this, error, itemIndex);
	}
}

/**
 * Re-throws a Knowledge Base failure with a friendly explanation when the
 * error is the raw 500 the article APIs return on accounts without the
 * feature (see articles.ts); anything else propagates as the client's
 * already-mapped NodeApiError.
 */
function rethrowArticleError(context: IExecuteFunctions, error: unknown, itemIndex: number): never {
	const friendly = describeArticleError(error);
	if (friendly) {
		throw new NodeOperationError(context.getNode(), 'Knowledge Base request failed', {
			itemIndex,
			description: friendly,
		});
	}
	// Anything else is already a mapped NodeApiError from the client.
	throw error;
}

/** Article: Create — create_article makes a DRAFT in the picked workspace. */
async function createArticle(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const name = (this.getNodeParameter('articleName', itemIndex, '') as string).trim();
	const workspaceId = this.getNodeParameter('articleWorkspaceId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const options = this.getNodeParameter('createArticleOptions', itemIndex, {}) as IDataObject;

	const variables: Record<string, unknown> = { workspaceId };
	if (name) variables.name = name;
	const folderId = ((options.folderId as string) ?? '').trim();
	if (folderId) variables.folderId = folderId;

	try {
		const data = await client.execute(
			`mutation ($name: String, $workspaceId: ID!, $folderId: ID) {
				create_article(name: $name, workspace_id: $workspaceId, folder_id: $folderId) { ${ARTICLE_METADATA_FIELDS} }
			}`,
			itemIndex,
			variables,
		);
		return (data.create_article ?? {}) as IDataObject;
	} catch (error) {
		rethrowArticleError(this, error, itemIndex);
	}
}

/**
 * Article: Publish — publish_article sets visibility and, for private
 * articles, the subscriber lists (combined users+teams picker split into
 * the API's separate user/team arguments).
 */
async function publishArticle(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const options = this.getNodeParameter('publishArticleOptions', itemIndex, {}) as IDataObject;
	const privacyKind = this.getNodeParameter('articlePrivacyKind', itemIndex) as string;
	const variables = buildPublishArticleVariables({
		objectId: this.getNodeParameter('articleObjectId', itemIndex) as string,
		privacyKind,
		folderId: (options.folderId as string) ?? '',
		// The subscriber pickers are hidden (no stored value) unless Privacy
		// is Private — the defaults keep Public publishes clean.
		addSubscribers:
			privacyKind === 'PRIVATE'
				? extractUserRowIds(this.getNodeParameter('articleAddSubscribers', itemIndex, {}))
				: [],
		removeSubscribers:
			privacyKind === 'PRIVATE'
				? extractUserRowIds(this.getNodeParameter('articleRemoveSubscribers', itemIndex, {}))
				: [],
	});

	try {
		const data = await client.execute(
			`mutation ($objectId: ID!, $privacyKind: PrivacyKind!, $folderId: ID, $addSubscriberIds: [ID!], $addSubscriberTeamIds: [ID!], $removeSubscriberIds: [ID!], $removeSubscriberTeamIds: [ID!]) {
				publish_article(object_id: $objectId, privacy_kind: $privacyKind, folder_id: $folderId, add_subscriber_ids: $addSubscriberIds, add_subscriber_team_ids: $addSubscriberTeamIds, remove_subscriber_ids: $removeSubscriberIds, remove_subscriber_team_ids: $removeSubscriberTeamIds) { ${ARTICLE_METADATA_FIELDS} }
			}`,
			itemIndex,
			variables,
		);
		return (data.publish_article ?? {}) as IDataObject;
	} catch (error) {
		rethrowArticleError(this, error, itemIndex);
	}
}

/** Article: Delete — delete_article by object ID (permanent). */
async function deleteArticle(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const objectId = this.getNodeParameter('articleObjectId', itemIndex) as string;

	try {
		const data = await client.execute(
			`mutation ($objectId: ID!) {
				delete_article(object_id: $objectId) { ${ARTICLE_METADATA_FIELDS} }
			}`,
			itemIndex,
			{ objectId },
		);
		return (data.delete_article ?? {}) as IDataObject;
	} catch (error) {
		rethrowArticleError(this, error, itemIndex);
	}
}

interface ArticleRow extends IDataObject {
	metadata?: IDataObject | null;
	blocks?: IDataObject[] | null;
}

/**
 * Article: Get Many — articles(object_ids:) with optional workspace filter.
 * Published articles only; one flattened row (metadata + optional blocks)
 * per article. Bounded by the requested IDs, so a single request suffices.
 */
async function getManyArticles(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const objectIds = normalizeIdList(this.getNodeParameter('articleObjectIds', itemIndex));
	const options = this.getNodeParameter('getArticlesOptions', itemIndex, {}) as IDataObject;

	if (objectIds.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one article object ID is required', {
			itemIndex,
			description:
				'The articles query fetches by ID — provide the object IDs to return, comma-separated (from the Create operation\u2019s output or the article URLs).',
		});
	}

	const workspaceIds = normalizeIdList(options.workspaceIds);
	const includeBlocks = options.includeBlocks === true;
	const variables: Record<string, unknown> = {
		objectIds,
		limit: (options.limit as number) ?? DEFAULT_LIMIT,
		page: (options.page as number) ?? 1,
	};
	if (workspaceIds.length > 0) variables.workspaceIds = workspaceIds;

	const blockSelection = includeBlocks ? `blocks { ${ARTICLE_BLOCK_FIELDS} }` : '';

	try {
		const data = await client.execute(
			`query ($objectIds: [ID!]!, $workspaceIds: [ID!], $limit: Int, $page: Int) {
				articles(object_ids: $objectIds, workspace_ids: $workspaceIds, limit: $limit, page: $page) {
					metadata { ${ARTICLE_METADATA_FIELDS} }
					${blockSelection}
				}
			}`,
			itemIndex,
			variables,
		);
		return ((data.articles ?? []) as ArticleRow[]).map((article) => {
			const row: IDataObject = { ...(article.metadata ?? {}) };
			if (includeBlocks) row.blocks = article.blocks ?? [];
			return row;
		});
	} catch (error) {
		rethrowArticleError(this, error, itemIndex);
	}
}

/**
 * Article: Get Blocks — article_blocks pages through the PUBLISHED
 * version's content blocks; one row per block. Single request with the
 * user's limit/page (same pattern as Update: Get Many).
 */
async function getArticleBlocks(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const objectId = this.getNodeParameter('articleObjectId', itemIndex) as string;
	const options = this.getNodeParameter('getArticleBlocksOptions', itemIndex, {}) as IDataObject;

	try {
		const data = await client.execute(
			`query ($objectId: ID!, $limit: Int, $page: Int) {
				article_blocks(object_id: $objectId, limit: $limit, page: $page) { ${ARTICLE_BLOCK_FIELDS} }
			}`,
			itemIndex,
			{
				objectId,
				limit: (options.limit as number) ?? DEFAULT_LIMIT,
				page: (options.page as number) ?? 1,
			},
		);
		return (data.article_blocks ?? []) as IDataObject[];
	} catch (error) {
		rethrowArticleError(this, error, itemIndex);
	}
}

/**
 * Article: Search Knowledge Base — knowledge_base_search returns one row
 * per execution: the AI-generated answer plus its grounding snippets.
 * Works even on accounts without own articles (it also grounds on monday's
 * support KB — verified live 2026-07-19).
 */
async function searchKnowledgeBase(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const query = (this.getNodeParameter('kbSearchQuery', itemIndex) as string).trim();
	const options = this.getNodeParameter('kbSearchOptions', itemIndex, {}) as IDataObject;

	if (!query) {
		throw new NodeOperationError(this.getNode(), 'Search query is required', { itemIndex });
	}

	try {
		const data = await client.execute(
			`query ($query: String!, $limit: Int) {
				knowledge_base_search(query: $query, limit: $limit) {
					answer
					raw_snippets { ${KB_SNIPPET_FIELDS} }
				}
			}`,
			itemIndex,
			{ query, limit: (options.snippetLimit as number) ?? 5 },
		);
		const result = (data.knowledge_base_search ?? {}) as IDataObject;
		return {
			answer: result.answer ?? null,
			snippets: result.raw_snippets ?? [],
		};
	} catch (error) {
		rethrowArticleError(this, error, itemIndex);
	}
}

interface ColumnValueRow extends IDataObject {
	id: string;
	type?: string;
	text?: string | null;
	value?: string | null;
	column?: { title?: string; settings_str?: string } | null;
	battery_value?: BatteryEntry[] | null;
	is_leaf?: boolean;
	display_value?: string | null;
	linked_item_ids?: string[] | null;
	linked_items?: Array<{ id: string; name: string }> | null;
	dependency_links?: Array<{
		linked_item_id: string;
		dependency_type?: number | null;
		lag?: number | null;
	}> | null;
}

/**
 * Shapes the Get Column Value output: parsed text plus the raw API value.
 * `value` arrives as a JSON-encoded string — decode it so workflows can
 * address fields directly (e.g. {{$json.value.index}}); `valueRaw` keeps
 * the original string for round-tripping into raw-JSON updates. Status
 * rollups (BatteryValue, multi-level boards) have no text/value — they get
 * label-count text plus batteryValue/isLeaf fields instead. Linked-item
 * columns (dependency / board_relation / mirror) also have no text/value —
 * text falls back to display_value (the linked items' names), and the raw
 * link data lands in displayValue/linkedItemIds/linkedItems (+
 * dependencyLinks for dependency columns).
 */
export function formatColumnValueOutput(
	item: { id?: string; name?: string },
	columnValue: ColumnValueRow | undefined,
	columnId: string,
): IDataObject {
	let value: unknown = null;
	if (columnValue?.value != null) {
		value = safeJsonParse(columnValue.value);
		if (value === undefined) value = columnValue.value;
	}
	const output: IDataObject = {
		itemId: item.id ?? null,
		itemName: item.name ?? null,
		columnId,
		columnTitle: columnValue?.column?.title ?? null,
		columnType: columnValue?.type ?? null,
		text: columnValue?.text ?? null,
		value: value as IDataObject,
		valueRaw: columnValue?.value ?? null,
	};
	if (columnValue?.battery_value) {
		output.text = formatBatteryText(columnValue.battery_value, columnValue.column?.settings_str);
		output.batteryValue = columnValue.battery_value as unknown as IDataObject[];
		// is_leaf: false = calculated from children; true = static leaf value.
		output.isLeaf = columnValue.is_leaf ?? null;
	}
	if (columnValue?.display_value !== undefined) {
		output.text = columnValue.text ?? (columnValue.display_value || null);
		output.displayValue = columnValue.display_value ?? '';
		if (columnValue.linked_item_ids) {
			output.linkedItemIds = columnValue.linked_item_ids;
		}
		if (columnValue.linked_items) {
			output.linkedItems = columnValue.linked_items as unknown as IDataObject[];
		}
		if (columnValue.dependency_links) {
			output.dependencyLinks = columnValue.dependency_links as unknown as IDataObject[];
		}
	}
	return output;
}

/**
 * Item: Get Column Value — items(ids:) { column_values(ids:) }, one column.
 * A column with no value set still yields a record (text/value null), so
 * downstream nodes can branch on emptiness without erroring.
 */
async function getColumnValue(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const columnId = this.getNodeParameter('columnId', itemIndex) as string;

	const data = await client.execute(
		`query ($ids: [ID!], $columnIds: [String!]) {
			items(ids: $ids) {
				id
				name
				column_values(ids: $columnIds, ${COLUMN_VALUES_CALCULATED_ARG}) {
					id type text value column { title settings_str }
					${BATTERY_VALUE_FRAGMENT}
					${LINKED_VALUE_DETAIL_FRAGMENTS}
				}
			}
		}`,
		itemIndex,
		{ ids: [itemId], columnIds: [columnId] },
	);

	const item = ((data.items ?? []) as Array<IDataObject & { column_values?: ColumnValueRow[] }>)[0];
	if (!item) {
		throw new NodeOperationError(this.getNode(), `Item ${itemId} not found`, { itemIndex });
	}
	const columnValue = (item.column_values ?? []).find((row) => row.id === columnId);
	if (!columnValue) {
		throw new NodeOperationError(
			this.getNode(),
			`Column ${columnId} not found on the item's board`,
			{ itemIndex },
		);
	}
	return formatColumnValueOutput(item as { id?: string; name?: string }, columnValue, columnId);
}

/**
 * Board: Create — create_board with optional workspace, template, owners
 * and subscribers. Only user-set arguments are sent, so API defaults
 * (main workspace, no template) stay in effect.
 */
async function createBoard(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardName = this.getNodeParameter('boardName', itemIndex) as string;
	const boardKind = this.getNodeParameter('boardKind', itemIndex) as string;
	const options = this.getNodeParameter('createBoardOptions', itemIndex, {}) as IDataObject;

	const varDefs = ['$name: String!', '$kind: BoardKind!'];
	const args = ['board_name: $name', 'board_kind: $kind'];
	const variables: Record<string, unknown> = { name: boardName, kind: boardKind };

	if (options.description) {
		varDefs.push('$description: String');
		args.push('description: $description');
		variables.description = options.description;
	}
	// Resource locator nested in a collection: the read of the parent
	// collection hands back the raw { mode, value } object.
	const createBoardWorkspaceId = extractWorkspaceId(options.workspaceId);
	if (createBoardWorkspaceId) {
		varDefs.push('$workspaceId: ID');
		args.push('workspace_id: $workspaceId');
		variables.workspaceId = createBoardWorkspaceId;
	}
	if (options.folderId) {
		varDefs.push('$folderId: ID');
		args.push('folder_id: $folderId');
		variables.folderId = options.folderId;
	}
	if (options.templateId) {
		varDefs.push('$templateId: ID');
		args.push('template_id: $templateId');
		variables.templateId = options.templateId;
	}
	// Owners/Subscribers mix users and teams in one picker; the API wants
	// them split into separate arguments. Note the asymmetric argument name:
	// board_subscriber_teams_ids (teams_ids, not team_ids).
	const owners = splitUserTeamIds(extractUserRowIds(options.ownerIds));
	if (owners.userIds.length > 0) {
		varDefs.push('$ownerIds: [ID!]');
		args.push('board_owner_ids: $ownerIds');
		variables.ownerIds = owners.userIds;
	}
	if (owners.teamIds.length > 0) {
		varDefs.push('$ownerTeamIds: [ID!]');
		args.push('board_owner_team_ids: $ownerTeamIds');
		variables.ownerTeamIds = owners.teamIds;
	}
	const subscribers = splitUserTeamIds(extractUserRowIds(options.subscriberIds));
	if (subscribers.userIds.length > 0) {
		varDefs.push('$subscriberIds: [ID!]');
		args.push('board_subscriber_ids: $subscriberIds');
		variables.subscriberIds = subscribers.userIds;
	}
	if (subscribers.teamIds.length > 0) {
		varDefs.push('$subscriberTeamIds: [ID!]');
		args.push('board_subscriber_teams_ids: $subscriberTeamIds');
		variables.subscriberTeamIds = subscribers.teamIds;
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			create_board(${args.join(', ')}) {
				id
				name
				board_kind
				description
				url
				board_folder_id
				folder { id name }
				workspace { id name }
			}
		}`,
		itemIndex,
		variables,
	);

	return (data.create_board ?? {}) as IDataObject;
}

/** Folder: Create — create_folder. Omitted workspace_id = Main workspace. */
/**
 * Resolves the Doc locator into the INTERNAL doc id (the only id the doc
 * mutations accept — see docs.ts) or throws a friendly error. URL/object
 * IDs are resolved transparently via one bounded docs lookup.
 */
async function requireDocId(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<string> {
	const locator = this.getNodeParameter('docId', itemIndex) as DocLocatorValue | string;
	const docId = await resolveDocId(client, itemIndex, locator);
	if (!docId) {
		const raw =
			typeof locator === 'object' && locator !== null ? locator.value : locator;
		throw new NodeOperationError(
			this.getNode(),
			`Doc ${String(raw)} was not found — check the ID/URL and that the API user can access it. Both the internal doc ID and the number in the doc URL are accepted.`,
			{ itemIndex },
		);
	}
	return docId;
}

/** Parses the escaped-JSON scalars of a doc row for friendlier output. */
function formatDocRow(doc: IDataObject): IDataObject {
	const row: IDataObject = { ...doc, settings: parseJsonField(doc.settings) as IDataObject };
	if (Array.isArray(doc.blocks)) {
		row.blocks = (doc.blocks as IDataObject[]).map((block) => formatDocBlockRow(block));
	}
	return row;
}

/** Parses a block row's content scalar into a real object. */
function formatDocBlockRow(block: IDataObject): IDataObject {
	return { ...block, content: parseJsonField(block.content) as IDataObject };
}

/**
 * Doc: Create — create_doc in a workspace (named, optional folder/kind) or
 * inside a doc column of a board item (always created "Untitled"; the API
 * takes no name for board-located docs — Rename covers that).
 */
async function createDoc(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const location = this.getNodeParameter('docLocation', itemIndex, 'workspace') as string;

	let locationInput: IDataObject;
	if (location === 'board') {
		const itemId = this.getNodeParameter('itemId', itemIndex, undefined, {
			extractValue: true,
		}) as string;
		const columnId = this.getNodeParameter('docColumnId', itemIndex) as string;
		locationInput = { board: { item_id: itemId, column_id: columnId } };
	} else {
		const name = this.getNodeParameter('docName', itemIndex) as string;
		const workspaceId = this.getNodeParameter('docWorkspaceId', itemIndex, undefined, {
			extractValue: true,
		}) as string;
		const options = this.getNodeParameter('createDocOptions', itemIndex, {}) as IDataObject;
		const workspace: IDataObject = { workspace_id: workspaceId, name };
		if (options.kind) workspace.kind = options.kind;
		if (options.folderId) workspace.folder_id = options.folderId;
		locationInput = { workspace };
	}

	const data = await client.execute(
		`mutation ($location: CreateDocInput!) {
			create_doc(location: $location) { ${DOC_FIELDS} }
		}`,
		itemIndex,
		{ location: locationInput },
	);

	return formatDocRow((data.create_doc ?? {}) as IDataObject);
}

/** Doc: Get — one doc's metadata, optionally with its first 100 blocks. */
async function getDoc(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const docId = await requireDocId.call(this, client, itemIndex);
	const options = this.getNodeParameter('getDocOptions', itemIndex, {}) as IDataObject;

	const blocksSelection =
		options.includeBlocks === true ? `blocks(limit: 100) { ${DOC_BLOCK_FIELDS} }` : '';

	const data = await client.execute(
		`query ($ids: [ID!]) {
			docs(ids: $ids) { ${DOC_FIELDS} ${blocksSelection} }
		}`,
		itemIndex,
		{ ids: [docId] },
	);

	const doc = ((data.docs as IDataObject[]) ?? [])[0];
	if (!doc) {
		throw new NodeOperationError(
			this.getNode(),
			`Doc ${docId} was not found — check the ID and that the API user can access it.`,
			{ itemIndex },
		);
	}
	return formatDocRow(doc);
}

/** The docs list page size. The documented default is 25; higher values
 * are accepted but unverified at scale, so paging sticks to 25. */
const DOCS_API_PAGE_SIZE = 25;

/**
 * Doc: Get Many — the docs query. When Doc IDs are given, both ID kinds
 * are looked up (internal via ids:, URL/object via object_ids:) and the
 * results merged, since callers can't be expected to know which kind they
 * hold. Otherwise a page-based listing with workspace/order filters.
 */
async function getManyDocs(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = this.getNodeParameter('getDocsOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;

	const docIds = normalizeIdList(options.docIds);
	if (docIds.length > 0) {
		const data = await client.execute(
			`query ($ids: [ID!], $objectIds: [ID!], $limit: Int!) {
				byId: docs(ids: $ids, limit: $limit) { ${DOC_FIELDS} }
				byObjectId: docs(object_ids: $objectIds, limit: $limit) { ${DOC_FIELDS} }
			}`,
			itemIndex,
			{ ids: docIds, objectIds: docIds, limit: Math.max(docIds.length, 1) },
		);
		const seen = new Set<string>();
		const rows: IDataObject[] = [];
		for (const doc of [
			...((data.byId as IDataObject[]) ?? []),
			...((data.byObjectId as IDataObject[]) ?? []),
		]) {
			const id = String(doc.id);
			if (seen.has(id)) continue;
			seen.add(id);
			rows.push(formatDocRow(doc));
		}
		return rows.slice(0, limit);
	}

	const varDefs = ['$limit: Int!', '$page: Int!'];
	const args = ['limit: $limit', 'page: $page'];
	const variables: Record<string, unknown> = {};

	const workspaceIds = normalizeIdList(options.workspaceIds);
	if (workspaceIds.length > 0) {
		varDefs.push('$workspaceIds: [ID]');
		args.push('workspace_ids: $workspaceIds');
		variables.workspaceIds = workspaceIds;
	}
	if (options.orderBy) {
		varDefs.push('$orderBy: DocsOrderBy');
		args.push('order_by: $orderBy');
		variables.orderBy = options.orderBy;
	}

	const rows = await fetchAllPaged({
		client,
		itemIndex,
		query: `query (${varDefs.join(', ')}) {
			docs(${args.join(', ')}) { ${DOC_FIELDS} }
		}`,
		variables,
		extractRows: (data) => (data.docs ?? []) as IDataObject[],
		limit,
		pageSize: DOCS_API_PAGE_SIZE,
	});

	return rows.map((row) => formatDocRow(row));
}

/** Doc: Get Blocks — the nested blocks connection, one row per block. */
async function getDocBlocks(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const docId = await requireDocId.call(this, client, itemIndex);
	const options = this.getNodeParameter('getDocBlocksOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;

	const rows = await fetchAllPaged({
		client,
		itemIndex,
		query: `query ($ids: [ID!], $limit: Int!, $page: Int!) {
			docs(ids: $ids) {
				blocks(limit: $limit, page: $page) { ${DOC_BLOCK_FIELDS} }
			}
		}`,
		variables: { ids: [docId] },
		extractRows: (data) => {
			const docs = (data.docs as IDataObject[]) ?? [];
			return (docs[0]?.blocks as IDataObject[]) ?? [];
		},
		limit,
		pageSize: 50,
	});

	return rows.map((row) => formatDocBlockRow(row));
}

/**
 * Doc: Add Content — add_content_to_doc_from_markdown. The mutation never
 * throws on bad input; failures come back as success: false + error.
 */
async function addDocContent(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const docId = await requireDocId.call(this, client, itemIndex);
	const markdown = this.getNodeParameter('docMarkdown', itemIndex) as string;
	const options = this.getNodeParameter('addDocContentOptions', itemIndex, {}) as IDataObject;

	const varDefs = ['$docId: ID!', '$markdown: String!'];
	const args = ['docId: $docId', 'markdown: $markdown'];
	const variables: Record<string, unknown> = { docId, markdown };
	if (options.afterBlockId) {
		varDefs.push('$afterBlockId: String');
		args.push('afterBlockId: $afterBlockId');
		variables.afterBlockId = options.afterBlockId;
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			add_content_to_doc_from_markdown(${args.join(', ')}) { success block_ids error }
		}`,
		itemIndex,
		variables,
	);

	const result = (data.add_content_to_doc_from_markdown ?? {}) as IDataObject;
	if (result.success !== true) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com could not convert the markdown: ${String(result.error ?? 'unknown error')}`,
			{ itemIndex },
		);
	}
	return { docId, success: true, blockIds: result.block_ids ?? [] };
}

/**
 * Doc: Export as Markdown — export_markdown_from_doc. Failures are soft
 * (success: false); the raw error for a missing doc is an unhelpful
 * "Fetcher response returned NON-OK status=500", hence the mapping.
 */
async function exportDocAsMarkdown(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const docId = await requireDocId.call(this, client, itemIndex);
	const options = this.getNodeParameter('exportDocOptions', itemIndex, {}) as IDataObject;

	const varDefs = ['$docId: ID!'];
	const args = ['docId: $docId'];
	const variables: Record<string, unknown> = { docId };
	const blockIds = normalizeIdList(options.blockIds);
	if (blockIds.length > 0) {
		varDefs.push('$blockIds: [String!]');
		args.push('blockIds: $blockIds');
		variables.blockIds = blockIds;
	}

	const data = await client.execute(
		`query (${varDefs.join(', ')}) {
			export_markdown_from_doc(${args.join(', ')}) { success markdown error }
		}`,
		itemIndex,
		variables,
	);

	const result = (data.export_markdown_from_doc ?? {}) as IDataObject;
	if (result.success !== true) {
		const rawError = String(result.error ?? 'unknown error');
		const friendly = rawError.includes('NON-OK status')
			? 'the doc could not be read (it may have been deleted, or the export service failed)'
			: rawError;
		throw new NodeOperationError(
			this.getNode(),
			`monday.com could not export the doc as markdown: ${friendly}`,
			{ itemIndex },
		);
	}
	return { docId, success: true, markdown: result.markdown ?? '' };
}

/**
 * Doc: Import From HTML — import_doc_from_html, then a read-back of the
 * new doc (the mutation returns only the internal doc id).
 */
async function importDocFromHtml(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const html = this.getNodeParameter('docHtml', itemIndex) as string;
	const workspaceId = this.getNodeParameter('docImportWorkspaceId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const options = this.getNodeParameter('importDocOptions', itemIndex, {}) as IDataObject;

	const varDefs = ['$html: String!', '$workspaceId: ID!'];
	const args = ['html: $html', 'workspaceId: $workspaceId'];
	const variables: Record<string, unknown> = { html, workspaceId };
	if (options.title) {
		varDefs.push('$title: String');
		args.push('title: $title');
		variables.title = options.title;
	}
	if (options.kind) {
		varDefs.push('$kind: DocKind');
		args.push('kind: $kind');
		variables.kind = options.kind;
	}
	if (options.folderId) {
		varDefs.push('$folderId: ID');
		args.push('folderId: $folderId');
		variables.folderId = options.folderId;
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			import_doc_from_html(${args.join(', ')}) { success doc_id error }
		}`,
		itemIndex,
		variables,
	);

	const result = (data.import_doc_from_html ?? {}) as IDataObject;
	if (result.success !== true || !result.doc_id) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com could not import the HTML: ${String(result.error ?? 'unknown error')}`,
			{ itemIndex },
		);
	}

	const readback = await client.execute(
		`query ($ids: [ID!]) { docs(ids: $ids) { ${DOC_FIELDS} } }`,
		itemIndex,
		{ ids: [result.doc_id] },
	);
	const doc = ((readback.docs as IDataObject[]) ?? [])[0];
	return doc ? formatDocRow(doc) : { id: result.doc_id, success: true };
}

/** Doc: Rename — update_doc_name (soft failures mapped to friendly errors). */
async function renameDoc(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const docId = await requireDocId.call(this, client, itemIndex);
	const name = this.getNodeParameter('docNewName', itemIndex) as string;

	const data = await client.execute(
		'mutation ($docId: ID!, $name: String!) { update_doc_name(docId: $docId, name: $name) }',
		itemIndex,
		{ docId, name },
	);

	const result = (data.update_doc_name ?? {}) as IDataObject;
	if (result.success !== true) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com could not rename the doc: ${String(result.error ?? 'unknown error')}`,
			{ itemIndex },
		);
	}
	return { id: docId, name: result.name ?? name, success: true };
}

/**
 * Doc: Duplicate — duplicate_doc returns the new doc's OBJECT id (verified
 * live), so the full record is read back via object_ids for a consistent
 * output shape.
 */
async function duplicateDoc(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const docId = await requireDocId.call(this, client, itemIndex);
	const withUpdates = this.getNodeParameter('docDuplicateWithUpdates', itemIndex, false) as boolean;

	// Live schema takes docId: ID! (the docs page's Int! is stale).
	const data = await client.execute(
		`mutation ($docId: ID!, $duplicateType: DuplicateType) {
			duplicate_doc(docId: $docId, duplicateType: $duplicateType)
		}`,
		itemIndex,
		{
			docId,
			duplicateType: withUpdates
				? 'duplicate_doc_with_content_and_updates'
				: 'duplicate_doc_with_content',
		},
	);

	const result = (data.duplicate_doc ?? {}) as IDataObject;
	if (result.success !== true || !result.id) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com could not duplicate the doc: ${String(result.error ?? 'unknown error')}`,
			{ itemIndex },
		);
	}

	const readback = await client.execute(
		`query ($objectIds: [ID!]) { docs(object_ids: $objectIds) { ${DOC_FIELDS} } }`,
		itemIndex,
		{ objectIds: [result.id] },
	);
	const doc = ((readback.docs as IDataObject[]) ?? [])[0];
	return doc ? formatDocRow(doc) : { object_id: result.id, success: true };
}

/** Doc: Delete — delete_doc (soft failures mapped to friendly errors). */
async function deleteDoc(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const docId = await requireDocId.call(this, client, itemIndex);

	const data = await client.execute(
		'mutation ($docId: ID!) { delete_doc(docId: $docId) }',
		itemIndex,
		{ docId },
	);

	const result = (data.delete_doc ?? {}) as IDataObject;
	if (result.success !== true) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com could not delete the doc: ${String(result.error ?? 'unknown error')}`,
			{ itemIndex },
		);
	}
	return { id: docId, deleted: true };
}

/**
 * Doc: Create Block / Update Block. The content argument is a JSON-encoded
 * STRING (a real object fails request validation — verified live, the
 * exact opposite of update_column settings). Text mode wraps plain text
 * into a deltaFormat payload; structured types require Raw JSON mode.
 */
async function upsertDocBlock(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	operation: string,
): Promise<IDataObject> {
	const contentMode = this.getNodeParameter('docBlockContentMode', itemIndex, 'text') as string;
	const isCreate = operation === 'createDocBlock';
	const blockType = isCreate
		? (this.getNodeParameter('docBlockType', itemIndex) as string)
		: 'normal_text';

	let content: string;
	if (contentMode === 'json') {
		try {
			content = normalizeBlockContentJson(
				this.getNodeParameter('docBlockContentJson', itemIndex),
			);
		} catch {
			throw new NodeOperationError(
				this.getNode(),
				'Content (JSON) is not valid JSON — provide the block content as a JSON object.',
				{ itemIndex },
			);
		}
	} else {
		const text = this.getNodeParameter('docBlockText', itemIndex, '') as string;
		const built = buildTextBlockContent(blockType, text);
		if (built === null) {
			throw new NodeOperationError(
				this.getNode(),
				`The "${blockType}" block type needs structured content — switch Content Mode to Raw JSON (e.g. tables need column_count and row_count).`,
				{ itemIndex },
			);
		}
		content = built;
	}

	if (isCreate) {
		const docId = await requireDocId.call(this, client, itemIndex);
		const options = this.getNodeParameter('createDocBlockOptions', itemIndex, {}) as IDataObject;

		const varDefs = ['$docId: ID!', '$type: DocBlockContentType!', '$content: JSON!'];
		const args = ['doc_id: $docId', 'type: $type', 'content: $content'];
		const variables: Record<string, unknown> = { docId, type: blockType, content };
		if (options.afterBlockId) {
			varDefs.push('$afterBlockId: String');
			args.push('after_block_id: $afterBlockId');
			variables.afterBlockId = options.afterBlockId;
		}
		if (options.parentBlockId) {
			varDefs.push('$parentBlockId: String');
			args.push('parent_block_id: $parentBlockId');
			variables.parentBlockId = options.parentBlockId;
		}

		const data = await client.execute(
			`mutation (${varDefs.join(', ')}) {
				create_doc_block(${args.join(', ')}) { ${DOC_BLOCK_FIELDS} }
			}`,
			itemIndex,
			variables,
		);
		return formatDocBlockRow((data.create_doc_block ?? {}) as IDataObject);
	}

	const blockId = this.getNodeParameter('docBlockId', itemIndex) as string;
	const data = await client.execute(
		`mutation ($blockId: String!, $content: JSON!) {
			update_doc_block(block_id: $blockId, content: $content) { ${DOC_BLOCK_FIELDS} }
		}`,
		itemIndex,
		{ blockId, content },
	);
	return formatDocBlockRow((data.update_doc_block ?? {}) as IDataObject);
}

/**
 * Doc: Delete Blocks — delete_doc_blocks is ALL-OR-NOTHING (verified live:
 * one unknown ID fails the request with NOT_FOUND and nothing is deleted),
 * so a thrown error here means no block was removed.
 */
async function deleteDocBlocks(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const blockIds = normalizeIdList(this.getNodeParameter('docBlockIds', itemIndex));
	if (blockIds.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'Provide at least one block ID to delete.',
			{ itemIndex },
		);
	}

	const data = await client.execute(
		'mutation ($blockIds: [ID!]!) { delete_doc_blocks(block_ids: $blockIds) { id } }',
		itemIndex,
		{ blockIds },
	);

	const deleted = ((data.delete_doc_blocks as IDataObject[]) ?? []).map((row) => ({
		id: row.id,
		deleted: true,
	}));
	return deleted.length > 0 ? deleted : blockIds.map((id) => ({ id, deleted: true }));
}

async function createFolder(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const name = this.getNodeParameter('folderName', itemIndex) as string;
	const options = this.getNodeParameter('createFolderOptions', itemIndex, {}) as IDataObject;

	const varDefs = ['$name: String!'];
	const args = ['name: $name'];
	const variables: Record<string, unknown> = { name };

	// Resource locator nested in a collection — see extractWorkspaceId.
	let workspaceId: string | undefined = extractWorkspaceId(options.workspaceId) || undefined;
	// API quirk (hit in e2e): with a parent_folder_id but NO workspace_id the
	// API rejects the call with "Folder has different WS than parent folder"
	// — even when the parent lives in the Main workspace (the omitted-arg
	// default is not equivalent). Resolve the parent's workspace explicitly.
	if (options.parentFolderId && !workspaceId) {
		const parentData = await client.execute(
			'query ($ids: [ID!]) { folders(ids: $ids) { workspace { id } } }',
			itemIndex,
			{ ids: [options.parentFolderId] },
		);
		const parent = ((parentData.folders as IDataObject[]) ?? [])[0] as
			| { workspace?: { id?: string } }
			| undefined;
		workspaceId = parent?.workspace?.id;
	}

	if (workspaceId) {
		varDefs.push('$workspaceId: ID');
		args.push('workspace_id: $workspaceId');
		variables.workspaceId = workspaceId;
	}
	if (options.parentFolderId) {
		varDefs.push('$parentFolderId: ID');
		args.push('parent_folder_id: $parentFolderId');
		variables.parentFolderId = options.parentFolderId;
	}
	// The styling dropdowns share a "None (Default)" sentinel = omit the arg.
	if (options.color && options.color !== FOLDER_ATTRIBUTE_NONE) {
		varDefs.push('$color: FolderColor');
		args.push('color: $color');
		variables.color = options.color;
	}
	if (options.customIcon && options.customIcon !== FOLDER_ATTRIBUTE_NONE) {
		varDefs.push('$customIcon: FolderCustomIcon');
		args.push('custom_icon: $customIcon');
		variables.customIcon = options.customIcon;
	}
	if (options.fontWeight && options.fontWeight !== FOLDER_ATTRIBUTE_NONE) {
		varDefs.push('$fontWeight: FolderFontWeight');
		args.push('font_weight: $fontWeight');
		variables.fontWeight = options.fontWeight;
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			create_folder(${args.join(', ')}) { ${FOLDER_FIELDS} }
		}`,
		itemIndex,
		variables,
	);

	return (data.create_folder ?? {}) as IDataObject;
}

/**
 * Folder: Get Many — the folders query. Page-based with an API max of 100
 * per request, so limits above that page through transparently. The list
 * is flat: sub-folders come back as their own rows with `parent` set.
 */
async function getManyFolders(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const options = this.getNodeParameter('getFoldersOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;

	const varDefs = ['$limit: Int!', '$page: Int!'];
	const args = ['limit: $limit', 'page: $page'];
	const variables: Record<string, unknown> = {};

	const folderIds = normalizeIdList(options.folderIds);
	if (folderIds.length > 0) {
		varDefs.push('$ids: [ID!]');
		args.push('ids: $ids');
		variables.ids = folderIds;
	}
	const workspaceIds = normalizeIdList(options.workspaceIds);
	if (workspaceIds.length > 0) {
		varDefs.push('$workspaceIds: [ID]');
		args.push('workspace_ids: $workspaceIds');
		variables.workspaceIds = workspaceIds;
	}

	// Boards only on request — a folder can hold many boards, and the
	// children selection multiplies the query's complexity.
	const childrenSelection =
		options.includeBoards === true ? 'children { id name type }' : '';

	const rows = await fetchAllPaged({
		client,
		itemIndex,
		query: `query (${varDefs.join(', ')}) {
			folders(${args.join(', ')}) { ${FOLDER_FIELDS} ${childrenSelection} }
		}`,
		variables,
		extractRows: (data) => (data.folders ?? []) as IDataObject[],
		limit,
		pageSize: FOLDERS_API_MAX_PAGE_SIZE,
	});

	if (options.includeBoards !== true) return rows;

	// The children field is boards-only per the API, but docs and subitem
	// boards ride along like everywhere else — same filter as board lists.
	return rows.map((row) => ({
		...row,
		children: ((row.children as IDataObject[]) ?? []).filter((board) =>
			isRealBoard(board as { type?: string }),
		),
	}));
}

/**
 * Folder: Update — update_folder RESETS every attribute not sent (verified
 * live: a name-only update wipes color/icon/font weight and un-nests the
 * folder). The handler therefore reads the current state and re-sends
 * unchanged attributes; "None (Default)" / "No Parent" selections omit the
 * argument on purpose, using the reset as the clear mechanism.
 */
async function updateFolder(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const folderId = this.getNodeParameter('folderId', itemIndex) as string;
	const rawFields = this.getNodeParameter('updateFolderFields', itemIndex, {}) as IDataObject;
	// Move to Workspace is a resource locator nested in the collection —
	// unwrap it before the fields reach buildUpdateFolderArgs.
	if (rawFields.workspaceId !== undefined) {
		rawFields.workspaceId = extractWorkspaceId(rawFields.workspaceId);
	}
	const fields = rawFields as FolderUpdateChanges;

	if (Object.keys(fields).length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'Add at least one field to Update Fields — there is nothing to change.',
			{ itemIndex },
		);
	}

	const readback = await client.execute(
		'query ($ids: [ID!]) { folders(ids: $ids) { name color custom_icon font_weight parent { id } } }',
		itemIndex,
		{ ids: [folderId] },
	);
	const current = ((readback.folders as IDataObject[]) ?? [])[0];
	if (!current) {
		throw new NodeOperationError(
			this.getNode(),
			`Folder ${folderId} was not found — check the folder ID and that the API user can access its workspace.`,
			{ itemIndex },
		);
	}

	const merged = buildUpdateFolderArgs(current as CurrentFolderState, fields);

	const varDefs = ['$folderId: ID!'];
	const args = ['folder_id: $folderId'];
	const variables: Record<string, unknown> = { folderId };

	if (merged.name !== undefined) {
		varDefs.push('$name: String');
		args.push('name: $name');
		variables.name = merged.name;
	}
	if (merged.color !== undefined) {
		varDefs.push('$color: FolderColor');
		args.push('color: $color');
		variables.color = merged.color;
	}
	if (merged.customIcon !== undefined) {
		varDefs.push('$customIcon: FolderCustomIcon');
		args.push('custom_icon: $customIcon');
		variables.customIcon = merged.customIcon;
	}
	if (merged.fontWeight !== undefined) {
		varDefs.push('$fontWeight: FolderFontWeight');
		args.push('font_weight: $fontWeight');
		variables.fontWeight = merged.fontWeight;
	}
	if (merged.parentFolderId !== undefined) {
		varDefs.push('$parentFolderId: ID');
		args.push('parent_folder_id: $parentFolderId');
		variables.parentFolderId = merged.parentFolderId;
	}
	if (merged.workspaceId !== undefined) {
		varDefs.push('$workspaceId: ID');
		args.push('workspace_id: $workspaceId');
		variables.workspaceId = merged.workspaceId;
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			update_folder(${args.join(', ')}) { ${FOLDER_FIELDS} }
		}`,
		itemIndex,
		variables,
	);

	return (data.update_folder ?? {}) as IDataObject;
}

/**
 * Folder: Delete — delete_folder removes the folder AND its contents
 * (contained boards end up state: deleted, verified live).
 */
async function deleteFolder(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const folderId = this.getNodeParameter('folderId', itemIndex) as string;

	const data = await client.execute(
		'mutation ($folderId: ID!) { delete_folder(folder_id: $folderId) { id name } }',
		itemIndex,
		{ folderId },
	);

	return { ...((data.delete_folder ?? {}) as IDataObject), deleted: true };
}

/** Folders are always fully listed for the left-pane read (bounded). */
const WORKSPACE_OBJECTS_MAX_FOLDERS = 1000;

/**
 * Folder & Object: Get Many Objects — the left pane of one workspace. Folders
 * come from the folders query, everything else from the boards query
 * (which also returns docs and workflows/custom objects; subitem boards
 * are dropped — they never appear in the left pane). Dashboards cannot be
 * listed on any dated API version (see workspaceObjects.ts). The API
 * exposes no sibling ORDER, so output is structure only: list rows carry
 * folderId, tree rows nest folder contents in children.
 */
async function getWorkspaceObjects(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const workspaceId = this.getNodeParameter('objectsWorkspaceId', itemIndex, '', {
		extractValue: true,
	}) as string;
	const structure = this.getNodeParameter('objectsOutputStructure', itemIndex, 'list') as string;
	const options = this.getNodeParameter('getObjectsOptions', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const includeTypes = normalizeIdList(options.objectTypes);

	const isTree = structure === 'tree';
	const wantsType = (type: string) => includeTypes.length === 0 || includeTypes.includes(type);
	// Tree output always needs folders — they ARE the structure.
	const wantsFolders = isTree || wantsType('folder');
	const wantsBoardish = wantsType('board') || wantsType('doc') || wantsType('customObject');

	// The workspaces query never lists the Main workspace; [null] is its
	// only handle (same convention as the Folder resource).
	const workspaceIds = [workspaceId || null];

	let folderRows: WorkspaceObjectRow[] = [];
	if (wantsFolders) {
		const rows = await fetchAllPaged({
			client,
			itemIndex,
			query: `query ($workspaceIds: [ID], $limit: Int!, $page: Int!) {
				folders(workspace_ids: $workspaceIds, limit: $limit, page: $page) {
					id name parent { id } workspace { id }
				}
			}`,
			variables: { workspaceIds },
			extractRows: (data) => (data.folders ?? []) as IDataObject[],
			limit: WORKSPACE_OBJECTS_MAX_FOLDERS,
			pageSize: FOLDERS_API_MAX_PAGE_SIZE,
		});
		folderRows = (rows as unknown as LeftPaneFolderRow[]).map(mapLeftPaneFolderRow);
	}

	let boardRows: WorkspaceObjectRow[] = [];
	if (wantsBoardish) {
		const rows = await fetchAllPaged({
			client,
			itemIndex,
			query: `query ($workspaceIds: [ID], $limit: Int!, $page: Int!) {
				boards(workspace_ids: $workspaceIds, limit: $limit, page: $page, state: active) {
					id name type board_folder_id url workspace { id }
				}
			}`,
			variables: { workspaceIds },
			extractRows: (data) => (data.boards ?? []) as IDataObject[],
			limit,
		});
		boardRows = (rows as unknown as LeftPaneBoardRow[])
			.map(mapLeftPaneBoardRow)
			.filter((row): row is WorkspaceObjectRow => row !== null);
	}

	if (isTree) {
		const include = (row: WorkspaceObjectRow) =>
			includeTypes.length === 0 || includeTypes.includes(row.objectType);
		return buildWorkspaceObjectTree(folderRows, boardRows.filter(include));
	}
	return buildWorkspaceObjectRows(folderRows, boardRows, includeTypes);
}

/**
 * Folder & Object: Move Object — update_board_hierarchy (boards AND docs, the
 * latter via their object id), update_overview_hierarchy (dashboards),
 * and update_folder with a position argument (folders). The folder path
 * re-sends the folder's current attributes because update_folder resets
 * everything not sent — a position-only update would wipe the folder's
 * color/icon/font weight and un-nest it (verified live).
 */
async function moveWorkspaceObject(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const objectType = this.getNodeParameter('moveObjectType', itemIndex) as string;
	const positionInput = this.getNodeParameter('movePosition', itemIndex, {}) as IDataObject;
	const destination = this.getNodeParameter('moveDestination', itemIndex, {}) as IDataObject;

	const referenceId = String(positionInput.objectId ?? '').trim();
	if (!referenceId && Object.keys(positionInput).length > 0) {
		throw new NodeOperationError(
			this.getNode(),
			'New Position needs a Reference Object ID — the object to position relative to.',
			{ itemIndex },
		);
	}
	const destinationFolderId = String(destination.folderId ?? '').trim();
	// Resource locator nested in a collection — see extractWorkspaceId.
	const destinationWorkspaceId = extractWorkspaceId(destination.workspaceId).trim();
	if (!referenceId && !destinationFolderId && !destinationWorkspaceId) {
		throw new NodeOperationError(
			this.getNode(),
			'Set New Position and/or Destination — there is nothing to move.',
			{ itemIndex },
		);
	}

	const position: HierarchyPosition | undefined = referenceId
		? {
				objectId: referenceId,
				objectType: (positionInput.objectType as string) || 'Board',
				isAfter: (positionInput.placement ?? 'after') !== 'before',
			}
		: undefined;

	// A bogus position reference fails with a bare USER_UNAUTHORIZED on all
	// three mutations (verified live) — remap it to an actionable hint.
	const executeMove = async (query: string, variables: Record<string, unknown>) => {
		try {
			return await client.execute(query, itemIndex, variables);
		} catch (error) {
			const hint = describePositionReferenceError(
				error instanceof Error ? error.message : String(error),
				position !== undefined,
			);
			if (hint) {
				throw new NodeOperationError(this.getNode(), hint, { itemIndex });
			}
			// Already a mapped NodeApiError from the shared client.
			throw ensureNodeError(this.getNode(), error);
		}
	};

	if (objectType === 'board' || objectType === 'doc') {
		let targetId: string;
		if (objectType === 'board') {
			targetId = this.getNodeParameter('boardId', itemIndex, undefined, {
				extractValue: true,
			}) as string;
		} else {
			const locator = this.getNodeParameter('docId', itemIndex) as IDataObject;
			const resolved = await resolveDocObjectId(
				client,
				itemIndex,
				locator as { mode?: string; value?: string },
			);
			if (!resolved) {
				throw new NodeOperationError(
					this.getNode(),
					'Doc not found — check the doc ID or URL and that the API user can access it.',
					{ itemIndex },
				);
			}
			targetId = resolved;
		}

		const data = await executeMove(
			`mutation ($boardId: ID!, $attributes: UpdateBoardHierarchyAttributesInput!) {
				update_board_hierarchy(board_id: $boardId, attributes: $attributes) {
					success
					message
					board { id name type board_folder_id workspace_id url }
				}
			}`,
			{
				boardId: targetId,
				attributes: buildHierarchyAttributes({
					folderId: destinationFolderId || undefined,
					workspaceId: destinationWorkspaceId || undefined,
					position,
				}),
			},
		);
		return { objectType, ...((data.update_board_hierarchy ?? {}) as IDataObject) };
	}

	if (objectType === 'dashboard') {
		const dashboardId = this.getNodeParameter('dashboardId', itemIndex) as string;
		// The echo skips folder_id: selecting it 500s (verified live 2026-07-19).
		const data = await executeMove(
			`mutation ($overviewId: ID!, $attributes: UpdateOverviewHierarchyAttributesInput!) {
				update_overview_hierarchy(overview_id: $overviewId, attributes: $attributes) {
					success
					message
					overview { id name kind workspace_id }
				}
			}`,
			{
				overviewId: dashboardId,
				attributes: buildHierarchyAttributes({
					folderId: destinationFolderId || undefined,
					workspaceId: destinationWorkspaceId || undefined,
					position,
				}),
			},
		);
		return { objectType, ...((data.update_overview_hierarchy ?? {}) as IDataObject) };
	}

	// Folder: update_folder(position:) plus the reset-survival readback.
	const folderId = this.getNodeParameter('folderId', itemIndex) as string;
	const readback = await client.execute(
		'query ($ids: [ID!]) { folders(ids: $ids) { name color custom_icon font_weight parent { id } } }',
		itemIndex,
		{ ids: [folderId] },
	);
	const current = ((readback.folders as IDataObject[]) ?? [])[0];
	if (!current) {
		throw new NodeOperationError(
			this.getNode(),
			`Folder ${folderId} was not found — check the folder ID and that the API user can access its workspace.`,
			{ itemIndex },
		);
	}

	const merged = buildUpdateFolderArgs(current as CurrentFolderState, {
		parentFolderId: destinationFolderId || undefined,
		workspaceId: destinationWorkspaceId || undefined,
	});

	const varDefs = ['$folderId: ID!'];
	const args = ['folder_id: $folderId'];
	const variables: Record<string, unknown> = { folderId };
	const addArg = (name: string, gqlType: string, gqlArg: string, value: unknown) => {
		if (value === undefined) return;
		varDefs.push(`$${name}: ${gqlType}`);
		args.push(`${gqlArg}: $${name}`);
		variables[name] = value;
	};
	addArg('name', 'String', 'name', merged.name);
	addArg('color', 'FolderColor', 'color', merged.color);
	addArg('customIcon', 'FolderCustomIcon', 'custom_icon', merged.customIcon);
	addArg('fontWeight', 'FolderFontWeight', 'font_weight', merged.fontWeight);
	addArg('parentFolderId', 'ID', 'parent_folder_id', merged.parentFolderId);
	addArg('workspaceId', 'ID', 'workspace_id', merged.workspaceId);
	if (position) {
		addArg('position', 'DynamicPosition', 'position', {
			object_id: position.objectId,
			object_type: position.objectType,
			is_after: position.isAfter,
		});
	}

	const data = await executeMove(
		`mutation (${varDefs.join(', ')}) {
			update_folder(${args.join(', ')}) { ${FOLDER_FIELDS} }
		}`,
		variables,
	);
	return { objectType, moved: true, ...((data.update_folder ?? {}) as IDataObject) };
}

/**
 * Portfolio: Create — the Enterprise-only create_portfolio mutation. It is
 * asynchronous and never returns the created board ID (only a callback_url
 * receives it), so by default the operation polls the newest boards until
 * the portfolio board with the requested name appears (~10s live) and
 * returns its ID and URL. Non-enterprise accounts get success: false with
 * "Not supported for non-enterprise accounts" (verified live) — mapped to a
 * friendly error.
 */
async function createPortfolio(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const name = this.getNodeParameter('portfolioName', itemIndex) as string;
	const privacy = this.getNodeParameter('portfolioPrivacy', itemIndex) as string;
	const options = this.getNodeParameter('createPortfolioOptions', itemIndex, {}) as IDataObject;
	// Resource locator nested in a collection — see extractWorkspaceId.
	const workspaceId = extractWorkspaceId(options.workspaceId) || undefined;
	const wait = options.waitForBoard !== false;

	// Snapshot BEFORE the mutation: any board in this set (even a same-name
	// one) predates the request. Clock-skew-proof, unlike created_at checks.
	const excludeIds = wait ? await snapshotRecentBoardIds(client, itemIndex, workspaceId) : null;

	const varDefs = ['$name: String!', '$privacy: String!'];
	const args = ['boardName: $name', 'boardPrivacy: $privacy'];
	const variables: Record<string, unknown> = { name, privacy };
	if (workspaceId) {
		varDefs.push('$workspaceId: Int');
		args.push('destinationWorkspaceId: $workspaceId');
		variables.workspaceId = Number.parseInt(workspaceId, 10);
	}
	if (options.callbackUrl) {
		varDefs.push('$callbackUrl: String');
		args.push('callback_url: $callbackUrl');
		variables.callbackUrl = options.callbackUrl;
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			create_portfolio(${args.join(', ')}) {
				success
				message
				process_id
			}
		}`,
		itemIndex,
		variables,
	);
	const result = (data.create_portfolio ?? {}) as IDataObject;

	if (result.success !== true) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com did not create the portfolio: ${(result.message as string) || 'no reason returned'}. Note that portfolios are only available on Enterprise plans.`,
			{ itemIndex },
		);
	}

	const output: IDataObject = {
		success: true,
		message: result.message ?? null,
		processId: result.process_id ?? null,
	};

	if (wait && excludeIds) {
		const timeoutSeconds =
			(options.waitTimeout as number) ?? DEFAULT_CREATE_WAIT_TIMEOUT_SECONDS;
		const board = await waitForCreatedBoard(client, itemIndex, {
			name,
			workspaceId,
			excludeIds,
			timeoutMs: timeoutSeconds * 1000,
		});
		if (!board) {
			throw new NodeOperationError(
				this.getNode(),
				`monday.com accepted the portfolio request, but the board "${name}" did not appear within ${timeoutSeconds} seconds. Creation continues on monday's side — find the board by name, or increase the Wait Timeout option.`,
				{ itemIndex },
			);
		}
		output.portfolioBoardId = board.id;
		output.portfolioBoardName = board.name;
		output.portfolioBoardUrl = board.url ?? null;
	}

	return output;
}

/**
 * The one connect_project_to_portfolio request, shared by the standalone
 * Connect Project operation and Project: Create's Connect to Portfolio
 * option. projectBoardId must be the multi-level task board — the classic
 * overview companion (or any regular board) fails with the API's generic
 * "Failed to connect project to portfolio." (verified live). The mutation's
 * dedicated 40/min rate limit surfaces as a 429, which the client's retry
 * layer already handles.
 */
async function requestConnectProjectToPortfolio(
	client: MondayGraphQLClient,
	itemIndex: number,
	projectBoardId: string,
	portfolioBoardId: string,
	callbackUrl?: string,
): Promise<IDataObject> {
	const varDefs = ['$projectBoardId: ID!', '$portfolioBoardId: ID!'];
	const args = ['projectBoardId: $projectBoardId', 'portfolioBoardId: $portfolioBoardId'];
	const variables: Record<string, unknown> = { projectBoardId, portfolioBoardId };
	if (callbackUrl) {
		varDefs.push('$callbackUrl: String');
		args.push('callback_url: $callbackUrl');
		variables.callbackUrl = callbackUrl;
	}

	const data = await client.execute(
		`mutation (${varDefs.join(', ')}) {
			connect_project_to_portfolio(${args.join(', ')}) {
				success
				message
				portfolio_item_id
				process_id
			}
		}`,
		itemIndex,
		variables,
	);
	return (data.connect_project_to_portfolio ?? {}) as IDataObject;
}

/** The generic API failure needs context — its message carries no reason. */
const CONNECT_FAILURE_HINT =
	'Check that the project board is a real project (the multi-level task board, not the project-overview companion), the portfolio board is a portfolio, and the account is on an Enterprise plan.';

/**
 * Project: Create — the Enterprise-only create_project mutation. Same async
 * pattern as createPortfolio, with one twist: monday creates TWO boards with
 * the requested name (verified live) — the multi-level task board (the
 * project connect_project_to_portfolio accepts) and, a few seconds later, a
 * classic "project overview" companion. Both are returned. With Connect to
 * Portfolio enabled, waiting is forced (the connection needs the board ID)
 * and the new project is linked into the picked portfolio in the same run.
 */
async function createProject(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const name = this.getNodeParameter('projectName', itemIndex) as string;
	const boardKind = this.getNodeParameter('projectKind', itemIndex) as string;
	const connectToPortfolio = this.getNodeParameter('connectToPortfolio', itemIndex, false) as boolean;
	const options = this.getNodeParameter('createProjectOptions', itemIndex, {}) as IDataObject;
	// Resource locator nested in a collection — see extractWorkspaceId.
	const workspaceId = extractWorkspaceId(options.workspaceId) || undefined;

	if (options.templateId && options.resourcePlanner === true) {
		throw new NodeOperationError(
			this.getNode(),
			'Template ID and Enable Resource Planner cannot be combined — the API rejects a project created from a template with companions. Remove one of the two options.',
			{ itemIndex },
		);
	}

	// The portfolio picker is resolved before the mutation so a bad selection
	// fails fast, before anything is created.
	const portfolioBoardId = connectToPortfolio
		? (this.getNodeParameter('portfolioBoardId', itemIndex, undefined, {
				extractValue: true,
			}) as string)
		: undefined;

	const wait = connectToPortfolio || options.waitForBoards !== false;
	const excludeIds = wait ? await snapshotRecentBoardIds(client, itemIndex, workspaceId) : null;

	const input: IDataObject = { name, board_kind: boardKind };
	if (workspaceId) input.workspace_id = workspaceId;
	if (options.folderId) input.folder_id = options.folderId;
	if (options.templateId) input.template_id = options.templateId;
	if (options.resourcePlanner === true) input.companions = ['resource_planner'];
	if (options.callbackUrl) input.callback_url = options.callbackUrl;

	const data = await client.execute(
		`mutation ($input: CreateProjectInput!) {
			create_project(input: $input) {
				success
				message
				process_id
				error
			}
		}`,
		itemIndex,
		{ input },
	);
	const result = (data.create_project ?? {}) as IDataObject;

	if (result.success !== true) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com did not create the project: ${(result.error as string) || (result.message as string) || 'no reason returned'}. Note that projects are only available on Enterprise plans.`,
			{ itemIndex },
		);
	}

	const output: IDataObject = {
		success: true,
		message: result.message ?? null,
		processId: result.process_id ?? null,
	};

	if (wait && excludeIds) {
		const timeoutSeconds =
			(options.waitTimeout as number) ?? DEFAULT_CREATE_WAIT_TIMEOUT_SECONDS;
		const boards = await waitForProjectBoards(client, itemIndex, {
			name,
			workspaceId,
			excludeIds,
			timeoutMs: timeoutSeconds * 1000,
		});
		if (!boards.projectBoard) {
			throw new NodeOperationError(
				this.getNode(),
				`monday.com accepted the project request, but the board "${name}" did not appear within ${timeoutSeconds} seconds. Creation continues on monday's side — find the board by name, or increase the Wait Timeout option.`,
				{ itemIndex },
			);
		}
		output.projectBoardId = boards.projectBoard.id;
		output.projectBoardUrl = boards.projectBoard.url ?? null;
		output.overviewBoardId = boards.overviewBoard?.id ?? null;
		output.overviewBoardUrl = boards.overviewBoard?.url ?? null;

		if (connectToPortfolio && portfolioBoardId) {
			const connectResult = await requestConnectProjectToPortfolio(
				client,
				itemIndex,
				boards.projectBoard.id,
				portfolioBoardId,
			);
			if (connectResult.success !== true) {
				throw new NodeOperationError(
					this.getNode(),
					`The project was created (board ID ${boards.projectBoard.id}), but connecting it to portfolio board ${portfolioBoardId} failed: ${(connectResult.message as string) || 'no reason returned'}. ${CONNECT_FAILURE_HINT}`,
					{ itemIndex },
				);
			}
			output.portfolioItemId = connectResult.portfolio_item_id ?? null;
			output.connectedPortfolioBoardId = portfolioBoardId;
		}
	}

	return output;
}

/**
 * Portfolio: Connect Project — links an existing project board into a
 * portfolio board. Synchronous (unlike the create mutations): without a
 * callback_url the portfolio_item_id comes back in the response.
 */
async function connectProjectToPortfolio(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const projectBoardId = this.getNodeParameter('projectBoardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const portfolioBoardId = this.getNodeParameter('portfolioBoardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const options = this.getNodeParameter('connectPortfolioOptions', itemIndex, {}) as IDataObject;

	const result = await requestConnectProjectToPortfolio(
		client,
		itemIndex,
		projectBoardId,
		portfolioBoardId,
		(options.callbackUrl as string) || undefined,
	);

	if (result.success !== true) {
		throw new NodeOperationError(
			this.getNode(),
			`monday.com could not connect project board ${projectBoardId} to portfolio board ${portfolioBoardId}: ${(result.message as string) || 'no reason returned'}. ${CONNECT_FAILURE_HINT}`,
			{ itemIndex },
		);
	}

	return {
		success: true,
		message: result.message ?? null,
		portfolioItemId: result.portfolio_item_id ?? null,
		processId: result.process_id ?? null,
	};
}

/**
 * Validation: Get — the board's required columns and validation rules.
 * Root-only query (can't nest under boards). On accounts without the
 * feature (non-Pro/Enterprise) the API returns null instead of erroring —
 * simplified output stays empty with a notice so workflows can branch.
 */
async function getValidations(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;

	const data = await client.execute(
		`query ($id: ID!) {
			validations(id: $id, type: board) {
				required_column_ids
				rules
			}
		}`,
		itemIndex,
		{ id: boardId },
	);

	const validations = (data.validations ?? null) as ValidationsResponse | null;

	if (!simplify) {
		return { validations };
	}

	const simplified: IDataObject = simplifyValidations(validations);
	if (validations === null) {
		// The API returns null BOTH when no validations are configured and on
		// plans without the feature (verified live) — the two are
		// indistinguishable from this query.
		simplified.notice =
			'No validations found. The API returns this same empty result when the board has no validations and on plans without the feature (board validations require Pro or Enterprise).';
	}
	return simplified;
}

/**
 * Validation: Set Required Column — add or remove a column's required
 * designation. Both mutations return the full updated required-column list.
 */
async function setRequiredColumn(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const mode = this.getNodeParameter('requiredColumnMode', itemIndex, 'add') as string;
	const columnId = this.getNodeParameter(
		mode === 'remove' ? 'requiredColumnRemoveId' : 'requiredColumnId',
		itemIndex,
	) as string;

	const mutation =
		mode === 'remove'
			? `mutation ($id: ID!, $columnId: String!) {
					remove_required_column(id: $id, column_id: $columnId, type: board) { required_column_ids }
				}`
			: `mutation ($id: ID!, $columnId: String!) {
					add_required_column(id: $id, column_id: $columnId, type: board) { required_column_ids }
				}`;

	const data = await client.execute(mutation, itemIndex, { id: boardId, columnId });
	const payload = (data.add_required_column ?? data.remove_required_column ?? {}) as IDataObject;

	return {
		action: mode,
		columnId,
		requiredColumnIds: payload.required_column_ids ?? [],
	};
}

/** The UI rows of one rule-builder fixedCollection. */
interface RuleBuilderRows {
	condition: RuleConstraintInput[];
	constraints: RuleConstraintInput[];
}

function readRuleBuilderRows(context: IExecuteFunctions, itemIndex: number): RuleBuilderRows {
	const conditionCollection = context.getNodeParameter('ruleCondition', itemIndex, {}) as {
		condition?: RuleConstraintInput | RuleConstraintInput[];
	};
	const rawCondition = conditionCollection.condition;
	const condition = (Array.isArray(rawCondition) ? rawCondition : rawCondition ? [rawCondition] : [])
		.filter((row) => row.columnId && row.operator);

	const constraintsCollection = context.getNodeParameter('ruleConstraints', itemIndex, {}) as {
		constraints?: RuleConstraintInput[];
	};
	const constraints = (constraintsCollection.constraints ?? []).filter(
		(row) => row.columnId && row.operator,
	);

	return { condition, constraints };
}

/**
 * Validation: Create Rule / Update Rule — both compile the same rule
 * definition (builder or raw JSON); update additionally sends the rule_id
 * and REPLACES the whole rule (the API has no partial update).
 */
async function upsertValidationRule(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	operation: string,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const mode = this.getNodeParameter('ruleDefinitionMode', itemIndex, 'builder') as string;

	let rule: IDataObject;

	if (mode === 'json') {
		const raw = this.getNodeParameter('ruleJson', itemIndex) as string | IDataObject;
		const parsed = typeof raw === 'string' ? (safeJsonParse(raw) as IDataObject | null) : raw;
		if (!parsed || typeof parsed !== 'object' || !parsed.then) {
			throw new NodeOperationError(
				this.getNode(),
				'Rule (JSON) must be an object with a "then" clause (and optionally an "if" clause) — see the validation rules guide',
				{ itemIndex },
			);
		}
		rule = parsed;
	} else {
		const { condition, constraints } = readRuleBuilderRows(this, itemIndex);

		if (constraints.length === 0) {
			throw new NodeOperationError(
				this.getNode(),
				'Add at least one constraint under Constraints (Then)',
				{ itemIndex },
			);
		}
		// API constraint (verified live): a rule without a condition allows
		// exactly one constraint, and only one such rule per column.
		if (condition.length === 0 && constraints.length > 1) {
			throw new NodeOperationError(
				this.getNode(),
				'Without a Condition (If), monday allows exactly one constraint per rule. Add a condition, or split into separate rules.',
				{ itemIndex },
			);
		}

		const columns = await fetchRuleColumns(client, boardId, itemIndex);

		// Execute-time operator guard — the dropdown's server-side counterpart
		// (stale operator selections and expression-mode IDs bypass the UI).
		const offending = [
			...findUnsupportedRuleConstraints('if', condition, columns),
			...findUnsupportedRuleConstraints(condition.length > 0 ? 'then' : 'plain', constraints, columns),
		];
		if (offending.length > 0) {
			throw new NodeOperationError(this.getNode(), formatUnsupportedRuleMessage(offending), {
				itemIndex,
			});
		}

		const ruleOptions = this.getNodeParameter('ruleOptions', itemIndex, {}) as IDataObject;
		const thenMatch = (ruleOptions.thenMatch as 'AND' | 'OR') ?? 'AND';

		rule = { then: compileRuleClause(constraints, columns, thenMatch) };
		if (condition.length > 0) {
			rule.if = compileRuleClause(condition, columns);
		}
	}

	if (operation === 'updateValidationRule') {
		const ruleId = this.getNodeParameter('ruleId', itemIndex) as string;
		const data = await client.execute(
			`mutation ($id: ID!, $ruleId: ID!, $rule: ValidationRuleInput!) {
				update_validation_rule(id: $id, type: board, rule_id: $ruleId, rule: $rule) { id if then }
			}`,
			itemIndex,
			{ id: boardId, ruleId, rule },
		);
		return (data.update_validation_rule ?? {}) as IDataObject;
	}

	const data = await client.execute(
		`mutation ($id: ID!, $rule: ValidationRuleInput!) {
			create_validation_rule(id: $id, type: board, rule: $rule) { id if then }
		}`,
		itemIndex,
		{ id: boardId, rule },
	);
	return (data.create_validation_rule ?? {}) as IDataObject;
}

/**
 * Validation: Delete Rule — returns the deleted rule's full definition
 * (useful for audit/undo downstream).
 */
async function deleteValidationRule(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const ruleId = this.getNodeParameter('ruleId', itemIndex) as string;

	const data = await client.execute(
		`mutation ($id: ID!, $ruleId: ID!) {
			delete_validation_rule(id: $id, type: board, rule_id: $ruleId) { id if then }
		}`,
		itemIndex,
		{ id: boardId, ruleId },
	);
	return { ...((data.delete_validation_rule ?? {}) as IDataObject), deleted: true };
}

/**
 * Board: Get Many — direct limit/page mapping onto the boards query.
 * No "Return All": on huge accounts unbounded enumeration simply won't work;
 * callers walk pages explicitly instead.
 */
/**
 * Board: Get — one board by ID. Queries with state: all so archived and
 * deleted boards still resolve (the API defaults to active only, which made
 * archived boards look nonexistent). Output is the unwrapped board object.
 */
async function getSingleBoard(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const options = this.getNodeParameter('getBoardOptions', itemIndex, {}) as IDataObject;

	const data = await client.execute(
		`query ($ids: [ID!]) {
			boards(ids: $ids, state: all) {
				${buildBoardFieldSelection({
					includeStructure: true,
					includeCompleteData: options.includeCompleteData === true,
				})}
			}
		}`,
		itemIndex,
		{ ids: [boardId] },
	);

	const boards = (data.boards ?? []) as IDataObject[];
	if (boards.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			`Board ${boardId} was not found. It may never have existed, or your API token may not have access to it.`,
			{ itemIndex },
		);
	}
	return boards[0];
}

async function getManyBoards(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	// Limit/Page live under Options (node-wide convention): the defaults are
	// used unless the user explicitly sets them.
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const page = (options.page as number) ?? 1;
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;

	// Only include filter args the user actually set, so we never override
	// the API's defaults (e.g. state defaults to active server-side).
	const varDefs = ['$limit: Int!', '$page: Int!'];
	const args = ['limit: $limit', 'page: $page'];
	const variables: Record<string, unknown> = {};

	if (filters.boardKind) {
		varDefs.push('$boardKind: BoardKind!');
		args.push('board_kind: $boardKind');
		variables.boardKind = filters.boardKind;
	}
	if (filters.state) {
		varDefs.push('$state: State!');
		args.push('state: $state');
		variables.state = filters.state;
	}
	if (filters.orderBy) {
		varDefs.push('$orderBy: BoardsOrderBy!');
		args.push('order_by: $orderBy');
		variables.orderBy = filters.orderBy;
	}
	// Both ID filters come from a multiOptions dropdown (array) or an
	// expression (array or comma-separated string).
	const workspaceIds = normalizeIdList(filters.workspaceIds);
	if (workspaceIds.length > 0) {
		varDefs.push('$workspaceIds: [ID!]');
		args.push('workspace_ids: $workspaceIds');
		variables.workspaceIds = workspaceIds;
	}
	const boardIds = normalizeIdList(filters.boardIds);
	if (boardIds.length > 0) {
		varDefs.push('$boardIds: [ID!]');
		args.push('ids: $boardIds');
		variables.boardIds = boardIds;
	}

	const data = await client.execute(
		`query (${varDefs.join(', ')}) {
			boards(${args.join(', ')}) {
				${buildBoardFieldSelection({ includeCompleteData: options.includeCompleteData === true })}
			}
		}`,
		itemIndex,
		{ ...variables, limit, page },
	);

	// The boards query also returns monday docs and subitem boards; a
	// "Get Many Boards" caller wants boards. Because this filter runs after
	// the API page, a page can return fewer than `limit` rows on accounts
	// with many docs — page numbering itself is unaffected.
	return ((data.boards ?? []) as IDataObject[]).filter((board) =>
		isRealBoard(board as { type?: string }),
	);
}

/**
 * Board: Aggregate Item Data — one server-side aggregate() call. Only the
 * result rows come back; the board's items are never fetched. One bounded
 * columns read resolves filter labels, column titles for output keys, and
 * the type-aware conversions (status/dropdown → label text, dates → ISO).
 */
async function aggregateBoardData(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const calculationRows =
		(
			this.getNodeParameter('aggregateCalculations', itemIndex, {}) as {
				calculations?: Array<{
					function: string;
					numericColumnId?: string;
					minMaxColumnId?: string;
					anyColumnId?: string;
					outputName?: string;
				}>;
			}
		).calculations ?? [];
	const groupByRows =
		(
			this.getNodeParameter('aggregateGroupBy', itemIndex, {}) as {
				groups?: Array<{ columnId: string; dateGrouping?: string }>;
			}
		).groups ?? [];
	const filterRows =
		(this.getNodeParameter('aggregateFilters', itemIndex, {}) as { rules?: FilterRuleInput[] })
			.rules ?? [];
	const options = this.getNodeParameter('aggregateOptions', itemIndex, {}) as IDataObject;

	// Each function shows its own type-filtered column picker in the UI, so
	// the picked column arrives under one of three names.
	const calculations: AggregateCalculationRow[] = calculationRows.map((row) => ({
		function: row.function,
		columnId: row.numericColumnId || row.minMaxColumnId || row.anyColumnId || undefined,
		outputName: row.outputName,
	}));

	const needsColumns =
		groupByRows.length > 0 ||
		filterRows.length > 0 ||
		calculations.some((row) => row.columnId !== undefined);
	const columns = needsColumns ? await fetchColumns(this, boardId, itemIndex) : [];

	// Same operator-vs-column-type guard as Item: Get Many (stale dropdown
	// selections and expression-mode column IDs bypass the dynamic dropdown).
	const unsupportedOperatorRules = findUnsupportedOperatorRules(filterRows, columns);
	if (unsupportedOperatorRules.length > 0) {
		throw new NodeOperationError(
			this.getNode(),
			formatUnsupportedOperatorMessage(unsupportedOperatorRules),
			{ itemIndex },
		);
	}

	let plan: AggregateQueryPlan;
	try {
		plan = buildAggregateQueryPlan({
			boardId,
			calculations,
			groupBys: groupByRows,
			columns,
			filterRules: filterRows.length > 0 ? buildFilterRules(filterRows, columns) : undefined,
			filtersMatch: (options.filtersMatch as string) ?? 'and',
			limit: (options.limit as number) ?? DEFAULT_LIMIT,
		});
	} catch (error) {
		if (error instanceof AggregateInputError) {
			throw new NodeOperationError(this.getNode(), error.message, { itemIndex });
		}
		// Anything else is a programming error, not an API/input problem.
		throw ensureNodeError(this.getNode(), error);
	}

	const data = await client.execute(
		`query ($query: AggregateQueryInput!) {
			aggregate(query: $query) {
				results {
					entries {
						alias
						value {
							... on AggregateBasicAggregationResult { result }
							... on AggregateGroupByResult { value }
						}
					}
				}
			}
		}`,
		itemIndex,
		{ query: plan.queryInput },
	);

	const rows = parseAggregateResults(data as AggregateApiResponse, plan.aliases);

	// On multi-level boards the aggregation engine scans LEAF items only
	// (verified live; no API control exists) — flag it so users don't read
	// the numbers as covering parent items too. One bounded lookup, cached
	// per execution.
	const hierarchyType = await getBoardHierarchyType(client, itemIndex, boardId);
	if (hierarchyType === 'multi_level') {
		return rows.map((row) => ({ ...row, multiLevelBoardNote: MULTI_LEVEL_AGGREGATE_NOTE }));
	}
	return rows;
}

/**
 * Item: Get Many — cursor pagination via items_page / next_items_page.
 * Group and column-value filtering plus sorting all go through query_params,
 * which keeps a single cursor across the whole query. Emits one item per
 * record, plus an optional trailing { nextCursor } item for resuming.
 *
 * Include Subitems (multi-level boards) adds hierarchy_scope_config:
 * "allItems" — subject to two verified API bugs handled here: order_by is
 * silently ignored under that scope (blocked with an error), and an
 * unfiltered all-items query returns an empty page (worked around with a
 * tautological all-groups rule).
 */
async function getManyItems(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
): Promise<IDataObject[]> {
	const boardId = this.getNodeParameter('boardId', itemIndex, undefined, {
		extractValue: true,
	}) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	// No "Return All" — a bounded limit only, under Options with a default
	// (node-wide convention). The helper still walks the cursor internally
	// (100/request) until the limit is reached.
	const limit = (options.limit as number) ?? DEFAULT_LIMIT;
	const groupIds = normalizeIdList(options.groupIds);
	const columnIds = normalizeIdList(options.columnIds);
	const startingCursor = (options.startingCursor ?? '') as string;
	const includeCursor = options.includeCursor === true;
	const includeSubitems = options.includeSubitems === true;

	if (includeSubitems && options.sortBy) {
		throw new NodeOperationError(
			this.getNode(),
			'Sort By Column cannot be combined with Include Subitems — the API silently ignores sorting when subitems are included. Remove one of the two options.',
			{ itemIndex },
		);
	}

	const filterRows = (
		this.getNodeParameter('itemFilters', itemIndex, {}) as { rules?: FilterRuleInput[] }
	).rules ?? [];

	const rules: IDataObject[] = [];
	if (groupIds.length > 0) {
		rules.push({ column_id: 'group', compare_value: groupIds, operator: 'any_of' });
	}
	if (filterRows.length > 0) {
		// Column settings are needed to resolve status/dropdown label text
		// into the label indexes the API filters by.
		const columns = await fetchColumns(this, boardId, itemIndex);
		// Rollup status columns (BatteryValue) return silently wrong filter
		// results — the picker hides them, this guards expression-set IDs.
		const rollupStatusColumns = findRollupStatusRuleColumns(filterRows, columns);
		if (rollupStatusColumns.length > 0) {
			throw new NodeOperationError(
				this.getNode(),
				`Cannot filter on ${rollupStatusColumns.join(', ')}: status columns that roll up child values (multi-level boards) return unreliable filter results in the monday API. Filter on a different column, or filter the output in n8n instead.`,
				{ itemIndex },
			);
		}
		// Stale dropdown selections (n8n keeps the operator when the column
		// changes) and expression-mode column IDs can pair a column with an
		// operator its type rejects — fail with the supported list up front.
		const unsupportedOperatorRules = findUnsupportedOperatorRules(filterRows, columns);
		if (unsupportedOperatorRules.length > 0) {
			throw new NodeOperationError(
				this.getNode(),
				formatUnsupportedOperatorMessage(unsupportedOperatorRules),
				{ itemIndex },
			);
		}
		rules.push(...buildFilterRules(filterRows, columns));
	}
	if (includeSubitems && rules.length === 0 && !startingCursor) {
		// Verified API bug: the all-items scope returns an empty page when no
		// rules are set at all. A rule matching every group is a no-op filter.
		rules.push(buildAllGroupsRule(await fetchBoardGroupIds(client, itemIndex, boardId)));
	}

	const orderBy = options.sortBy
		? [{ column_id: options.sortBy, direction: options.sortDirection ?? 'asc' }]
		: undefined;

	let queryParams: IDataObject | null = null;
	if (rules.length > 0 || orderBy) {
		queryParams = {};
		if (rules.length > 0) {
			queryParams.rules = rules;
			queryParams.operator = options.filtersMatch ?? 'and';
		}
		if (orderBy) {
			queryParams.order_by = orderBy;
		}
	}

	// Column IDs come from the picker or an expression; serialize them as a
	// JSON string array, which is valid GraphQL list syntax for [String!].
	// Empty selection = all columns. The item name is a top-level field, so
	// it is always present regardless of this selection. CALCULATED is
	// always requested — without it, rollup columns (multi-level boards)
	// are silently missing from column_values.
	const columnArgs =
		columnIds.length > 0
			? `(ids: ${JSON.stringify(columnIds)}, ${COLUMN_VALUES_CALCULATED_ARG})`
			: `(${COLUMN_VALUES_CALCULATED_ARG})`;
	const itemFields = `
		id
		name
		state
		url
		created_at
		updated_at
		group { id title }
		${includeSubitems ? 'parent_item { id name }' : ''}
		column_values${columnArgs} { id type text value ${BATTERY_VALUE_FRAGMENT} ${LINKED_VALUE_FRAGMENTS} }
	`;

	interface ItemsPagePayload {
		boards?: Array<{ items_page?: { cursor: string | null; items: IDataObject[] } }>;
	}

	// The hierarchy scope only exists on the first query; follow-up
	// next_items_page calls inherit it through the cursor.
	const scopeArg = includeSubitems ? ', hierarchy_scope_config: "allItems"' : '';

	const { rows, nextCursor } = await fetchAllByCursor({
		client,
		itemIndex,
		firstQuery: `query ($boardId: [ID!], $limit: Int!, $queryParams: ItemsQuery) {
			boards(ids: $boardId) {
				items_page(limit: $limit, query_params: $queryParams${scopeArg}) {
					cursor
					items { ${itemFields} }
				}
			}
		}`,
		firstVariables: {
			boardId: [boardId],
			queryParams,
		},
		extractFirstPage: (data) => {
			const page = (data as ItemsPagePayload).boards?.[0]?.items_page;
			return page ? { cursor: page.cursor, items: page.items } : undefined;
		},
		itemFields,
		limit,
		startCursor: startingCursor || undefined,
	});

	return includeCursor ? [...rows, { nextCursor }] : rows;
}

/**
 * Resolves the Form Token parameter — raw token or full form URL — into the
 * bare token, with a friendly error for unusable inputs (e.g. shortened
 * wkf.ms links, which don't contain the token).
 */
function resolveFormToken(this: IExecuteFunctions, itemIndex: number): string {
	const raw = this.getNodeParameter('formToken', itemIndex) as string;
	const token = extractFormToken(raw);
	if (!token) {
		throw new NodeOperationError(this.getNode(), 'Form Token is missing or not usable', {
			itemIndex,
			description:
				'Provide the form\u2019s alphanumeric token or its full URL (https://forms.monday.com/forms/<token>). Shortened wkf.ms links do not contain the token \u2014 open the short link in a browser and copy the full URL it resolves to.',
		});
	}
	return token;
}

/** Parses an optional JSON-object parameter from a collection field. */
function parseJsonObjectField(
	this: IExecuteFunctions,
	value: unknown,
	fieldLabel: string,
	itemIndex: number,
): IDataObject | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	if (typeof value === 'object' && !Array.isArray(value)) return value as IDataObject;
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as IDataObject;
			}
		} catch {
			// fall through to the error below
		}
	}
	throw new NodeOperationError(this.getNode(), `${fieldLabel} must be a valid JSON object`, {
		itemIndex,
	});
}

/**
 * Form resource dispatcher — all 12 operations of the Workforms API. Kept in
 * one function so the friendly error mapping (InvalidFormToken /
 * USER_UNAUTHORIZED, see describeFormError) wraps every call uniformly.
 */
async function executeFormOperation(
	this: IExecuteFunctions,
	client: MondayGraphQLClient,
	itemIndex: number,
	operation: string,
): Promise<IDataObject> {
	try {
		if (operation === 'createForm') {
			const workspaceId = this.getNodeParameter('formWorkspaceId', itemIndex, undefined, {
				extractValue: true,
			}) as string;
			const options = this.getNodeParameter('createFormOptions', itemIndex, {}) as IDataObject;
			const owners = splitUserTeamIds(extractUserRowIds(options.ownerIds ?? {}));
			const subscribers = splitUserTeamIds(extractUserRowIds(options.subscriberIds ?? {}));

			// The docs table says Float for these arguments — the live schema
			// types them all as ID (introspected 2026-07-19).
			const toIds = (ids: string[]) => (ids.length > 0 ? ids : null);
			const data = await client.execute(
				`mutation ($workspaceId: ID!, $boardKind: BoardKind, $name: String, $folderId: ID, $ownerIds: [ID!], $ownerTeamIds: [ID!], $subscriberIds: [ID!], $subscriberTeamIds: [ID!]) {
					create_form(
						destination_workspace_id: $workspaceId,
						board_kind: $boardKind,
						destination_name: $name,
						destination_folder_id: $folderId,
						board_owner_ids: $ownerIds,
						board_owner_team_ids: $ownerTeamIds,
						board_subscriber_ids: $subscriberIds,
						board_subscriber_teams_ids: $subscriberTeamIds
					) {
						boardId
						token
					}
				}`,
				itemIndex,
				{
					workspaceId,
					boardKind: (options.boardKind as string) || null,
					name: (options.destinationName as string) || null,
					folderId: (options.destinationFolderId as string) || null,
					ownerIds: toIds(owners.userIds),
					ownerTeamIds: toIds(owners.teamIds),
					subscriberIds: toIds(subscribers.userIds),
					subscriberTeamIds: toIds(subscribers.teamIds),
				},
			);
			const created = (data.create_form ?? {}) as IDataObject;
			return { ...created, formUrl: created.token ? `${FORM_PUBLIC_URL_BASE}${created.token}` : null };
		}

		const formToken = resolveFormToken.call(this, itemIndex);

		if (operation === 'getForm') {
			const data = await client.execute(
				`query ($formToken: String!) { form(formToken: $formToken) { ${FORM_FIELDS} } }`,
				itemIndex,
				{ formToken },
			);
			const form = (data.form ?? {}) as IDataObject;
			return { ...form, formUrl: `${FORM_PUBLIC_URL_BASE}${formToken}` };
		}

		if (operation === 'updateForm') {
			const fields = this.getNodeParameter('updateFormFields', itemIndex, {}) as IDataObject;
			const input: IDataObject = {};
			if (typeof fields.title === 'string' && fields.title !== '') input.title = fields.title;
			if (typeof fields.description === 'string' && fields.description !== '') {
				input.description = fields.description;
			}
			const orderIds = splitCsvList((fields.questionOrder as string) ?? '');
			if (orderIds.length > 0) {
				input.questions = orderIds.map((id) => ({ id }));
			}
			if (Object.keys(input).length === 0) {
				throw new NodeOperationError(
					this.getNode(),
					'Add at least one field to update (Title, Description, or Question Order)',
					{ itemIndex },
				);
			}
			const data = await client.execute(
				`mutation ($formToken: String!, $input: UpdateFormInput!) {
					update_form(formToken: $formToken, input: $input) {
						token
						title
						description
						questions { id title type }
					}
				}`,
				itemIndex,
				{ formToken, input },
			);
			return (data.update_form ?? {}) as IDataObject;
		}

		if (operation === 'updateFormSettings') {
			const fields = this.getNodeParameter('formSettingsFields', itemIndex, {}) as IDataObject;
			const rawSettings = parseJsonObjectField.call(
				this,
				fields.rawSettings,
				'Raw Settings (JSON)',
				itemIndex,
			);
			const typedFields = { ...fields };
			delete typedFields.rawSettings;
			const result = buildFormSettingsInput(typedFields, rawSettings);
			if (result.error) {
				throw new NodeOperationError(this.getNode(), result.error, { itemIndex });
			}
			const data = await client.execute(
				`mutation ($formToken: String!, $settings: UpdateFormSettingsInput!) {
					update_form_settings(formToken: $formToken, settings: $settings) {
						token
						title
						active
						isAnonymous
						accessibility { language logoAltText }
						appearance {
							primaryColor
							showProgressBar
							hideBranding
							submitButton { text }
						}
						features {
							reCaptchaChallenge
							password { enabled }
							requireLogin { enabled redirectToLogin }
							responseLimit { enabled limit }
							draftSubmission { enabled }
							closeDate { enabled date }
							afterSubmissionView { redirectAfterSubmission { enabled redirectUrl } }
						}
					}
				}`,
				itemIndex,
				{ formToken, settings: result.settings },
			);
			return (data.update_form_settings ?? {}) as IDataObject;
		}

		if (operation === 'activateOrDeactivateForm') {
			const action = this.getNodeParameter('formActiveAction', itemIndex, 'activate') as string;
			const mutation =
				action === 'deactivate'
					? 'mutation ($formToken: String!) { deactivate_form(formToken: $formToken) }'
					: 'mutation ($formToken: String!) { activate_form(formToken: $formToken) }';
			const data = await client.execute(mutation, itemIndex, { formToken });
			// Both mutations return a bare Boolean — echo a useful record.
			const success = (data.activate_form ?? data.deactivate_form) === true;
			return { token: formToken, action, success, active: action === 'activate' ? success : !success };
		}

		if (operation === 'setFormPassword') {
			const action = this.getNodeParameter('formPasswordAction', itemIndex, 'set') as string;
			if (action === 'remove') {
				// The only removal path — set_form_password can't disable
				// protection, update_form_settings can't enable it (verified live).
				const data = await client.execute(
					`mutation ($formToken: String!) {
						update_form_settings(formToken: $formToken, settings: { features: { password: { enabled: false } } }) {
							token
							features { password { enabled } }
						}
					}`,
					itemIndex,
					{ formToken },
				);
				const form = (data.update_form_settings ?? {}) as IDataObject;
				const features = (form.features ?? {}) as IDataObject;
				const password = (features.password ?? {}) as IDataObject;
				return { token: formToken, passwordEnabled: password.enabled === true };
			}
			const password = this.getNodeParameter('formPassword', itemIndex) as string;
			if (!password) {
				throw new NodeOperationError(this.getNode(), 'Password must not be empty', { itemIndex });
			}
			const data = await client.execute(
				`mutation ($formToken: String!, $input: SetFormPasswordInput!) {
					set_form_password(formToken: $formToken, input: $input) {
						id
						token
						title
						features { password { enabled } }
					}
				}`,
				itemIndex,
				{ formToken, input: { password } },
			);
			const form = (data.set_form_password ?? {}) as IDataObject;
			const features = (form.features ?? {}) as IDataObject;
			const passwordState = (features.password ?? {}) as IDataObject;
			return {
				id: form.id ?? null,
				token: formToken,
				title: form.title ?? null,
				passwordEnabled: passwordState.enabled === true,
			};
		}

		if (operation === 'shortenFormUrl') {
			const data = await client.execute(
				'mutation ($formToken: String!) { shorten_form_url(formToken: $formToken) { enabled url } }',
				itemIndex,
				{ formToken },
			);
			return { token: formToken, ...((data.shorten_form_url ?? {}) as IDataObject) };
		}

		if (operation === 'createFormQuestion') {
			const title = this.getNodeParameter('formQuestionTitle', itemIndex) as string;
			const type = this.getNodeParameter('formQuestionType', itemIndex) as string;
			const options = this.getNodeParameter(
				'createFormQuestionOptions',
				itemIndex,
				{},
			) as IDataObject;
			const settings = parseJsonObjectField.call(
				this,
				options.settingsJson,
				'Settings (JSON)',
				itemIndex,
			);
			const input = buildCreateQuestionInput(title, type, { ...options, settings });
			if (input.error) {
				throw new NodeOperationError(this.getNode(), input.error, { itemIndex });
			}
			const data = await client.execute(
				`mutation ($formToken: String!, $question: CreateQuestionInput!) {
					create_form_question(formToken: $formToken, question: $question) { ${FORM_QUESTION_FIELDS} }
				}`,
				itemIndex,
				{ formToken, question: input.question },
			);
			return (data.create_form_question ?? {}) as IDataObject;
		}

		if (operation === 'updateFormQuestion') {
			const questionId = this.getNodeParameter('formQuestionId', itemIndex) as string;
			const fields = this.getNodeParameter(
				'updateFormQuestionFields',
				itemIndex,
				{},
			) as IDataObject;
			const settings = parseJsonObjectField.call(
				this,
				fields.settingsJson,
				'Settings (JSON)',
				itemIndex,
			);

			// UpdateQuestionInput requires `type`, and it must match the
			// question's existing type (the API can't change types) — read it
			// from the form so the user never has to provide it.
			const formData = await client.execute(
				'query ($formToken: String!) { form(formToken: $formToken) { questions { id type } } }',
				itemIndex,
				{ formToken },
			);
			const questions = (((formData.form ?? {}) as IDataObject).questions ?? []) as Array<{
				id: string;
				type?: string;
			}>;
			const existing = questions.find((question) => question.id === questionId);
			if (!existing?.type) {
				throw new NodeOperationError(
					this.getNode(),
					`Question ${questionId} was not found on this form`,
					{ itemIndex },
				);
			}

			const input = buildUpdateQuestionInput(existing.type, { ...fields, settings });
			if (input.error) {
				throw new NodeOperationError(this.getNode(), input.error, { itemIndex });
			}
			const data = await client.execute(
				`mutation ($formToken: String!, $questionId: String!, $question: UpdateQuestionInput!) {
					update_form_question(formToken: $formToken, questionId: $questionId, question: $question) { ${FORM_QUESTION_FIELDS} }
				}`,
				itemIndex,
				{ formToken, questionId, question: input.question },
			);
			return (data.update_form_question ?? {}) as IDataObject;
		}

		if (operation === 'deleteFormQuestion') {
			const questionId = this.getNodeParameter('formQuestionId', itemIndex) as string;
			const data = await client.execute(
				'mutation ($formToken: String!, $questionId: String!) { delete_question(formToken: $formToken, questionId: $questionId) }',
				itemIndex,
				{ formToken, questionId },
			);
			return { token: formToken, questionId, deleted: data.delete_question === true };
		}

		if (operation === 'createFormTag') {
			const name = this.getNodeParameter('formTagName', itemIndex) as string;
			const data = await client.execute(
				`mutation ($formToken: String!, $tag: CreateFormTagInput!) {
					create_form_tag(formToken: $formToken, tag: $tag) { id name columnId }
				}`,
				itemIndex,
				{ formToken, tag: { name } },
			);
			return (data.create_form_tag ?? {}) as IDataObject;
		}

		// deleteFormTag
		const tagId = this.getNodeParameter('formTagId', itemIndex) as string;
		const tagOptions = this.getNodeParameter('deleteFormTagOptions', itemIndex, {}) as IDataObject;
		const data = await client.execute(
			`mutation ($formToken: String!, $tagId: String!, $options: DeleteFormTagInput) {
				delete_form_tag(formToken: $formToken, tagId: $tagId, options: $options)
			}`,
			itemIndex,
			{
				formToken,
				tagId,
				options:
					tagOptions.deleteAssociatedColumn === true ? { deleteAssociatedColumn: true } : null,
			},
		);
		return { token: formToken, tagId, deleted: data.delete_form_tag === true };
	} catch (error) {
		const friendly = describeFormError(error);
		if (friendly) {
			throw new NodeOperationError(this.getNode(), 'Form request failed', {
				itemIndex,
				description: friendly,
			});
		}
		// Anything else is already a mapped NodeApiError from the client.
		throw ensureNodeError(this.getNode(), error);
	}
}
