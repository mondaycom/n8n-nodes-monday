import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { MondayGraphQLClient } from './MondayGraphQLClient';

/**
 * Departments (Enterprise-only, API >= 2026-04; the node's pinned version
 * qualifies). Seat-management grouping of account users: each department has
 * members (a user belongs to AT MOST ONE department) and owners (a user can
 * own many departments, without being a member).
 *
 * Live-verified behavior (enterprise account 20692525, 2026-07-19):
 * - Free/non-Enterprise accounts get USER_UNAUTHORIZED ("User unauthorized
 *   to perform action") from every departments query/mutation — mapped to a
 *   plan/permission hint below. Writes additionally need the account-level
 *   "manage users" permission.
 * - assign_department_members SILENTLY DROPS unknown user IDs — they appear
 *   in neither successful_users nor failed_users. The node diffs the request
 *   against both lists and reports dropped IDs as failures.
 * - Assigning a user who is already in another department MOVES them there
 *   silently (one department per user — no error, no warning).
 * - assign_department_owner takes ONE user per call — multi-user assignment
 *   is one aliased request (per-alias errors, batch NOT atomic; a bogus user
 *   fails its alias with BAD_REQUEST "User not found" while others succeed).
 * - unassign_department_owners is idempotent: users who are not owners are
 *   echoed back in unassigned_users without an error.
 * - clear_users_department takes NO department ID — it clears whatever
 *   department each user is currently in. Unknown user IDs are unreliable:
 *   observed both a NOT_FOUND partial error and a silent echo in
 *   cleared_users for the same bogus ID.
 * - Unknown department IDs: delete/query fail with DEPARTMENT_NOT_FOUND;
 *   assign_department_members fails with BAD_REQUEST "Department not found".
 * - The departments(ids:) query fails ENTIRELY (departments: null) when any
 *   requested ID does not exist — it is not a partial result.
 */

/** Scalar fields every department read/write returns. */
export const DEPARTMENT_FIELDS = `
	id
	name
	assigned_seats
	reserved_seats
`;

/**
 * Field selection for Get Many — members/owners are opt-in because on a
 * large account (10k+ users) every member ships a User object.
 */
export function buildDepartmentFieldSelection(
	includeMembers: boolean,
	includeOwners: boolean,
): string {
	const fields = [DEPARTMENT_FIELDS];
	if (includeMembers) fields.push('members { id name email }');
	if (includeOwners) fields.push('owners { id name email }');
	return fields.join('\n');
}

interface DepartmentRow {
	id: string;
	name: string;
}

/**
 * loadOptions method for department pickers. Departments are a bounded
 * admin-managed collection (seat management), so a single full listing is
 * safe — same rationale as getTeamsList.
 */
export async function getDepartmentsList(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const client = new MondayGraphQLClient(this);
	const data = await client.execute('query { departments { id name } }', 0);

	return ((data.departments ?? []) as DepartmentRow[])
		.map((department) => ({ name: department.name, value: department.id }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Builds one aliased request assigning several owners to a department —
 * assign_department_owner only takes a single user per call. Exported for
 * tests.
 */
export function buildAssignOwnersMutation(userIds: string[]): string {
	const varDefs = ['$departmentId: ID!'];
	const aliases: string[] = [];
	userIds.forEach((_, index) => {
		varDefs.push(`$user${index}: ID!`);
		aliases.push(
			`owner${index}: assign_department_owner(department_id: $departmentId, user_id: $user${index}) { owner { id name } }`,
		);
	});
	return `mutation (${varDefs.join(', ')}) {\n\t${aliases.join('\n\t')}\n}`;
}

/**
 * Friendlier description for departments API failures, or null when the
 * error isn't one this module knows how to explain. NodeApiError stores the
 * raw monday error object on `errorResponse` (non-Error inputs never land on
 * `cause`) — check both to stay robust.
 */
export function describeDepartmentError(error: unknown): string | null {
	interface RawMondayError {
		message?: string;
		extensions?: { code?: string; user_id?: number | string };
		error_code?: string;
	}
	const candidate = error as { errorResponse?: RawMondayError; cause?: RawMondayError };
	const raw = candidate?.errorResponse ?? candidate?.cause;
	const code = raw?.extensions?.code ?? raw?.error_code;
	if (code === 'USER_UNAUTHORIZED') {
		return (
			'The departments API is only available on monday.com Enterprise plans, and mutations additionally require ' +
			'account-level permission to manage users. Check the plan and the permissions of the user behind the API token.'
		);
	}
	if (code === 'DEPARTMENT_NOT_FOUND') {
		return 'The department does not exist (it may have been deleted). Pick it again from the list.';
	}
	if (code === 'BAD_REQUEST' && raw?.message === 'Department not found') {
		return 'The department does not exist (it may have been deleted). Pick it again from the list.';
	}
	if (code === 'NOT_FOUND' && raw?.message === 'User not found') {
		const userId = raw?.extensions?.user_id;
		return `A user ID does not exist in the account${userId ? `: ${userId}` : ''}. Remove it from the selection and re-run.`;
	}
	return null;
}
