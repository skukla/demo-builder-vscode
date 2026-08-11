/**
 * mcp-health on-open check (the silent-MCP self-heal, P2).
 *
 * Detects stale `.claude/mcp.json` paths (a project created/moved before an MCP
 * package existed points at files that aren't there → the silent MODULE_NOT_FOUND
 * / "Connection closed" that only surfaced in logs). On confirmed drift it
 * VISIBLY auto-heals: posts a `warning` ("Updating AI configuration…"), runs the
 * existing regenerate pipeline (`creationProgress` is emitted by the heal itself),
 * then resolves `ok` — or `error` (with a retry hint) if the heal fails.
 *
 * The drift probe and the heal are injected so the check stays decoupled from the
 * handler layer and is fully unit-testable. Wired in `handleRequestStatus`, which
 * supplies `detectMcpDrift` and `() => handleRegenerateAiFiles(context)`.
 *
 * `edsOnly` (only EDS projects carry the storefront MCP tooling) + once-per-session
 * (NOT reRunnable — don't heal twice per session) are enforced by the orchestrator.
 *
 * @module features/dashboard/services/onOpenChecks/mcpHealthCheck
 */

import type { CheckResult, OnOpenCheck, OnOpenCheckContext } from './types';
import type { McpDriftResult } from '@/features/ai/mcpDriftDetector';
import { CHECK_IDS } from '@/types/messages';

/** Result of the injected heal (mirrors the handler's HandlerResponse subset). */
export interface McpHealResult {
    success: boolean;
    error?: string;
}

/** Injected collaborators — keeps the check decoupled from disk + the handler layer. */
export interface McpHealthCheckDeps {
    detectDrift: (projectPath: string) => Promise<McpDriftResult>;
    heal: () => Promise<McpHealResult>;
}

/** Payload the webview routes from a `checkResult{mcp-health}`. */
export interface McpHealthCheckData {
    /** Resolved paths that were missing (drift detail). */
    missing?: string[];
}

const HEALING_MESSAGE = 'Updating AI configuration…';
const RETRY_HINT = 'AI configuration update failed — retry from View AI Capabilities';

/**
 * Build the mcp-health check. Pass `detectMcpDrift` and a heal closure
 * (`() => handleRegenerateAiFiles(context)`) from the handler.
 */
export function createMcpHealthCheck(deps: McpHealthCheckDeps): OnOpenCheck {
    return {
        id: CHECK_IDS.MCP_HEALTH,
        mode: 'background',
        edsOnly: true,
        async run(ctx: OnOpenCheckContext): Promise<CheckResult<McpHealthCheckData>> {
            const { project, logger, post } = ctx;

            const drift = await deps.detectDrift(project.path);
            if (!drift.drifted) {
                return { status: 'ok' };
            }

            // P2: telegraph the heal BEFORE the work — never silent.
            logger.info(`[McpHealth] Stale MCP paths detected (${drift.missing.length}); auto-healing`);
            post({ status: 'warning', message: HEALING_MESSAGE, data: { missing: drift.missing } });

            try {
                const result = await deps.heal();
                if (result.success) {
                    return { status: 'ok' };
                }
                logger.warn(`[McpHealth] Heal failed: ${result.error ?? 'unknown error'}`);
                return { status: 'error', message: RETRY_HINT };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`[McpHealth] Heal threw: ${message}`);
                return { status: 'error', message };
            }
        },
    };
}
