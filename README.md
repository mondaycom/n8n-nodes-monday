# Official monday.com node for n8n

Official monday.com community node for [n8n](https://n8n.io) — automate boards, items, webhooks, and agent triggers.

This package replaces the legacy built-in `n8n-nodes-base.mondayCom` node with a modern, full-coverage connector maintained by monday.com.

> **Status:** Pre-1.0 — actively developed. APIs and parameters may change before 1.0.

## Installation

### n8n Cloud / verified community nodes

Once verified, install from the n8n nodes panel: search for **monday.com**.

### Self-hosted n8n

1. Go to **Settings → Community Nodes**.
2. Install `@mondaycom/n8n-nodes-monday`.

Or from the command line inside your n8n user directory:

```bash
npm install @mondaycom/n8n-nodes-monday
```

## Authentication

Create a **monday.com API** credential in n8n:

1. In monday.com: **Profile → Developers → My Access Tokens**.
2. Generate a personal API token with the scopes your workflow needs.
3. In n8n: add a **monday.com API** credential and paste the token.

See [monday.com API authentication](https://developer.monday.com/api-reference/docs/authentication) for details.

## Nodes

### Monday (actions)

Resources include:

- **Item** — create, update, archive, delete, search, bulk import
- **Board** — create, update, duplicate, archive
- **Column / Board Group** — manage structure
- **Update** — post and manage item updates
- **Workspace / Folder & Object** — workspace and left-pane objects
- **Doc / Form / Article** — docs, forms, knowledge base
- **Portfolio & Project** — portfolio API
- **User / Team / Department / Directory Resource**
- **Notification / Audit Log / Meeting (Notetaker)**
- **AI & Agent Actions** — respond to custom agent interactions
- **GraphQL** — run arbitrary GraphQL queries and mutations

Resource pickers use server-side search and support ID/URL entry for large accounts.

### Monday Trigger

- Board webhooks (item created, column changed, status changed, and more)
- Multi-output routing for item vs subitem events
- **Agent Interaction** trigger for custom monday agents (chat, mention, assigned)

## Example workflow

**When an item is created → post a welcome update:**

1. Add **Monday Trigger** → Event: *Item Created* → select your board.
2. Add **Monday** → Resource: *Update* → Operation: *Create* → item ID from trigger → message body.
3. Activate the workflow and create a test item on the board.

## Development

```bash
git clone https://github.com/mondaycom/n8n-nodes-monday.git
cd n8n-nodes-monday
npm ci
npm run build
npm test
npm run lint
```

Local node loading:

```bash
npm run dev
```

## Releasing

Releases are published to npm via GitHub Actions with [provenance](https://docs.npmjs.com/generating-provenance-statements). Do not publish from your local machine.

```bash
npm run release
```

Requires npm Trusted Publisher (or `NPM_TOKEN` secret) configured for this repository. See [`.github/workflows/publish.yml`](.github/workflows/publish.yml).

## Verification

This node is designed to meet [n8n verified community node guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines):

- Zero runtime dependencies
- MIT license
- Published via GitHub Actions with provenance

## Links

- [monday.com API reference](https://developer.monday.com/api-reference)
- [n8n community node docs](https://docs.n8n.io/integrations/community-nodes/)
- [Report issues](https://github.com/mondaycom/n8n-nodes-monday/issues)

## License

[MIT](LICENSE)
