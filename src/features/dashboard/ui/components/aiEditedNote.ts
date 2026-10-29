/**
 * The AI Capabilities modal's one sentence about edited files (ADR-013).
 *
 * `inventory.editedFiles` is every bundle file the verify found changed since
 * the last generate: its disk sha-256 no longer matches the hash recorded in
 * `project.aiFileHashes` (`detectEditedFiles` in `features/ai/aiSetupVerifier`,
 * which leaves out `.claude/settings.json` because that one is merged, not
 * kept). Regenerate's hash-and-skip writer leaves exactly those files alone, so
 * the sentence is about Regenerate and sits beside its button (owner,
 * 2026-10-22). It names every file, however many: AGENTS.md, .mcp.json, or a
 * skill, which reads by its title rather than its path.
 *
 * Pure: no React, no IO.
 *
 * @module features/dashboard/ui/components/aiEditedNote
 */

import { skillDisplayTitle } from './AiSkillsList';
import { andList } from '@/core/utils/andList';
import type { SkillInventoryEntry } from '@/types/ai';

/** Bundle prefix of a skill file, as the edited list writes it (project-relative posix). */
const SKILLS_PREFIX = '.claude/skills/';

/**
 * Does this skill's on-disk file match the edited path? Suffix match: inventory
 * paths are absolute while edited entries are project-relative, so anchor on a
 * separator to avoid partial-name collisions. Backslashes are normalized for
 * win32 inventory paths (edited keys are always posix).
 */
function ownsPath(skill: SkillInventoryEntry, relPath: string): boolean {
    return skill.path.replace(/\\/g, '/').endsWith(`/${relPath}`);
}

/** How one edited file is named: a skill by its title, anything else by its path. */
function nameOf(relPath: string, skills: readonly SkillInventoryEntry[]): string {
    if (!relPath.startsWith(SKILLS_PREFIX)) return relPath;
    const skill = skills.find((candidate) => ownsPath(candidate, relPath));
    return skill ? `the ${skillDisplayTitle(skill)} skill` : relPath;
}

/**
 * The sentence, or `undefined` when nothing is edited.
 *
 * @param editedFiles - project-relative paths from `inventory.editedFiles`
 * @param skills - the installed skills, to name an edited skill by its title
 * @returns e.g. "Regenerate keeps your edits to AGENTS.md."
 */
export function regenerateKeepsSentence(
    editedFiles: readonly string[] | undefined,
    skills: readonly SkillInventoryEntry[],
): string | undefined {
    if (!editedFiles || editedFiles.length === 0) return undefined;
    const names = editedFiles.map((relPath) => nameOf(relPath, skills));
    return `Regenerate keeps your edits to ${andList(names)}.`;
}
