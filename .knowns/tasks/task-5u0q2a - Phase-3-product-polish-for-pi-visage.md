---
id: 5u0q2a
title: Phase 3 — product polish for pi-visage
status: done
priority: medium
labels:
  - roadmap
  - phase-3
createdAt: '2026-07-23T00:51:02.162Z'
updatedAt: '2026-07-23T03:37:59.098Z'
timeSpent: 0
---
# Phase 3 — product polish for pi-visage

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog after Phase 1 (footer/density/splash) + Phase 2 (session header, compact tools, theme transcript tokens). Do these on another machine/session when ready. Repo: https://github.com/anionzo/pi-visage — local D:/CODE/PI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Second+ startup page under pages/ with unique id; discoverable via /setStartUI
- [x] #2 At least one extra theme JSON under themes/ and loadable via /visage theme or setTheme
- [x] #3 /visage doctor reports theme, page id, visage.json + visage-ui.json paths without crashing non-TUI
- [x] #4 Optional widget or context strip only if supported by current Pi extension API; otherwise note skip in notes
- [x] #5 npm test still passes; pages have no top-level imports; extensions/ only factories
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Done already (do not re-do)
- Phase 1: idle footer shortcuts, density wired, splash branch/theme/tip/cmds
- Phase 2: post-splash session header (model·thinking·cwd), density-driven compact tool render for read/bash/edit/write/grep/find/ls, transcript colors via themes (userMessageBg/Text, muted, accent). Helpers live in lib/ (NOT extensions/).
- Package install path; initial git push main fdb1b61+

## Phase 3 scope (from KNOWNS roadmap + earlier plan Tier C / leftovers)
1. Extra startup pages/presets under pages/ (e.g. minimal / dashboard) + unique id/order
2. Theme pack variant (e.g. rose/cyan accent) under themes/
3. Widget placement: plan/todo/context usage bar if Pi API allows
4. Optional splash animation (1–2 frame face blink), off by default
5. /visage doctor — check theme loaded, page id, config paths (~/.pi/agent/visage.json + visage-ui.json)
6. Startup layout modes polish in /setStartUI (full/compact/tiny preview) if adapter layout API still exposes it
7. Collapse/group Skills·Extensions block styling only if Pi API allows (no core patch)

## Constraints
- Package surface only (pi.extensions + pi.themes). No Pi core / node_modules patches.
- pages/*: // @ts-nocheck, no top-level import
- Do not put non-factory .ts under extensions/ (Pi loads every file as extension)
- PeerDeps @earendil-works/pi-* stay "*"
- No second startup-ui adapter package
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User 2026-07-23: note Phase 3 into Knowns then push git for work elsewhere. Status of Phase1+2: shipped on main.
Done 2026-07-23 on E:/CODE/pi-visage main@6e30fea: pages/visage-minimal; themes/visage-rose; /visage doctor (formatDoctorReport + non-TUI reportLines); /visage widget on|off via setWidget aboveEditor (default off); npm test 16/11→16 pass; pi -e print smoke ok.
<!-- SECTION:NOTES:END -->

