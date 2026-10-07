# Setup Guide

## Prerequisites

| Tool                    | Version | Purpose                           |
| ----------------------- | ------- | --------------------------------- |
| Node.js                 | 20+     | JavaScript runtime                |
| Bun                     | 1.1+    | Package manager and dev server    |
| Hush dev environment | latest  | Relay API, Stellar testnet access |

## Local Setup

```bash
cd tools/v1/team/internal-comment-thread
bun install
```

Copy and edit the environment file:

```bash
cp .env.example .env
```

## Configuration

| Variable                    | Required | Description                                                  |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `STEALTH_API_URL`           | Yes      | Hush relay API base URL (e.g., `http://localhost:8080`)   |
| `TEAM_ROSTER`               | Yes      | Comma-separated Hush addresses of authorized team members |
| `INTERNAL_COMMENT_STORAGE`  | No       | Storage backend: `memory` (default) or `file`                |
| `INTERNAL_COMMENT_DATA_DIR` | No       | Directory for file-based storage (defaults to `./data/`)     |
| `LOG_LEVEL`                 | No       | `debug`, `info`, `warn`, `error` (defaults to `info`)        |

## Running Locally

```bash
bun dev          # Development server with hot reload
bun run build    # Production build
bun run preview  # Preview production build
bun test         # Run tests
bun run lint     # Lint
```

## Troubleshooting

| Problem                                    | Likely cause                               | Fix                                                    |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------ |
| Relay connection refused                   | Hush dev server not running             | Start from repo root: `bun run dev`                    |
| No comments visible                        | Wrong team roster or no authorized members | Verify `TEAM_ROSTER` contains the current test address |
| Identity resolution fails                  | Member addresses not registered with relay | Confirm addresses in `TEAM_ROSTER`                     |
| Changes not reflected after editing `.env` | Values read at startup                     | Restart the dev server                                 |
