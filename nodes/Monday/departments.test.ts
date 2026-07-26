/* Unit tests — never shipped in dist/, so cloud-compatibility import rules don't apply. */
/* eslint-disable @n8n/community-nodes/no-restricted-imports, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
	buildAssignOwnersMutation,
	buildDepartmentFieldSelection,
	describeDepartmentError,
	getDepartmentsList,
} from './departments';

describe('departments', () => {
	describe('buildDepartmentFieldSelection', () => {
		it('returns only scalar fields by default', () => {
			const selection = buildDepartmentFieldSelection(false, false);
			expect(selection).toContain('assigned_seats');
			expect(selection).toContain('reserved_seats');
			expect(selection).not.toContain('members');
			expect(selection).not.toContain('owners');
		});

		it('adds members and owners behind their toggles', () => {
			expect(buildDepartmentFieldSelection(true, false)).toContain('members { id name email }');
			expect(buildDepartmentFieldSelection(true, false)).not.toContain('owners {');
			expect(buildDepartmentFieldSelection(false, true)).toContain('owners { id name email }');
			const both = buildDepartmentFieldSelection(true, true);
			expect(both).toContain('members {');
			expect(both).toContain('owners {');
		});
	});

	describe('buildAssignOwnersMutation', () => {
		it('builds one alias per user — assign_department_owner is single-user', () => {
			const query = buildAssignOwnersMutation(['11', '22']);
			expect(query).toContain('$departmentId: ID!');
			expect(query).toContain('$user0: ID!');
			expect(query).toContain('$user1: ID!');
			expect(query).toContain(
				'owner0: assign_department_owner(department_id: $departmentId, user_id: $user0)',
			);
			expect(query).toContain(
				'owner1: assign_department_owner(department_id: $departmentId, user_id: $user1)',
			);
		});

		it('handles a single user', () => {
			const query = buildAssignOwnersMutation(['11']);
			expect(query).toContain('owner0:');
			expect(query).not.toContain('owner1:');
		});
	});

	describe('getDepartmentsList', () => {
		it('returns name-sorted options from the departments query', async () => {
			const httpMock = vi.fn().mockResolvedValueOnce({
				data: {
					departments: [
						{ id: '2', name: 'Sales' },
						{ id: '1', name: 'Engineering' },
					],
				},
			});
			const context: any = {
				getNode: vi.fn(() => ({ name: 'test-node' })),
				helpers: { httpRequestWithAuthentication: httpMock },
			};

			const options = await getDepartmentsList.call(context);
			expect(options).toEqual([
				{ name: 'Engineering', value: '1' },
				{ name: 'Sales', value: '2' },
			]);
		});
	});

	describe('describeDepartmentError', () => {
		// NodeApiError stores the raw monday error object on errorResponse
		// (non-Error inputs never land on cause).
		const errorWith = (raw: any) => ({ errorResponse: raw });

		it('explains USER_UNAUTHORIZED as plan/permission gating', () => {
			const message = describeDepartmentError(
				errorWith({ extensions: { code: 'USER_UNAUTHORIZED' } }),
			);
			expect(message).toContain('Enterprise');
			expect(message).toContain('manage users');
		});

		it('explains DEPARTMENT_NOT_FOUND', () => {
			expect(
				describeDepartmentError(errorWith({ extensions: { code: 'DEPARTMENT_NOT_FOUND' } })),
			).toContain('does not exist');
		});

		it('explains the BAD_REQUEST department-not-found variant from assign mutations', () => {
			expect(
				describeDepartmentError(
					errorWith({ message: 'Department not found', extensions: { code: 'BAD_REQUEST' } }),
				),
			).toContain('does not exist');
			// Other BAD_REQUESTs (e.g. "User not found" on an owner alias) are not this case.
			expect(
				describeDepartmentError(
					errorWith({ message: 'User not found', extensions: { code: 'BAD_REQUEST' } }),
				),
			).toBeNull();
		});

		it('names the offending user on clear_users_department NOT_FOUND', () => {
			const message = describeDepartmentError(
				errorWith({
					message: 'User not found',
					extensions: { code: 'NOT_FOUND', user_id: 999999999 },
				}),
			);
			expect(message).toContain('999999999');
		});

		it('falls back to cause for wrapped Error-shaped inputs', () => {
			expect(
				describeDepartmentError({ cause: { extensions: { code: 'DEPARTMENT_NOT_FOUND' } } }),
			).toContain('does not exist');
		});

		it('returns null for unrelated errors', () => {
			expect(
				describeDepartmentError(errorWith({ extensions: { code: 'ComplexityException' } })),
			).toBeNull();
			expect(describeDepartmentError(new Error('boom'))).toBeNull();
			expect(describeDepartmentError(undefined)).toBeNull();
		});
	});
});
