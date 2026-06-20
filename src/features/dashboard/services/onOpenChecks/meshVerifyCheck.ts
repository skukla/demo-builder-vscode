/**
 * mesh-verify on-open check (P2: no more silent flip).
 *
 * The background mesh verify used to mutate persisted mesh status to
 * `not-deployed` with no user signal — and it flipped to `not-deployed` even on
 * a transient verify error, scaring the user about a mesh that's actually fine.
 * As an OnOpenCheck it ALWAYS posts a typed outcome:
 *   - deployed mesh still exists → `ok` (endpoint), state synced.
 *   - genuinely gone            → `warning` ("API Mesh is no longer deployed"),
 *                                 state still synced — but now the user is told.
 *   - verify error              → `unknown` (transient; no scare, no state flip).
 *
 * The verify (cached-auth Adobe I/O call — already P1-safe, no browser),
 * syncMeshStatus, and markDirty are injected so the check stays decoupled and
 * unit-testable. Wired in `handleRequestStatus` only when the project has a
 * deployed mesh and the user is authenticated.
 *
 * @module features/dashboard/services/onOpenChecks/meshVerifyCheck
 */

import type { CheckOutcome, OnOpenCheck, OnOpenCheckContext } from './types';
import type { Project } from '@/types';
import { CHECK_IDS } from '@/types/messages';

/** The subset of the mesh verifier result this check reads. */
export interface MeshVerifyResultLike {
    success: boolean;
    error?: string;
    data?: { exists?: boolean; endpoint?: string };
}

/**
 * Injected collaborators — keeps the check decoupled from the mesh service +
 * state. Generic over the verifier result `R` so `verify` and `syncMeshStatus`
 * share the SAME concrete type (the real `MeshVerificationResult` at the wiring
 * site), while the check only relies on the {@link MeshVerifyResultLike} subset.
 */
export interface MeshVerifyCheckDeps<R extends MeshVerifyResultLike = MeshVerifyResultLike> {
    verify: (project: Project) => Promise<R>;
    syncMeshStatus: (project: Project, result: R) => Promise<void>;
    markDirty: (key: keyof Project) => void;
}

/** Payload the webview routes from a `checkResult{mesh-verify}`. */
export interface MeshVerifyCheckData {
    endpoint?: string;
}

/** Build the mesh-verify check. Pass the mesh verifier fns + state markDirty. */
export function createMeshVerifyCheck<R extends MeshVerifyResultLike>(deps: MeshVerifyCheckDeps<R>): OnOpenCheck {
    return {
        id: CHECK_IDS.MESH_VERIFY,
        mode: 'background',
        // Re-verify on each requestStatus (mirrors the prior background verify),
        // e.g. after a re-auth refresh — not a once-per-session check.
        reRunnable: true,
        async run(ctx: OnOpenCheckContext): Promise<CheckOutcome<MeshVerifyCheckData>> {
            const { project, logger } = ctx;

            const result = await deps.verify(project);

            if (result?.success && result.data?.exists) {
                await deps.syncMeshStatus(project, result);
                deps.markDirty('meshState');
                return { checkId: CHECK_IDS.MESH_VERIFY, status: 'ok', data: { endpoint: result.data.endpoint } };
            }

            if (!result?.success) {
                // Transient verify error — do NOT flip persisted state to not-deployed
                // (the old path's scare). Surface it as unknown and move on.
                logger.warn(`[MeshVerify] Verification failed (transient): ${result?.error ?? 'unknown error'}`);
                return { checkId: CHECK_IDS.MESH_VERIFY, status: 'unknown', message: 'Cannot verify API Mesh right now' };
            }

            // Verified, but the mesh is gone (deleted externally). Persist AND tell the user.
            logger.warn('[MeshVerify] Mesh not found in Adobe I/O — may have been deleted externally');
            await deps.syncMeshStatus(project, result);
            deps.markDirty('meshState');
            return {
                checkId: CHECK_IDS.MESH_VERIFY,
                status: 'warning',
                message: 'API Mesh is no longer deployed',
            };
        },
    };
}
