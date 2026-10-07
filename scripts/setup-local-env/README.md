# One‑Command Local Stellar & Relay Environment

This directory contains scripts to **set up** and **tear down** a complete local development environment for the Hush project.

- `setup.ps1` / `setup.sh` – install dependencies, build contracts, start Docker services, fund accounts, deploy contracts, generate `client-config.json`.
- `teardown.ps1` / `teardown.sh` – stop Docker containers and clean generated artifacts.

Run the appropriate script for your OS:

```sh
# macOS / Linux
npm run local:setup:unix

# Windows PowerShell
npm run local:setup
```

After a successful run you will see a **"Environment ready"** banner and a `client-config.json` file in the project root, which the UI can use to send messages.

Use the matching teardown command when you are done.

```sh
npm run local:teardown   # Windows
npm run local:teardown:unix   # macOS / Linux
```
