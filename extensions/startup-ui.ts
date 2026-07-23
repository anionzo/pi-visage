// @ts-nocheck

/**
 * Visage startup-ui adapter (pi-visage)
 *
 * Loaded by package.json:
 *   "pi": { "extensions": ["./extensions"] }
 *
 * Page discovery paths:
 *   - Package pages: <package>/pages/*.ts
 *   - User pages: ~/.pi/agent/extensions/startup-ui/*.ts
 *
 * This file only discovers, selects, persists, and applies startup UIs.
 * Each page is a separate .ts file under pages/ (or the user startup-ui folder).
 * After adding a page, run /setStartUI to rescan — no adapter edits needed.
 * Do not put index.ts in the user startup-ui folder (Pi would load it as another extension).
 */


import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

import {
  VERSION,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";

import {
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const PACKAGE_DIR = (() => {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return typeof __dirname !== "undefined"
      ? __dirname
      : process.cwd();
  }
})();

// Package-bundled pages directory: extensions/../pages
const PACKAGE_PAGES_DIR = path.join(
  PACKAGE_DIR,
  "..",
  "pages",
);

const EXTENSION_ID = "pi-visage-adapter";

const UI_DIRECTORY = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "extensions",
  "startup-ui",
);

const CONFIG_PATH = path.join(
  os.homedir(),
  ".pi",
  "agent",
  "visage-ui.json",
);

type LayoutMode = "auto" | "full" | "compact";

type AdapterState = {
  enabled: boolean;
  selectedId: string;
  layout: LayoutMode;
};

type StartupUiDefinition = {
  id: string;
  label: string;
  description?: string;
  order?: number;
  title?: string;

  renderFull?: (args: any) => string[];
  renderCompact?: (args: any) => string[];
  renderTiny?: (args: any) => string[];
  render?: (args: any) => string[];

  workingIndicator?: (args: any) => {
    frames: string[];
    intervalMs?: number;
  };

  onActivate?: (args: any) => void | Promise<void>;
  onDeactivate?: (args: any) => void | Promise<void>;
};

const STATE: AdapterState = {
  enabled: true,
  selectedId: "visage",
  layout: "auto",
};

const SETTINGS = {
  fullLayoutMinWidth: 82,
  maxHeaderWidth: 108,
  showWorkingDirectory: true,
  customFooter: false,
};

let loadedUis = new Map<string, StartupUiDefinition>();
let loadErrors: string[] = [];
let currentContext: any;
let currentPi: ExtensionAPI;
let requestRender: () => void = () => {};

/* -------------------------------------------------------------------------- */
/* Shared render helpers                                                        */
/* -------------------------------------------------------------------------- */

function formatTokens(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  if (value < 1_000) {
    return String(Math.round(value));
  }

  if (value < 1_000_000) {
    return `${(value / 1_000).toFixed(
      value < 10_000 ? 1 : 0,
    )}k`;
  }

  return `${(value / 1_000_000).toFixed(2)}m`;
}

function formatPercent(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function shortenPath(
  value: string,
  maxLength = 40,
): string {
  const home = os.homedir();
  let result = value;

  const startsWithHome =
    process.platform === "win32"
      ? value
          .toLowerCase()
          .startsWith(home.toLowerCase())
      : value.startsWith(home);

  if (startsWithHome) {
    result = `~${value.slice(home.length)}`;
  }

  if (result.length <= maxLength) {
    return result;
  }

  const normalized = result.replaceAll("\\", "/");
  const parts = normalized
    .split("/")
    .filter(Boolean);

  if (parts.length <= 2) {
    return `…${result.slice(-(maxLength - 1))}`;
  }

  return `…/${parts.slice(-2).join("/")}`;
}

function padRightAnsi(
  text: string,
  targetWidth: number,
): string {
  const fitted = truncateToWidth(
    text,
    targetWidth,
    "",
  );

  return (
    fitted +
    " ".repeat(
      Math.max(
        0,
        targetWidth - visibleWidth(fitted),
      ),
    )
  );
}

function centerAnsi(
  text: string,
  targetWidth: number,
): string {
  const fitted = truncateToWidth(
    text,
    targetWidth,
    "",
  );

  const remaining = Math.max(
    0,
    targetWidth - visibleWidth(fitted),
  );

  const left = Math.floor(remaining / 2);
  const right = remaining - left;

  return (
    " ".repeat(left) +
    fitted +
    " ".repeat(right)
  );
}

function joinLeftRight(
  left: string,
  right: string,
  width: number,
): string {
  const gap = Math.max(
    1,
    width -
      visibleWidth(left) -
      visibleWidth(right),
  );

  return truncateToWidth(
    left + " ".repeat(gap) + right,
    width,
    "",
  );
}

function createFrame(
  theme: Theme,
  terminalWidth: number,
  content: string[],
  options?: {
    title?: string;
    footer?: string;
    maxWidth?: number;
  },
): string[] {
  const frameWidth = Math.max(
    34,
    Math.min(
      options?.maxWidth ?? SETTINGS.maxHeaderWidth,
      terminalWidth,
    ),
  );

  const innerWidth = frameWidth - 2;

  const border = (value: string) =>
    theme.fg("borderMuted", value);

  const accentBorder = (value: string) =>
    theme.fg("borderAccent", value);

  const title = options?.title
    ? ` ${options.title} `
    : "";

  const top = title
    ? accentBorder(
        `╭${title}${"─".repeat(
          Math.max(
            0,
            frameWidth -
              2 -
              visibleWidth(title),
          ),
        )}╮`,
      )
    : accentBorder(
        `╭${"─".repeat(innerWidth)}╮`,
      );

  const body = content.map((line) => {
    return (
      border("│") +
      padRightAnsi(line, innerWidth) +
      border("│")
    );
  });

  let bottom: string;

  if (options?.footer) {
    const footer = ` ${options.footer} `;
    const available = Math.max(
      0,
      frameWidth -
        2 -
        visibleWidth(footer),
    );

    const left = Math.floor(available / 2);
    const right = available - left;

    bottom = accentBorder(
      `╰${"─".repeat(left)}` +
        footer +
        `${"─".repeat(right)}╯`,
    );
  } else {
    bottom = accentBorder(
      `╰${"─".repeat(innerWidth)}╯`,
    );
  }

  const indent = " ".repeat(
    Math.max(
      0,
      Math.floor(
        (terminalWidth - frameWidth) / 2,
      ),
    ),
  );

  return [
    top,
    ...body,
    bottom,
  ].map((line) => {
    return truncateToWidth(
      indent + line,
      terminalWidth,
      "",
    );
  });
}

function renderTwoColumns(
  theme: Theme,
  width: number,
  leftRows: string[],
  rightRows: string[],
  options: {
    title?: string;
    footer?: string;
    leftWidth?: number;
    gapWidth?: number;
    maxWidth?: number;
  } = {},
): string[] {
  const frameWidth = Math.max(
    34,
    Math.min(
      options.maxWidth ?? SETTINGS.maxHeaderWidth,
      width,
    ),
  );

  const contentWidth = frameWidth - 2;
  const leftWidth = options.leftWidth ?? 25;
  const gapWidth = options.gapWidth ?? 3;

  const rightWidth = Math.max(
    20,
    contentWidth -
      leftWidth -
      gapWidth -
      2,
  );

  const rows: string[] = [];
  const rowCount = Math.max(
    leftRows.length,
    rightRows.length,
  );

  for (
    let index = 0;
    index < rowCount;
    index += 1
  ) {
    rows.push(
      [
        " ",
        padRightAnsi(
          leftRows[index] ?? "",
          leftWidth,
        ),
        " ".repeat(gapWidth),
        truncateToWidth(
          rightRows[index] ?? "",
          rightWidth,
          "",
        ),
      ].join(""),
    );
  }

  return createFrame(
    theme,
    width,
    [
      "",
      ...rows,
      "",
    ],
    options,
  );
}

function rgbText(
  rgb: readonly [
    number,
    number,
    number,
  ],
  value: string,
): string {
  const [red, green, blue] = rgb;

  return (
    `\x1b[38;2;${red};${green};${blue}m` +
    value +
    "\x1b[39m"
  );
}

function getModel(ctx: any) {
  return {
    id: ctx?.model?.id ?? "no-model",
    provider:
      ctx?.model?.provider ?? "unknown",
    contextWindow:
      ctx?.model?.contextWindow ?? null,
  };
}

function getContextUsage(ctx: any) {
  try {
    const usage =
      ctx?.getContextUsage?.();

    return {
      tokens:
        usage?.tokens ?? null,
      contextWindow:
        usage?.contextWindow ??
        ctx?.model?.contextWindow ??
        null,
      percent:
        usage?.percent ?? null,
    };
  } catch {
    return {
      tokens: null,
      contextWindow:
        ctx?.model?.contextWindow ??
        null,
      percent: null,
    };
  }
}

function getThinking(pi: ExtensionAPI) {
  try {
    return (
      pi.getThinkingLevel?.() ??
      "off"
    );
  } catch {
    return "off";
  }
}

/**
 * Read current git branch from .git/HEAD (no shell).
 * Walks up from cwd a few levels — pages cannot import node:fs.
 */
function getGitBranch(cwd?: string): string | null {
  try {
    let dir = cwd || process.cwd();
    for (let i = 0; i < 10; i++) {
      const headPath = path.join(dir, ".git", "HEAD");
      if (fs.existsSync(headPath)) {
        const head = fs.readFileSync(headPath, "utf8").trim();
        if (head.startsWith("ref:")) {
          const ref = head.slice(4).trim();
          const name = ref.split("/").pop();
          return name || null;
        }
        // detached HEAD — short sha
        return head.length > 7 ? head.slice(0, 7) : head;
      }
      // .git may be a file (worktree/gitdir pointer)
      const gitFile = path.join(dir, ".git");
      if (fs.existsSync(gitFile) && fs.statSync(gitFile).isFile()) {
        const content = fs.readFileSync(gitFile, "utf8").trim();
        const m = content.match(/^gitdir:\s*(.+)$/i);
        if (m?.[1]) {
          const gitDir = path.isAbsolute(m[1])
            ? m[1]
            : path.resolve(dir, m[1]);
          const headPath2 = path.join(gitDir, "HEAD");
          if (fs.existsSync(headPath2)) {
            const head = fs.readFileSync(headPath2, "utf8").trim();
            if (head.startsWith("ref:")) {
              return head.slice(4).trim().split("/").pop() || null;
            }
            return head.length > 7 ? head.slice(0, 7) : head;
          }
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // ignore
  }
  return null;
}

function getThemeName(theme: any, ctx?: any): string {
  const candidates = [
    theme?.name,
    theme?.id,
    ctx?.ui?.theme?.name,
    ctx?.ui?.getThemeName?.(),
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "default";
}

/**
 * Every startup page receives this ui helper bag.
 * Page files must not import Pi/TUI packages.
 */
const UI_RUNTIME = {
  VERSION,
  truncateToWidth,
  visibleWidth,
  formatTokens,
  formatPercent,
  shortenPath,
  padRightAnsi,
  centerAnsi,
  joinLeftRight,
  createFrame,
  renderTwoColumns,
  rgbText,
  getModel,
  getContextUsage,
  getThinking,
  getGitBranch,
  getThemeName,
};

/* -------------------------------------------------------------------------- */
/* Startup page loader                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Startup pages use JS-compatible TypeScript:
 *
 *   // @ts-nocheck
 *   export default { ... }
 *
 * Pages are read and evaluated at runtime so new pages need no static imports.
 * Only load trusted code — pages run with full user permissions.
 */
function evaluateUiFile(
  filePath: string,
): StartupUiDefinition {
  let source = fs.readFileSync(
    filePath,
    "utf8",
  );

  source = source.replace(
    /^\uFEFF/,
    "",
  );

  if (
    /^\s*import\s/m.test(source)
  ) {
    throw new Error(
      "Startup page files cannot use import; use helpers from the render ui argument.",
    );
  }

  source = source.replace(
    /\bexport\s+default\s+/,
    "module.exports.default = ",
  );

  if (
    !source.includes(
      "module.exports.default",
    ) &&
    !source.includes(
      "module.exports",
    )
  ) {
    throw new Error(
      "Missing export default startup page definition.",
    );
  }

  const module = {
    exports: {} as any,
  };

  const localRequire = createRequire(
    filePath,
  );

  const execute = new Function(
    "module",
    "exports",
    "require",
    "__filename",
    "__dirname",
    source,
  );

  execute(
    module,
    module.exports,
    localRequire,
    filePath,
    path.dirname(filePath),
  );

  const definition =
    module.exports.default ??
    module.exports;

  validateUiDefinition(
    definition,
    filePath,
  );

  return definition;
}

function validateUiDefinition(
  definition: any,
  filePath: string,
): asserts definition is StartupUiDefinition {
  if (
    !definition ||
    typeof definition !== "object"
  ) {
    throw new Error(
      "Default export must be an object.",
    );
  }

  if (
    typeof definition.id !== "string" ||
    !/^[a-z0-9][a-z0-9_-]*$/i.test(
      definition.id,
    )
  ) {
    throw new Error(
      "id must be a non-empty string of letters, digits, underscores, or hyphens.",
    );
  }

  if (
    typeof definition.label !==
      "string"
  ) {
    throw new Error(
      "Missing label.",
    );
  }

  const hasRenderer =
    typeof definition.render ===
      "function" ||
    typeof definition.renderFull ===
      "function" ||
    typeof definition.renderCompact ===
      "function" ||
    typeof definition.renderTiny ===
      "function";

  if (!hasRenderer) {
    throw new Error(
      "At least one of render, renderFull, renderCompact, or renderTiny is required.",
    );
  }

  definition.__filePath = filePath;
}

/**
 * Scan one directory; return discovered pages and load errors.
 * Files starting with _ or named index.ts/index.js are ignored.
 */
function scanDirectory(
  dir: string,
): {
  map: Map<string, StartupUiDefinition>;
  errors: string[];
} {
  const map = new Map<
    string,
    StartupUiDefinition
  >();

  const errors: string[] = [];

  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(
      dir,
      {
        withFileTypes: true,
      },
    );
  } catch {
    return { map, errors };
  }

  const files = entries
    .filter((entry) => {
      if (!entry.isFile()) {
        return false;
      }

      const name =
        entry.name.toLowerCase();

      return (
        (name.endsWith(".ts") ||
          name.endsWith(".js")) &&
        !name.endsWith(".d.ts") &&
        !name.startsWith("_") &&
        name !== "index.ts" &&
        name !== "index.js"
      );
    })
    .map((entry) => {
      return path.join(
        dir,
        entry.name,
      );
    })
    .sort((a, b) =>
      a.localeCompare(b),
    );

  for (const filePath of files) {
    try {
      const definition =
        evaluateUiFile(filePath);

      if (
        map.has(definition.id)
      ) {
        throw new Error(
          `Duplicate startup page id: ${definition.id}`,
        );
      }

      map.set(
        definition.id,
        definition,
      );
    } catch (error) {
      errors.push(
        `${path.basename(filePath)}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  return { map, errors };
}

function discoverStartupUis(): void {
  fs.mkdirSync(
    UI_DIRECTORY,
    {
      recursive: true,
    },
  );

  // Package pages load first; user pages may override the same id.
  const packaged = scanDirectory(
    PACKAGE_PAGES_DIR,
  );
  const homedir = scanDirectory(
    UI_DIRECTORY,
  );

  const next = new Map<
    string,
    StartupUiDefinition
  >();

  for (
    const [id, def] of packaged.map
  ) {
    next.set(id, def);
  }

  for (
    const [id, def] of homedir.map
  ) {
    next.set(id, def);
  }

  loadedUis = next;
  loadErrors = [
    ...packaged.errors,
    ...homedir.errors,
  ];

  if (
    loadedUis.size > 0 &&
    !loadedUis.has(STATE.selectedId)
  ) {
    STATE.selectedId =
      getSortedUis()[0].id;

    saveState();
  }
}

function getSortedUis(): StartupUiDefinition[] {
  return [
    ...loadedUis.values(),
  ].sort((a, b) => {
    const orderA =
      Number.isFinite(a.order)
        ? Number(a.order)
        : 1_000;

    const orderB =
      Number.isFinite(b.order)
        ? Number(b.order)
        : 1_000;

    return (
      orderA - orderB ||
      a.label.localeCompare(b.label)
    );
  });
}

function getActiveUi():
  | StartupUiDefinition
  | undefined {
  return (
    loadedUis.get(
      STATE.selectedId,
    ) ??
    getSortedUis()[0]
  );
}

/* -------------------------------------------------------------------------- */
/* State persistence                                                            */
/* -------------------------------------------------------------------------- */

function loadState(): void {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      // First run: persist package defaults so splash is on without /setStartUI.
      STATE.enabled = true;
      STATE.selectedId = "visage";
      STATE.layout = "auto";
      saveState();
      return;
    }

    const saved = JSON.parse(
      fs.readFileSync(
        CONFIG_PATH,
        "utf8",
      ),
    );

    if (
      typeof saved.enabled ===
      "boolean"
    ) {
      STATE.enabled = saved.enabled;
    }

    if (
      typeof saved.selectedId ===
      "string"
    ) {
      STATE.selectedId =
        saved.selectedId;
    }

    if (
      saved.layout === "auto" ||
      saved.layout === "full" ||
      saved.layout === "compact"
    ) {
      STATE.layout = saved.layout;
    }
  } catch {
    // Fall back to defaults if the config file is corrupt.
  }
}

function saveState(): void {
  try {
    fs.mkdirSync(
      path.dirname(CONFIG_PATH),
      {
        recursive: true,
      },
    );

    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        STATE,
        null,
        2,
      ) + "\n",
      "utf8",
    );
  } catch {
    // Save failures must not break the current session.
  }
}

/* -------------------------------------------------------------------------- */
/* UI dispatch                                                                  */
/* -------------------------------------------------------------------------- */

function buildRenderArgs(
  definition: StartupUiDefinition,
  ctx: any,
  theme: Theme,
  width: number,
) {
  return {
    pi: currentPi,
    ctx,
    theme,
    width,
    ui: UI_RUNTIME,
    definition,
    state: {
      ...STATE,
    },
  };
}

function renderActiveUi(
  ctx: any,
  theme: Theme,
  width: number,
): string[] {
  const definition =
    getActiveUi();

  if (!definition) {
    return [
      theme.fg(
        "warning",
        "No startup UI files found.",
      ),
      theme.fg(
        "dim",
        `Directory: ${UI_DIRECTORY}`,
      ),
    ];
  }

  const args = buildRenderArgs(
    definition,
    ctx,
    theme,
    width,
  );

  if (
    width < 38 &&
    typeof definition.renderTiny ===
      "function"
  ) {
    return definition.renderTiny(args);
  }

  const useFull =
    STATE.layout === "full" ||
    (
      STATE.layout === "auto" &&
      width >=
        SETTINGS.fullLayoutMinWidth
    );

  if (
    useFull &&
    typeof definition.renderFull ===
      "function"
  ) {
    return definition.renderFull(args);
  }

  if (
    !useFull &&
    typeof definition.renderCompact ===
      "function"
  ) {
    return definition.renderCompact(args);
  }

  if (
    typeof definition.render ===
    "function"
  ) {
    return definition.render(args);
  }

  if (
    typeof definition.renderFull ===
    "function"
  ) {
    return definition.renderFull(args);
  }

  if (
    typeof definition.renderCompact ===
    "function"
  ) {
    return definition.renderCompact(args);
  }

  return definition.renderTiny(args);
}

function createHeaderComponent(
  ctx: any,
  tui: any,
  theme: Theme,
) {
  requestRender = () => {
    tui.requestRender();
  };

  return {
    render(width: number) {
      return renderActiveUi(
        ctx,
        theme,
        width,
      );
    },

    invalidate() {
      tui.requestRender();
    },
  };
}

function createFooterComponent(
  ctx: any,
  tui: any,
  theme: Theme,
  footerData: any,
) {
  const unsubscribeBranch =
    footerData.onBranchChange?.(
      () => {
        tui.requestRender();
      },
    );

  return {
    dispose() {
      unsubscribeBranch?.();
    },

    invalidate() {
      tui.requestRender();
    },

    render(width: number) {
      const model = getModel(ctx);
      const usage =
        getContextUsage(ctx);
      const thinking =
        getThinking(currentPi);

      const leftParts = [
        theme.fg(
          "muted",
          `${formatPercent(
            usage.percent,
          )}/${formatTokens(
            usage.contextWindow,
          )}`,
        ),
      ];

      if (
        SETTINGS.showWorkingDirectory
      ) {
        leftParts.push(
          theme.fg(
            "dim",
            shortenPath(ctx.cwd),
          ),
        );
      }

      const branch =
        footerData.getGitBranch?.() ??
        null;

      if (branch) {
        leftParts.push(
          theme.fg(
            "accent",
            `git:${branch}`,
          ),
        );
      }

      const left =
        leftParts.join(
          theme.fg("dim", " · "),
        );

      const right = [
        theme.fg(
          "accent",
          model.id,
        ),
        theme.fg("dim", " · "),
        theme.fg(
          "muted",
          `thinking ${thinking}`,
        ),
      ].join("");

      if (
        visibleWidth(left) +
          visibleWidth(right) +
          1 <=
        width
      ) {
        return [
          joinLeftRight(
            left,
            right,
            width,
          ),
        ];
      }

      return [
        truncateToWidth(
          left,
          width,
          "",
        ),
        truncateToWidth(
          right,
          width,
          "",
        ),
      ];
    },
  };
}

async function applyActiveUi(
  ctx: any,
): Promise<void> {
  currentContext = ctx;

  if (
    !STATE.enabled ||
    ctx.mode !== "tui"
  ) {
    return;
  }

  const definition =
    getActiveUi();

  if (!definition) {
    ctx.ui.notify(
      [
        "No available startup UI found.",
        `Place startup page .ts files in:`,
        UI_DIRECTORY,
      ].join("\n"),
      "warning",
    );

    return;
  }

  ctx.ui.setHeader(
    (
      tui: any,
      theme: Theme,
    ) => {
      return createHeaderComponent(
        ctx,
        tui,
        theme,
      );
    },
  );

  if (SETTINGS.customFooter) {
    ctx.ui.setFooter(
      (
        tui: any,
        theme: Theme,
        footerData: any,
      ) => {
        return createFooterComponent(
          ctx,
          tui,
          theme,
          footerData,
        );
      },
    );
  }

  if (
    typeof definition.workingIndicator ===
    "function"
  ) {
    const indicator =
      definition.workingIndicator({
        pi: currentPi,
        ctx,
        theme: ctx.ui.theme,
        ui: UI_RUNTIME,
        definition,
        state: {
          ...STATE,
        },
      });

    ctx.ui.setWorkingIndicator({
      frames:
        indicator.frames ?? ["·"],
      intervalMs:
        indicator.intervalMs ?? 140,
    });
  } else {
    ctx.ui.setWorkingIndicator({
      frames: [
        ctx.ui.theme.fg("dim", "·"),
        ctx.ui.theme.fg(
          "accent",
          "●",
        ),
        ctx.ui.theme.fg("dim", "·"),
      ],
      intervalMs: 140,
    });
  }

  ctx.ui.setTitle(
    `${
      definition.title ??
      definition.label
    } · ${
      path.basename(ctx.cwd) ||
      "workspace"
    }`,
  );

  ctx.ui.setStatus(
    EXTENSION_ID,
    ctx.ui.theme.fg(
      "accent",
      `${definition.label} ready`,
    ),
  );

  await definition.onActivate?.({
    pi: currentPi,
    ctx,
    ui: UI_RUNTIME,
    definition,
    state: {
      ...STATE,
    },
  });

  requestRender();
}

async function deactivateCurrentUi(
  ctx: any,
): Promise<void> {
  const definition =
    getActiveUi();

  await definition?.onDeactivate?.({
    pi: currentPi,
    ctx,
    ui: UI_RUNTIME,
    definition,
    state: {
      ...STATE,
    },
  });
}

async function restoreBuiltInUi(
  ctx: any,
): Promise<void> {
  await deactivateCurrentUi(ctx);

  ctx.ui.setHeader(undefined);
  ctx.ui.setFooter(undefined);
  ctx.ui.setWorkingIndicator();
  ctx.ui.setTitle("pi");

  ctx.ui.setStatus(
    EXTENSION_ID,
    undefined,
  );
}

/* -------------------------------------------------------------------------- */
/* Slash commands                                                               */
/* -------------------------------------------------------------------------- */

function getCommandCompletions(
  prefix: string,
) {
  discoverStartupUis();

  const normalized =
    prefix.trim().toLowerCase();

  const values = [
    ...getSortedUis().map(
      (definition) => ({
        value: definition.id,
        label:
          `${definition.id} — ` +
          `${definition.label}` +
          (
            definition.description
              ? `: ${definition.description}`
              : ""
          ),
      }),
    ),

    {
      value: "off",
      label:
        "off — disable custom startup UI",
    },

    {
      value: "reload",
      label:
        "reload — rescan startup page directories",
    },

    {
      value: "status",
      label:
        "status — show adapter status",
    },
  ].filter((item) => {
    return item.value.startsWith(
      normalized,
    );
  });

  return values.length > 0
    ? values
    : null;
}

async function showStatus(ctx: any) {
  const active =
    getActiveUi();

  ctx.ui.notify(
    [
      `Visage UI: ${STATE.enabled ? "on" : "off"}`,
      `Current UI: ${
        active
          ? `${active.label} (${active.id})`
          : "none"
      }`,
      `Layout: ${STATE.layout}`,
      `Pages found: ${loadedUis.size}`,
      `User pages dir: ${UI_DIRECTORY}`,
      `Package pages dir: ${PACKAGE_PAGES_DIR}`,
      `Config file: ${CONFIG_PATH}`,
      "",
      ...(loadErrors.length > 0
        ? [
            "Load errors:",
            ...loadErrors,
          ]
        : []),
    ].join("\n"),
    loadErrors.length > 0
      ? "warning"
      : "info",
  );
}

async function chooseStartupUi(
  args: string,
  ctx: any,
) {
  discoverStartupUis();

  const requested =
    args.trim().toLowerCase();

  if (requested === "status") {
    await showStatus(ctx);
    return;
  }

  if (requested === "reload") {
    if (
      STATE.enabled &&
      getActiveUi()
    ) {
      await applyActiveUi(ctx);
    }

    ctx.ui.notify(
      [
        `Rescanned ${loadedUis.size} startup page(s).`,
        ...(loadErrors.length > 0
          ? loadErrors
          : []),
      ].join("\n"),
      loadErrors.length > 0
        ? "warning"
        : "info",
    );

    return;
  }

  let selected:
    | string
    | "off"
    | undefined;

  if (requested) {
    if (
      requested === "off" ||
      loadedUis.has(requested)
    ) {
      selected = requested;
    } else {
      ctx.ui.notify(
        [
          `Unknown startup UI: ${requested}`,
          "",
          "Available pages:",
          ...getSortedUis().map(
            (item) =>
              `${item.id} — ${item.label}`,
          ),
          "off — use Pi default UI",
        ].join("\n"),
        "error",
      );

      return;
    }
  } else {
    const current = STATE.enabled
      ? STATE.selectedId
      : "off";

    const entries = [
      ...getSortedUis().map(
        (definition) => ({
          id: definition.id,
          text:
            `${definition.label}` +
            (
              definition.description
                ? ` — ${definition.description}`
                : ""
            ) +
            (
              current === definition.id
                ? " (current)"
                : ""
            ),
        }),
      ),

      {
        id: "off",
        text:
          "Disable startup UI — use Pi default" +
          (
            current === "off"
              ? " (current)"
              : ""
          ),
      },
    ];

    const selectedText =
      await ctx.ui.select(
        "Select startup UI",
        entries.map(
          (item) => item.text,
        ),
      );

    if (!selectedText) {
      return;
    }

    selected =
      entries.find(
        (item) =>
          item.text === selectedText,
      )?.id;
  }

  if (!selected) {
    return;
  }

  if (selected === "off") {
    STATE.enabled = false;
    saveState();

    await restoreBuiltInUi(ctx);

    ctx.ui.notify(
      "Restored Pi default startup UI.",
      "info",
    );

    return;
  }

  await deactivateCurrentUi(ctx);

  STATE.selectedId = selected;
  STATE.enabled = true;

  saveState();
  await applyActiveUi(ctx);

  const definition =
    getActiveUi();

  ctx.ui.notify(
    [
      `Startup UI switched to: ${definition?.label ?? selected}`,
      definition?.description ?? "",
      "Settings saved; applied on next start as well.",
    ]
      .filter(Boolean)
      .join("\n"),
    "info",
  );
}

/* -------------------------------------------------------------------------- */
/* Extension entry                                                              */
/* -------------------------------------------------------------------------- */

export default function startupUiAdapter(
  pi: ExtensionAPI,
) {
  currentPi = pi;

  pi.on(
    "session_start",
    async (_event, ctx) => {
      loadState();
      discoverStartupUis();

      if (STATE.enabled) {
        await applyActiveUi(ctx);
      }
    },
  );

  pi.on(
    "model_select",
    async () => {
      requestRender();
    },
  );

  pi.on(
    "thinking_level_select",
    async () => {
      requestRender();
    },
  );

  pi.on(
    "turn_end",
    async () => {
      requestRender();
    },
  );

  pi.on(
    "session_shutdown",
    async (_event, ctx) => {
      await deactivateCurrentUi(ctx);

      ctx.ui.setStatus(
        EXTENSION_ID,
        undefined,
      );
    },
  );

  /** Canonical command name. Prefer /setStartUI visage (no dialog). */
  pi.registerCommand(
    "setStartUI",
    {
      description:
        "Startup UI: /setStartUI visage|visage-minimal|off|reload|status (omit arg = picker)",

      getArgumentCompletions:
        getCommandCompletions,

      handler:
        chooseStartupUi,
    },
  );
}
