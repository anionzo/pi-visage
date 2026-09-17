# pi-visage

Full UI skin for [Pi](https://pi.dev): slime-mascot startup page, session chrome, status panels (git / info / session / system), bounce working indicator, and matching themes.

A Pi package that reskins the TUI: startup page adapter, session chrome, below-editor status panels, and matching themes. The splash mascot is a block-pixel slime (teal/violet gradient); while the agent works, the indicator cycles short face frames (`[▀▀]` / `[▄▄]` / …).

## What's inside

| Piece | Type | Path |
| --- | --- | --- |
| Startup adapter | extension | `extensions/startup-ui.ts` |
| Visage splash (slime) | page | `pages/visage.ts` |
| Visage minimal splash | page | `pages/visage-minimal.ts` |
| Session chrome | extension | `extensions/skin.ts` |
| Status panels | extension | `extensions/panels.ts` |
| Panel builders | lib | `lib/panels/*` |
| Dark theme | theme | `themes/visage-dark.json` |
| Light theme | theme | `themes/visage-light.json` |
| Rose theme | theme | `themes/visage-rose.json` |

## Install

### Local (dev)

```bash
pi install E:/CODE/pi-visage
# or one-shot without writing settings:
pi -e E:/CODE/pi-visage
```

### Git

```bash
pi install git:github.com/anionzo/pi-visage
```

### npm (after publish)

```bash
pi install npm:pi-visage
```

Then pick the theme in `/settings` → `visage-dark`, `visage-light`, or `visage-rose`, or:

```text
/visage theme dark
/visage theme light
/visage theme rose
```

**If you previously installed standalone `@anionzo/pi-status-panels`, uninstall it** so you do not get two below-editor widgets:

```bash
pi uninstall npm:@anionzo/pi-status-panels
# or remove the local path package from Pi settings
```

Old panel prefs under `~/.pi/agent/state/extensions/status-panels/config.json` are migrated once into `visage.json` → `panels`.

## Commands

| Command | Action |
| --- | --- |
| `/visage setup` | **Apply recommended defaults** (startup `visage`, theme dark, footer/status on, **panels on**) — no picker |
| `/setStartUI visage` | Set startup page without dialog (`visage`, `visage-minimal`, `off`, `reload`, `status`) |
| `/visage page …` | Same page ids as `/setStartUI`, writes `visage-ui.json` |
| `/visage show` | Show saved chrome config |
| `/visage doctor` | Report theme, page id, density, panels, and config paths (safe in non-TUI) |
| `/visage footer on\|off` | Toggle custom footer (shows ↑↓ **R**/**W**/**CH** cache when provider reports it) |
| `/visage status on\|off` | Toggle status chip |
| `/visage header on\|off` | Force thin session header (model · thinking · cwd) |
| `/visage widget on\|off` | Thin context strip **above** the editor (blocked while panels are on) |
| `/visage panels` / `/sp` | Status panels settings help / master toggle |
| `/sp` or `/status-panels` | Open panels settings overlay (or `on\|off`) |
| `Ctrl+Shift+P` | Same panels settings overlay |
| `/visage density comfortable\|compact` | Density for footer, session header, and built-in tool chrome |
| `/visage theme dark\|light\|rose` | Switch Visage theme (transcript colors for user/assistant bubbles) |

## Status panels (below editor)

Integrated from [pi-status-panels](https://github.com/anionzo/pi-status-panels). Four framed panels auto-layout side-by-side when width allows:

| Panel | Content |
| --- | --- |
| **GIT** | Worktree, branch, tracking, staged/unstaged, untracked/stash |
| **INFO** | Context bar, token/cost breakdown, provider · model · thinking |
| **SESSION** | Elapsed, start time, turns, avg turn, tok/s |
| **SYSTEM** | CPU, RAM, GPU/VRAM (NVIDIA via `nvidia-smi` when present) |

- Placement: `setWidget` · `belowEditor` · id `pi-visage-panels`
- Defaults: **all on** (master + each panel)
- Footer stays as the one-line chrome; panels are the multi-line dashboard
- Thin above-editor widget (`/visage widget`) is **suppressed** while panels are enabled (Info already covers context)

Open `/sp` to toggle individual panels and border/text colors.

### transcript styling (user / assistant)

Pi paints **core** user and assistant messages from theme tokens only (`userMessageBg`, `userMessageText`, `text`, `muted`, `accent`). There is no extension hook to replace `role=user|assistant` renderers (`registerMessageRenderer` is customType-only). Visage therefore ships those tokens in `themes/visage-*.json` and applies them via `/visage theme` or the startup page `onActivate`.

## Config files (runtime)

| File | Purpose |
| --- | --- |
| `~/.pi/agent/visage-ui.json` | Startup adapter state (selected page, layout, enabled) |
| `~/.pi/agent/visage.json` | Chrome prefs (`footer`, `status`, `density`, `widget`) **and** `panels` |

Example `visage.json` after setup:

```json
{
  "footer": true,
  "status": true,
  "density": "comfortable",
  "widget": false,
  "panels": {
    "enabled": true,
    "git": true,
    "info": true,
    "session": true,
    "system": true,
    "borderColor": "cyan",
    "textColor": "green"
  }
}
```

Project agent memory / tasks live under `.knowns/` (Knowns). See `KNOWNS.md`.

## Layout

```text
pi-visage/
├── package.json              # pi manifest: extensions + themes
├── extensions/
│   ├── startup-ui.ts         # discovers pages/, applies splash header + working indicator
│   ├── skin.ts               # footer / session header / compact tools
│   └── panels.ts             # status panels factory (below editor)
├── lib/
│   ├── chrome-helpers.ts     # pure chrome formatters
│   └── panels/               # pure panel builders + config (NOT under extensions/)
├── pages/
│   ├── visage.ts             # default slime splash (no imports)
│   └── visage-minimal.ts     # compact one-line splash
├── themes/
│   ├── visage-dark.json
│   ├── visage-light.json
│   └── visage-rose.json
├── test/
│   ├── chrome-helpers.test.mjs
│   └── panels.test.mjs
├── .knowns/                  # Knowns project store (tasks, memory, docs)
└── KNOWNS.md                 # agent operating guide
```

## Add your own startup page

1. Copy `pages/visage.ts` → `pages/my-skin.ts`
2. Change `id`, art, colors, `onActivate` theme name
3. Optionally add a matching file under `themes/`
4. Run `/setStartUI` and pick the new id

User-level pages can also live in `~/.pi/agent/extensions/startup-ui/*.ts` (do **not** put `index.ts` there).

## Notes

- Do **not** install another package that bundles a second full `startup-ui` adapter at the same time (duplicate registration). Prefer one adapter + multiple pages.
- Do **not** run standalone `pi-status-panels` alongside this package (duplicate below-editor widgets).
- Pages must use `// @ts-nocheck` and **no** top-level `import` — the adapter evaluates them and injects helpers via `ui`.
- Peer packages (`@earendil-works/pi-*`) are provided by the Pi install; do not bundle them.
- Helpers never go under `extensions/` — Pi loads every file there as an extension factory.

## License

MIT
