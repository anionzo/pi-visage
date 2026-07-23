# pi-visage — project overview

## Purpose

Personal / shareable Pi TUI skin package. Ships as a standard `pi-package` installable from local path, git, or npm.

## Components

- **Startup adapter** (`extensions/startup-ui.ts`): page discovery, selection UI (`/setStartUI`), header + working indicator application. State file: `~/.pi/agent/visage-ui.json`.
- **Default page** (`pages/visage.ts`): teal face splash, theme switch on activate.
- **Chrome** (`extensions/skin.ts`): footer, turn status, `/visage` commands. State file: `~/.pi/agent/visage.json`.
- **Themes**: `visage-dark`, `visage-light`.

## Non-goals (v0.1)

- Forking Pi core
- Full custom RPC TUI client
- Competing with a second bundled startup adapter package

## Local path

`D:/CODE/PI` ↔ `https://github.com/anionzo/pi-visage`
