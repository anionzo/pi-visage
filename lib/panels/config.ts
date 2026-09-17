/**
 * Visage panels config — lives under visage.json key `panels`.
 * Read-modify-write only that key so skin chrome fields are preserved.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	COLOR_NAMES,
	type ColorName,
} from "./colors.ts";

export const VISAGE_CONFIG_PATH = path.join(
	os.homedir(),
	".pi",
	"agent",
	"visage.json",
);

/** Legacy standalone pi-status-panels config (one-time migrate). */
export const LEGACY_PANELS_CONFIG_PATH = path.join(
	os.homedir(),
	".pi",
	"agent",
	"state",
	"extensions",
	"status-panels",
	"config.json",
);

export const PANEL_DEFS = [
	{ id: "git", label: "Git", defaultEnabled: true },
	{ id: "info", label: "Info", defaultEnabled: true },
	{ id: "session", label: "Session", defaultEnabled: true },
	{ id: "system", label: "System", defaultEnabled: true },
] as const;

export type PanelId = (typeof PANEL_DEFS)[number]["id"];

export type PanelState = Record<PanelId, boolean>;

export type PanelsConfig = {
	enabled: boolean;
	panels: PanelState;
	borderColor: ColorName;
	textColor: ColorName;
};

export function createPanelState(enabled: boolean): PanelState {
	return PANEL_DEFS.reduce((acc, panel) => {
		acc[panel.id] = enabled;
		return acc;
	}, {} as PanelState);
}

export function createDefaultPanelsConfig(): PanelsConfig {
	return {
		enabled: true,
		panels: createPanelState(true),
		borderColor: "cyan",
		textColor: "green",
	};
}

function isColorName(v: unknown): v is ColorName {
	return typeof v === "string" && (COLOR_NAMES as string[]).includes(v);
}

/** Normalize raw JSON (visage.panels or legacy status-panels shape). */
export function normalizePanelsConfig(raw: unknown): PanelsConfig {
	const defaults = createDefaultPanelsConfig();
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return defaults;
	}

	const input = raw as {
		enabled?: unknown;
		panels?: Record<string, unknown>;
		// legacy flat keys: git/info/session/system as booleans at top? status-panels nests under panels
		borderColor?: unknown;
		textColor?: unknown;
		git?: unknown;
		info?: unknown;
		session?: unknown;
		system?: unknown;
	};

	const panels = { ...defaults.panels };

	// Nested panels object (status-panels + our shape)
	if (input.panels && typeof input.panels === "object") {
		for (const panel of PANEL_DEFS) {
			const value = input.panels[panel.id];
			if (typeof value === "boolean") panels[panel.id] = value;
		}
	}

	// Flat convenience keys (if someone wrote panels.git at top of panels blob)
	for (const panel of PANEL_DEFS) {
		const flat = input[panel.id];
		if (typeof flat === "boolean") panels[panel.id] = flat;
	}

	return {
		enabled:
			typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
		panels,
		borderColor: isColorName(input.borderColor)
			? input.borderColor
			: defaults.borderColor,
		textColor: isColorName(input.textColor)
			? input.textColor
			: defaults.textColor,
	};
}

function readJsonFile(filePath: string): unknown | null {
	try {
		if (!fs.existsSync(filePath)) return null;
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

/**
 * Load panels section from visage.json.
 * If missing, try one-time migrate from legacy status-panels config.
 */
export function loadPanelsConfig(): PanelsConfig {
	const root = readJsonFile(VISAGE_CONFIG_PATH);
	if (root && typeof root === "object" && !Array.isArray(root)) {
		const obj = root as Record<string, unknown>;
		if ("panels" in obj) {
			return normalizePanelsConfig(obj.panels);
		}
	}

	const legacy = readJsonFile(LEGACY_PANELS_CONFIG_PATH);
	if (legacy != null) {
		const migrated = normalizePanelsConfig(legacy);
		// Persist into visage.json without wiping chrome fields
		savePanelsConfig(migrated);
		return migrated;
	}

	return createDefaultPanelsConfig();
}

/** Merge panels into visage.json preserving footer/status/density/widget/etc. */
export function savePanelsConfig(config: PanelsConfig): boolean {
	try {
		const dir = path.dirname(VISAGE_CONFIG_PATH);
		fs.mkdirSync(dir, { recursive: true });

		let root: Record<string, unknown> = {};
		const existing = readJsonFile(VISAGE_CONFIG_PATH);
		if (existing && typeof existing === "object" && !Array.isArray(existing)) {
			root = { ...(existing as Record<string, unknown>) };
		}

		// Flatten to a clean stored shape
		root.panels = {
			enabled: config.enabled,
			git: config.panels.git,
			info: config.panels.info,
			session: config.panels.session,
			system: config.panels.system,
			borderColor: config.borderColor,
			textColor: config.textColor,
		};

		fs.writeFileSync(
			VISAGE_CONFIG_PATH,
			`${JSON.stringify(root, null, 2)}\n`,
			"utf8",
		);
		return true;
	} catch (err) {
		console.error(`Failed to save panels config to ${VISAGE_CONFIG_PATH}:`, err);
		return false;
	}
}

/** Whether panels master toggle is on (for skin widget coordination). */
export function isPanelsMasterEnabled(): boolean {
	return loadPanelsConfig().enabled;
}
