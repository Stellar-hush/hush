# Team Digest Generator - Specs

## Purpose

Generate daily summaries of team emails for quick review and digest.

Generate a daily team digest that summarizes email activity, pending items, completed work, and team member contributions — all within an isolated workspace, with no dependency on the main Hush Mail application.

- **Release tier:** V2 (later-release)
- **Audience:** Team
- **Folder ownership:** `tools/v2/team/team-digest-generator/`

- Release tier: V2 later-release tool
- Audience: team
- Folder ownership: `tools/v2/team/team-digest-generator/`
- Integration status: isolated mini-product workspace

## Recommended Internal Structure

- `components/` - UI components for digest configuration and preview
- `services/` - Business logic for aggregation, filtering, sanitization
- `hooks/` - React hooks for state and side effects
- `tests/` - Unit and integration tests with local fixtures
- `docs/` - Architecture, API, threat model, and performance notes
- `types/` - TypeScript type definitions

## Contributor Boundary

All work for this tool should stay in:

`tools/v2/team/team-digest-generator/`

See `ARCHITECTURE.md` for detailed module boundaries and integration constraints.

## Required Issue Categories

Contributors should expect issues in these categories:

- **Architecture** - Folder structure, module boundaries, contracts
- **Feature** - Digest generation, filtering, scheduling logic
- **UI and accessibility** - Component creation, UX, a11y
- **Security and performance** - Input validation, sanitization, optimization
- **Testing and documentation** - Test coverage, API docs, threat models

## Acceptance Criteria for Issues

Issues in this tool must meet:

1. Changes limited to `tools/v2/team/team-digest-generator/`
2. No modifications to main app shell, routing, inbox, wallet, or Stellar core
3. Clear documentation of architectural decisions
4. Tests covering new functionality
5. Reviewable as a self-contained mini-product

---

For detailed architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).
