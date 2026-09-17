import { truncateToWidth } from "@earendil-works/pi-tui";
import { labelBright, labelDim } from "./colors.ts";
import {
	computePanelWidths,
	framePanelBody,
	renderRow,
	SEPARATOR_WIDTH,
	type BuiltPanel,
} from "./frame.ts";

export type GitInfo = {
	inRepo: boolean;
	worktree: string;
	branch: string;
	tracking: string;
	ahead: number;
	behind: number;
	insertions: number;
	deletions: number;
	stagedInsertions: number;
	stagedDeletions: number;
	filesChanged: number;
	stagedFiles: number;
	untrackedCount: number;
	stashCount: number;
};

export const EMPTY_GIT_STATE: GitInfo = {
	inRepo: false,
	worktree: "-",
	branch: "-",
	tracking: "(no repository)",
	ahead: 0,
	behind: 0,
	insertions: 0,
	deletions: 0,
	stagedInsertions: 0,
	stagedDeletions: 0,
	filesChanged: 0,
	stagedFiles: 0,
	untrackedCount: 0,
	stashCount: 0,
};

type GitRow = {
	label: string;
	value: string;
	labelColor?: string;
};

function buildChangesValue(snapshot: GitInfo): string {
	const parts: string[] = [];
	if (snapshot.stagedFiles > 0) {
		parts.push(
			`staged: ${snapshot.stagedFiles} file${snapshot.stagedFiles > 1 ? "s" : ""} (+${snapshot.stagedInsertions} -${snapshot.stagedDeletions})`,
		);
	}
	if (snapshot.filesChanged > 0) {
		parts.push(
			`unstaged: ${snapshot.filesChanged} file${snapshot.filesChanged > 1 ? "s" : ""} (+${snapshot.insertions} -${snapshot.deletions})`,
		);
	}
	if (parts.length === 0) return "clean";
	return parts.join(" · ");
}

export function buildGitPanel(snapshot: GitInfo, maxInner: number): BuiltPanel {
	const worktreeValue = snapshot.inRepo
		? snapshot.worktree
		: "(not a git repository)";
	const branchValue = snapshot.inRepo ? snapshot.branch : "-";
	const trackingValue = snapshot.inRepo ? snapshot.tracking : "-";

	const expectedTracking = `origin/${branchValue}`;
	const shouldShowTracking =
		snapshot.inRepo &&
		(trackingValue === "(no upstream)" || trackingValue !== expectedTracking);

	const rows: GitRow[] = [
		{ label: "worktree", value: worktreeValue, labelColor: labelBright() },
		{ label: "branch", value: branchValue, labelColor: labelDim() },
	];

	if (shouldShowTracking) {
		rows.push({
			label: "tracking",
			value: trackingValue,
			labelColor: labelDim(),
		});
	}

	if (snapshot.inRepo) {
		rows.push({
			label: "changes",
			value: buildChangesValue(snapshot),
			labelColor: labelDim(),
		});
		const extras: string[] = [];
		if (snapshot.untrackedCount > 0)
			extras.push(`${snapshot.untrackedCount} untracked`);
		if (snapshot.stashCount > 0)
			extras.push(
				`${snapshot.stashCount} stash${snapshot.stashCount > 1 ? "es" : ""}`,
			);
		if (extras.length > 0) {
			rows.push({
				label: "other",
				value: extras.join(" · "),
				labelColor: labelDim(),
			});
		}
	}

	const labelWidth = rows.reduce((max, row) => Math.max(max, row.label.length), 0);
	const right = snapshot.inRepo ? `↑${snapshot.ahead} ↓${snapshot.behind}` : "";
	const naturalContentWidth = rows.reduce(
		(max, row) => Math.max(max, labelWidth + SEPARATOR_WIDTH + row.value.length),
		0,
	);

	const { inner, contentWidth } = computePanelWidths({
		title: "GIT",
		rightText: right,
		naturalContentWidth,
		maxInner,
		minInner: 24,
	});

	return framePanelBody({
		title: "GIT",
		rightText: right,
		bodyLines: rows.map((entry) =>
			renderRow(entry.label, entry.labelColor, labelWidth, contentWidth, (vw) =>
				truncateToWidth(entry.value, vw, "…", true),
			),
		),
		inner,
		contentWidth,
	});
}
