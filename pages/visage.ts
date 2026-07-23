// @ts-nocheck

/**
 * Visage startup page for pi-visage.
 *
 * Loaded by extensions/startup-ui.ts from package pages/.
 * No import statements — helpers come from the `ui` argument.
 */

const TEAL = [94, 234, 212];
const TEAL_SOFT = [45, 212, 191];
const VIOLET = [196, 181, 253];

const VISAGE_THEME = "visage-dark";
const NORMAL_THEME = "dark";

const TIPS = [
  "density: /visage density compact",
  "theme:   /visage theme light",
  "chrome:  /visage show",
  "pages:   /setStartUI",
  "model:   /model",
];

function switchPiTheme(ctx, themeName) {
  if (ctx.mode !== "tui" || !ctx.hasUI) return;
  const result = ctx.ui.setTheme(themeName);
  if (result && !result.success) {
    ctx.ui.notify(
      [`Theme switch failed: ${themeName}`, result.error ?? "unknown error"].join("\n"),
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
  // Stable-ish per day so splash doesn't flicker every render
  const day = Math.floor(Date.now() / 86_400_000);
  return TIPS[day % TIPS.length];
}

function contextLabel(ui, ctx) {
  try {
    const usage = ui.getContextUsage?.(ctx);
    const percent = usage?.percent;
    if (typeof percent !== "number" || !Number.isFinite(percent) || percent <= 0) {
      return null;
    }
    const pct = percent < 10 ? percent.toFixed(1) : `${Math.round(percent)}`;
    return `${pct}%`;
  } catch {
    return null;
  }
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
  return [top, ...body, bottom].map((line) => ui.truncateToWidth(indent + line, width, ""));
}

function renderColumns({ width, ui, leftRows, rightRows, title, footer }) {
  const frameWidth = Math.max(40, Math.min(96, width));
  const innerWidth = frameWidth - 2;
  const gap = 4;
  const leftWidth = Math.min(18, Math.floor(innerWidth * 0.32));
  const rightWidth = Math.max(16, innerWidth - leftWidth - gap);
  const rowCount = Math.max(leftRows.length, rightRows.length);
  const rows = [];

  for (let index = 0; index < rowCount; index++) {
    rows.push(
      [
        ui.padRightAnsi(leftRows[index] ?? "", leftWidth, ""),
        " ".repeat(gap),
        ui.truncateToWidth(rightRows[index] ?? "", rightWidth, ""),
      ].join(""),
    );
  }

  return createFrame({
    width,
    ui,
    content: ["", ...rows, ""],
    title,
    footer,
  });
}

function faceRows(ui) {
  const t = (v) => ui.rgbText(TEAL, v);
  const s = (v) => ui.rgbText(TEAL_SOFT, v);
  const v = (v) => ui.rgbText(VIOLET, v);

  return [
    t("   ╭─────╮"),
    t("  ╱ ") + s("•") + t("   ") + s("•") + t(" ╲"),
    t(" │   ") + v("─") + t("   │"),
    t("  ╲ ") + s("╰───╯") + t(" ╱"),
    t("   ╰─────╯"),
  ];
}

function labelValue(theme, ui, label, value, valueColor) {
  const muted = (v) => theme.fg("muted", v);
  const paint = valueColor || ((v) => ui.rgbText(TEAL, v));
  return [muted(label.padEnd(10)), paint(value)].join("");
}

function cmdsRow(theme, ui, accent, soft) {
  const muted = (v) => theme.fg("muted", v);
  // Useful discoverability: chrome + model + page picker
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
  description: "Visage startup skin for Pi",
  order: 10,
  title: "Visage · PI",

  onActivate({ ctx }) {
    switchPiTheme(ctx, VISAGE_THEME);
  },

  onDeactivate({ ctx }) {
    switchPiTheme(ctx, NORMAL_THEME);
  },

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

    const infoRows = [
      soft("Visage") + muted("  pi ui skin"),
      "",
      labelValue(theme, ui, "model", pm, accent),
      labelValue(theme, ui, "thinking", thinking, soft),
      labelValue(theme, ui, "cwd", ui.shortenPath(ctx.cwd, 42), (v) =>
        theme.fg("dim", v),
      ),
      labelValue(theme, ui, "theme", themeName, soft),
    ];

    if (branch) {
      infoRows.push(
        labelValue(theme, ui, "branch", branch, (v) => theme.fg("accent", v)),
      );
    }
    if (ctxPct) {
      infoRows.push(
        labelValue(theme, ui, "context", ctxPct, (v) => theme.fg("dim", v)),
      );
    }

    infoRows.push("");
    infoRows.push(cmdsRow(theme, ui, accent, soft));
    infoRows.push([muted("tip   "), theme.fg("dim", tip)].join(""));

    // Face column is 5 rows; pad so face still aligns with model block
    const left = faceRows(ui);
    while (left.length < infoRows.length) left.push("");

    return renderColumns({
      width,
      ui,
      leftRows: left,
      rightRows: infoRows,
      title: [accent("Visage"), theme.fg("dim", ` · PI v${ui.VERSION}`)].join(""),
      footer: theme.fg("dim", "pi-visage"),
    });
  },

  renderCompact({ pi, ctx, theme, width, ui }) {
    const accent = (value) => ui.rgbText(TEAL, value);
    const soft = (value) => ui.rgbText(TEAL_SOFT, value);
    const muted = (value) => theme.fg("muted", value);
    const { pm, thinking, branch, themeName, tip } = splashMeta(pi, ctx, theme, ui);

    const content = [
      "",
      [soft("◉ "), accent("Visage"), theme.fg("dim", ` · PI v${ui.VERSION}`)].join(""),
      [muted("model    "), accent(pm)].join(""),
      [muted("thinking "), soft(thinking)].join(""),
      [muted("cwd      "), theme.fg("dim", ui.shortenPath(ctx.cwd, 48))].join(""),
      [
        muted("theme    "),
        soft(themeName),
        branch ? muted(" · ") + theme.fg("accent", branch) : "",
      ].join(""),
      "",
      cmdsRow(theme, ui, accent, soft),
      [muted("tip      "), theme.fg("dim", tip)].join(""),
      "",
    ];

    return createFrame({
      width,
      ui,
      maxWidth: 72,
      content,
      title: accent("Visage"),
      footer: theme.fg("dim", "pi-visage"),
    });
  },

  renderTiny({ pi, ctx, theme, width, ui }) {
    const model = ui.getModel(ctx);
    const pm = providerModel(model);
    const accent = (value) => ui.rgbText(TEAL, value);
    const soft = (value) => ui.rgbText(TEAL_SOFT, value);
    const branch =
      typeof ui.getGitBranch === "function" ? ui.getGitBranch(ctx.cwd) : null;

    return [
      ui.truncateToWidth(
        [soft("◉ "), accent("Visage"), theme.fg("dim", ` · v${ui.VERSION}`)].join(""),
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

  workingIndicator({ ui }) {
    const accent = (value) => ui.rgbText(TEAL, value);
    const soft = (value) => ui.rgbText(TEAL_SOFT, value);
    const violet = (value) => ui.rgbText(VIOLET, value);

    return {
      frames: [
        accent("◉") + " ",
        soft("◎") + " ",
        violet("●") + " ",
        soft("◎") + " ",
        accent("◉") + " ",
        soft("○") + " ",
      ],
      intervalMs: 110,
    };
  },
};
