@AGENTS.md

# Claude Code notes - Tilari

Read [MEMORY.md](MEMORY.md) first for open defects and dated decisions.

- Kitsas behaviour: the authority is `../kitsas/kitupiikki` (read-only reference clone).
- Never point tests or the dev server at a production `.kitsas`; use `testdb/` or a copy.
- Before finishing a change, run the test sniff from AGENTS.md
  (`cd server && npm test`, `cd frontend && npm test && npx tsc -b --noEmit`).
- This repo is public: no book contents (names, amounts) in code, tests, docs or commit messages.
- Update MEMORY.md (dated entry) when a defect is found or fixed, or a decision is made.
