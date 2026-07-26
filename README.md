<p align="center">
  <img src="https://raw.githubusercontent.com/mondaycom/n8n-nodes-monday/main/nodes/Monday/monday.svg" alt="monday.com" width="120">
</p>

# Official monday.com node for n8n

Official monday.com community node for [n8n](https://n8n.io) — automate boards, items, updates, webhooks, and custom agent interactions.

This package replaces the legacy built-in `n8n-nodes-base.mondayCom` node with a modern, full-coverage connector maintained by monday.com.

> **Status:** Pre-1.0 — actively developed. APIs and parameters may change before 1.0.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Table of contents

- [Installation](#installation)
- [Authentication](#authentication)
- [Nodes](#nodes)
- [Example workflow](#example-workflow)
- [Triggers and webhooks](#triggers-and-webhooks)
- [AI Agent tool usage](#ai-agent-tool-usage)
- [Compatibility](#compatibility)
- [Migration from the built-in monday node](#migration-from-the-built-in-monday-node)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Links](#links)
- [License](#license)

## Installation

### n8n Cloud

Once the node is verified, install it from the node panel:

1. Open the **workflow canvas** and open the **nodes panel**.
2. Search for **monday.com**.
3. Click **Install node**.

> Instance owners can disable verified community nodes in the Cloud Admin Panel. Ensure verified community nodes are enabled if you do not see monday.com in search.

### Self-hosted n8n

1. Open your n8n instance.
2. Go to **Settings → Community Nodes**.
3. Click **Install**.
4. Enter the package name: `@mondaycom/n8n-nodes-monday`
5. Review the [risks of using community nodes](https://docs.n8n.io/integrations/community-nodes/risks/) and click **Install**.

Or from the command line in your n8n user directory:

```bash
npm install @mondaycom/n8n-nodes-monday
```

## Authentication

This package uses a **personal API token** (not OAuth). Create a **monday.com API** credential in n8n:

1. In monday.com, open **Profile → Developers → My Access Tokens**.
2. Generate a token with the scopes your workflow needs.
3. In n8n, add a **monday.com API** credential and paste the token.

See [monday.com API authentication](https://developer.monday.com/api-reference/docs/authentication) for token types, scopes, and OAuth app details if you build a custom integration outside this credential type.

## Nodes

### Monday (actions)

Automate monday.com from any workflow step.

| Resource | Examples |
|---|---|
| **Item** | Create, update, archive, delete, search, bulk import |
| **Board** | Create, update, duplicate, archive |
| **Column / Board Group** | Manage board structure |
| **Update** | Post and manage item updates |
| **Workspace / Folder & Object** | Workspace and left-pane objects |
| **Doc / Form / Article** | Docs, forms, knowledge base |
| **Portfolio & Project** | Portfolio API |
| **User / Team / Department / Directory Resource** | People and org data |
| **Notification / Audit Log / Meeting (Notetaker)** | Notifications, audit, meetings |
| **AI & Agent Actions** | Respond to custom agent interactions |
| **GraphQL** | Run arbitrary GraphQL queries and mutations |

Resource pickers use server-side search and support ID/URL entry for large accounts.

### Monday Trigger

Start workflows from monday.com events:

- Board webhooks — item created, column changed, status changed, and more
- Multi-output routing for item vs subitem events
- **Agent Interaction** — chat, mention, and assigned triggers for custom monday agents

## Example workflow

**When an item is created → post a welcome update**

1. Add **Monday Trigger** → Event: *Item Created* → select your board.
2. Add **Monday** → Resource: *Update* → Operation: *Create* → use the item ID from the trigger → enter your message.
3. Activate the workflow and create a test item on the board.

## Triggers and webhooks

monday.com sends webhook events to a **public URL** that n8n exposes. This matters for self-hosted instances.

### Self-hosted: set a public webhook URL

By default, n8n may register webhooks using `localhost`, which monday.com cannot reach.

1. Expose your n8n instance with a public URL (reverse proxy, cloud host, or tunnel).
2. Set the `WEBHOOK_URL` environment variable to that public base URL, for example:

   ```bash
   export WEBHOOK_URL="https://your-n8n.example.com/"
   ```

3. Restart n8n.
4. Deactivate and reactivate the workflow so the trigger re-registers the webhook.

### Agent Interaction trigger

Custom agent triggers (chat, mention, assigned) require a reachable **HTTPS** webhook URL. monday.com rejects callback URLs that use `localhost` or plain `http`. Set `WEBHOOK_URL` as above, then connect your agent in monday.com to the webhook URL shown on the trigger node. See the [monday developer portal](https://developer.monday.com) for agent setup.

## AI Agent tool usage

The **Monday** action node can be used as a tool by n8n AI Agents (for example, to create items or post updates from an agent workflow).

On self-hosted instances, community nodes are not available as AI tools by default. Enable them with:

```bash
export N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

Restart n8n after changing this variable. The **Monday Trigger** is a webhook trigger and is not used as an AI tool.

## Compatibility

- **n8n:** 1.0.0+ (test before production upgrades)
- **Node.js:** follow your n8n instance requirements (18+ for most self-hosted releases)
- **Runtime dependencies:** none (verified community node requirement)
- **Package build:** Node.js 20.15+ if compiling from source

## Migration from the built-in monday node

The legacy node is `n8n-nodes-base.mondayCom` (built into n8n). This package is `@mondaycom/n8n-nodes-monday` (community node).

| | Built-in `mondayCom` | This package |
|---|---|---|
| Install | Included with n8n | Community Nodes → `@mondaycom/n8n-nodes-monday` |
| Coverage | Limited / outdated | Full monday API coverage |
| Triggers | Limited | Webhooks + Agent Interaction |
| Maintained by | n8n built-in set | monday.com |

Existing workflows using the built-in node are not auto-migrated. Create new workflows with **Monday** and **Monday Trigger**, then retire old ones when ready.

## Troubleshooting

### Authentication errors

- Confirm the API token is valid and not expired.
- Verify the token has scopes for the operation (boards, items, webhooks, etc.).
- Re-create the credential in n8n after rotating tokens in monday.com.

### Trigger not firing

- Confirm the workflow is **active**.
- Check that `WEBHOOK_URL` points to a URL monday.com can reach (not `localhost`).
- Deactivate and reactivate the workflow after changing `WEBHOOK_URL`.
- In monday.com, verify the webhook was created on the board (Developer → Webhooks).

### Agent Interaction not responding

- Confirm `WEBHOOK_URL` is a public **HTTPS** URL.
- For chat triggers, ensure the workflow includes a response path (for example **Respond to Agent Chat**).
- Verify the agent is linked to the webhook URL shown on the trigger node.

### Resource picker empty or slow

- Use search or paste a board/item ID or URL directly — pickers do not load entire accounts.
- Confirm the credential has access to the workspace that owns the resource.

### Getting help

- [GitHub Issues](https://github.com/mondaycom/n8n-nodes-monday/issues)
- [monday.com API reference](https://developer.monday.com/api-reference)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## Development

```bash
git clone https://github.com/mondaycom/n8n-nodes-monday.git
cd n8n-nodes-monday
npm ci
npm run build
npm test
npm run lint
npm run dev   # local n8n with hot reload
```

Releases are published to npm via GitHub Actions with [provenance](https://docs.npmjs.com/generating-provenance-statements). Do not publish from a local machine.

This node is designed to meet [n8n verified community node guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines) and passes `@n8n/scan-community-package`.

## Links

- [monday.com API reference](https://developer.monday.com/api-reference)
- [monday.com developer portal](https://developer.monday.com)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)
- [n8n verified node guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)
- [Report issues](https://github.com/mondaycom/n8n-nodes-monday/issues)

## License

[MIT](LICENSE)
