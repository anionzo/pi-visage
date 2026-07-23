/**
 * Visage chrome — footer, status, session header, compact tools.
 *
 * Footer (Phase 1):
 *   left:  usage ↑↓ R W CH $ ctx  (matches stock Pi cache fields) OR idle shortcuts
 *   right: provider/model · thinking · branch
 *
 * Session header (Phase 2):
 *   after first turn — thin bar: model · thinking · cwd
 *
 * Tools (Phase 2):
 *   render-only overrides for read/bash/edit/write/grep/find/ls
 *   density=compact → shorter Visage call/result lines
 *
 * Messages / transcript (Phase 2 — honest path):
 *   Pi paints core user/assistant bubbles from theme tokens only
 *   (userMessageBg, userMessageText, text, muted, accent).
 *   registerMessageRenderer is customType-only and cannot restyle role=user|assistant,
 *   so Visage does NOT register dead customTypes for that. Ship themes under themes/
 *   and apply them via /visage theme or page onActivate.
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  type Density,
  type DoctorSnapshot,
  type UsageTotals,
  addUsageToTotals,
  buildHeaderSegments,
  cacheHitRate,
  countLines,
  emptyUsageTotals,
  formatDoctorReport,
  formatToolCallLine,
  formatToolResultLine,
  formatUsageSegments,
  resolveVisageThemeId,
  summarizeToolArgs,
  truncate as truncStr,
} from "../lib/chrome-helpers.ts";

const STATUS_KEY = "pi-visage";
const WIDGET_KEY = "pi-visage-ctx";
const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "visage.json");
const UI_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "visage-ui.json");

type VisageConfig = {
  footer: boolean;
  status: boolean;
  density: Density;
  /** Context strip above editor via setWidget (Phase 3). */
  widget: boolean;
};

const DEFAULT_CONFIG: VisageConfig = {
  footer: true,
  status: true,
  density: "comfortable",
  widget: false,
};

/** Canonical thinking levels from Pi. */
const THINKING_LEVELS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

/** Common short forms Pi / users may produce → full level name. */
const THINKING_ALIASES: Record<string, string> = {
  hi: "high",
  high: "high",
  med: "medium",
  mid: "medium",
  medium: "medium",
  min: "minimal",
  minimal: "minimal",
  lo: "low",
  low: "low",
  xhi: "xhigh",
  xhigh: "xhigh",
  max: "max",
  off: "off",
  none: "off",
};

const IDLE_SHORTCUTS_FULL = ["/model", "/visage", "/setStartUI"];
const IDLE_SHORTCUTS_COMPACT = ["/visage", "/model"];

const BUILTIN_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;

type BuiltinName = (typeof BUILTIN_TOOLS)[number];

function loadConfig(): VisageConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<VisageConfig>;
    return {
      footer: raw.footer ?? DEFAULT_CONFIG.footer,
      status: raw.status ?? DEFAULT_CONFIG.status,
      density: raw.density === "compact" ? "compact" : "comfortable",
      widget: typeof raw.widget === "boolean" ? raw.widget : DEFAULT_CONFIG.widget,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

type UiAdapterState = {
  selectedId: string | null;
  enabled: boolean | null;
  layout: string | null;
};

function loadUiAdapterState(): UiAdapterState {
  try {
    if (!fs.existsSync(UI_CONFIG_PATH)) {
      return { selectedId: null, enabled: null, layout: null };
    }
    const raw = JSON.parse(fs.readFileSync(UI_CONFIG_PATH, "utf8")) as Record<string, unknown>;
    return {
      selectedId: typeof raw.selectedId === "string" ? raw.selectedId : null,
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : null,
      layout: typeof raw.layout === "string" ? raw.layout : null,
    };
  } catch {
    return { selectedId: null, enabled: null, layout: null };
  }
}

function readThemeName(ctx: any): string | null {
  try {
    const t = ctx?.ui?.theme;
    if (t && typeof t.name === "string" && t.name) return t.name;
    if (typeof ctx?.ui?.getThemeName === "function") {
      const n = ctx.ui.getThemeName();
      if (typeof n === "string" && n) return n;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Deliver doctor/show text without crashing when UI notify is unavailable. */
function reportLines(ctx: any, lines: string[], type: "info" | "warning" | "error" = "info"): void {
  const msg = lines.join("\n");
  try {
    if (ctx?.ui && typeof ctx.ui.notify === "function") {
      ctx.ui.notify(msg, type);
      return;
    }
  } catch {
    // fall through
  }
  try {
    console.log(msg);
  } catch {
    // swallow — doctor must not throw in non-TUI
  }
}

function buildDoctorSnapshot(ctx: any, config: VisageConfig): DoctorSnapshot {
  const uiState = loadUiAdapterState();
  return {
    mode: typeof ctx?.mode === "string" ? ctx.mode : "unknown",
    themeName: readThemeName(ctx),
    pageId: uiState.selectedId,
    pageEnabled: uiState.enabled,
    layout: uiState.layout,
    chromePath: CONFIG_PATH,
    uiPath: UI_CONFIG_PATH,
    chromeExists: fs.existsSync(CONFIG_PATH),
    uiExists: fs.existsSync(UI_CONFIG_PATH),
    density: config.density,
    footer: config.footer,
    status: config.status,
    widget: config.widget,
  };
}

function saveConfig(config: VisageConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** Recommended startup-page defaults written to visage-ui.json (no picker). */
const DEFAULT_UI_STATE = {
  selectedId: "visage",
  enabled: true,
  layout: "auto" as const,
};

function saveUiAdapterState(state: {
  selectedId: string;
  enabled: boolean;
  layout: "auto" | "full" | "compact";
}): void {
  fs.mkdirSync(path.dirname(UI_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(UI_CONFIG_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * One-shot recommended setup — no interactive /setStartUI picker.
 * Writes chrome + startup defaults and applies what the current session can.
 */
function applyRecommendedSetup(
  pi: ExtensionAPI,
  ctx: any,
  config: VisageConfig,
): { config: VisageConfig; lines: string[] } {
  const next: VisageConfig = {
    footer: true,
    status: true,
    density: "comfortable",
    widget: false,
  };
  saveConfig(next);
  saveUiAdapterState({ ...DEFAULT_UI_STATE });

  const themeName = "visage-dark";
  let themeNote = `theme → ${themeName}`;
  if (ctx?.mode === "tui" && ctx?.hasUI && typeof ctx.ui?.setTheme === "function") {
    try {
      const result = ctx.ui.setTheme(themeName);
      if (result && !result.success) {
        themeNote = `theme → ${themeName} (failed: ${result.error ?? "unknown"})`;
      } else {
        themeNote = `theme → ${themeName} (applied)`;
      }
    } catch (err) {
      themeNote = `theme → ${themeName} (error: ${err instanceof Error ? err.message : String(err)})`;
    }
  } else {
    themeNote = `theme → ${themeName} (saved in settings separately; non-TUI skip apply)`;
  }

  if (ctx?.mode === "tui") {
    applyFooter(pi, ctx, next.footer, next.density);
    setIdleStatus(ctx, next.status, next.density);
    applyContextWidget(pi, ctx, next.widget, next.density);
  }

  void config;
  return {
    config: next,
    lines: [
      "pi-visage setup — defaults applied (no picker)",
      "  startup page: visage (enabled, layout auto)",
      `  ${themeNote}`,
      "  footer: on · status: on · widget: off · density: comfortable",
      `  chrome: ${CONFIG_PATH}`,
      `  ui:     ${UI_CONFIG_PATH}`,
      "  tip: restart Pi or /setStartUI visage to refresh splash if needed",
    ],
  };
}

function formatThinking(level: unknown): string {
  if (typeof level !== "string" || !level) return "off";
  const normalized = level.toLowerCase().trim();
  if (THINKING_ALIASES[normalized]) return THINKING_ALIASES[normalized];
  if (THINKING_LEVELS.has(normalized)) return normalized;
  return normalized;
}

/** Theme token for thinking level color, falls back to muted. Level name only (no "think" prefix). */
function paintThinking(theme: any, level: unknown): string {
  const name = formatThinking(level);
  const tokenByLevel: Record<string, string> = {
    off: "thinkingOff",
    minimal: "thinkingMinimal",
    low: "thinkingLow",
    medium: "thinkingMedium",
    high: "thinkingHigh",
    xhigh: "thinkingXhigh",
    max: "thinkingMax",
  };
  const token = tokenByLevel[name];
  try {
    if (token && typeof theme.fg === "function") {
      const painted = theme.fg(token, name);
      if (typeof painted === "string" && painted.length > 0) return painted;
    }
  } catch {
    // ignore
  }
  return theme.fg("muted", name);
}

function getProviderModel(ctx: any, compact = false): string {
  const provider = ctx?.model?.provider?.trim?.() || "";
  const id = ctx?.model?.id?.trim?.() || "";
  if (compact && id) return id;
  if (provider && id) return `${provider}/${id}`;
  if (id) return id;
  if (provider) return provider;
  return "no-model";
}

function shortenCwd(cwd: string, max = 40): string {
  if (!cwd) return ".";
  const home = os.homedir();
  let result = cwd;
  const startsWithHome =
    process.platform === "win32"
      ? cwd.toLowerCase().startsWith(home.toLowerCase())
      : cwd.startsWith(home);
  if (startsWithHome) {
    result = `~${cwd.slice(home.length)}`;
  }
  result = result.replace(/\\/g, "/");
  if (result.length <= max) return result;
  const parts = result.split("/").filter(Boolean);
  if (parts.length <= 2) return `…${result.slice(-(max - 1))}`;
  return `…/${parts.slice(-2).join("/")}`;
}

/**
 * Cumulative usage for Visage footer — mirrors stock Pi FooterComponent:
 * assistant + toolResult usage, plus branch_summary/compaction if present.
 * Tracks cacheRead / cacheWrite and latest turn CH%.
 */
function getUsageTotals(ctx: any): UsageTotals {
  const totals = emptyUsageTotals();

  try {
    // Prefer full session entries (matches Pi); fall back to branch walk.
    const entries =
      typeof ctx.sessionManager.getEntries === "function"
        ? ctx.sessionManager.getEntries()
        : ctx.sessionManager.getBranch?.() ?? [];

    for (const e of entries) {
      if (e?.type === "message" && e.message?.role === "assistant") {
        const m = e.message as AssistantMessage;
        addUsageToTotals(totals, m.usage as any);
        const rate = cacheHitRate(m.usage as any);
        if (rate != null) totals.latestCacheHitRate = rate;
      } else if (e?.type === "message" && e.message?.role === "toolResult" && e.message?.usage) {
        addUsageToTotals(totals, e.message.usage);
      } else if (
        (e?.type === "branch_summary" || e?.type === "compaction") &&
        e.usage
      ) {
        addUsageToTotals(totals, e.usage);
      }
    }
  } catch {
    // ignore
  }

  return totals;
}

function getContextLabel(ctx: any): string | null {
  try {
    const usage = ctx?.getContextUsage?.();
    const percent = usage?.percent;
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent <= 0) {
      return null;
    }
    const pct = percent < 10 ? percent.toFixed(1) : `${Math.round(percent)}`;
    return `ctx ${pct}%`;
  } catch {
    return null;
  }
}

function joinSegments(parts: string[], sep: string): string {
  return parts.filter(Boolean).join(sep);
}

function isIdleUsage(totals: UsageTotals): boolean {
  return (
    totals.input <= 0 &&
    totals.output <= 0 &&
    totals.cacheRead <= 0 &&
    totals.cacheWrite <= 0 &&
    totals.cost <= 0
  );
}

/** Idle left strip: discoverability instead of ↑0 ↓0 $0 */
function renderIdleLeft(theme: any, density: Density, width: number): string {
  const cmds =
    density === "compact" || width < 56 ? IDLE_SHORTCUTS_COMPACT : IDLE_SHORTCUTS_FULL;
  const sep = theme.fg("dim", " · ");
  const painted = cmds.map((cmd, i) =>
    i === 0 ? theme.fg("accent", cmd) : theme.fg("muted", cmd),
  );
  return painted.join(sep);
}

function renderUsageLeft(
  theme: any,
  totals: UsageTotals,
  ctxLabel: string | null,
  density: Density,
): string {
  // Stock Pi order: ↑ ↓ R W CH $ ctx
  const parts = formatUsageSegments(totals, { density, includeCost: true });
  if (ctxLabel) parts.push(ctxLabel);

  // Compact still shows cache when present (it's high-signal); trim only empties
  if (density === "compact" && parts.length > 6) {
    // Prefer keeping CH over W when very tight — drop W first
    const withoutW = parts.filter((p) => !p.startsWith("W"));
    if (withoutW.length < parts.length && withoutW.length <= 6) {
      return theme.fg("dim", withoutW.join(" "));
    }
  }

  return theme.fg("dim", parts.join(" "));
}

function renderRight(
  theme: any,
  model: string,
  thinking: string,
  branch: string,
  density: Density,
  width: number,
  leftWidth: number,
): string {
  const sep = theme.fg("dim", " · ");
  const budget = Math.max(8, width - leftWidth - 1);
  const thinkPainted = paintThinking(theme, thinking);

  const candidates: string[][] = [];

  if (density === "comfortable" && width >= 72) {
    candidates.push([
      theme.fg("accent", model),
      thinkPainted,
      branch ? theme.fg("dim", branch) : "",
    ]);
  }

  if (width >= 52) {
    candidates.push([
      theme.fg("accent", model),
      density === "comfortable" ? thinkPainted : "",
      branch && density === "comfortable" ? theme.fg("dim", branch) : "",
    ]);
  }

  // Prefer model + level when space is tight
  candidates.push([theme.fg("accent", model), thinkPainted]);
  candidates.push([theme.fg("accent", model), branch ? theme.fg("dim", branch) : ""]);
  candidates.push([theme.fg("accent", model)]);

  for (const parts of candidates) {
    const line = joinSegments(parts, sep);
    if (visibleWidth(line) <= budget) return line;
  }

  return truncateToWidth(theme.fg("accent", model), budget);
}

function applyFooter(
  pi: ExtensionAPI,
  ctx: any,
  enabled: boolean,
  density: Density,
): void {
  if (ctx.mode !== "tui" || !ctx.hasUI) return;

  if (!enabled) {
    ctx.ui.setFooter(undefined);
    return;
  }

  ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
    const unsub = footerData.onBranchChange?.(() => tui.requestRender());

    return {
      dispose: unsub,
      invalidate() {},
      render(width: number): string[] {
        const totals = getUsageTotals(ctx);
        const ctxLabel = getContextLabel(ctx);
        const thinking = formatThinking(pi.getThinkingLevel?.() ?? "off");
        const compactModel = density === "compact" || width < 64;
        const model = getProviderModel(ctx, compactModel);
        const branch = footerData.getGitBranch?.() || "";
        const idle = isIdleUsage(totals);

        const left = idle
          ? renderIdleLeft(theme, density, width)
          : renderUsageLeft(theme, totals, ctxLabel, density);

        const rightCore = renderRight(
          theme,
          model,
          thinking,
          branch,
          density,
          width,
          visibleWidth(left),
        );

        const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(rightCore));
        const line = left + " ".repeat(gap) + rightCore;
        return [truncateToWidth(line, width)];
      },
    };
  });
}

/** Post-splash thin session header: model · thinking · cwd */
function applySessionHeader(pi: ExtensionAPI, ctx: any, density: Density): void {
  if (ctx.mode !== "tui" || !ctx.hasUI) return;

  ctx.ui.setHeader((tui: any, theme: any) => {
    return {
      invalidate() {
        tui.requestRender();
      },
      render(width: number): string[] {
        const model = getProviderModel(ctx, density === "compact");
        const thinking = formatThinking(pi.getThinkingLevel?.() ?? "off");
        const cwd = shortenCwd(ctx.cwd ?? process.cwd());
        // comfortable segments already say "thinking <level>"; compact is bare level
        const segs = buildHeaderSegments({ model, thinking, cwd }, density);

        // Colorize: model accent, thinking themed, cwd dim
        const painted = segs.map((seg, i) => {
          if (i === 0) return theme.fg("accent", seg);
          if (i === 1) {
            // compact: just the level name; comfortable segment is "thinking <level>" from helper
            if (density === "compact") return paintThinking(theme, thinking);
            const tokenByLevel: Record<string, string> = {
              off: "thinkingOff",
              minimal: "thinkingMinimal",
              low: "thinkingLow",
              medium: "thinkingMedium",
              high: "thinkingHigh",
              xhigh: "thinkingXhigh",
              max: "thinkingMax",
            };
            try {
              const token = tokenByLevel[thinking];
              if (token) return theme.fg(token, seg);
            } catch {
              // fall through
            }
            return theme.fg("muted", seg);
          }
          return theme.fg("dim", seg);
        });
        const sep = theme.fg("dim", " · ");
        const line = painted.join(sep);
        const brand =
          density === "compact"
            ? theme.fg("dim", "v ")
            : theme.fg("dim", "visage ");
        return [truncateToWidth(brand + line, width)];
      },
    };
  });
}

function setIdleStatus(ctx: any, enabled: boolean, density: Density): void {
  if (ctx.mode !== "tui" || !ctx.hasUI) return;
  if (!enabled) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  // Short idle mark — avoid competing with workingIndicator text
  const mark = density === "compact" ? "v" : "·";
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", mark));
}

function setWorkingStatus(ctx: any, enabled: boolean): void {
  if (!enabled || ctx.mode !== "tui" || !ctx.hasUI) return;
  // Dot only; animated face is the page workingIndicator next to "Working..."
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", "●"));
}

/**
 * Optional context strip above the editor (Pi setWidget API).
 * Off by default — enable with /visage widget on.
 */
function applyContextWidget(
  pi: ExtensionAPI,
  ctx: any,
  enabled: boolean,
  density: Density,
): void {
  if (ctx?.mode !== "tui" || !ctx?.hasUI) return;
  if (typeof ctx.ui?.setWidget !== "function") return;

  if (!enabled) {
    try {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    } catch {
      // ignore
    }
    return;
  }

  const label = getContextLabel(ctx);
  const model = getProviderModel(ctx, density === "compact");
  const thinking = formatThinking(pi.getThinkingLevel?.() ?? "off");

  try {
    ctx.ui.setWidget(
      WIDGET_KEY,
      (_tui: any, theme: any) => ({
        invalidate() {},
        render(width: number): string[] {
          const bits = [
            density === "compact" ? "v" : "visage",
            label ?? "ctx —",
            model,
            density === "comfortable" ? thinking : "",
          ].filter(Boolean);
          const plain = bits.join(" · ");
          const painted = theme.fg("dim", plain);
          return [truncateToWidth(painted, Math.max(8, width))];
        },
      }),
      { placement: "aboveEditor" },
    );
  } catch {
    // API shape drift — skip quietly
  }
}

/* -------------------------------------------------------------------------- */
/* Built-in tool render overrides (execute delegated, render Visage-styled)     */
/* -------------------------------------------------------------------------- */

function createToolCache() {
  const cache = new Map<string, ReturnType<typeof buildTools>>();
  function buildTools(cwd: string) {
    return {
      read: createReadTool(cwd),
      bash: createBashTool(cwd),
      edit: createEditTool(cwd),
      write: createWriteTool(cwd),
      grep: createGrepTool(cwd),
      find: createFindTool(cwd),
      ls: createLsTool(cwd),
    };
  }
  return {
    get(cwd: string) {
      let tools = cache.get(cwd);
      if (!tools) {
        tools = buildTools(cwd);
        cache.set(cwd, tools);
      }
      return tools;
    },
  };
}

function textFromResult(result: any): string {
  const content = result?.content;
  if (!Array.isArray(content) || content.length === 0) return "";
  const first = content[0];
  if (first?.type === "text" && typeof first.text === "string") return first.text;
  return "";
}

function resultSummary(tool: BuiltinName, result: any): { ok: boolean; summary: string; detail: string } {
  const text = textFromResult(result);
  const err =
    typeof text === "string" &&
    (text.startsWith("Error") || /exit code: [1-9]/.test(text) || result?.isError);

  if (tool === "bash") {
    const lines = countLines(text);
    const exitMatch = text.match(/exit code: (\d+)/);
    const code = exitMatch ? Number(exitMatch[1]) : 0;
    return {
      ok: !err && code === 0,
      summary: code === 0 ? `${lines} lines` : `exit ${code}`,
      detail: lines > 0 ? `${lines} lines` : "",
    };
  }

  if (tool === "read") {
    if (result?.content?.[0]?.type === "image") {
      return { ok: true, summary: "image", detail: "" };
    }
    const lines = countLines(text);
    const trunc = result?.details?.truncation?.truncated;
    return {
      ok: !err,
      summary: `${lines} lines`,
      detail: trunc ? "truncated" : "",
    };
  }

  if (tool === "edit") {
    const diff = result?.details?.diff as string | undefined;
    if (diff) {
      let add = 0;
      let del = 0;
      for (const line of diff.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) add++;
        if (line.startsWith("-") && !line.startsWith("---")) del++;
      }
      return { ok: !err, summary: `+${add}/-${del}`, detail: "" };
    }
    return { ok: !err, summary: err ? "error" : "applied", detail: "" };
  }

  if (tool === "write") {
    return { ok: !err, summary: err ? "error" : "written", detail: "" };
  }

  // grep / find / ls
  const lines = countLines(text);
  return {
    ok: !err,
    summary: lines ? `${lines} hits` : "done",
    detail: "",
  };
}

function paintToolCall(theme: any, density: Density, tool: string, args: any): any {
  const summary = summarizeToolArgs(tool, args);
  const extraBits: string[] = [];
  if (tool === "read" && args) {
    if (args.offset != null) extraBits.push(`offset=${args.offset}`);
    if (args.limit != null) extraBits.push(`limit=${args.limit}`);
  }
  if (tool === "bash" && args?.timeout) extraBits.push(`timeout=${args.timeout}s`);

  const plain = formatToolCallLine(
    { tool, summary, extra: extraBits.join(" ") },
    density,
  );

  // Re-paint: tool title accent-ish, path/command accent, rest dim
  if (density === "compact") {
    const body = summary ? `${tool}  ${summary}` : tool;
    return new Text(
      theme.fg("dim", "▸ ") + theme.fg("toolTitle", tool) + (summary ? theme.fg("accent", `  ${summary}`) : ""),
      0,
      0,
    );
  }

  let text = theme.fg("toolTitle", theme.bold?.(`⚙ ${tool}`) ?? `⚙ ${tool}`);
  if (summary) text += theme.fg("dim", " · ") + theme.fg("accent", summary);
  if (extraBits.length) text += theme.fg("dim", ` (${extraBits.join(", ")})`);
  // keep plain length relationship for tests via formatToolCallLine
  void plain;
  return new Text(text, 0, 0);
}

function paintToolResult(
  theme: any,
  density: Density,
  tool: BuiltinName,
  result: any,
  options: { expanded?: boolean; isPartial?: boolean },
): any {
  if (options.isPartial) {
    return new Text(theme.fg("warning", density === "compact" ? "…" : "working…"), 0, 0);
  }

  const { ok, summary, detail } = resultSummary(tool, result);
  const plain = formatToolResultLine({ tool, ok, summary, detail }, density);
  void plain;

  const mark = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");

  if (density === "compact") {
    let text = `${mark} ${theme.fg(ok ? "muted" : "error", summary)}`;
    if (options.expanded) {
      const body = textFromResult(result);
      if (body) {
        const lines = body.split("\n").slice(0, 12);
        for (const line of lines) text += `\n${theme.fg("dim", truncStr(line, 120))}`;
        if (body.split("\n").length > 12) {
          text += `\n${theme.fg("muted", "…")}`;
        }
      }
    }
    return new Text(text, 0, 0);
  }

  let text = `${mark} ${theme.fg("toolTitle", tool)}`;
  text += theme.fg("dim", " · ") + theme.fg(ok ? "muted" : "error", summary);
  if (detail) text += theme.fg("dim", ` · ${detail}`);

  if (options.expanded) {
    const body = textFromResult(result);
    if (body) {
      const lines = body.split("\n").slice(0, 20);
      for (const line of lines) text += `\n${theme.fg("dim", truncStr(line, 140))}`;
    }
  }

  return new Text(text, 0, 0);
}

function registerBuiltinToolOverrides(
  pi: ExtensionAPI,
  getDensity: () => Density,
): void {
  const tools = createToolCache();

  const registerOne = (name: BuiltinName) => {
    const sample = tools.get(process.cwd())[name];

    pi.registerTool({
      name,
      label: name,
      description: (sample as any).description ?? name,
      parameters: (sample as any).parameters,

      async execute(toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) {
        const cwd = ctx?.cwd || process.cwd();
        const impl = tools.get(cwd)[name] as any;
        return impl.execute(toolCallId, params, signal, onUpdate, ctx);
      },

      renderCall(args: any, theme: any) {
        return paintToolCall(theme, getDensity(), name, args);
      },

      renderResult(result: any, options: any, theme: any) {
        return paintToolResult(theme, getDensity(), name, result, options ?? {});
      },
    });
  };

  for (const name of BUILTIN_TOOLS) {
    registerOne(name);
  }
}

/* -------------------------------------------------------------------------- */
/* Extension entry                                                              */
/* -------------------------------------------------------------------------- */

export default function visageSkin(pi: ExtensionAPI) {
  let config = loadConfig();
  /** True once splash is replaced by the thin session header. */
  let sessionHeaderActive = false;

  const refreshChrome = (ctx: any) => {
    if (ctx?.mode !== "tui") return;
    applyFooter(pi, ctx, config.footer, config.density);
    if (sessionHeaderActive) {
      applySessionHeader(pi, ctx, config.density);
    }
    applyContextWidget(pi, ctx, config.widget, config.density);
  };

  registerBuiltinToolOverrides(pi, () => config.density);
  // Transcript user/assistant styling: Visage themes (see themes/*.json + lib/chrome-helpers
  // applyTranscriptTheme). No registerMessageRenderer for core roles — Pi API is customType-only.

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    sessionHeaderActive = false;
    if (ctx.mode !== "tui") return;
    // Leave splash header to startup-ui; only footer/status here.
    applyFooter(pi, ctx, config.footer, config.density);
    setIdleStatus(ctx, config.status, config.density);
    applyContextWidget(pi, ctx, config.widget, config.density);
  });

  pi.on("model_select", async (_event, ctx) => {
    refreshChrome(ctx);
  });

  pi.on("thinking_level_select", async (_event, ctx) => {
    refreshChrome(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    // First turn: swap splash for thin session identity bar
    if (ctx.mode === "tui" && ctx.hasUI) {
      sessionHeaderActive = true;
      applySessionHeader(pi, ctx, config.density);
    }
    setWorkingStatus(ctx, config.status);
  });

  pi.on("turn_end", async (_event, ctx) => {
    setIdleStatus(ctx, config.status, config.density);
    refreshChrome(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    sessionHeaderActive = false;
    ctx.ui.setStatus(STATUS_KEY, undefined);
    applyContextWidget(pi, ctx, false, config.density);
  });

  pi.registerCommand("visage", {
    description:
      "Visage UI: setup | show | doctor | footer | status | density | theme | header | widget",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const [cmd, value] = parts;

      if (cmd === "setup" || cmd === "init" || cmd === "defaults") {
        const result = applyRecommendedSetup(pi, ctx, config);
        config = result.config;
        reportLines(ctx, result.lines);
        return;
      }

      if (!cmd || cmd === "show") {
        reportLines(ctx, [
          "pi-visage",
          `  footer:   ${config.footer ? "on" : "off"}`,
          `  status:   ${config.status ? "on" : "off"}`,
          `  widget:   ${config.widget ? "on" : "off"}`,
          `  density:  ${config.density}`,
          `  header:   ${sessionHeaderActive ? "session" : "splash/default"}`,
          `  model:    ${getProviderModel(ctx)}`,
          `  thinking: ${formatThinking(pi.getThinkingLevel?.() ?? "off")}`,
          `  transcript: theme tokens (userMessageBg/Text, muted, accent)`,
          `  config:   ${CONFIG_PATH}`,
          `  ui:       ${UI_CONFIG_PATH}`,
        ]);
        return;
      }

      if (cmd === "doctor") {
        // Safe in TUI and non-TUI — never throws on missing notify/theme.
        reportLines(ctx, formatDoctorReport(buildDoctorSnapshot(ctx, config)));
        return;
      }

      // Non-interactive startup page pick (same as /setStartUI <id>, no dialog).
      if (cmd === "page") {
        const pageId = (value || "visage").toLowerCase();
        if (pageId !== "off" && pageId !== "visage" && pageId !== "visage-minimal") {
          reportLines(
            ctx,
            [
              `Unknown page: ${pageId}`,
              "Usage: /visage page visage|visage-minimal|off",
              "(or /setStartUI <id> — same files)",
            ],
            "warning",
          );
          return;
        }
        if (pageId === "off") {
          saveUiAdapterState({ selectedId: "visage", enabled: false, layout: "auto" });
          reportLines(ctx, ["Startup page disabled (Pi default). Restart or /setStartUI off applied on next paint."]);
          return;
        }
        saveUiAdapterState({ selectedId: pageId, enabled: true, layout: "auto" });
        reportLines(ctx, [
          `Startup page → ${pageId} (saved)`,
          "Apply now: /setStartUI " + pageId,
        ]);
        return;
      }

      if (cmd === "footer") {
        if (value !== "on" && value !== "off") {
          reportLines(ctx, ["Usage: /visage footer on|off"], "warning");
          return;
        }
        config.footer = value === "on";
        saveConfig(config);
        applyFooter(pi, ctx, config.footer, config.density);
        reportLines(ctx, [`Footer ${config.footer ? "on" : "off"}`]);
        return;
      }

      if (cmd === "status") {
        if (value !== "on" && value !== "off") {
          reportLines(ctx, ["Usage: /visage status on|off"], "warning");
          return;
        }
        config.status = value === "on";
        saveConfig(config);
        setIdleStatus(ctx, config.status, config.density);
        reportLines(ctx, [`Status chip ${config.status ? "on" : "off"}`]);
        return;
      }

      if (cmd === "header") {
        if (value === "off") {
          sessionHeaderActive = false;
          if (ctx.mode === "tui" && ctx.hasUI) ctx.ui.setHeader(undefined);
          reportLines(ctx, ["Session header off (restored default/splash)"]);
          return;
        }
        if (value === "on" || !value) {
          sessionHeaderActive = true;
          applySessionHeader(pi, ctx, config.density);
          reportLines(ctx, ["Session header on (model · thinking · cwd)"]);
          return;
        }
        reportLines(ctx, ["Usage: /visage header on|off"], "warning");
        return;
      }

      if (cmd === "density") {
        if (value !== "comfortable" && value !== "compact") {
          reportLines(ctx, ["Usage: /visage density comfortable|compact"], "warning");
          return;
        }
        config.density = value;
        saveConfig(config);
        applyFooter(pi, ctx, config.footer, config.density);
        setIdleStatus(ctx, config.status, config.density);
        if (sessionHeaderActive) applySessionHeader(pi, ctx, config.density);
        applyContextWidget(pi, ctx, config.widget, config.density);
        reportLines(
          ctx,
          [
            `Density → ${config.density}` +
              (config.density === "compact"
                ? " (shorter footer + compact tool rows)"
                : " (full footer + roomier tool rows)"),
          ],
        );
        return;
      }

      if (cmd === "widget") {
        if (value !== "on" && value !== "off") {
          reportLines(ctx, ["Usage: /visage widget on|off"], "warning");
          return;
        }
        config.widget = value === "on";
        saveConfig(config);
        applyContextWidget(pi, ctx, config.widget, config.density);
        reportLines(
          ctx,
          [
            `Context widget ${config.widget ? "on" : "off"}` +
              (config.widget ? " (above editor via setWidget)" : ""),
          ],
        );
        return;
      }

      if (cmd === "theme") {
        const name = resolveVisageThemeId(value) ?? (value ? null : "visage-dark");
        if (!name) {
          reportLines(ctx, ["Usage: /visage theme dark|light|rose"], "warning");
          return;
        }
        if (ctx?.mode === "tui" && ctx?.hasUI && typeof ctx.ui?.setTheme === "function") {
          const result = ctx.ui.setTheme(name);
          if (result && !result.success) {
            reportLines(ctx, [result.error ?? `Failed theme ${name}`], "error");
          } else {
            reportLines(ctx, [`Theme → ${name}`]);
          }
        } else {
          reportLines(ctx, [`Theme → ${name} (not applied: non-TUI)`], "warning");
        }
        return;
      }

      reportLines(
        ctx,
        [
          "Usage:",
          "  /visage setup              — apply defaults (no picker)",
          "  /visage show | doctor",
          "  /visage page visage|visage-minimal|off",
          "  /visage footer on|off",
          "  /visage status on|off",
          "  /visage header on|off",
          "  /visage widget on|off",
          "  /visage density comfortable|compact",
          "  /visage theme dark|light|rose",
        ],
      );
    },
  });
}
