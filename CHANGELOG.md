# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/mondaycom/n8n-nodes-monday/releases/tag/0.1.1
[0.1.0]: https://github.com/mondaycom/n8n-nodes-monday/releases/tag/0.1.0
