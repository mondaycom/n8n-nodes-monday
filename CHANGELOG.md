# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-07-27

### Changed

- Operations that only need a globally unique item ID no longer require a board.
  **Update → Create Update**, **Item → Get**, **Item → Get Subscribers**,
  **Update → Get Many** (item scope), and **Notification → Create** (item and
  update targets) now show an **Item Input** selector that defaults to
  **By Item ID**, which takes the item ID as a plain text field.
- Choosing **From Board** keeps the previous behaviour of picking a board and
  then selecting the item from its list. The item picker stays hidden until a
  board is selected, so it can no longer be opened in a state where it cannot
  load options.
- **Notification → Create** shows the board picker only for the board target.
- Removed the **By URL** mode from the board picker. A board URL already
  contains the board ID, so the extra parsing step only added failure modes —
  use **From List** or **By ID** instead.

## [0.1.3] - 2026-07-26

### Changed

- All authenticated monday.com API requests now send `User-Agent: n8n-monday`
  (GraphQL, file uploads, platform agent, and trigger lifecycle calls).

## [0.1.2] - 2026-07-26

### Changed

- Expanded npm README with installation steps, webhook/`WEBHOOK_URL` guidance,
  compatibility, migration from the built-in node, troubleshooting, and AI
  agent tool usage.

## [0.1.1] - 2026-07-26

Lint and UX fixes required for n8n verified community node submission. The
package now passes `@n8n/scan-community-package` with zero ESLint violations.

### Changed

- Dynamic option pickers now follow n8n's naming convention: display names end
  with "{Entity} Name or ID" / "{Entity} Names or IDs" (e.g. "Workspaces" →
  "Workspace Names or IDs", "File Column" → "File Column Name or ID").
- The advanced options collection on Update Board Subscribers is now labeled
  "Update Fields" per n8n convention.
- The Form Token input is masked in the UI (n8n requires password masking on
  token fields; the form token itself is a public URL fragment).
- Errors rethrown from catch blocks are now always wrapped as `NodeApiError` /
  `NodeOperationError` via a shared `ensureNodeError` helper, so the n8n UI
  never receives a raw error. Already-wrapped client errors pass through
  unchanged, preserving retry markers and HTTP context.
- The Monday Trigger declares `usableAsTool` (required by n8n's verification
  lint; inert for trigger nodes — n8n skips AI-tool generation for triggers).
- The trigger's dynamic outputs expression now interpolates the combined-event
  keys from `COMBINED_EVENTS` at module load instead of duplicating the list.

## [0.1.0] - 2026-07-26

### Added

- Initial public release of the official monday.com community node for n8n.
- **Monday** action node with broad API coverage: boards, items, columns, groups, workspaces, docs, forms, folders, portfolios, users, teams, notifications, audit logs, AI & agent actions, GraphQL passthrough, and more.
- **Monday Trigger** node with board webhooks, multi-output routing for item/subitem events, and custom agent interaction triggers (chat, mention, assigned).
- **monday.com API** credential type (personal API token).

[0.1.3]: https://github.com/mondaycom/n8n-nodes-monday/releases/tag/0.1.3
[0.1.2]: https://github.com/mondaycom/n8n-nodes-monday/releases/tag/0.1.2
[0.1.1]: https://github.com/mondaycom/n8n-nodes-monday/releases/tag/0.1.1
[0.1.0]: https://github.com/mondaycom/n8n-nodes-monday/releases/tag/0.1.0
