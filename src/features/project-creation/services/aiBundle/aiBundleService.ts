/**
 * AI Bundle Service — the tiered AI-bundle refresh orchestrator (ADR-013).
 *
 * Every caller that regenerates the AI bundle goes through this module:
 * project creation (executor phase 6), the dashboard "Regenerate AI files"
 * action, both update paths, project rename, and (from Step 5) the activation
 * sweep. All writes flow through ONE `GeneratedFileWriter` per run — the
 * hash-and-skip seam that lets user edits survive a refresh.
 *
 * Tiers:
 * - **Tier 1** (`refreshMcpConfigs`): `.mcp.json`, `.claude/mcp.json`,
 *   `.claude/settings.json` (merge). Offline, machine-path repair.
 * - **Tier 2** (`refreshContextAndSkills`): AGENTS.md + CLAUDE.md pointers +
 *   `.claude/skills/`. Offline, version-driven content.
 * - **Tier 3** (packages) stays `installAiDefaultsMcpTools` — a separate call
 *   at every site (network, the long pole).
 *
 * `generateAIContextFiles` (tier 1+2) interleaves the tier-2 writers around
 * tier 1 (AGENTS.md → MCP configuration → skills) rather than composing the
 * two tier functions: the step ORDER is pinned by the regenerate progress UI,
 * and the collect-errors-then-throw semantics need each writer isolated. The
 * tier functions exist for tier-selective callers (the activation sweep).
 */

import * as path from 'path';
import type { ProgressTracker } from '../../handlers/shared';
import { writeAgentsMd } from './aiContextWriter';
import {
    createGeneratedFileWriter,
    type GeneratedFileWriteReport,
    type GeneratedFileWriter,
} from './generatedFileWriter';
import { writeMcpConfigs } from './mcpConfigWriter';
import { writeSkillFiles } from './skillsWriter';
import { AI_CONTEXT_VERSION } from '@/core/constants';
import { getLogger } from '@/core/logging';
import stacksConfig from '@/features/components/config/stacks.json';
import type { Project } from '@/types/base';
import type { Stack } from '@/types/stacks';

export interface AiBundleRefreshResult {
    /** Written demo-builder skill filenames (existing contract). */
    skills: string[];
    /** The run's writer report: written / skipped (user-edited) / removed. */
    report: GeneratedFileWriteReport;
}

/**
 * Tier 1: `.claude/mcp.json` + `.mcp.json` + `.claude/settings.json` merge +
 * gitignore upkeep. Offline and deterministic — safe to run on every
 * activation ("`'unchanged'` is the common path → no disk writes").
 *
 * `nodePath` is the pre-resolved Node binary; pass it when refreshing many
 * projects (the activation sweep resolves once) — omitted, `writeMcpConfigs`
 * resolves it itself.
 */
export async function refreshMcpConfigs(
    projectPath: string,
    project: Project,
    extensionPath: string,
    writer: GeneratedFileWriter,
    nodePath?: string,
): Promise<void> {
    const distPath = path.join(extensionPath, 'dist');
    await writeMcpConfigs(projectPath, project, distPath, writer, nodePath);
}

/**
 * Tier 2: AGENTS.md + CLAUDE.md pointers + `.claude/skills/`. Offline.
 *
 * `_extensionPath` is accepted for call-shape parity with `refreshMcpConfigs`
 * (the activation sweep threads the same arguments to both tiers); the tier-2
 * writers derive everything from the project itself today.
 */
export async function refreshContextAndSkills(
    projectPath: string,
    project: Project,
    _extensionPath: string,
    writer: GeneratedFileWriter,
): Promise<{ skills: string[] }> {
    await writeAgentsMd(projectPath, project, stacksConfig.stacks as Stack[], writer);
    const summary = await writeSkillFiles(projectPath, project, writer);
    return { skills: summary?.written ?? [] };
}

/**
 * Tier 1 + tier 2: generate the full AI context bundle (AGENTS.md, MCP
 * configs, `.claude/skills/`). Moved here from `projectFinalizationService`
 * (which stays a pure creation-phase module); the services barrel preserves
 * the name for all callers.
 *
 * Pass `onProgress` to emit a step before each writer runs (dashboard
 * "Regenerate AI files" surfaces this in the AI Capabilities modal). The
 * writers serialize so each step's UI matches the work in flight; writer
 * errors are collected across all three steps before being rethrown.
 *
 * ADR-013 contract:
 * - ONE hash-and-skip writer per run, seeded from `project.aiFileHashes`
 *   (absent on pre-ADR projects → every bundle file gets the overwrite-once
 *   treatment and a fresh hash).
 * - Stamps `project.aiContextVersion = AI_CONTEXT_VERSION` ONLY on success
 *   (single point shared by all callers; the activation sweep reads it — a
 *   failed run must stay stale so the sweep retries).
 * - Assigns `project.aiFileHashes = writer.hashes()` BEFORE the
 *   collected-errors throw — hashes for files that DID land must survive.
 *   CALLERS MUST BEST-EFFORT PERSIST THE MANIFEST ON THE THROW PATH TOO, or
 *   a partial run leaves disk ≠ recorded and those files read as user-edited
 *   forever (every call site does; keep it that way).
 * - Returns `{ skills, report }` — additive; existing callers destructure
 *   `skills` only, the update paths log `report.skipped`.
 */
export async function generateAIContextFiles(
    projectPath: string,
    project: Project,
    extensionPath: string,
    onProgress?: ProgressTracker,
): Promise<AiBundleRefreshResult> {
    let skills: string[] = [];

    const writer = createGeneratedFileWriter(projectPath, project.aiFileHashes ?? {}, getLogger());

    const steps: Array<{ label: string; run: () => Promise<void> }> = [
        {
            label: 'Writing AGENTS.md',
            run: () => writeAgentsMd(projectPath, project, stacksConfig.stacks as Stack[], writer),
        },
        {
            label: 'Writing MCP configuration',
            run: () => refreshMcpConfigs(projectPath, project, extensionPath, writer),
        },
        {
            label: 'Writing skills',
            run: async () => {
                const summary = await writeSkillFiles(projectPath, project, writer);
                skills = summary?.written ?? [];
            },
        },
    ];

    const errors: string[] = [];
    for (const step of steps) {
        onProgress?.(step.label, 0);
        try {
            await step.run();
        } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
        }
    }

    // Hashes for files that DID land are assigned even on failure — callers
    // best-effort persist them so a partial run cannot poison the skip logic
    // (an unrecorded landed write would read as "user-edited" forever).
    project.aiFileHashes = writer.hashes();

    if (errors.length > 0) {
        throw new Error(`AI context file generation failed: ${errors.join('; ')}`);
    }

    // Stamp ONLY on success — a failed run must not declare itself current, or
    // the activation sweep would never come back to finish the refresh.
    project.aiContextVersion = AI_CONTEXT_VERSION;

    return { skills, report: writer.report() };
}
