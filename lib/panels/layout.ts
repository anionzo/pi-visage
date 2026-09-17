/**
 * Multi-panel layout helpers (side-by-side / stack).
 */

import { maxVisibleWidth, padVisible, visibleWidth } from "./colors.ts";
import type { BuiltPanel } from "./frame.ts";
import { buildGitPanel, type GitInfo } from "./git.ts";
import { buildInfoPanel, type InfoSnapshot } from "./info.ts";
import { buildSessionPanel, type SessionSnapshot } from "./session.ts";
import { buildSystemPanel, type SystemSnapshot } from "./system.ts";

const GAP = " ";

export function combineSideBySide(
	left: string[],
	leftWidth: number,
	right: string[],
): string[] {
	const rows = Math.max(left.length, right.length);
	const output: string[] = [];
	for (let i = 0; i < rows; i++) {
		const l = left[i] ?? " ".repeat(leftWidth);
		const r = right[i] ?? "";
		output.push(`${padVisible(l, leftWidth)}${GAP}${r}`);
	}
	return output;
}

export type PanelFlags = {
	git: boolean;
	info: boolean;
	session: boolean;
	system: boolean;
};

export type PanelSnapshots = {
	git: GitInfo;
	info: InfoSnapshot;
	session: SessionSnapshot;
	system: SystemSnapshot;
};

/** Compose enabled panels into a terminal-width-aware block of lines. */
export function buildAllPanels(
	flags: PanelFlags,
	snap: PanelSnapshots,
	safeWidth: number,
): string[] {
	const topPanels: BuiltPanel[] = [];
	if (flags.git) topPanels.push(buildGitPanel(snap.git, safeWidth - 2));
	if (flags.info) topPanels.push(buildInfoPanel(snap.info, safeWidth - 2));

	let topBlock: string[] = [];
	if (topPanels.length === 1) {
		topBlock = topPanels[0]!.lines;
	} else if (topPanels.length === 2) {
		const [first, second] = topPanels;
		const naturalCombined =
			first!.width + visibleWidth(GAP) + second!.width;
		if (naturalCombined <= safeWidth) {
			topBlock = combineSideBySide(first!.lines, first!.width, second!.lines);
		} else {
			const leftOuterTarget = Math.max(
				28,
				Math.floor((safeWidth - visibleWidth(GAP)) * 0.55),
			);
			const rightOuterTarget = Math.max(
				28,
				safeWidth - visibleWidth(GAP) - leftOuterTarget,
			);
			const gitCompact = buildGitPanel(
				snap.git,
				Math.max(24, leftOuterTarget - 2),
			);
			const infoCompact = buildInfoPanel(
				snap.info,
				Math.max(24, rightOuterTarget - 2),
			);
			const compactCombined =
				gitCompact.width + visibleWidth(GAP) + infoCompact.width;
			if (compactCombined <= safeWidth) {
				topBlock = combineSideBySide(
					gitCompact.lines,
					gitCompact.width,
					infoCompact.lines,
				);
			} else {
				topBlock = [...first!.lines, ...second!.lines];
			}
		}
	}

	if (!flags.session && !flags.system) {
		return topBlock;
	}

	const bottomPanels: BuiltPanel[] = [];
	if (flags.session)
		bottomPanels.push(buildSessionPanel(snap.session, safeWidth - 2));
	if (flags.system)
		bottomPanels.push(buildSystemPanel(snap.system, safeWidth - 2));

	let bottomBlock: string[] = [];
	if (bottomPanels.length === 1) {
		bottomBlock = bottomPanels[0]!.lines;
	} else if (bottomPanels.length === 2) {
		const [first, second] = bottomPanels;
		const combined = first!.width + visibleWidth(GAP) + second!.width;
		if (combined <= safeWidth) {
			bottomBlock = combineSideBySide(
				first!.lines,
				first!.width,
				second!.lines,
			);
		} else {
			bottomBlock = [...first!.lines, ...second!.lines];
		}
	}

	if (topBlock.length === 0) return bottomBlock;

	const topWidth = maxVisibleWidth(topBlock);
	const gapWidth = visibleWidth(GAP);
	const bottomWidth = maxVisibleWidth(bottomBlock);
	if (topWidth + gapWidth + bottomWidth <= safeWidth) {
		return combineSideBySide(topBlock, topWidth, bottomBlock);
	}
	return [...topBlock, ...bottomBlock];
}
