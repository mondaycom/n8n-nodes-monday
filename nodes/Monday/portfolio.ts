import { sleep, type IDataObject } from 'n8n-workflow';

import { isRealBoard } from './boardLocator';

/**
 * Portfolio & Project support (Enterprise-plan API surface).
 *
 * create_portfolio and create_project are ASYNCHRONOUS: the mutation returns
 * { success, process_id } and the actual board(s) appear a few seconds later
 * (~10s observed live 2026-07-17). The created board ID is only pushed to an
 * optional callback_url — which an n8n action node cannot receive — so the
 * node resolves it by polling the newest boards for a new board matching the
 * requested name. To be clock-skew-proof, boards that existed BEFORE the
 * mutation are excluded by ID (snapshot), not by created_at comparison.
 *
 * Polling interval: 5 seconds (BOARD_POLL_INTERVAL_MS).
 * Default wait timeout: 60 seconds (DEFAULT_CREATE_WAIT_TIMEOUT_SECONDS).
 * This timeout is configurable via the "Wait Timeout (Seconds)" option (min: 10, max: 600).
 * If the board(s) do not appear within the timeout, the node throws an error,
 * but the creation request continues asynchronously on monday.com.
 *
 * create_project creates TWO boards with the same name (verified live):
 * the multi-level task board (item_terminology "task") — the one
 * connect_project_to_portfolio accepts — plus a classic companion "project
 * overview" board (item_terminology "project") that arrives a few seconds
 * later. Deleting the task board cascades to the companion.
 */

/** How many newest boards each snapshot/poll request scans. */
const BOARD_POLL_WINDOW = 50;

/** Delay between poll requests. */
export const BOARD_POLL_INTERVAL_MS = 5000;

/**
 * After the project's task board appears, how long to keep polling for the
 * classic companion overview board (observed ~8s behind the task board).
 */
export const PROJECT_COMPANION_GRACE_MS = 15000;

/** Default and bounds for the user-facing wait timeout (seconds). */
export const DEFAULT_CREATE_WAIT_TIMEOUT_SECONDS = 60;

export interface CreatedBoardRow {
	id: string;
	name: string;
	url?: string;
	type?: string;
	created_at?: string;
	hierarchy_type?: string | null;
	item_terminology?: string | null;
}

/** The slice of MondayGraphQLClient the pollers need (kept narrow for tests). */
export interface PollExecutor {
	execute(
		query: string,
		itemIndex: number,
		variables?: Record<string, unknown>,
	): Promise<IDataObject>;
}

const BOARD_POLL_FIELDS = 'id name url type created_at hierarchy_type item_terminology';

async function fetchNewestBoards(
	client: PollExecutor,
	itemIndex: number,
	workspaceId?: string,
): Promise<CreatedBoardRow[]> {
	const query = workspaceId
		? `query ($limit: Int!, $workspaceIds: [ID!]) {
				boards(limit: $limit, order_by: created_at, state: active, workspace_ids: $workspaceIds) { ${BOARD_POLL_FIELDS} }
			}`
		: `query ($limit: Int!) {
				boards(limit: $limit, order_by: created_at, state: active) { ${BOARD_POLL_FIELDS} }
			}`;
	const variables: Record<string, unknown> = { limit: BOARD_POLL_WINDOW };
	if (workspaceId) variables.workspaceIds = [workspaceId];

	const data = await client.execute(query, itemIndex, variables);
	return ((data.boards ?? []) as CreatedBoardRow[]).filter(isRealBoard);
}

/**
 * IDs of the newest boards BEFORE the create mutation runs. Anything in this
 * set is not the board we are waiting for, even if the name matches.
 */
export async function snapshotRecentBoardIds(
	client: PollExecutor,
	itemIndex: number,
	workspaceId?: string,
): Promise<Set<string>> {
	const boards = await fetchNewestBoards(client, itemIndex, workspaceId);
	return new Set(boards.map((board) => board.id));
}

interface WaitOptions {
	name: string;
	workspaceId?: string;
	excludeIds: Set<string>;
	timeoutMs: number;
	intervalMs?: number;
	sleepFn?: (ms: number) => Promise<void>;
}

async function pollMatches(
	client: PollExecutor,
	itemIndex: number,
	options: WaitOptions,
): Promise<CreatedBoardRow[]> {
	const boards = await fetchNewestBoards(client, itemIndex, options.workspaceId);
	return boards.filter((board) => board.name === options.name && !options.excludeIds.has(board.id));
}

/**
 * Waits for the portfolio board created by create_portfolio to become
 * queryable. Returns null when the timeout expires without a match.
 */
export async function waitForCreatedBoard(
	client: PollExecutor,
	itemIndex: number,
	options: WaitOptions,
): Promise<CreatedBoardRow | null> {
	const intervalMs = options.intervalMs ?? BOARD_POLL_INTERVAL_MS;
	const sleepFn = options.sleepFn ?? sleep;
	const deadline = Date.now() + options.timeoutMs;

	for (;;) {
		const matches = await pollMatches(client, itemIndex, options);
		if (matches.length > 0) return matches[0];
		if (Date.now() >= deadline) return null;
		await sleepFn(intervalMs);
	}
}

export interface ProjectBoards {
	/** The multi-level task board — the ID connect_project_to_portfolio accepts. */
	projectBoard?: CreatedBoardRow;
	/** The classic companion "project overview" board (same name). */
	overviewBoard?: CreatedBoardRow;
}

/**
 * Splits the new boards matching the project name into the task board and
 * the companion overview board. The task board is identified by
 * hierarchy_type multi_level (fallbacks: item_terminology "task", then the
 * newest match — templates could conceivably change the created structure).
 */
export function splitProjectBoards(rows: CreatedBoardRow[]): ProjectBoards {
	const multiLevel = rows.find((row) => row.hierarchy_type === 'multi_level');
	const projectBoard =
		multiLevel ?? rows.find((row) => row.item_terminology === 'task') ?? rows[0];
	if (!projectBoard) return {};
	return {
		projectBoard,
		overviewBoard: rows.find(
			(row) => row.id !== projectBoard.id && row.hierarchy_type !== 'multi_level',
		),
	};
}

/**
 * Waits for the boards created by create_project. Returns as soon as the
 * multi-level task board is visible AND the companion overview board has
 * either appeared or stayed missing for PROJECT_COMPANION_GRACE_MS (it
 * arrives a few seconds after the task board). On timeout, returns whatever
 * matched so far — projectBoard is undefined when nothing appeared.
 */
export async function waitForProjectBoards(
	client: PollExecutor,
	itemIndex: number,
	options: WaitOptions & { companionGraceMs?: number },
): Promise<ProjectBoards> {
	const intervalMs = options.intervalMs ?? BOARD_POLL_INTERVAL_MS;
	const graceMs = options.companionGraceMs ?? PROJECT_COMPANION_GRACE_MS;
	const sleepFn = options.sleepFn ?? sleep;
	const deadline = Date.now() + options.timeoutMs;
	let taskBoardFoundAt: number | null = null;

	for (;;) {
		const matches = await pollMatches(client, itemIndex, options);
		const boards = splitProjectBoards(matches);
		const now = Date.now();

		if (boards.projectBoard?.hierarchy_type === 'multi_level') {
			taskBoardFoundAt ??= now;
			if (boards.overviewBoard || now - taskBoardFoundAt >= graceMs) return boards;
		}
		if (now >= deadline) return boards;
		await sleepFn(intervalMs);
	}
}
