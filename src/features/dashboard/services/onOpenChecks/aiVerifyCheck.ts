/**
 * ai-verify on-open check (P2: which MCP/skill failed and why).
 *
 * Moves the on-open AI setup verification off the hook's own `useEffect` and onto
 * the orchestrator, so AI health is one coordinated check rather than a separate
 * chain (and the servers spawn ONCE on open, not twice). It maps the verification
 * to a typed outcome that names the SPECIFIC failure — the failing server id and
 * reason — in both `message` and `data`, replacing the generic yellow badge whose
 * diagnostic only reached the logs.
 *
 * `data` always carries `{ checks, inventory }` so the webview keeps driving the
 * AI-Ready badge + the "View AI Capabilities" skills/MCP modal exactly as before;
 * the `status`/`message` add the coordinated, surfaced diagnostic on top.
 *
 * `verify` is injected (the real wiring is `verifyAiSetup(path, distPath)`), so
 * the check stays decoupled and unit-testable. Not `reRunnable` — the verify
 * spawns MCP servers, so it runs once per session (the on-demand re-verify after
 * Regenerate keeps using the `verify-ai-setup` request path).
 *
 * @module features/dashboard/services/onOpenChecks/aiVerifyCheck
 */

import type { CheckOutcome, OnOpenCheck, OnOpenCheckContext } from './types';
import type { AiCheckResult, AiVerificationResult } from '@/features/ai';
import type { AiInventory } from '@/types/ai';
import { CHECK_IDS } from '@/types/messages';

/** Payload the webview routes from a `checkResult{ai-verify}` (drives badge + modal). */
export interface AiVerifyCheckData {
    checks: AiCheckResult[];
    inventory: AiInventory;
}

/** Injected verify — the real wiring is `verifyAiSetup(projectPath, extensionDistPath)`. */
export interface AiVerifyCheckDeps {
    verify: (projectPath: string) => Promise<AiVerificationResult>;
}

const FILE_CHECK_FAILED = 'AI context files are missing or invalid — Regenerate AI files';

/** Name the first inventory inspector failure (the which + why), or undefined. */
function firstInventoryFailure(inventory: AiInventory): string | undefined {
    if (inventory.mcpsError) return `MCP inventory failed: ${inventory.mcpsError}`;
    const badMcp = inventory.mcps?.find(m => m.status !== 'ok');
    if (badMcp) return `MCP "${badMcp.id}" failed: ${badMcp.error ?? badMcp.status}`;
    if (inventory.skillsError) return `Skills inventory failed: ${inventory.skillsError}`;
    if (inventory.sessionMcpsError) return `Session MCP inventory failed: ${inventory.sessionMcpsError}`;
    return undefined;
}

/** Build the ai-verify check. Pass `verifyAiSetup` bound to the extension dist path. */
export function createAiVerifyCheck(deps: AiVerifyCheckDeps): OnOpenCheck {
    return {
        id: CHECK_IDS.AI_VERIFY,
        mode: 'background',
        async run(ctx: OnOpenCheckContext): Promise<CheckOutcome<AiVerifyCheckData>> {
            const { project } = ctx;

            const result = await deps.verify(project.path);
            // Always carry the full result so the badge + modal render unchanged.
            const data: AiVerifyCheckData = { checks: result.checks, inventory: result.inventory };

            // A failed file-presence check is a hard "broken" — files missing/invalid.
            if (result.checks.some(c => c.status !== 'ok')) {
                return { checkId: CHECK_IDS.AI_VERIFY, status: 'error', message: FILE_CHECK_FAILED, data };
            }

            // Files OK but an inventory inspector failed — surface WHICH and WHY (P2).
            const failure = firstInventoryFailure(result.inventory);
            if (failure) {
                return { checkId: CHECK_IDS.AI_VERIFY, status: 'warning', message: failure, data };
            }

            return { checkId: CHECK_IDS.AI_VERIFY, status: 'ok', data };
        },
    };
}
