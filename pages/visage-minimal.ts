// @ts-nocheck

/**
 * Minimal Visage startup page — one-line brand + meta.
 * Discoverable via /setStartUI (id: visage-minimal).
 */

const TEAL = [94, 234, 212];
const TEAL_SOFT = [45, 212, 191];
const VIOLET = [196, 181, 253];

const VISAGE_THEME = "visage-dark";
const NORMAL_THEME = "dark";

function switchPiTheme(ctx, themeName) {
  if (ctx.mode !== "tui" || !ctx.hasUI) return;
  const result = ctx.ui.setTheme(themeName);
  if (result && !result.success && typeof ctx.ui.notify === "function") {
    ctx.ui.notify(result.error ?? `Theme ${themeName} failed`, "warning");
  }
}

function providerModel(model) {
  if (!model) return "—";
  const id = model.id || model.name || "";
  const provider = model.provider || "";
  if (provider && id) return `${provider}/${id}`;
  return id || provider || "—";
}

export default {
  id: "visage-minimal",
  label: "Visage Minimal",
  description: "Compact one-line Visage startup (no full slime art)",
  order: 20,
  title: "Visage · minimal",

  onActivate({ ctx }) {
    switchPiTheme(ctx, VISAGE_THEME);
  },

  onDeactivate({ ctx }) {
    switchPiTheme(ctx, NORMAL_THEME);
  },

  renderFull({ pi, ctx, theme, width, ui }) {
    return this.renderCompact({ pi, ctx, theme, width, ui });
  },

  renderCompact({ pi, ctx, theme, width, ui }) {
    const accent = (v) => ui.rgbText(TEAL, v);
    const soft = (v) => ui.rgbText(TEAL_SOFT, v);
    const muted = (v) => theme.fg("muted", v);
    const model = ui.getModel(ctx);
    const pm = providerModel(model);
    const thinking = ui.getThinking(pi);
    const branch =
      typeof ui.getGitBranch === "function" ? ui.getGitBranch(ctx.cwd) : null;
    const themeName =
      typeof ui.getThemeName === "function"
        ? ui.getThemeName(theme, ctx)
        : theme?.name || VISAGE_THEME;
    const cwd = ui.shortenPath(ctx.cwd, Math.min(36, Math.max(12, width - 28)));

    const line1 = ui.truncateToWidth(
      [
        soft("· "),
        accent("Visage"),
        muted(" minimal"),
        theme.fg("dim", ` · v${ui.VERSION}`),
      ].join(""),
      width,
      "",
    );

    const bits = [pm, thinking, themeName, cwd];
    if (branch) bits.push(branch);
    const line2 = ui.truncateToWidth(
      muted(bits.filter(Boolean).join(" · ")),
      width,
      "",
    );

    const cmds = ui.truncateToWidth(
      [
        muted("cmds "),
        accent("/model"),
        muted(" · "),
        soft("/visage"),
        muted(" · "),
        soft("/setStartUI"),
      ].join(""),
      width,
      "",
    );

    return ["", line1, line2, cmds, ""];
  },

  renderTiny({ pi, ctx, theme, width, ui }) {
    const accent = (v) => ui.rgbText(TEAL, v);
    const soft = (v) => ui.rgbText(TEAL_SOFT, v);
    const model = ui.getModel(ctx);
    const pm = providerModel(model);
    return [
      ui.truncateToWidth(
        [soft("· "), accent("Visage"), theme.fg("dim", ` · ${pm}`)].join(""),
        width,
        "",
      ),
    ];
  },

  workingIndicator({ ui }) {
    const frames = ["·", "✦", "·", "✧"].map((f, i) => {
      const palette = [TEAL_SOFT, TEAL, VIOLET, TEAL];
      return ui.rgbText(palette[i % palette.length], f) + " ";
    });
    return { frames, intervalMs: 120 };
  },
};
