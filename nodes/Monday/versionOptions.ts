import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { MondayGraphQLClient } from './MondayGraphQLClient';

interface VersionRow {
	kind: string;
	value: string;
	display_name: string;
}

/**
 * loadOptions method listing the API versions the account can use, newest
 * first, labeled with lifecycle kind (current / release candidate /
 * maintenance). The unstable "dev" version is excluded on purpose.
 */
export async function getApiVersions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const client = new MondayGraphQLClient(this);
	const data = await client.execute('query { versions { kind value display_name } }', 0);
	const versions = (data.versions ?? []) as VersionRow[];

	return versions
		.filter((version) => version.kind !== 'dev')
		// Values are yyyy-mm, so a reverse lexical sort = most recent first.
		.sort((a, b) => b.value.localeCompare(a.value))
		.map((version) => ({
			name: `${version.value} — ${version.display_name}`,
			value: version.value,
		}));
}
