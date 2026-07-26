import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

import { MONDAY_API_URL, MONDAY_API_VERSION } from '../nodes/Monday/constants';

export class MondayApi implements ICredentialType {
	name = 'mondayApi';

	displayName = 'monday.com API';

	icon: Icon = {
		light: 'file:../nodes/Monday/monday.svg',
		dark: 'file:../nodes/Monday/monday.dark.svg',
	};

	documentationUrl = 'https://developer.monday.com/api-reference/docs/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Personal API token from monday.com (Profile → Developers → My Access Tokens).',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{$credentials.apiToken}}',
				// NOTE: no API-Version here — credential headers override request
				// headers, which would break the GraphQL operation's per-request
				// version override. The client sends the pinned version itself.
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: MONDAY_API_URL,
			method: 'POST',
			headers: {
				// Pinned node-wide; reviewed quarterly. See nodes/Monday/constants.ts.
				'API-Version': MONDAY_API_VERSION,
			},
			body: {
				query: '{ me { id name } }',
			},
		},
	};
}
