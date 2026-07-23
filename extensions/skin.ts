/**
 * Visage chrome — footer, status, session header, compact tools.
 *
 * Footer (Phase 1):
 *   left:  usage OR idle shortcuts when no usage yet
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
  buildHeaderSegments,
  countLines,
  formatToolCallLine,
  formatToolResultLine,
  summarizeToolArgs,
  truncate as truncStr,
} from "../lib/chrome-helpers.ts";

const STATUS_KEY = "pi-visage";
const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "visage.json");

type VisageConfig = {
  footer: boolean;
  status: boolean;
  density: Density;
};

const DEFAULT_CONFIG: VisageConfig = {
  footer: true,
  status: true,
  density: "comfortable",
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
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config: VisageConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}m`;
}

function formatCost(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

function formatThinking(level: unknown): string {
  if (typeof level !== "string" || !level) return "off";
  const normalized = level.toLowerCase();
  return THINKING_LEVELS.has(normalized) ? normalized : normalized;
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

function getUsageTotals(ctx: any): { input: number; output: number; cost: number } {
  let input = 0;
  let output = 0;
  let cost = 0;

  try {
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "message" && e.message?.role === "assistant") {
        const m = e.message as AssistantMessage;
        input += m.usage?.input ?? 0;
        output += m.usage?.output ?? 0;
        cost += m.usage?.cost?.total ?? 0;
      }
    }
  } catch {
    // ignore
  }

  return { input, output, cost };
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

function isIdleUsage(input: number, output: number, cost: number): boolean {
  return (
    (!Number.isFinite(input) || input <= 0) &&
    (!Number.isFinite(output) || output <= 0) &&
    (!Number.isFinite(cost) || cost <= 0)
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
  input: number,
  output: number,
  cost: number,
  ctxLabel: string | null,
  density: Density,
): string {
  if (density === "compact") {
    return theme.fg(
      "dim",
      joinSegments(
        [formatCost(cost), `↑${formatTokens(input)}`, `↓${formatTokens(output)}`, ctxLabel ?? ""],
        " ",
      ),
    );
  }

  return theme.fg(
    "dim",
    joinSegments(
      [`↑${formatTokens(input)}`, `↓${formatTokens(output)}`, formatCost(cost), ctxLabel ?? ""],
      " ",
    ),
  );
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

  const candidates: string[][] = [];

  if (density === "comfortable" && width >= 72) {
    candidates.push([
      theme.fg("accent", model),
      theme.fg("muted", thinking),
      branch ? theme.fg("dim", branch) : "",
    ]);
  }

  if (width >= 52) {
    candidates.push([
      theme.fg("accent", model),
      density === "comfortable" ? theme.fg("muted", thinking) : "",
      branch && density === "comfortable" ? theme.fg("dim", branch) : "",
    ]);
  }

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
        const { input, output, cost } = getUsageTotals(ctx);
        const ctxLabel = getContextLabel(ctx);
        const thinking = formatThinking(pi.getThinkingLevel?.() ?? "off");
        const compactModel = density === "compact" || width < 64;
        const model = getProviderModel(ctx, compactModel);
        const branch = footerData.getGitBranch?.() || "";
        const idle = isIdleUsage(input, output, cost);

        const left = idle
          ? renderIdleLeft(theme, density, width)
          : renderUsageLeft(theme, input, output, cost, ctxLabel, density);

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
        const segs = buildHeaderSegments({ model, thinking, cwd }, density);

        // Colorize: model accent, thinking muted, cwd dim
        const painted = segs.map((seg, i) => {
          if (i === 0) return theme.fg("accent", seg);
          if (i === 1) return theme.fg("muted", seg);
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
  const mark = density === "compact" ? "v" : "·";
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", mark));
}

function setWorkingStatus(ctx: any, enabled: boolean): void {
  if (!enabled || ctx.mode !== "tui" || !ctx.hasUI) return;
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", "●"));
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
  });

  pi.registerCommand("visage", {
    description:
      "Visage UI: show | footer on|off | status on|off | density | theme dark|light | header on|off",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const [cmd, value] = parts;

      if (!cmd || cmd === "show") {
        ctx.ui.notify(
          [
            "pi-visage",
            `  footer:   ${config.footer ? "on" : "off"}`,
            `  status:   ${config.status ? "on" : "off"}`,
            `  density:  ${config.density}`,
            `  header:   ${sessionHeaderActive ? "session" : "splash/default"}`,
            `  model:    ${getProviderModel(ctx)}`,
            `  thinking: ${formatThinking(pi.getThinkingLevel?.() ?? "off")}`,
            `  transcript: theme tokens (userMessageBg/Text, muted, accent)`,
            `  config:   ${CONFIG_PATH}`,
          ].join("\n"),
          "info",
        );
        return;
      }

      if (cmd === "footer") {
        if (value !== "on" && value !== "off") {
          ctx.ui.notify("Usage: /visage footer on|off", "warning");
          return;
        }
        config.footer = value === "on";
        saveConfig(config);
        applyFooter(pi, ctx, config.footer, config.density);
        ctx.ui.notify(`Footer ${config.footer ? "on" : "off"}`, "info");
        return;
      }

      if (cmd === "status") {
        if (value !== "on" && value !== "off") {
          ctx.ui.notify("Usage: /visage status on|off", "warning");
          return;
        }
        config.status = value === "on";
        saveConfig(config);
        setIdleStatus(ctx, config.status, config.density);
        ctx.ui.notify(`Status chip ${config.status ? "on" : "off"}`, "info");
        return;
      }

      if (cmd === "header") {
        if (value === "off") {
          sessionHeaderActive = false;
          if (ctx.mode === "tui" && ctx.hasUI) ctx.ui.setHeader(undefined);
          ctx.ui.notify("Session header off (restored default/splash)", "info");
          return;
        }
        if (value === "on" || !value) {
          sessionHeaderActive = true;
          applySessionHeader(pi, ctx, config.density);
          ctx.ui.notify("Session header on (model · thinking · cwd)", "info");
          return;
        }
        ctx.ui.notify("Usage: /visage header on|off", "warning");
        return;
      }

      if (cmd === "density") {
        if (value !== "comfortable" && value !== "compact") {
          ctx.ui.notify("Usage: /visage density comfortable|compact", "warning");
          return;
        }
        config.density = value;
        saveConfig(config);
        applyFooter(pi, ctx, config.footer, config.density);
        setIdleStatus(ctx, config.status, config.density);
        if (sessionHeaderActive) applySessionHeader(pi, ctx, config.density);
        ctx.ui.notify(
          `Density → ${config.density}` +
            (config.density === "compact"
              ? " (shorter footer + compact tool rows)"
              : " (full footer + roomier tool rows)"),
          "info",
        );
        return;
      }

      if (cmd === "theme") {
        const name = value === "light" ? "visage-light" : "visage-dark";
        const result = ctx.ui.setTheme(name);
        if (result && !result.success) {
          ctx.ui.notify(result.error ?? `Failed theme ${name}`, "error");
        } else {
          ctx.ui.notify(`Theme → ${name}`, "info");
        }
        return;
      }

      ctx.ui.notify(
        [
          "Usage:",
          "  /visage show",
          "  /visage footer on|off",
          "  /visage status on|off",
          "  /visage header on|off",
          "  /visage density comfortable|compact",
          "  /visage theme dark|light",
        ].join("\n"),
        "info",
      );
    },
  });
}
