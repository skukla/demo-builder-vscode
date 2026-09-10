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
import type { CheckResult, OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks/types';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockLogger: Logger = createMockLogger();

function makeCtx(): { ctx: OnOpenCheckContext; post: jest.Mock } {
    const post = jest.fn();
    return { ctx: { project: createMockProject({ path: '/proj' }), logger: mockLogger, post }, post };
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
    expect(deps.markDirty).toHaveBeenCalledWith('appBuilderComponents');
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
    expect(deps.markDirty).toHaveBeenCalledWith('appBuilderComponents');
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

it('a verifier that answers with nothing at all → unknown, not a crash', async () => {
    // The verifier is injected, and its own failure paths have resolved undefined
    // before. Reading `.success` off it directly turns a transient miss into a thrown
    // check, which the orchestrator reports as an error rather than as "cannot say".
    const deps = makeDeps(undefined);
    const check = createMeshVerifyCheck(deps);
    const { ctx } = makeCtx();

    const outcome = await check.run(ctx) as CheckResult;

    expect(outcome.status).toBe('unknown');
    expect(deps.syncMeshStatus).not.toHaveBeenCalled();
    expect(deps.markDirty).not.toHaveBeenCalled();
});

it('a successful verify carrying no data block → mesh gone, state still synced', async () => {
    // `data` is optional on the verifier result, so "succeeded but said nothing about
    // the mesh" is the same answer as "succeeded and it is not there".
    const result = { success: true };
    const deps = makeDeps(result);
    const check = createMeshVerifyCheck(deps);
    const { ctx } = makeCtx();

    const outcome = await check.run(ctx) as CheckResult;

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toMatch(/no longer deployed/i);
    // The ARGUMENTS, not just the call: the sync has to be handed this project and
    // this verifier result, or it persists the wrong mesh's status.
    expect(deps.syncMeshStatus).toHaveBeenCalledWith(ctx.project, result);
    expect(deps.markDirty).toHaveBeenCalledWith('appBuilderComponents');
});
