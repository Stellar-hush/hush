# Contact Extractor Setup

## Prerequisites

- Node.js 18+ or Bun 1.x
- Access to the Hush repository
- Familiarity with the folder ownership boundary in `specs.md`

## Local Setup

```bash
# Clone the repository (if you haven't already)
# git clone <repository-url>
# cd stealth

# Navigate to the tool workspace
cd tools/v1/individual/contact-extractor/

# Install project-level dependencies from the repository root
# cd ../../
# bun install
# cd tools/v1/individual/contact-extractor/
```

## Suggested Folder Structure

When implementation begins, the tool should follow this structure:

```
tools/v1/individual/contact-extractor/
├── README.md              # Tool overview and contributor guide
├── specs.md               # Specifications and scope
├── docs/
│   ├── setup.md           # Setup instructions (this file)
│   ├── usage.md           # Usage documentation
│   ├── fixtures.md        # Fixture documentation
│   ├── known-limitations.md
│   └── review-notes.md    # OSS review notes
├── tests/
│   └── README.md          # Test plan
├── fixtures/              # Test fixtures (sample messages, expected output)
├── components/            # UI components (future)
├── services/              # Extraction logic (future)
└── hooks/                 # State management (future)
```

## Documentation Review Workflow

1. Make changes inside `tools/v1/individual/contact-extractor/` only
2. Run `bun x prettier --check .` to verify formatting
3. Verify all test data is fake and deterministic
4. Ensure no real user data, secrets, or private keys are present
5. Submit changes for independent review

## Troubleshooting

| Problem                      | Likely Cause            | Solution                                                       |
| ---------------------------- | ----------------------- | -------------------------------------------------------------- |
| Prettier fails               | Unformatted Markdown    | Run `bun x prettier --write .`                                 |
| File outside boundary        | Wrong working directory | Verify you are inside `tools/v1/individual/contact-extractor/` |
| Test data contains real info | Copied from production  | Replace with fake, deterministic data                          |

## Validation Commands

```bash
# Format check
bun x prettier --check tools/v1/individual/contact-extractor/

# Format and fix
bun x prettier --write tools/v1/individual/contact-extractor/
```
