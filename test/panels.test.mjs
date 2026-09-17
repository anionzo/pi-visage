/**
 * Unit tests for Visage status-panel pure builders + config normalize.
 * Runs with: node --experimental-strip-types --test test/panels.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	normalizePanelsConfig,
	createDefaultPanelsConfig,
	PANEL_DEFS,
} from "../lib/panels/config.ts";
import { EMPTY_GIT_STATE, buildGitPanel } from "../lib/panels/git.ts";
import { buildInfoPanel } from "../lib/panels/info.ts";
import { buildSessionPanel } from "../lib/panels/session.ts";
import { buildSystemPanel } from "../lib/panels/system.ts";
import { combineSideBySide, buildAllPanels } from "../lib/panels/layout.ts";
import { setBorderColor, setTextColor, visibleWidth } from "../lib/panels/colors.ts";
import { formatThinkingLevel } from "../lib/chrome-helpers.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("normalizePanelsConfig defaults and partial flat keys", () => {
	const d = normalizePanelsConfig(null);
	assert.equal(d.enabled, true);
	assert.equal(d.borderColor, "cyan");
	assert.equal(d.textColor, "green");
	for (const p of PANEL_DEFS) assert.equal(d.panels[p.id], true);

	const partial = normalizePanelsConfig({
		enabled: false,
		git: false,
		info: true,
		borderColor: "magenta",
	});
	assert.equal(partial.enabled, false);
	assert.equal(partial.panels.git, false);
	assert.equal(partial.panels.info, true);
	assert.equal(partial.borderColor, "magenta");

	const nested = normalizePanelsConfig({
		enabled: true,
		panels: { git: false, system: false },
		textColor: "gold",
	});
	assert.equal(nested.panels.git, false);
	assert.equal(nested.panels.system, false);
	assert.equal(nested.panels.info, true);
	assert.equal(nested.textColor, "gold");
});

test("buildGitPanel empty and dirty produce framed lines", () => {
	setBorderColor("cyan");
	setTextColor("green");
	const empty = buildGitPanel(EMPTY_GIT_STATE, 40);
	assert.ok(empty.lines.length >= 3);
	assert.ok(empty.width >= 24);

	const dirty = buildGitPanel(
		{
			...EMPTY_GIT_STATE,
			inRepo: true,
			worktree: "pi-visage",
			branch: "main",
			tracking: "origin/main",
			ahead: 1,
			behind: 0,
			filesChanged: 2,
			insertions: 10,
			deletions: 3,
			stagedFiles: 1,
			stagedInsertions: 4,
			stagedDeletions: 0,
			untrackedCount: 2,
			stashCount: 1,
		},
		60,
	);
	const blob = dirty.lines.join("\n");
	assert.ok(blob.includes("GIT") || dirty.lines[0].includes("GIT"));
	assert.ok(dirty.width >= 24);
});

test("buildInfoPanel shows context bar and tokens", () => {
	setBorderColor("cyan");
	setTextColor("green");
	const panel = buildInfoPanel(
		{
			percent: 42.5,
			tokens: 12000,
			contextWindow: 200000,
			modelText: "grok-4.5 · medium",
			modelLabel: "xai",
			inputTokens: 1000,
			outputTokens: 500,
			thinkingTokens: 100,
			cacheRead: 2000,
			totalCost: 0.12,
			turnCount: 3,
		},
		50,
	);
	assert.ok(panel.lines.length >= 4);
	assert.ok(panel.width >= 30);
});

test("buildSessionPanel and buildSystemPanel basic shape", () => {
	setBorderColor("cyan");
	setTextColor("green");
	const session = buildSessionPanel(
		{
			startedAt: Date.now() - 60_000,
			elapsed: 60_000,
			turnCount: 2,
			avgTurnDuration: 1500,
			tokensPerSec: 40,
		},
		40,
	);
	assert.ok(session.lines.length >= 4);

	const system = buildSystemPanel(
		{
			cpuPercent: 25,
			ramUsedGB: 8,
			ramTotalGB: 16,
			ramPercent: 50,
			gpuName: null,
			gpuPercent: null,
			gpuMemUsedMB: null,
			gpuMemTotalMB: null,
		},
		40,
	);
	assert.ok(system.lines.length >= 3);
});

test("combineSideBySide keeps left width", () => {
	const left = ["aaa", "bb"];
	const right = ["xxxx", "y"];
	const out = combineSideBySide(left, 5, right);
	assert.equal(out.length, 2);
	// visible width of each row >= 5 + gap + right
	assert.ok(visibleWidth(out[0]) >= 5);
});

test("buildAllPanels stacks or joins without throwing", () => {
	setBorderColor("cyan");
	setTextColor("green");
	const lines = buildAllPanels(
		{ git: true, info: true, session: true, system: false },
		{
			git: { ...EMPTY_GIT_STATE, inRepo: true, branch: "main", worktree: "r" },
			info: {
				percent: 10,
				tokens: 1,
				contextWindow: 100,
				modelText: "m",
				modelLabel: "p",
				inputTokens: 1,
				outputTokens: 1,
				thinkingTokens: 0,
				cacheRead: 0,
				totalCost: 0,
				turnCount: 0,
			},
			session: {
				startedAt: Date.now(),
				elapsed: 0,
				turnCount: 0,
				avgTurnDuration: 0,
				tokensPerSec: 0,
			},
			system: {
				cpuPercent: 0,
				ramUsedGB: 0,
				ramTotalGB: 1,
				ramPercent: 0,
				gpuName: null,
				gpuPercent: null,
				gpuMemUsedMB: null,
				gpuMemTotalMB: null,
			},
		},
		80,
	);
	assert.ok(lines.length > 0);
});

test("formatThinkingLevel shared helper", () => {
	assert.equal(formatThinkingLevel("hi"), "high");
	assert.equal(formatThinkingLevel("off"), "off");
	assert.equal(formatThinkingLevel(null), "off");
});

test("createDefaultPanelsConfig shape", () => {
	const d = createDefaultPanelsConfig();
	assert.equal(d.enabled, true);
	assert.deepEqual(Object.keys(d.panels).sort(), [
		"git",
		"info",
		"session",
		"system",
	]);
});

test("helpers live under lib/panels not extensions/", () => {
	const libDir = path.join(ROOT, "lib", "panels");
	assert.ok(fs.existsSync(path.join(libDir, "git.ts")));
	assert.ok(fs.existsSync(path.join(libDir, "config.ts")));
	const ext = fs.readdirSync(path.join(ROOT, "extensions"));
	assert.ok(!ext.includes("git.ts"));
	assert.ok(ext.includes("panels.ts"));
});
