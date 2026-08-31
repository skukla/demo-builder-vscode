/**
 * ai-context-freshness on-open check — detect-and-surface (broad AI-context drift).
 *
 * Every project gets a COPY of the extension's AI context at creation (skills,
 * AGENTS.md/CLAUDE.md, .claude/mcp.json + .mcp.json, .claude/settings.json).
 * This check watches BOTH staleness axes, but since ADR-013 only one of them
 * surfaces to the user:
 *
 *   - **Bundle version** — did WE change what we ship? Compares the project's
 *     persisted `aiContextVersion` stamp against the current `AI_CONTEXT_VERSION`
 *     (injected as `currentVersion`). LOGGED-ONLY: the activation sweep
 *     (`refreshAiBundlesOnActivation`) owns this repair — it silently refreshes
 *     tier 1+2 and advances the stamp on every extension-host start, which is
 *     the only moment the constant can change. The badge therefore no longer
 *     flips for a stale stamp; the per-run `info` line is the support trail — a
 *     stamp that stays stale across restarts means the sweep is failing (check
 *     its `[AI Bundle]` lines in Debug Logs).
 *   - **Project composition** — did YOU change what you have? Compares the
 *     ai-defaults packages the project qualifies for NOW (`applicablePackages`,
 *     per the aiToolingGate `requires` gates) against what the isolated
 *     `.demo-builder-mcp/` manifest actually declares (`installedPackages`).
 *     Still `warning` → flips the AI badge and surfaces the existing
 *     "Regenerate AI files" action. The user's explicit click is the remediation
 *     because this axis is the real download — no silent path installs packages.
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
import type { Project } from '@/types/base';
import { CHECK_IDS } from '@/types/messages';

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
        // clears immediately after the user regenerates (installs the missing
        // packages).
        reRunnable: true,
        async run(ctx: OnOpenCheckContext): Promise<CheckResult> {
            const stamp = ctx.project.aiContextVersion ?? 0;
            const versionStale = stamp < deps.currentVersion;

            const applicable = deps.applicablePackages(ctx.project);
            const installed = await deps.installedPackages(ctx.project.path);
            const missing = applicable.filter((pkg) => !installed.includes(pkg));

            if (versionStale) {
                // Logged-only (no badge): the activation sweep owns this repair.
                // This line is the support trail — if the stamp stays stale
                // across restarts, the sweep is failing.
                ctx.logger.info(
                    `[AiContextFreshness] Stale AI context (stamp ${stamp} < ${deps.currentVersion}) — ` +
                        `repair owned by the activation sweep (refreshAiBundlesOnActivation); ` +
                        `stale across restarts means the sweep is failing`,
                );
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
            if (!versionStale) {
                // The healthy verdict logs too — "checked and fine" must not read
                // like "never ran" (routine per-open line, so Debug-channel only).
                ctx.logger.debug(
                    `[AiContextFreshness] ok — stamp ${stamp} >= ${deps.currentVersion}; ` +
                        `composition ${applicable.length} applicable / ${installed.length} installed`,
                );
            }
            return { status: 'ok' };
        },
    };
}
