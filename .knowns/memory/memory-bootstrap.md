---
id: bootstrap
title: pi-visage bootstrap decisions
layer: project
category: decision
---

# Bootstrap decisions

- Repo name: `pi-visage` (anionzo/pi-visage).
- Workspace path: `D:/CODE/PI`.
- Packaging model: `extensions/` + `pages/` + `themes/` under one `pi` manifest.
- Startup adapter config: `~/.pi/agent/visage-ui.json` (package-specific, not shared with other skins).
- Chrome prefs live in `~/.pi/agent/visage.json`.
- Knowns initialized manually because `kn.exe` is blocked by Device Guard on this machine; structure matches other projects (e.g. Bot_Tele_BanHang).
- Default page id: `visage`; default theme while active: `visage-dark`.
