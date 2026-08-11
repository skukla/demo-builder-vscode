/**
 * ai-context-freshness on-open check — detect-and-surface (broad AI-context drift).
 *
 * Every project gets a COPY of the extension's AI context at creation (skills,
 * AGENTS.md/CLAUDE.md, .claude/mcp.json + .mcp.json, .claude/settings.json).
 * Nothing reconciles those copies afterward, so a project silently rots behind the
 * extension when skills/templates change. This check compares the project's
 * persisted `aiContextVersion` stamp against the current `AI_CONTEXT_VERSION`
 * (injected as `currentVersion`) and, when stale, returns a `warning` — which
 * flips the AI badge to "AI files out of date" and surfaces the existing
 * "Regenerate AI files" action (DashboardStatusHeader gates that action on a
 * red/yellow AI badge). The user's explicit Regenerate click is the remediation.
 *
 * Per the OnOpenCheck P1 contract it does NOT prompt or heal on open — it is a
 * cheap, read-only in-memory compare. Because it's cheap and side-effect-free it
 * is `reRunnable`: re-evaluated on every status refresh, which is how the badge
 * clears the moment the user regenerates (persisting a fresh stamp). Detect-only
 * (vs mcp-health's silent auto-heal) also avoids a concurrent-heal race: the two
 * checks can't both drive `handleRegenerateAiFiles` at once.
 *
 * @module features/dashboard/services/onOpenChecks/aiContextFreshnessCheck
 */

import type { CheckResult, OnOpenCheck, OnOpenCheckContext } from './types';
import { CHECK_IDS } from '@/types/messages';

/** Badge text when the project's AI bundle predates the current extension. */
const STALE_MESSAGE = 'AI files out of date';

/** Injected collaborator — the current AI-context bundle version (`AI_CONTEXT_VERSION`). */
export interface AiContextFreshnessCheckDeps {
    currentVersion: number;
}

/**
 * Build the ai-context-freshness check. Pass the current `AI_CONTEXT_VERSION`.
 * NOT `edsOnly` (AI context is generated for every project).
 */
export function createAiContextFreshnessCheck(deps: AiContextFreshnessCheckDeps): OnOpenCheck {
    return {
        id: CHECK_IDS.AI_CONTEXT_FRESHNESS,
        mode: 'background',
        // Cheap read-only compare — re-run on every status refresh so the badge
        // clears immediately after the user regenerates (persists a new stamp).
        reRunnable: true,
        async run(ctx: OnOpenCheckContext): Promise<CheckResult> {
            const stamp = ctx.project.aiContextVersion ?? 0;
            if (stamp >= deps.currentVersion) {
                return { status: 'ok' };
            }
            ctx.logger.info(
                `[AiContextFreshness] Stale AI context (stamp ${stamp} < ${deps.currentVersion})`,
            );
            return { status: 'warning', message: STALE_MESSAGE };
        },
    };
}
