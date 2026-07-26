import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { MondayGraphQLClient } from './MondayGraphQLClient';

/**
 * Account audit logs (security events: logins, exports, deletions, ...).
 *
 * API surface (verified live 2026-07-19 on API 2026-10):
 * - audit_logs(limit, page, user_id, events, ip_address, start_time,
 *   end_time) → { logs: [AuditLogEntry], pagination { has_more_pages,
 *   next_page_number } }. Newest first. Docs gate it to Enterprise admins
 *   (manage_account_security), but it answered on the free dev account with
 *   an admin token too — plan/permission failures therefore can't be
 *   assumed; the generic error mapping handles whatever comes back.
 * - The live AuditLogEntry has 9 fields the docs table omits: slug,
 *   account_id, client_name, client_version, os_name, os_version,
 *   device_name, device_type, activity_metadata (JSON).
 * - The server silently caps every request at 200 rows regardless of the
 *   limit argument, and the page offset is computed from the EFFECTIVE
 *   (capped) limit — limit: 250, page: 2 returns the same rows as
 *   limit: 200, page: 2 (verified live). fetchAuditLogs hides the cap by
 *   translating the user-facing (limit, page) window into capped server
 *   pages and slicing locally.
 * - Unknown event names return an empty list, not an error.
 * - audit_event_catalogue { name description metadata_details } lists the
 *   ~95 queryable events; bounded, so a plain dropdown is scale-safe.
 */

/** Rows per request the API actually honors (verified live 2026-07-19). */
export const AUDIT_LOGS_SERVER_PAGE_CAP = 200;

/** All fields of the live AuditLogEntry type (superset of the docs table). */
export const AUDIT_LOG_ENTRY_FIELDS = `
	timestamp
	event
	slug
	account_id
	ip_address
	user_agent
	client_name
	client_version
	os_name
	os_version
	device_name
	device_type
	activity_metadata
	user { id name email }
`;

export interface AuditLogFilterInput {
	userId?: string;
	events?: string[];
	ipAddress?: string;
	startTime?: string;
	endTime?: string;
}

/**
 * Builds the audit_logs query with only the filter arguments the user set,
 * so the API's defaults stay in effect. Exported for tests.
 */
export function buildAuditLogsQuery(filters: AuditLogFilterInput): {
	query: string;
	variables: Record<string, unknown>;
} {
	const varDefs = ['$limit: Int!', '$page: Int!'];
	const args = ['limit: $limit', 'page: $page'];
	const variables: Record<string, unknown> = {};

	if (filters.userId) {
		varDefs.push('$userId: ID');
		args.push('user_id: $userId');
		variables.userId = filters.userId;
	}
	if (filters.events && filters.events.length > 0) {
		varDefs.push('$events: [String!]');
		args.push('events: $events');
		variables.events = filters.events;
	}
	if (filters.ipAddress) {
		varDefs.push('$ipAddress: String');
		args.push('ip_address: $ipAddress');
		variables.ipAddress = filters.ipAddress;
	}
	if (filters.startTime) {
		varDefs.push('$startTime: ISO8601DateTime');
		args.push('start_time: $startTime');
		variables.startTime = filters.startTime;
	}
	if (filters.endTime) {
		varDefs.push('$endTime: ISO8601DateTime');
		args.push('end_time: $endTime');
		variables.endTime = filters.endTime;
	}

	return {
		query: `query (${varDefs.join(', ')}) {
			audit_logs(${args.join(', ')}) {
				logs { ${AUDIT_LOG_ENTRY_FIELDS} }
				pagination { has_more_pages }
			}
		}`,
		variables,
	};
}

interface AuditLogsPage {
	logs?: IDataObject[];
	pagination?: { has_more_pages?: boolean };
}

export interface AuditLogsFetchOptions {
	client: MondayGraphQLClient;
	itemIndex: number;
	filters: AuditLogFilterInput;
	/** Records per user-facing page. */
	limit: number;
	/** User-facing page number (page size = limit), starting at 1. */
	page: number;
}

/**
 * Fetches one user-facing (limit, page) window of audit logs.
 *
 * Requests at or under the 200-row server cap map directly. Larger windows
 * are assembled from cap-sized server pages: because the API offsets pages
 * by the effective limit, fixed 200-row pages tile the log stream, so the
 * requested window [ (page-1)*limit, page*limit ) is covered by consecutive
 * cap pages and sliced locally. A short server page means the log is
 * exhausted.
 */
export async function fetchAuditLogs(options: AuditLogsFetchOptions): Promise<IDataObject[]> {
	const { client, itemIndex, filters, limit, page } = options;
	const { query, variables } = buildAuditLogsQuery(filters);

	// Direct case: the server honors the limit as-is, one request suffices.
	if (limit <= AUDIT_LOGS_SERVER_PAGE_CAP) {
		const data = await client.execute(query, itemIndex, { ...variables, limit, page });
		return ((data.audit_logs as AuditLogsPage | undefined)?.logs ?? []) as IDataObject[];
	}

	const startRow = (page - 1) * limit;
	const endRow = startRow + limit;
	const firstServerPage = Math.floor(startRow / AUDIT_LOGS_SERVER_PAGE_CAP) + 1;
	const lastServerPage = Math.floor((endRow - 1) / AUDIT_LOGS_SERVER_PAGE_CAP) + 1;

	const buffer: IDataObject[] = [];
	for (let serverPage = firstServerPage; serverPage <= lastServerPage; serverPage++) {
		const data = await client.execute(query, itemIndex, {
			...variables,
			limit: AUDIT_LOGS_SERVER_PAGE_CAP,
			page: serverPage,
		});
		const rows = ((data.audit_logs as AuditLogsPage | undefined)?.logs ?? []) as IDataObject[];
		buffer.push(...rows);
		if (rows.length < AUDIT_LOGS_SERVER_PAGE_CAP) break;
	}

	const sliceStart = startRow - (firstServerPage - 1) * AUDIT_LOGS_SERVER_PAGE_CAP;
	return buffer.slice(sliceStart, sliceStart + limit);
}

interface AuditEventCatalogueEntry {
	name?: string;
	description?: string;
}

/**
 * loadOptions method for the Events filter — the audit event catalogue is a
 * bounded collection (~95 entries), so one full listing is safe.
 */
export async function getAuditEventsList(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const client = new MondayGraphQLClient(this);
	const data = await client.execute('query { audit_event_catalogue { name description } }', 0);

	return ((data.audit_event_catalogue ?? []) as AuditEventCatalogueEntry[])
		.filter((entry) => entry.name)
		.map((entry) => ({
			name: entry.name as string,
			value: entry.name as string,
			description: entry.description ?? undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
