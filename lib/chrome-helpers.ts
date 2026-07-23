/**
 * Pure Visage chrome formatters (no TUI / Pi imports).
 * Used by skin.ts and unit-tested without a live session.
 */

export type Density = "comfortable" | "compact";

export type HeaderParts = {
  model: string;
  thinking: string;
  cwd: string;
  branch?: string | null;
};

export type ToolCallInput = {
  tool: string;
  summary: string;
  extra?: string;
};

export type ToolResultInput = {
  tool: string;
  ok: boolean;
  summary: string;
  detail?: string;
};

/** Session header segment tokens — always includes model, thinking, cwd. */
export function buildHeaderSegments(parts: HeaderParts, density: Density = "comfortable"): string[] {
  const model = (parts.model || "no-model").trim() || "no-model";
  const thinking = (parts.thinking || "off").trim() || "off";
  const cwd = (parts.cwd || ".").trim() || ".";
  const branch = parts.branch?.trim() || "";

  if (density === "compact") {
    const segs = [model, thinking, cwd];
    if (branch) segs.push(branch);
    return segs;
  }

  const segs = [`model ${model}`, `thinking ${thinking}`, cwd];
  if (branch) segs.push(`git:${branch}`);
  return segs;
}

/** Single-line header body joined with · (plain text, no ANSI). */
export function formatHeaderLine(parts: HeaderParts, density: Density = "comfortable"): string {
  return buildHeaderSegments(parts, density).join(" · ");
}

/**
 * Compact vs full tool call line (plain text).
 * Compact is always shorter for the same inputs (less chrome).
 */
export function formatToolCallLine(
  input: ToolCallInput,
  density: Density,
): string {
  const tool = (input.tool || "tool").trim();
  const summary = (input.summary || "").trim();
  const extra = (input.extra || "").trim();

  if (density === "compact") {
    // short: "▸ tool  summary"
    const body = summary ? `${tool}  ${summary}` : tool;
    return `▸ ${body}`;
  }

  // full/comfortable Visage chrome (still styled, more verbose than compact)
  const bits = [`⚙ ${tool}`];
  if (summary) bits.push(summary);
  if (extra) bits.push(`(${extra})`);
  return bits.join(" · ");
}

/**
 * Compact vs full tool result line (plain text).
 */
export function formatToolResultLine(
  input: ToolResultInput,
  density: Density,
): string {
  const tool = (input.tool || "tool").trim();
  const summary = (input.summary || "").trim();
  const detail = (input.detail || "").trim();
  const mark = input.ok ? "✓" : "✗";

  if (density === "compact") {
    return summary ? `${mark} ${summary}` : `${mark} ${tool}`;
  }

  const bits = [`${mark} ${tool}`];
  if (summary) bits.push(summary);
  if (detail) bits.push(detail);
  return bits.join(" · ");
}

/** True when compact call line is shorter than comfortable for same inputs. */
export function isCompactToolCallShorter(
  input: ToolCallInput,
): boolean {
  const c = formatToolCallLine(input, "compact");
  const f = formatToolCallLine(input, "comfortable");
  return c.length < f.length;
}

export type MessageRole = "user" | "assistant";

/**
 * Pi styles core user/assistant transcript bubbles via theme tokens only
 * (UserMessageComponent uses userMessageBg + userMessageText; assistant body/thinking
 * use text / muted / accent). registerMessageRenderer cannot retarget role=user|assistant.
 *
 * These helpers resolve the shipped Visage theme JSON the same way the TUI does
 * (colors → vars → hex) so tests can prove transcript styling is wired.
 */
export type VisageThemeDoc = {
  name?: string;
  vars: Record<string, string>;
  colors: Record<string, string>;
};

/** Resolve a theme color token to a concrete hex (or raw value) via vars. */
export function resolveThemeToken(theme: VisageThemeDoc, token: string): string {
  if (!theme?.colors || !theme?.vars) {
    throw new Error("theme missing colors/vars");
  }
  const fromColors = theme.colors[token];
  const key = fromColors ?? token;
  if (typeof key === "string" && key.startsWith("#")) return key;
  if (typeof key === "string" && theme.vars[key]) return theme.vars[key];
  if (theme.vars[token]) return theme.vars[token];
  throw new Error(`unresolved theme token: ${token}`);
}

/** Tokens Pi applies to core transcript roles (honest AC3 path). */
export function transcriptStyleForRole(role: MessageRole): {
  bgToken?: string;
  fgToken: string;
  secondaryToken?: string;
  accentToken: string;
} {
  if (role === "user") {
    return {
      bgToken: "userMessageBg",
      fgToken: "userMessageText",
      accentToken: "accent",
    };
  }
  // Assistant: primary text + muted secondary (thinking/quotes) + accent highlights
  return {
    fgToken: "text",
    secondaryToken: "muted",
    accentToken: "accent",
  };
}

/** Resolve concrete colors for a role message fixture against a theme doc. */
export function applyTranscriptTheme(
  theme: VisageThemeDoc,
  message: { role: MessageRole; content?: string },
): {
  role: MessageRole;
  content: string;
  bg?: string;
  fg: string;
  muted?: string;
  accent: string;
} {
  const role = message.role;
  const tokens = transcriptStyleForRole(role);
  const content = message.content ?? "";
  if (role === "user") {
    return {
      role,
      content,
      bg: resolveThemeToken(theme, tokens.bgToken!),
      fg: resolveThemeToken(theme, tokens.fgToken),
      accent: resolveThemeToken(theme, tokens.accentToken),
    };
  }
  return {
    role,
    content,
    fg: resolveThemeToken(theme, tokens.fgToken),
    muted: resolveThemeToken(theme, tokens.secondaryToken!),
    accent: resolveThemeToken(theme, tokens.accentToken),
  };
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Assert a Visage theme has the transcript tokens Pi needs for user/assistant chrome.
 * Throws if accent/muted/userMessage* are missing or do not resolve to distinct hex.
 */
export function assertTranscriptTheme(theme: VisageThemeDoc): {
  userMessageBg: string;
  userMessageText: string;
  accent: string;
  muted: string;
  text: string;
} {
  const required = [
    "userMessageBg",
    "userMessageText",
    "accent",
    "muted",
    "text",
  ] as const;
  const out: Record<string, string> = {};
  for (const token of required) {
    const value = resolveThemeToken(theme, token);
    if (!HEX.test(value)) {
      throw new Error(`token ${token} is not hex: ${value}`);
    }
    out[token] = value;
  }
  if (out.accent.toLowerCase() === out.muted.toLowerCase()) {
    throw new Error("accent and muted must differ for Visage role contrast");
  }
  if (out.userMessageBg.toLowerCase() === out.text.toLowerCase()) {
    throw new Error("userMessageBg must differ from text for user bubble contrast");
  }
  return out as {
    userMessageBg: string;
    userMessageText: string;
    accent: string;
    muted: string;
    text: string;
  };
}

/** Summarize common tool args into a short path/command snippet. */
export function summarizeToolArgs(tool: string, args: Record<string, unknown> | null | undefined): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;

  switch (tool) {
    case "read":
    case "write":
    case "edit":
    case "ls":
      return typeof a.path === "string" ? shortenPath(a.path) : "";
    case "bash":
      return typeof a.command === "string" ? truncate(a.command, 64) : "";
    case "grep": {
      const pat = typeof a.pattern === "string" ? a.pattern : "";
      const path = typeof a.path === "string" ? shortenPath(a.path) : "";
      return [pat && `/${truncate(pat, 32)}/`, path].filter(Boolean).join(" ");
    }
    case "find": {
      const pattern = typeof a.pattern === "string" ? a.pattern : typeof a.glob === "string" ? a.glob : "";
      const path = typeof a.path === "string" ? shortenPath(a.path) : "";
      return [pattern, path].filter(Boolean).join(" ");
    }
    default:
      return "";
  }
}

export function shortenPath(value: string, maxLength = 48): string {
  if (!value) return "";
  let result = value.replace(/\\/g, "/");
  // strip common home prefixes generically
  result = result.replace(/^\/Users\/[^/]+/i, "~");
  result = result.replace(/^\/home\/[^/]+/i, "~");
  result = result.replace(/^[A-Za-z]:\/Users\/[^/]+/i, "~");
  if (result.length <= maxLength) return result;
  const parts = result.split("/").filter(Boolean);
  if (parts.length <= 2) return `…${result.slice(-(maxLength - 1))}`;
  return `…/${parts.slice(-2).join("/")}`;
}

export function truncate(value: string, max: number): string {
  if (!value || value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

/** Count lines in tool text content safely. */
export function countLines(text: string | undefined | null): number {
  if (!text) return 0;
  return text.split("\n").length;
}
