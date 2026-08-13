/**
 * ai-context-freshness on-open check — detect-and-surface (broad AI-context drift).
 *
 * Every project gets a COPY of the extension's AI context at creation (skills,
 * AGENTS.md/CLAUDE.md, .claude/mcp.json + .mcp.json, .claude/settings.json).
 * Nothing reconciles those copies afterward, so a project silently rots behind the
 * extension when skills/templates change. This check watches BOTH staleness axes:
 *
 *   - **Bundle version** — did WE change what we ship? Compares the project's
 *     persisted `aiContextVersion` stamp against the current `AI_CONTEXT_VERSION`
 *     (injected as `currentVersion`).
 *   - **Project composition** — did YOU change what you have? Compares the
 *     ai-defaults packages the project qualifies for NOW (`applicablePackages`,
 *     per the aiToolingGate `requires` gates) against what the isolated
 *     `.demo-builder-mcp/` manifest actually declares (`installedPackages`).
 *     Before 2026-08-14 this axis was unwatched, so a project that gained a
 *     qualifying component from the dashboard silently went under-equipped —
 *     the version stamp had not moved, so nothing prompted.
 *
 * Either axis stale → `warning`, which flips the AI badge and surfaces the
 * existing "Regenerate AI files" action (DashboardStatusHeader gates that action
 * on a red/yellow AI badge). The user's explicit Regenerate click is the
 * remediation — it reruns the installer, which installs exactly the applicable
 * set, clearing the composition axis.
 *
 * Every run logs its DECISION — both axes and the verdict — including the
 * healthy one. A check that only speaks when unhappy is indistinguishable in
 * Debug Logs from a check that never ran; that ambiguity is how the
 * composition gap stayed invisible.
 *
 * Per the OnOpenCheck P1 contract it does NOT prompt or heal on open — a
 * version compare plus one manifest read, both cheap and read-only, so it stays
 * `reRunnable`: re-evaluated on every status refresh, which is how the badge
 * clears the moment the user regenerates. Detect-only (vs mcp-health's silent
 * auto-heal) also avoids a concurrent-heal race: the two checks can't both
 * drive `handleRegenerateAiFiles` at once.
 *
 * @module features/dashboard/services/onOpenChecks/aiContextFreshnessCheck
 */

import type { CheckResult, OnOpenCheck, OnOpenCheckContext } from './types';
import type { Project } from '@/types';
import { CHECK_IDS } from '@/types/messages';

/** Badge text when the project's AI bundle predates the current extension. */
const STALE_MESSAGE = 'AI files out of date';

/** Badge text when the project outgrew its bundle (composition axis). */
const MISSING_TOOLING_MESSAGE = "AI tooling missing for this project's components";

/** Injected collaborators — the two staleness axes. */
export interface AiContextFreshnessCheckDeps {
    /** The current AI-context bundle version (`AI_CONTEXT_VERSION`). */
    currentVersion: number;
    /** ai-defaults packages the project qualifies for NOW (`applicableMcpPackages`). */
    applicablePackages: (project: Project) => string[];
    /** Packages the isolated tools manifest declares (`readInstalledMcpPackages`). */
    installedPackages: (projectPath: string) => Promise<string[]>;
}

/**
 * Build the ai-context-freshness check. Pass the current `AI_CONTEXT_VERSION`
 * plus the composition-axis readers (see `aiDefaultsInstaller`).
 * NOT `edsOnly` (AI context is generated for every project).
 */
export function createAiContextFreshnessCheck(deps: AiContextFreshnessCheckDeps): OnOpenCheck {
    return {
        id: CHECK_IDS.AI_CONTEXT_FRESHNESS,
        mode: 'background',
        // Cheap read-only compares — re-run on every status refresh so the badge
        // clears immediately after the user regenerates (persists a new stamp /
        // installs the missing packages).
        reRunnable: true,
        async run(ctx: OnOpenCheckContext): Promise<CheckResult> {
            const stamp = ctx.project.aiContextVersion ?? 0;
            const versionStale = stamp < deps.currentVersion;

            const applicable = deps.applicablePackages(ctx.project);
            const installed = await deps.installedPackages(ctx.project.path);
            const missing = applicable.filter((pkg) => !installed.includes(pkg));

            if (versionStale) {
                ctx.logger.info(
                    `[AiContextFreshness] Stale AI context (stamp ${stamp} < ${deps.currentVersion})`,
                );
                return { status: 'warning', message: STALE_MESSAGE };
            }
            if (missing.length > 0) {
                // The WHY, for support: which packages this project now
                // qualifies for but never received (the dashboard-add gap).
                ctx.logger.info(
                    `[AiContextFreshness] Project composition outgrew its AI bundle — ` +
                        `missing: ${missing.join(', ')} ` +
                        `(applicable ${applicable.length}, installed ${installed.length})`,
                );
                return { status: 'warning', message: MISSING_TOOLING_MESSAGE };
            }
            // The healthy verdict logs too — "checked and fine" must not read
            // like "never ran" (routine per-open line, so Debug-channel only).
            ctx.logger.debug(
                `[AiContextFreshness] ok — stamp ${stamp} >= ${deps.currentVersion}; ` +
                    `composition ${applicable.length} applicable / ${installed.length} installed`,
            );
            return { status: 'ok' };
        },
    };
}
