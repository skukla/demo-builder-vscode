/**
 * AI Status Derivations
 *
 * Pure derivations behind useDashboardStatus's AI surface: the "AI Ready"
 * badge state and the "View AI Capabilities" inventory view. Extracted from
 * the hook body (the deriveOrgCheckState precedent) so each stays a plain
 * function with focused unit tests; the hook wraps them in useMemo.
 *
 * @module features/dashboard/ui/hooks/aiStatusDerivations
 */

import type { AiReadyState, VerifyAiSetupResponse } from './dashboardStatusTypes';
import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';

/** Stable empty references so identity doesn't churn each render. */
const EMPTY_GATED: never[] = [];
const EMPTY_SKILLS: SkillInventoryEntry[] = [];
const EMPTY_MCPS: McpInventoryEntry[] = [];
const EMPTY_EDITED_FILES: string[] = [];

/**
 * Derive the "View AI Capabilities" inventory view from the verify state
 * (extracted from the hook body to keep its complexity in budget).
 *
 * - loading: no result and no failure = still in flight. Without this the
 *   modal collapsed "not asked yet" into "none exist" and told the user to
 *   regenerate healthy files.
 * - errors: a failed verify is an inspector error as far as these lists are
 *   concerned — we could not read them, which is what the error row already
 *   says. Claiming zero would be a different lie from the one just fixed.
 * - editedFiles: ADR-013 "kept your version" flags; absent inventory (or a
 *   pre-ADR verify response without the field) degrades to the stable empty
 *   list.
 */
export function deriveAiInventoryView(
    verifyResult: VerifyAiSetupResponse | null,
    verifyFailed: boolean,
): {
    aiSkills: SkillInventoryEntry[];
    aiMcps: McpInventoryEntry[];
    aiInventoryLoading: boolean;
    aiSkillsError: boolean;
    aiMcpsError: boolean;
    aiEditedFiles: string[];
    aiGatedSkills: Array<{
        file: string;
        toolId: string;
        reason: 'setting-disabled' | 'tool-missing';
    }>;
} {
    const inventory = verifyResult?.inventory;
    return {
        aiSkills: inventory?.skills ?? EMPTY_SKILLS,
        aiGatedSkills: inventory?.gatedSkills ?? EMPTY_GATED,
        aiMcps: inventory?.mcps ?? EMPTY_MCPS,
        aiInventoryLoading: !verifyResult && !verifyFailed,
        aiSkillsError: Boolean(inventory?.skillsError) || verifyFailed,
        aiMcpsError: Boolean(inventory?.mcpsError) || verifyFailed,
        aiEditedFiles: inventory?.editedFiles ?? EMPTY_EDITED_FILES,
    };
}

/** Inputs feeding the AI Ready badge — mirrors the hook state it reads. */
export interface AiBadgeInputs {
    verifyResult: VerifyAiSetupResponse | null;
    verifyFailed: boolean;
    mcpHealing: boolean;
    aiToolingMissing: boolean;
    aiRegenerating: boolean;
}

/**
 * Derive AI Ready badge state from the verify response. Colors:
 *   blue:   verify hasn't returned yet (initial) — matches the dashboard's
 *           convention that blue is "in-flight / transient" across badges
 *           (Mesh "Loading status...", Frontend "Starting...", etc.)
 *   red:    any of the project AI file checks failed
 *   yellow: files OK but an inventory inspector errored
 *   green:  files OK and inventory healthy
 *
 * Global MCP registration (~/.claude.json) is an optional convenience for
 * cross-directory discovery, not a readiness requirement — the per-project
 * .mcp.json is written at creation and is sufficient. So it does NOT gate
 * this badge; the "Demo Builder: Register Global MCP" command is the
 * explicit opt-in.
 */
export function deriveAiReadyState(inputs: AiBadgeInputs): AiReadyState {
    const { verifyResult, verifyFailed, mcpHealing, aiToolingMissing, aiRegenerating } = inputs;

    // A user-initiated regenerate is in flight (up to ~1 min with the tooling
    // install) — telegraph it, or the "Regenerate AI files" click reads as a
    // dead link. Highest precedence: it IS the current activity.
    if (aiRegenerating) {
        return { label: 'AI', color: 'blue', text: 'Regenerating AI files…' };
    }
    // The mcp-health check is visibly self-healing stale MCP paths — telegraph
    // it on the badge (P2) so the work isn't silent. Overrides the verify state
    // until the heal resolves (ok → verify-driven badge; error → falls back to
    // the verify badge whose "Regenerate AI files" action is the retry).
    if (mcpHealing) {
        return { label: 'AI', color: 'blue', text: 'Updating AI configuration…' };
    }
    if (!verifyResult) {
        // Verify failed — surface as 'Setup incomplete' rather than leaving
        // the badge stuck on gray indefinitely.
        if (verifyFailed) {
            return { label: 'AI', color: 'yellow', text: 'Setup incomplete' };
        }
        return { label: 'AI', color: 'blue', text: 'Verifying' };
    }

    const checks = verifyResult.checks ?? [];
    const anyCheckFailed = checks.some((c) => c.status !== 'ok');
    if (anyCheckFailed) {
        return { label: 'AI', color: 'red', text: 'Broken' };
    }

    const inv = verifyResult.inventory ?? {};
    const hasInventoryError = Boolean(inv.skillsError ?? inv.mcpsError);
    if (hasInventoryError) {
        return { label: 'AI', color: 'yellow', text: 'Setup incomplete' };
    }

    // Files verify healthy, but the project qualifies for MCP tooling it has
    // not received (composition axis — gaining a component after creation).
    // Yellow surfaces the "Regenerate AI files" action, which downloads it;
    // the reRunnable check clears the badge once the packages land.
    if (aiToolingMissing) {
        return { label: 'AI', color: 'yellow', text: 'AI tooling missing' };
    }

    return { label: 'AI', color: 'green', text: 'Ready' };
}
