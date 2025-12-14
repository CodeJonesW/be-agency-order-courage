# be-game-1 / fe-game-1

Start here: `docs/README.md` (canonical constraints)

Cursor rules live in `.cursor/rules/`.
Do not implement features that violate `docs/ethos.md` or `docs/identity_arc.md`.

## Development

### Quest Linting

Validate all quests against v1 rules:

```bash
npm run lint:quests
```

This script:
- Imports all quests from `src/infra/quests` (recursively)
- Validates each quest against v1 validation rules
- Prints a clear report of any failures
- Exits with code 1 if any failures, else exits 0

The lint script runs automatically before `npm test` via the `pretest` hook.
