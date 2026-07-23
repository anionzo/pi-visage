# KNOWNS

Canonical repository guidance for agents working in **pi-visage**.

## Source of Truth

- `KNOWNS.md` is the canonical repo-level guidance file.
- `AGENTS.md`, `CLAUDE.md`, `OPENCODE.md`, and `.github/copilot-instructions.md` are compatibility shims.
- Precedence: system → developer → `KNOWNS.md` → shims → other docs.

## TL;DR

- This repo is a **Pi package** that reskins Pi's TUI (startup page + chrome + themes).
- Install target path in this workspace: `D:/CODE/PI` → GitHub `anionzo/pi-visage`.
- Read `README.md` for install/commands; use `.knowns/` for tasks/memory/docs.
- Do not manually edit Knowns-managed task/doc markdown.
- Prefer search-first; validate UI changes with `pi -e D:/CODE/PI`.
- Do not commit unless the user asks.

## Repo Mental Model

| Area | Role |
| --- | --- |
| `extensions/startup-ui.ts` | Discovers `pages/*`, persists selection in `~/.pi/agent/visage-ui.json`, sets header + working indicator |
| `pages/*.ts` | Pure page definitions (`export default { id, render*, workingIndicator, onActivate... }`), **no imports** |
| `extensions/skin.ts` | Footer/status/`/visage` commands; config in `~/.pi/agent/visage.json` |
| `themes/*.json` | Full Pi theme tokens (51+ colors) |
| `.knowns/` | Knowns project store (config, tasks, memory, docs) |
| Runtime config (user home) | Preference persistence outside the git repo |

## Architecture Rules

1. **Package surface only** — ship via `package.json` → `pi.extensions` + `pi.themes`. Never patch Pi core or `node_modules`.
2. **Pages stay sandboxed** — `// @ts-nocheck`, no `import`, helpers only through the `ui` bag from the adapter.
3. **Themes own color** — extensions/pages should prefer `theme.fg/bg` or page-local brand RGB that matches theme vars.
4. **TUI-only guards** — check `ctx.mode === "tui"` (and `ctx.hasUI` when available) before calling UI APIs.
5. **One startup adapter** — do not load a second package that also registers a full startup-ui adapter.
6. **Config split**:
   - Startup selection/layout → `visage-ui.json`
   - Chrome prefs → `visage.json`
   - Project agent knowledge → `.knowns/`

## Development Workflow

1. Edit theme / page / extension.
2. Smoke test: `pi -e D:/CODE/PI` (or reinstall with `pi install D:/CODE/PI`).
3. Exercise: splash render, `/setStartUI`, `/visage show`, theme switch, turn status.
4. Capture durable decisions in Knowns memory/docs when they should survive sessions.

## Critical Rules

- Never manually edit Knowns-managed task or doc markdown.
- Search first, then read only relevant files.
- Do not revert unrelated user changes.
- No commit/push unless explicitly requested.
- Keep peerDeps on `@earendil-works/pi-*` as `"*"`.
- When adding pages, give unique `id` values and optional `order`.

## Roadmap Hints (for agents)

Priority order when extending:

1. Tool compact renderers (`density: compact`) via `registerTool` overrides
2. Message/entry custom cards
3. Extra pages/presets under `pages/` + `themes/`
4. Widget placement (plan/todo/context)

## Git Safety

- Worktree may already have local edits.
- No destructive git, no amend, no push unless asked.
- `_ref/` is local reference only and is gitignored.

## References

- Pi docs (local install): themes, tui, extensions, packages
- Repo: https://github.com/anionzo/pi-visage
- Pi package layout: `extensions/` + `pages/` + `themes/` via `package.json` `pi` manifest
