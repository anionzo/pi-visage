# pi-visage

Full UI skin for [Pi](https://pi.dev): slime-mascot startup page, session chrome, bounce working indicator, and matching themes.

A Pi package that reskins the TUI: startup page adapter, session chrome, and matching themes. The splash mascot is a block-pixel slime (teal/violet gradient); while the agent works, the indicator cycles short face frames (`[▀▀]` / `[▄▄]` / …).

## What's inside

| Piece | Type | Path |
| --- | --- | --- |
| Startup adapter | extension | `extensions/startup-ui.ts` |
| Visage splash (slime) | page | `pages/visage.ts` |
| Visage minimal splash | page | `pages/visage-minimal.ts` |
| Session chrome | extension | `extensions/skin.ts` |
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

## Commands

| Command | Action |
| --- | --- |
| `/setStartUI` | Choose startup page (`visage`, `visage-minimal`, …) |
| `/visage show` | Show saved chrome config |
| `/visage doctor` | Report theme, page id, density, and `visage.json` / `visage-ui.json` paths (safe in non-TUI) |
| `/visage footer on\|off` | Toggle custom footer (shows ↑↓ **R**/**W**/**CH** cache when provider reports it) |
| `/visage status on\|off` | Toggle status chip |
| `/visage header on\|off` | Force thin session header (model · thinking · cwd) |
| `/visage widget on\|off` | Optional context strip above the editor (`setWidget`, off by default) |
| `/visage density comfortable\|compact` | Density for footer, session header, and built-in tool chrome (persisted + applied) |
| `/visage theme dark\|light\|rose` | Switch Visage theme (applies transcript colors for user/assistant bubbles) |

### Transcript styling (user / assistant)

Pi paints **core** user and assistant messages from theme tokens only (`userMessageBg`, `userMessageText`, `text`, `muted`, `accent`). There is no extension hook to replace `role=user|assistant` renderers (`registerMessageRenderer` is customType-only). Visage therefore ships those tokens in `themes/visage-dark.json` and `themes/visage-light.json` and applies them via `/visage theme` or the startup page `onActivate`.

## Config files (runtime)

| File | Purpose |
| --- | --- |
| `~/.pi/agent/visage-ui.json` | Startup adapter state (selected page, layout, enabled) |
| `~/.pi/agent/visage.json` | Chrome preferences (footer, status, density) |

Project agent memory / tasks live under `.knowns/` (Knowns). See `KNOWNS.md`.

## Layout

```text
pi-visage/
├── package.json              # pi manifest: extensions + themes
├── extensions/
│   ├── startup-ui.ts         # discovers pages/, applies splash header + working indicator
│   └── skin.ts               # footer / session header / compact tools (extension factories only)
├── lib/
│   └── chrome-helpers.ts     # pure formatters (not an extension — do not put under extensions/)
├── pages/
│   ├── visage.ts             # default slime splash (no imports)
│   └── visage-minimal.ts     # compact one-line splash
├── themes/
│   ├── visage-dark.json
│   ├── visage-light.json
│   └── visage-rose.json
├── test/
│   └── chrome-helpers.test.mjs
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
- Pages must use `// @ts-nocheck` and **no** top-level `import` — the adapter evaluates them and injects helpers via `ui`.
- Peer packages (`@earendil-works/pi-*`) are provided by the Pi install; do not bundle them.

## License

MIT
