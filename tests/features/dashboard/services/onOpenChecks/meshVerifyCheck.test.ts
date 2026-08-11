/**
 * mesh-verify on-open check (Step 4) — P2: no more silent flip.
 *
 * The background mesh verify used to quietly mutate persisted status to
 * not-deployed with no user signal (and flipped to not-deployed even on a
 * transient verify error). As a check it ALWAYS posts a typed outcome:
 *   - deployed mesh still exists → ok (endpoint)
 *   - genuinely gone           → warning ("API Mesh is no longer deployed") +
 *                                 still update persisted state
 *   - verify error             → unknown (transient; don't scare, don't flip)
 * verify/syncMeshStatus/markDirty are injected for clean unit testing.
 */

import { createMeshVerifyCheck } from '@/features/dashboard/services/onOpenChecks/meshVerifyCheck';
import { CHECK_IDS } from '@/types/messages';
import type { CheckResult, OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function makeCtx(): { ctx: OnOpenCheckContext; post: jest.Mock } {
    const post = jest.fn();
    return { ctx: { project: { path: '/proj' } as Project, logger: mockLogger, post }, post };
}

function makeDeps(verifyResult: unknown) {
    return {
        verify: jest.fn().mockResolvedValue(verifyResult),
        syncMeshStatus: jest.fn().mockResolvedValue(undefined),
        markDirty: jest.fn(),
    };
}

it('is the mesh-verify check, reRunnable (re-verifies on each requestStatus)', () => {
    const check = createMeshVerifyCheck(makeDeps({ success: true, data: { exists: true } }));
    expect(check.id).toBe(CHECK_IDS.MESH_VERIFY);
    expect(check.reRunnable).toBe(true);
});

it('deployed mesh still exists → ok with endpoint; persists state', async () => {
    const deps = makeDeps({ success: true, data: { exists: true, endpoint: 'https://mesh.example/graphql' } });
    const check = createMeshVerifyCheck(deps);
    const { ctx } = makeCtx();

    const outcome = await check.run(ctx) as CheckResult<{ endpoint?: string }>;

    expect(outcome.status).toBe('ok');
    expect(outcome.data?.endpoint).toBe('https://mesh.example/graphql');
    expect(deps.syncMeshStatus).toHaveBeenCalledTimes(1);
    expect(deps.markDirty).toHaveBeenCalledWith('meshState');
});

it('mesh gone (success but !exists) → VISIBLE warning + still persists state', async () => {
    const deps = makeDeps({ success: true, data: { exists: false } });
    const check = createMeshVerifyCheck(deps);
    const { ctx } = makeCtx();

    const outcome = await check.run(ctx) as CheckResult;

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toMatch(/no longer deployed/i);
    // Still updates persisted state — but now ALSO tells the user.
    expect(deps.syncMeshStatus).toHaveBeenCalledTimes(1);
    expect(deps.markDirty).toHaveBeenCalledWith('meshState');
});

it('verify error → unknown (transient); does NOT flip persisted state', async () => {
    const deps = makeDeps({ success: false, error: 'network timeout' });
    const check = createMeshVerifyCheck(deps);
    const { ctx } = makeCtx();

    const outcome = await check.run(ctx) as CheckResult;

    expect(outcome.status).toBe('unknown');
    // The old path flipped to not-deployed on a transient error — no more.
    expect(deps.syncMeshStatus).not.toHaveBeenCalled();
    expect(deps.markDirty).not.toHaveBeenCalled();
});
