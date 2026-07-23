// @ts-nocheck

/**
 * Visage startup page for pi-visage.
 *
 * Loaded by extensions/startup-ui.ts from package pages/.
 * No import statements — helpers come from the `ui` argument.
 *
 * Mascot: simple slime blob (easy to read in TUI) + short working faces.
 * Layout inspired by my-pi centered brand splash.
 */

const TEAL = [94, 234, 212];
const TEAL_SOFT = [45, 212, 191];
const VIOLET = [196, 181, 253];
const CREAM = [255, 232, 224];
const CREAM_SOFT = [245, 208, 197];
const PINK = [251, 182, 206];
/** Face highlights — bright so eyes/mouth don’t read as black blobs. */
const EYE_BRIGHT = [255, 255, 255];
const EYE_GLOW = [186, 230, 253]; // soft sky
const MOUTH_BRIGHT = [255, 200, 170]; // peach
const MOUTH_GLOW = [253, 186, 216]; // light pink

/** Soft teal/violet wash for brand + slime body. */
const SLIME_PALETTE = [TEAL_SOFT, TEAL, VIOLET, PINK, TEAL_SOFT];

const VISAGE_THEME = "visage-dark";
const NORMAL_THEME = "dark";

const TIPS = [
	"density: /visage density compact",
	"theme:   /visage theme rose",
	"doctor:  /visage doctor",
	"chrome:  /visage show",
	"pages:   /setStartUI",
	"model:   /model",
];

/**
 * Place glyphs on a fixed-width row (guarantees no ragged lines).
 * pieces: [startCol, text]
 */
function placeRow(width, pieces) {
	const cells = Array(width).fill(" ");
	for (const [col, text] of pieces) {
		for (let i = 0; i < text.length; i++) {
			const at = col + i;
			if (at >= 0 && at < width) cells[at] = text[i];
		}
	}
	return cells.join("");
}

/**
 * BIG slime — larger squat dome (user scale-up).
 * Body = █ / rim = ▄▀ ; expression only = ▀▀ eyes + ▄▀▄ cat mouth.
 *
 *                      ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 *                  ▄████████████████████████████▄
 *                ████████████████████████████████
 *               ██████████████████████████████████
 *              ████████████████████████████████████
 *             ██████████████████████████████████████
 *             █████████████▀▀██████▀▀███████████████
 *             ███████████████▄▄▄▄███████████████████   ← mouth all ▄ (no ▀ mix = no black holes)
 *              ████████████████████████████████████
 *               ▀████████████████████████████████▀
 *                  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
 */
const SLIME_LOGO_WIDTH = 60;
const SLIME_LOGO_LINES = (() => {
	const W = SLIME_LOGO_WIDTH;
	// Max body 36 cells @ col 11
	// Marker glyphs for paint detection: eyes use ▀, mouth uses only ▄ (never mix on one cell row)
	const lines = [
		placeRow(W, [[20, "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄"]]), // 20
		placeRow(W, [[15, "▄████████████████████████████▄"]]), // 30
		placeRow(W, [[13, "████████████████████████████████"]]), // 32
		placeRow(W, [[12, "██████████████████████████████████"]]), // 34
		placeRow(W, [[11, "████████████████████████████████████"]]), // 36
		placeRow(W, [[11, "████████████████████████████████████"]]), // 36 cheek
		// eyes: ▀▀ · ▀▀ only (upper half — same glyph, no black gap)
		placeRow(W, [[11, "█████████████▀▀██████▀▀█████████████"]]), // 36
		// mouth: solid ▄▄▄▄ smile (lower half only — evenly filled, bright)
		placeRow(W, [[11, "███████████████▄▄▄▄█████████████████"]]), // 36
		placeRow(W, [[12, "██████████████████████████████████"]]), // 34
		placeRow(W, [[13, "▀████████████████████████████████▀"]]), // 32
		placeRow(W, [[17, "▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀"]]), // 26
	];
	for (const line of lines) {
		if (line.length !== W) throw new Error(`slime logo width ${line.length}`);
	}
	if (!lines[6].includes("▀▀") || !lines[7].includes("▄▄")) {
		throw new Error("slime face pixels missing");
	}
	return lines;
})();

/** Medium slime — same proportions; mouth = solid ▄ only. */
const SLIME_MED_WIDTH = 40;
const SLIME_MED_LINES = (() => {
	const W = SLIME_MED_WIDTH;
	const lines = [
		placeRow(W, [[10, "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄"]]), // 20
		placeRow(W, [[7, "▄████████████████████████▄"]]), // 26
		placeRow(W, [[6, "██████████████████████████"]]), // 26
		placeRow(W, [[5, "████████████████████████████"]]), // 28
		placeRow(W, [[5, "████████████████████████████"]]), // 28
		// eyes ▀▀ · ▀▀
		placeRow(W, [[5, "██████████▀▀████▀▀██████████"]]), // 28
		// mouth solid ▄▄▄▄
		placeRow(W, [[5, "████████████▄▄▄▄████████████"]]), // 28
		placeRow(W, [[6, "▀████████████████████████▀"]]), // 26
		placeRow(W, [[9, "▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀"]]), // 22
	];
	for (const line of lines) {
		if (line.length !== W) throw new Error(`slime med width ${line.length}`);
	}
	return lines;
})();

/**
 * Working-indicator — mini block face (still short for "Working...").
 */
const SLIME_WORK_FRAMES = ["[▀▀]", "[▄▄]", "[▀▀]", "[▄▄▄]", "[──]", "[▀▀]"];

function switchPiTheme(ctx, themeName) {
	if (ctx.mode !== "tui" || !ctx.hasUI) return;
	const result = ctx.ui.setTheme(themeName);
	if (result && !result.success) {
		ctx.ui.notify(
			[
				`Theme switch failed: ${themeName}`,
				result.error ?? "unknown error",
			].join("\n"),
			"error",
		);
	}
}

function providerModel(model) {
	const provider = (model?.provider || "").trim();
	const id = (model?.id || "").trim();
	if (provider && id) return `${provider}/${id}`;
	if (id) return id;
	if (provider) return provider;
	return "no-model";
}

function pickTip() {
	const day = Math.floor(Date.now() / 86_400_000);
	return TIPS[day % TIPS.length];
}

function contextLabel(ui, ctx) {
	try {
		const usage = ui.getContextUsage?.(ctx);
		const percent = usage?.percent;
		if (
			typeof percent !== "number" ||
			!Number.isFinite(percent) ||
			percent <= 0
		) {
			return null;
		}
		const pct = percent < 10 ? percent.toFixed(1) : `${Math.round(percent)}`;
		return `${pct}%`;
	} catch {
		return null;
	}
}

function mix(a, b, t) {
	return Math.round(a + (b - a) * t);
}

function sampleGradient(position, palette) {
	const wrapped = ((position % 1) + 1) % 1;
	const scaled = wrapped * palette.length;
	const index = Math.floor(scaled);
	const next = (index + 1) % palette.length;
	const t = scaled - index;
	const a = palette[index];
	const b = palette[next];
	return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function gradientText(ui, text, phase, palette) {
	const chars = [...text];
	const span = Math.max(chars.length - 1, 1);
	return chars
		.map((ch, i) => {
			if (ch === " ") return ch;
			const rgb = sampleGradient(i / span + phase, palette);
			return ui.rgbText(rgb, ch);
		})
		.join("");
}

function centerLine(ui, line, width) {
	if (typeof ui.centerAnsi === "function") {
		return ui.centerAnsi(line, width);
	}
	const clipped =
		ui.visibleWidth(line) > width ? ui.truncateToWidth(line, width, "") : line;
	const pad = Math.max(0, Math.floor((width - ui.visibleWidth(clipped)) / 2));
	return `${" ".repeat(pad)}${clipped}`;
}

/**
 * Paint big pixel slime (face is also ▄/▀).
 *
 * Mouth uses only ▄▄▄▄ (same half) so the empty half of a ▀ cell never
 * shows terminal black next to an ▄ cell. Eyes use only ▀▀.
 *
 * Indent is fixed from logoWidth so the sprite never drifts line-to-line.
 */
function renderSlimeLogo(ui, lines, logoWidth, width, phaseStep = 0.05) {
	const blockWidth = Math.min(logoWidth, Math.max(1, width));
	const indent = Math.max(0, Math.floor((width - blockWidth) / 2));
	const pad = " ".repeat(indent);

	return lines.map((line, row) => {
		const padded =
			line.length >= logoWidth
				? line.slice(0, logoWidth)
				: line.padEnd(logoWidth);
		const plain =
			padded.length > blockWidth ? padded.slice(0, blockWidth) : padded;

		// Eyes: body █ with ▀ lids. Mouth: body █ with ▄▄ smile (no ▀ on mouth row).
		const isEyeLine = plain.includes("█▀▀") || plain.includes("▀▀█");
		const isMouthLine =
			plain.includes("█▄▄") && !plain.includes("▀") && /▄{2,}/.test(plain);
		const chars = [...plain];
		const span = Math.max(chars.length - 1, 1);

		const painted = chars
			.map((ch, i) => {
				if (ch === " ") return ch;

				// Eyes — bright white / sky, even fill
				if (isEyeLine && ch === "▀") {
					return ui.rgbText(EYE_BRIGHT, ch);
				}

				// Mouth — solid peach band (every ▄ same color → no dark cell)
				if (isMouthLine && ch === "▄") {
					return ui.rgbText(MOUTH_BRIGHT, ch);
				}

				// Dome / base rims
				if (ch === "▀" || ch === "▄") {
					return ui.rgbText(CREAM, ch);
				}

				if (ch === "█") {
					const rgb = sampleGradient(i / span + row * phaseStep, SLIME_PALETTE);
					return ui.rgbText(rgb, ch);
				}

				const rgb = sampleGradient(i / span + row * phaseStep, SLIME_PALETTE);
				return ui.rgbText(rgb, ch);
			})
			.join("");

		return ui.truncateToWidth(pad + painted, width, "");
	});
}

function createFrame({ width, ui, content, title, footer, maxWidth = 96 }) {
	const edge = (value) => ui.rgbText(TEAL, value);
	const frameWidth = Math.max(40, Math.min(maxWidth, width));
	const innerWidth = frameWidth - 2;
	const titleText = title ? ` ${title} ` : "";
	const topRemainder = Math.max(0, frameWidth - 2 - ui.visibleWidth(titleText));

	const top = titleText
		? [edge("╭"), titleText, edge("─".repeat(topRemainder)), edge("╮")].join("")
		: edge(`╭${"─".repeat(innerWidth)}╮`);

	const body = content.map((line) =>
		[edge("│"), ui.padRightAnsi(line, innerWidth), edge("│")].join(""),
	);

	let bottom;
	if (footer) {
		const footerText = ` ${footer} `;
		const available = Math.max(0, frameWidth - 2 - ui.visibleWidth(footerText));
		const left = Math.floor(available / 2);
		const right = available - left;
		bottom = [
			edge("╰"),
			edge("─".repeat(left)),
			footerText,
			edge("─".repeat(right)),
			edge("╯"),
		].join("");
	} else {
		bottom = edge(`╰${"─".repeat(innerWidth)}╯`);
	}

	const indent = " ".repeat(Math.max(0, Math.floor((width - frameWidth) / 2)));
	return [top, ...body, bottom].map((line) =>
		ui.truncateToWidth(indent + line, width, ""),
	);
}

function cmdsRow(theme, ui, accent, soft) {
	const muted = (v) => theme.fg("muted", v);
	return [
		muted("cmds  "),
		accent("/model"),
		muted("  "),
		soft("/visage"),
		muted("  "),
		accent("/setStartUI"),
	].join("");
}

function splashMeta(pi, ctx, theme, ui) {
	const model = ui.getModel(ctx);
	const thinking = ui.getThinking(pi);
	const pm = providerModel(model);
	const branch =
		typeof ui.getGitBranch === "function" ? ui.getGitBranch(ctx.cwd) : null;
	const themeName =
		typeof ui.getThemeName === "function"
			? ui.getThemeName(theme, ctx)
			: theme?.name || VISAGE_THEME;
	const ctxPct = contextLabel(ui, ctx);
	const tip = pickTip();

	return { pm, thinking, branch, themeName, ctxPct, tip };
}

export default {
	id: "visage",
	label: "Visage",
	description: "Visage slime startup skin for Pi",
	order: 10,
	title: "Visage · PI",

	onActivate({ ctx }) {
		switchPiTheme(ctx, VISAGE_THEME);
	},

	onDeactivate({ ctx }) {
		switchPiTheme(ctx, NORMAL_THEME);
	},

	/** Full splash — centered slime + meta (my-pi style open header). */
	renderFull({ pi, ctx, theme, width, ui }) {
		const accent = (value) => ui.rgbText(TEAL, value);
		const soft = (value) => ui.rgbText(TEAL_SOFT, value);
		const muted = (value) => theme.fg("muted", value);
		const { pm, thinking, branch, themeName, ctxPct, tip } = splashMeta(
			pi,
			ctx,
			theme,
			ui,
		);

		if (width < 36) {
			return this.renderTiny({ pi, ctx, theme, width, ui });
		}

		const brand = centerLine(
			ui,
			gradientText(ui, `Visage · PI v${ui.VERSION}`, 0.12, SLIME_PALETTE),
			width,
		);

		const subtitleBits = [pm, thinking].filter(Boolean).join(" · ");
		const subtitle = centerLine(
			ui,
			gradientText(ui, subtitleBits, 0.18, [TEAL_SOFT, TEAL, VIOLET]),
			width,
		);

		const cwdShort = ui.shortenPath(
			ctx.cwd,
			Math.min(42, Math.max(16, width - 20)),
		);
		const metaParts = [cwdShort, themeName];
		if (branch) metaParts.push(branch);
		if (ctxPct) metaParts.push(`ctx ${ctxPct}`);
		const meta = centerLine(ui, muted(metaParts.join(" · ")), width);

		const cmds = centerLine(ui, cmdsRow(theme, ui, accent, soft), width);
		const tipLine = centerLine(
			ui,
			[muted("tip  "), theme.fg("dim", tip)].join(""),
			width,
		);

		const logo = renderSlimeLogo(
			ui,
			SLIME_LOGO_LINES,
			SLIME_LOGO_WIDTH,
			width,
			0.06,
		);

		return ["", brand, ...logo, "", subtitle, meta, "", cmds, tipLine, ""].map(
			(line) => ui.truncateToWidth(line, width, ""),
		);
	},

	/** Compact: framed medium slime. */
	renderCompact({ pi, ctx, theme, width, ui }) {
		const accent = (value) => ui.rgbText(TEAL, value);
		const soft = (value) => ui.rgbText(TEAL_SOFT, value);
		const muted = (value) => theme.fg("muted", value);
		const { pm, thinking, branch, themeName, tip } = splashMeta(
			pi,
			ctx,
			theme,
			ui,
		);

		const frameWidth = Math.min(84, Math.max(40, width));
		const inner = frameWidth - 2;

		const logo = renderSlimeLogo(
			ui,
			SLIME_MED_LINES,
			SLIME_MED_WIDTH,
			inner,
			0.08,
		);

		const info = [
			centerLine(ui, soft("Visage") + muted("  pi ui skin"), inner),
			centerLine(ui, [muted("model "), accent(pm)].join(""), inner),
			centerLine(
				ui,
				[
					muted("thinking "),
					soft(thinking),
					muted(" · "),
					soft(themeName),
					branch ? muted(" · ") + theme.fg("accent", branch) : "",
				].join(""),
				inner,
			),
			centerLine(ui, theme.fg("dim", ui.shortenPath(ctx.cwd, 40)), inner),
			"",
			centerLine(ui, cmdsRow(theme, ui, accent, soft), inner),
			centerLine(ui, [muted("tip  "), theme.fg("dim", tip)].join(""), inner),
		];

		return createFrame({
			width,
			ui,
			maxWidth: 84,
			content: ["", ...logo, "", ...info, ""],
			title: [accent("Visage"), theme.fg("dim", ` · PI v${ui.VERSION}`)].join(
				"",
			),
			footer: theme.fg("dim", "pi-visage"),
		});
	},

	renderTiny({ pi, ctx, theme, width, ui }) {
		const model = ui.getModel(ctx);
		const pm = providerModel(model);
		const accent = (value) => ui.rgbText(TEAL, value);
		const soft = (value) => ui.rgbText(TEAL_SOFT, value);
		const slime = (value) => ui.rgbText(TEAL_SOFT, value);
		const branch =
			typeof ui.getGitBranch === "function" ? ui.getGitBranch(ctx.cwd) : null;

		return [
			ui.truncateToWidth(
				[
					slime("[▀▀] "),
					accent("Visage"),
					theme.fg("dim", ` · v${ui.VERSION}`),
				].join(""),
				width,
				"",
			),
			ui.truncateToWidth(
				[
					theme.fg("muted", "model "),
					accent(pm),
					theme.fg("muted", " · "),
					soft(ui.getThinking(pi)),
					branch ? theme.fg("muted", " · ") + theme.fg("accent", branch) : "",
				].join(""),
				width,
				"",
			),
			ui.truncateToWidth(
				[
					theme.fg("muted", "cmds "),
					accent("/model"),
					theme.fg("muted", " "),
					soft("/visage"),
					theme.fg("muted", " "),
					accent("/setStartUI"),
				].join(""),
				width,
				"",
			),
		];
	},

	/** Bounce-y slime face while working. */
	workingIndicator({ ui }) {
		const paint = (frame, index) => {
			const palette = [TEAL_SOFT, TEAL, VIOLET, PINK, TEAL, VIOLET];
			return ui.rgbText(palette[index % palette.length], frame) + " ";
		};

		return {
			frames: SLIME_WORK_FRAMES.map((frame, i) => paint(frame, i)),
			intervalMs: 140,
		};
	},
};
