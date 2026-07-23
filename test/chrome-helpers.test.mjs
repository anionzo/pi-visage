/**
 * Unit tests for shipped Visage chrome helpers + theme transcript tokens.
 * Runs with: node --experimental-strip-types --test test/chrome-helpers.test.mjs
 *
 * Loads real themes/*.json — not fixtures reimplemented in the test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHeaderSegments,
  formatHeaderLine,
  formatToolCallLine,
  formatToolResultLine,
  isCompactToolCallShorter,
  summarizeToolArgs,
  resolveThemeToken,
  transcriptStyleForRole,
  applyTranscriptTheme,
  assertTranscriptTheme,
  emptyUsageTotals,
  addUsageToTotals,
  cacheHitRate,
  formatUsageSegments,
  formatFooterTokens,
} from "../lib/chrome-helpers.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DARK_PATH = path.join(ROOT, "themes", "visage-dark.json");
const LIGHT_PATH = path.join(ROOT, "themes", "visage-light.json");

function loadTheme(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

test("header segments always include model, thinking, cwd", () => {
  const segs = buildHeaderSegments({
    model: "xai/grok-4.5",
    thinking: "medium",
    cwd: "~/CODE/PI",
  });
  const line = formatHeaderLine({
    model: "xai/grok-4.5",
    thinking: "medium",
    cwd: "~/CODE/PI",
  });
  assert.ok(segs.some((s) => s.includes("grok-4.5") || s.includes("xai")));
  assert.ok(segs.some((s) => s.includes("medium")));
  assert.ok(segs.some((s) => s.includes("CODE/PI") || s.includes("~/CODE")));
  assert.ok(line.includes("grok-4.5") || line.includes("xai"));
  assert.ok(line.includes("medium"));
  assert.ok(line.includes("·"));
});

test("header compact still carries model + thinking + cwd tokens", () => {
  const segs = buildHeaderSegments(
    { model: "gpt", thinking: "low", cwd: "/tmp/work" },
    "compact",
  );
  assert.deepEqual(segs.slice(0, 3), ["gpt", "low", "/tmp/work"]);
});

test("compact tool call is shorter than comfortable full chrome", () => {
  const input = {
    tool: "read",
    summary: "src/index.ts",
    extra: "offset=1 limit=40",
  };
  const compact = formatToolCallLine(input, "compact");
  const full = formatToolCallLine(input, "comfortable");
  assert.ok(compact.length < full.length, `${compact} should be shorter than ${full}`);
  assert.ok(isCompactToolCallShorter(input));
  assert.ok(compact.startsWith("▸"));
  assert.ok(full.includes("⚙") || full.includes("read"));
  assert.ok(!compact.includes("offset="), "compact omits verbose extra chrome");
  assert.ok(full.includes("offset=") || full.includes("extra") || full.includes("("));
});

test("compact tool result is shorter than comfortable", () => {
  const input = {
    tool: "bash",
    ok: true,
    summary: "12 lines",
    detail: "exit 0 · truncated",
  };
  const compact = formatToolResultLine(input, "compact");
  const full = formatToolResultLine(input, "comfortable");
  assert.ok(compact.length < full.length);
  assert.ok(compact.startsWith("✓"));
  assert.ok(full.includes("bash") || full.includes("exit"));
});

test("summarizeToolArgs produces short path/command snippets", () => {
  assert.ok(summarizeToolArgs("read", { path: "/Users/me/proj/a.ts" }).includes("a.ts"));
  assert.ok(summarizeToolArgs("bash", { command: "ls -la" }).includes("ls"));
  assert.equal(summarizeToolArgs("edit", {}), "");
});

test("shipped visage-dark exposes user/assistant transcript theme tokens", () => {
  assert.ok(fs.existsSync(DARK_PATH), `missing ${DARK_PATH}`);
  const theme = loadTheme(DARK_PATH);
  assert.equal(theme.name, "visage-dark");
  const resolved = assertTranscriptTheme(theme);
  // user bubble tokens used by Pi UserMessageComponent
  assert.equal(resolved.userMessageBg, theme.vars.userMsgBg);
  assert.equal(resolved.userMessageText, theme.vars.text);
  assert.equal(resolved.accent, theme.vars.primary);
  assert.equal(resolved.muted, theme.vars.muted);
  assert.ok(resolved.accent.toLowerCase() !== resolved.muted.toLowerCase());
});

test("shipped visage-light exposes user/assistant transcript theme tokens", () => {
  assert.ok(fs.existsSync(LIGHT_PATH), `missing ${LIGHT_PATH}`);
  const theme = loadTheme(LIGHT_PATH);
  assert.equal(theme.name, "visage-light");
  const resolved = assertTranscriptTheme(theme);
  assert.equal(resolved.userMessageBg, theme.vars.userMsgBg);
  assert.equal(resolved.accent, theme.vars.primary);
  assert.equal(resolved.muted, theme.vars.muted);
});

test("applyTranscriptTheme maps realistic user/assistant message fixtures via shipped dark theme", () => {
  const theme = loadTheme(DARK_PATH);
  const userMsg = { role: "user", content: "xin chào — fix the footer" };
  const asstMsg = { role: "assistant", content: "Đã áp dụng density compact." };

  const userStyle = applyTranscriptTheme(theme, userMsg);
  const asstStyle = applyTranscriptTheme(theme, asstMsg);

  assert.equal(userStyle.role, "user");
  assert.equal(userStyle.content, userMsg.content);
  assert.ok(userStyle.bg?.startsWith("#"), "user bubble needs bg");
  assert.ok(userStyle.fg.startsWith("#"));
  assert.ok(userStyle.accent.startsWith("#"));
  // Pi UserMessageComponent path
  assert.equal(userStyle.bg, resolveThemeToken(theme, "userMessageBg"));
  assert.equal(userStyle.fg, resolveThemeToken(theme, "userMessageText"));
  assert.equal(userStyle.accent, resolveThemeToken(theme, "accent"));

  assert.equal(asstStyle.role, "assistant");
  assert.equal(asstStyle.content, asstMsg.content);
  assert.equal(asstStyle.fg, resolveThemeToken(theme, "text"));
  assert.equal(asstStyle.muted, resolveThemeToken(theme, "muted"));
  assert.equal(asstStyle.accent, resolveThemeToken(theme, "accent"));
  // accent vs muted contrast for Visage assistant secondary chrome
  assert.notEqual(asstStyle.accent.toLowerCase(), asstStyle.muted.toLowerCase());

  // role token map is stable / documented
  const userTokens = transcriptStyleForRole("user");
  assert.equal(userTokens.bgToken, "userMessageBg");
  assert.equal(userTokens.fgToken, "userMessageText");
  const asstTokens = transcriptStyleForRole("assistant");
  assert.equal(asstTokens.secondaryToken, "muted");
  assert.equal(asstTokens.accentToken, "accent");
});

test("usage totals track cache read/write and Pi cache-hit formula", () => {
  const totals = emptyUsageTotals();
  addUsageToTotals(totals, {
    input: 1000,
    output: 50,
    cacheRead: 9000,
    cacheWrite: 0,
    cost: { total: 0.01 },
  });
  assert.equal(totals.input, 1000);
  assert.equal(totals.cacheRead, 9000);
  assert.equal(totals.output, 50);

  // CH = 9000 / (1000+9000+0) = 90%
  const rate = cacheHitRate({ input: 1000, cacheRead: 9000, cacheWrite: 0 });
  assert.ok(rate != null);
  assert.ok(Math.abs(rate - 90) < 0.01);

  totals.latestCacheHitRate = rate;
  const segs = formatUsageSegments(totals);
  assert.ok(segs.some((s) => s.startsWith("↑")));
  assert.ok(segs.some((s) => s.startsWith("↓")));
  assert.ok(segs.some((s) => s.startsWith("R")), `expected R cache read in ${segs.join(" ")}`);
  assert.ok(segs.some((s) => s.startsWith("CH")), `expected CH% in ${segs.join(" ")}`);
  assert.ok(!segs.some((s) => s.startsWith("W")), "zero cacheWrite should be omitted");
  assert.equal(formatFooterTokens(23000), "23k");
});

test("formatUsageSegments omits cache fields when zero", () => {
  const totals = emptyUsageTotals();
  addUsageToTotals(totals, { input: 100, output: 20, cost: { total: 0.05 } });
  const segs = formatUsageSegments(totals);
  assert.deepEqual(
    segs.filter((s) => s.startsWith("R") || s.startsWith("W") || s.startsWith("CH")),
    [],
  );
  assert.ok(segs.some((s) => s.startsWith("↑")));
  assert.ok(segs.some((s) => s.startsWith("$")));
});

test("skin.ts does not register dead customType message renderers for core roles", () => {
  const skin = fs.readFileSync(path.join(ROOT, "extensions", "skin.ts"), "utf8");
  assert.ok(
    !skin.includes('registerMessageRenderer("visage-user"'),
    "dead visage-user customType must not be registered",
  );
  assert.ok(
    !skin.includes('registerMessageRenderer("visage-assistant"'),
    "dead visage-assistant customType must not be registered",
  );
  assert.ok(
    skin.includes("userMessageBg") || skin.includes("theme tokens"),
    "skin must document theme-token transcript path",
  );
  assert.ok(skin.includes("setHeader") || skin.includes("applySessionHeader"));
  assert.ok(skin.includes("registerTool"));
  assert.ok(skin.includes("renderCall"));
  assert.ok(skin.includes("cacheRead") || skin.includes("formatUsageSegments"), "footer must surface prompt cache");
  // Helpers must live outside extensions/ so Pi does not load them as factories
  assert.ok(
    fs.existsSync(path.join(ROOT, "lib", "chrome-helpers.ts")),
    "chrome-helpers must live under lib/",
  );
  assert.ok(
    !fs.existsSync(path.join(ROOT, "extensions", "chrome-helpers.ts")),
    "chrome-helpers must not sit in extensions/",
  );
});
