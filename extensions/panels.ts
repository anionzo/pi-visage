/**
 * Visage status panels — Git / Info / Session / System below the editor.
 * Ported from anionzo/pi-status-panels into the Visage package surface.
 *
 * Config: ~/.pi/agent/visage.json → key `panels` (shared with skin chrome).
 * Commands: /sp, /status-panels, /visage panels (via skin hand-off text).
 * Widget id: pi-visage-panels · placement: belowEditor
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
	Key,
	type SettingItem,
	SettingsList,
	truncateToWidth,
} from "@earendil-works/pi-tui";

import { formatThinkingLevel } from "../lib/chrome-helpers.ts";
import {
	COLOR_NAMES,
	type ColorName,
	maxVisibleWidth,
	setBorderColor,
	setTextColor,
	visibleWidth,
} from "../lib/panels/colors.ts";
import {
	createPanelState,
	loadPanelsConfig,
	PANEL_DEFS,
	type PanelId,
	savePanelsConfig,
} from "../lib/panels/config.ts";
import { framePanelBody } from "../lib/panels/frame.ts";
import { EMPTY_GIT_STATE, type GitInfo } from "../lib/panels/git.ts";
import type { InfoSnapshot } from "../lib/panels/info.ts";
import { buildAllPanels } from "../lib/panels/layout.ts";
import type { SessionSnapshot } from "../lib/panels/session.ts";
import {
	readSystemStats,
	type SystemSnapshot,
} from "../lib/panels/system.ts";

const WIDGET_ID = "pi-visage-panels";
const REFRESH_MS = 5000;
const TICK_MS = 1000;
const SETTINGS_OVERLAY_MAX_INNER = 62;

function computeSettingsOverlayInner(
	bodyLines: string[],
	availableWidth: number,
): number {
	const maxInner = Math.max(
		24,
		Math.min(availableWidth - 2, SETTINGS_OVERLAY_MAX_INNER),
	);
	return Math.max(
		24,
		Math.min(
			maxInner,
			Math.max(maxVisibleWidth(bodyLines), visibleWidth("─ VISAGE PANELS ")) +
				2,
		),
	);
}

function parseCount(raw: string): { behind: number; ahead: number } {
	const [behindRaw, aheadRaw] = raw.trim().split(/\s+/);
	return {
		behind: Number.parseInt(behindRaw || "0", 10) || 0,
		ahead: Number.parseInt(aheadRaw || "0", 10) || 0,
	};
}

export default function visagePanels(pi: ExtensionAPI) {
	let ctxRef: ExtensionContext | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let config = loadPanelsConfig();
	let lastGitRefreshAt = 0;

	let turnStartAt = 0;
	let turnDurations: number[] = [];
	let lastTurnOutputTokens = 0;
	let tokensPerSec = 0;

	let warnedAt80 = false;
	let warnedAt90 = false;

	let gitState: GitInfo = EMPTY_GIT_STATE;

	let systemState: SystemSnapshot = {
		cpuPercent: 0,
		ramUsedGB: 0,
		ramTotalGB: 0,
		ramPercent: 0,
		gpuName: null,
		gpuPercent: null,
		gpuMemUsedMB: null,
		gpuMemTotalMB: null,
	};

	let infoState: InfoSnapshot = {
		percent: null,
		tokens: null,
		contextWindow: 0,
		modelText: "(no model)",
		modelLabel: "model",
		inputTokens: 0,
		outputTokens: 0,
		thinkingTokens: 0,
		cacheRead: 0,
		totalCost: 0,
		turnCount: 0,
	};

	let sessionState: SessionSnapshot = {
		startedAt: Date.now(),
		elapsed: 0,
		turnCount: 0,
		avgTurnDuration: 0,
		tokensPerSec: 0,
	};

	function isPanelEnabled(panelId: PanelId): boolean {
		return config.panels[panelId];
	}

	function checkboxValue(enabled: boolean): string {
		return enabled ? "[x]" : "[ ]";
	}

	function persistConfig(ctx?: ExtensionContext): boolean {
		const ok = savePanelsConfig(config);
		if (!ok && ctx?.hasUI) {
			ctx.ui.notify("Failed to save Visage panels preferences", "error");
		}
		return ok;
	}

	function applyConfig(ctx?: ExtensionContext) {
		if (ctx) ctxRef = ctx;
		setBorderColor(config.borderColor);
		setTextColor(config.textColor);
		if (!config.enabled) {
			stop();
			return;
		}
		stop();
		start();
	}

	function setMasterEnabled(nextEnabled: boolean, ctx?: ExtensionContext) {
		config = {
			enabled: nextEnabled,
			panels: createPanelState(nextEnabled),
			borderColor: config.borderColor,
			textColor: config.textColor,
		};
		persistConfig(ctx);
		applyConfig(ctx);
	}

	function setPanelEnabled(
		panelId: PanelId,
		nextEnabled: boolean,
		ctx?: ExtensionContext,
	) {
		config = {
			...config,
			panels: {
				...config.panels,
				[panelId]: nextEnabled,
			},
		};
		persistConfig(ctx);
		applyConfig(ctx);
	}

	function setBorderColorConfig(color: ColorName, ctx?: ExtensionContext) {
		config = { ...config, borderColor: color };
		setBorderColor(color);
		persistConfig(ctx);
		renderPanels();
	}

	function setTextColorConfig(color: ColorName, ctx?: ExtensionContext) {
		config = { ...config, textColor: color };
		setTextColor(color);
		persistConfig(ctx);
		renderPanels();
	}

	async function runGit(args: string[]): Promise<string | undefined> {
		try {
			const result = await pi.exec("git", args, { timeout: 2000 });
			if (result.code !== 0) return undefined;
			const value = result.stdout.trim();
			return value || undefined;
		} catch {
			return undefined;
		}
	}

	async function parseDiffStats(
		extra: string[] = [],
	): Promise<{ insertions: number; deletions: number; files: number }> {
		const raw = await runGit(["diff", ...extra, "--shortstat"]);
		if (!raw) return { insertions: 0, deletions: 0, files: 0 };
		const filesMatch = raw.match(/(\d+) file/);
		const insMatch = raw.match(/(\d+) insertion/);
		const delMatch = raw.match(/(\d+) deletion/);
		return {
			insertions: insMatch ? Number.parseInt(insMatch[1]!, 10) : 0,
			deletions: delMatch ? Number.parseInt(delMatch[1]!, 10) : 0,
			files: filesMatch ? Number.parseInt(filesMatch[1]!, 10) : 0,
		};
	}

	async function countUntracked(): Promise<number> {
		const raw = await runGit(["ls-files", "--others", "--exclude-standard"]);
		if (!raw) return 0;
		return raw.split("\n").filter(Boolean).length;
	}

	async function countStash(): Promise<number> {
		const raw = await runGit(["stash", "list"]);
		if (!raw) return 0;
		return raw.split("\n").filter(Boolean).length;
	}

	async function readGitInfo(): Promise<GitInfo> {
		const inside = await runGit(["rev-parse", "--is-inside-work-tree"]);
		if (inside !== "true") return EMPTY_GIT_STATE;

		const topLevel = (await runGit(["rev-parse", "--show-toplevel"])) || "-";
		const worktree = topLevel.split(/[/\\]/).filter(Boolean).pop() || topLevel;
		const branch =
			(await runGit(["branch", "--show-current"])) ||
			(await runGit(["rev-parse", "--short", "HEAD"])) ||
			"(detached)";

		const upstream = await runGit([
			"rev-parse",
			"--abbrev-ref",
			"--symbolic-full-name",
			"@{upstream}",
		]);

		const unstagedStats = await parseDiffStats([]);
		const stagedStats = await parseDiffStats(["--cached"]);
		const untrackedCount = await countUntracked();
		const stashCount = await countStash();

		if (!upstream) {
			return {
				inRepo: true,
				worktree,
				branch,
				tracking: "(no upstream)",
				ahead: 0,
				behind: 0,
				insertions: unstagedStats.insertions,
				deletions: unstagedStats.deletions,
				filesChanged: unstagedStats.files,
				stagedInsertions: stagedStats.insertions,
				stagedDeletions: stagedStats.deletions,
				stagedFiles: stagedStats.files,
				untrackedCount,
				stashCount,
			};
		}

		const countsRaw = await runGit([
			"rev-list",
			"--left-right",
			"--count",
			`${upstream}...HEAD`,
		]);
		const { behind, ahead } = parseCount(countsRaw || "0 0");

		return {
			inRepo: true,
			worktree,
			branch,
			tracking: upstream,
			ahead,
			behind,
			insertions: unstagedStats.insertions,
			deletions: unstagedStats.deletions,
			filesChanged: unstagedStats.files,
			stagedInsertions: stagedStats.insertions,
			stagedDeletions: stagedStats.deletions,
			stagedFiles: stagedStats.files,
			untrackedCount,
			stashCount,
		};
	}

	function readInfoState(ctx: ExtensionContext): InfoSnapshot {
		const usage = ctx.getContextUsage?.();
		const provider = (ctx as any).model?.provider || "model";
		const modelName =
			(ctx as any).model?.name || (ctx as any).model?.id || "(no model)";
		const thinking = formatThinkingLevel(pi.getThinkingLevel?.() ?? "off");
		const modelLabel = provider;
		const modelValue = `${modelName} · ${thinking}`;

		let inputTokens = 0;
		let outputTokens = 0;
		let thinkingTokens = 0;
		let cacheRead = 0;
		let totalCost = 0;

		try {
			const sm = ctx.sessionManager as any;
			const entries =
				typeof sm?.getEntries === "function"
					? sm.getEntries()
					: (sm?.getBranch?.() ?? []);
			for (const entry of entries) {
				if (entry?.type === "message" && entry.message?.role === "assistant") {
					const msg = entry.message as any;
					if (msg.usage) {
						inputTokens += msg.usage.input || 0;
						outputTokens += msg.usage.output || 0;
						thinkingTokens += msg.usage.thinkingOutput || msg.usage.thinking || 0;
						cacheRead += msg.usage.cacheRead || 0;
						if (msg.usage.cost) totalCost += msg.usage.cost.total || 0;
					}
				}
			}
		} catch {
			// Session may not be ready
		}

		return {
			percent: usage?.percent ?? null,
			tokens: usage?.tokens ?? null,
			contextWindow: usage?.contextWindow ?? 0,
			modelText: modelValue,
			modelLabel,
			inputTokens,
			outputTokens,
			thinkingTokens,
			cacheRead,
			totalCost,
			turnCount: sessionState.turnCount,
		};
	}

	function updateSessionElapsed() {
		const avgTurnDuration =
			turnDurations.length > 0
				? turnDurations.reduce((a, b) => a + b, 0) / turnDurations.length
				: 0;
		sessionState = {
			...sessionState,
			elapsed: Date.now() - sessionState.startedAt,
			avgTurnDuration,
			tokensPerSec,
		};
	}

	function renderPanels() {
		if (!config.enabled || !ctxRef?.hasUI) return;
		if (typeof ctxRef.ui.setWidget !== "function") return;

		ctxRef.ui.setWidget(
			WIDGET_ID,
			(_tui, _theme) => ({
				invalidate() {},
				render(width: number) {
					const safeWidth = Math.max(1, width);
					return buildAllPanels(
						{
							git: isPanelEnabled("git"),
							info: isPanelEnabled("info"),
							session: isPanelEnabled("session"),
							system: isPanelEnabled("system"),
						},
						{
							git: gitState,
							info: infoState,
							session: sessionState,
							system: systemState,
						},
						safeWidth,
					).map((line) => truncateToWidth(line, safeWidth));
				},
			}),
			{ placement: "belowEditor" },
		);
	}

	function checkContextWarning(ctx: ExtensionContext) {
		const percent = infoState.percent;
		if (percent == null || !ctx.hasUI) return;
		if (percent >= 90 && !warnedAt90) {
			warnedAt90 = true;
			ctx.ui.notify(
				`Context usage at ${Math.round(percent)}% — compaction imminent!`,
				"error",
			);
		} else if (percent >= 80 && !warnedAt80) {
			warnedAt80 = true;
			ctx.ui.notify(
				`Context usage at ${Math.round(percent)}% — consider compacting`,
				"warning",
			);
		}
	}

	async function refreshCore(force = false) {
		if (!ctxRef) return;
		const now = Date.now();
		if (!force && now - lastGitRefreshAt < REFRESH_MS) return;
		gitState = await readGitInfo();
		infoState = readInfoState(ctxRef);
		systemState = await readSystemStats(pi);
		lastGitRefreshAt = now;
		checkContextWarning(ctxRef);
	}

	async function tick(forceCore = false) {
		if (!config.enabled || !ctxRef?.hasUI) return;
		updateSessionElapsed();
		await refreshCore(forceCore);
		renderPanels();
	}

	function start() {
		if (!config.enabled || !ctxRef?.hasUI) return;
		if (timer) return;
		void tick(true);
		timer = setInterval(() => {
			void tick(false);
		}, TICK_MS);
	}

	function stop() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		if (ctxRef?.hasUI && typeof ctxRef.ui.setWidget === "function") {
			try {
				ctxRef.ui.setWidget(WIDGET_ID, undefined);
			} catch {
				// ignore teardown errors
			}
		}
	}

	async function showSettingsOverlay(ctx: ExtensionContext): Promise<void> {
		ctxRef = ctx;
		if (!ctx.hasUI) return;

		const items: SettingItem[] = [
			{
				id: "enabled",
				label: "Show all panels",
				description: "Master toggle — enable or disable every panel at once",
				currentValue: checkboxValue(config.enabled),
				values: ["[x]", "[ ]"],
			},
			...PANEL_DEFS.map((panel) => ({
				id: panel.id,
				label: `   ${panel.label}`,
				description: `Toggle the ${panel.label} panel`,
				currentValue: checkboxValue(isPanelEnabled(panel.id)),
				values: ["[x]", "[ ]"],
			})),
			{
				id: "borderColor",
				label: "Border color",
				description: "Color of panel frames",
				currentValue: config.borderColor,
				values: [...COLOR_NAMES],
			},
			{
				id: "textColor",
				label: "Text color",
				description: "Color of panel labels (bright + dim pair)",
				currentValue: config.textColor,
				values: [...COLOR_NAMES],
			},
		];

		const settingsTheme = getSettingsListTheme();
		const maxVisibleItems = Math.min(items.length + 2, 12);
		const probeList = new SettingsList(
			items,
			maxVisibleItems,
			settingsTheme,
			() => {},
			() => {},
			{ enableSearch: true },
		);
		const probeLines = probeList.render(
			Math.max(8, SETTINGS_OVERLAY_MAX_INNER - 2),
		);
		const overlayBodyLines = [
			"Toggle panels & customize appearance",
			"",
			...probeLines,
		];
		const overlayWidth =
			computeSettingsOverlayInner(
				overlayBodyLines,
				SETTINGS_OVERLAY_MAX_INNER + 2,
			) + 2;

		await ctx.ui.custom(
			(_tui, theme, _kb, done) => {
				const settingsList = new SettingsList(
					items,
					maxVisibleItems,
					settingsTheme,
					(id, newValue) => {
						if (id === "borderColor") {
							setBorderColorConfig(newValue as ColorName, ctx);
							return;
						}
						if (id === "textColor") {
							setTextColorConfig(newValue as ColorName, ctx);
							return;
						}
						const nextEnabled = newValue === "[x]";
						if (id === "enabled") {
							setMasterEnabled(nextEnabled, ctx);
							for (const panel of PANEL_DEFS) {
								settingsList.updateValue(panel.id, checkboxValue(nextEnabled));
							}
							return;
						}
						setPanelEnabled(id as PanelId, nextEnabled, ctx);
					},
					() => done(undefined),
					{ enableSearch: true },
				);

				return {
					render(width: number) {
						const safeWidth = Math.max(24, width);
						const provisionalInner = Math.max(
							24,
							Math.min(safeWidth - 2, SETTINGS_OVERLAY_MAX_INNER),
						);
						const listLines = settingsList.render(
							Math.max(8, provisionalInner - 2),
						);
						const bodyLines = [
							theme.fg("muted", "Toggle panels & customize appearance"),
							"",
							...listLines,
						];
						const naturalInner = computeSettingsOverlayInner(
							bodyLines,
							safeWidth,
						);
						return framePanelBody({
							title: "VISAGE PANELS",
							bodyLines,
							inner: naturalInner,
						}).lines;
					},
					invalidate() {
						settingsList.invalidate();
					},
					handleInput(data: string) {
						settingsList.handleInput?.(data);
					},
				};
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "top-center",
					width: "55%",
					minWidth: 48,
					margin: { top: 2, left: 2, right: 2 },
				},
			},
		);

		void overlayWidth;
	}

	const commandHandler = async (args: string, ctx: ExtensionContext) => {
		ctxRef = ctx;
		const mode = (args || "").trim().toLowerCase();

		if (mode === "" || mode === "settings") {
			await showSettingsOverlay(ctx);
			return;
		}

		if (!["on", "off"].includes(mode)) {
			if (ctx.hasUI) {
				ctx.ui.notify("Usage: /sp [on|off]  or open settings with /sp", "warning");
			}
			return;
		}

		const nextEnabled = mode === "on";
		setMasterEnabled(nextEnabled, ctx);
		if (ctx.hasUI) {
			ctx.ui.notify(
				nextEnabled ? "Visage panels visible" : "Visage panels hidden",
				"info",
			);
		}
	};

	pi.registerCommand("status-panels", {
		description: "Visage panels settings, or /status-panels [on|off]",
		handler: commandHandler as any,
	});

	pi.registerCommand("sp", {
		description: "Alias for status panels — open settings popup",
		handler: commandHandler as any,
	});

	pi.registerShortcut(Key.ctrlShift("p"), {
		description: "Toggle Visage panels settings",
		handler: async (ctx) => {
			await showSettingsOverlay(ctx);
		},
	});

	function resetSessionClock() {
		sessionState = {
			startedAt: Date.now(),
			elapsed: 0,
			turnCount: 0,
			avgTurnDuration: 0,
			tokensPerSec: 0,
		};
		turnDurations = [];
		tokensPerSec = 0;
		lastTurnOutputTokens = 0;
		warnedAt80 = false;
		warnedAt90 = false;
	}

	pi.on("session_start", async (_event, ctx) => {
		config = loadPanelsConfig();
		resetSessionClock();
		applyConfig(ctx);
	});

	pi.on("turn_start", async (_event, _ctx) => {
		turnStartAt = Date.now();
		lastTurnOutputTokens = infoState.outputTokens;
	});

	pi.on("turn_end", async (_event, ctx) => {
		ctxRef = ctx;
		if (turnStartAt > 0) {
			const duration = Date.now() - turnStartAt;
			if (duration > 0) {
				turnDurations.push(duration);
				const newInfo = readInfoState(ctx);
				const turnOutputTokens = newInfo.outputTokens - lastTurnOutputTokens;
				if (turnOutputTokens > 0 && duration > 0) {
					tokensPerSec = (turnOutputTokens / duration) * 1000;
				}
			}
			turnStartAt = 0;
		}
		sessionState = {
			...sessionState,
			turnCount: sessionState.turnCount + 1,
		};
		if (!config.enabled) return;
		void tick(true);
	});

	pi.on("model_select", async (_event, ctx) => {
		ctxRef = ctx;
		if (!config.enabled) return;
		infoState = readInfoState(ctx);
		renderPanels();
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctxRef = ctx;
		stop();
	});
}
