/**
 * ai-context-freshness on-open check — detect-and-surface.
 *
 * Per the OnOpenCheck P1 contract this check does NOT prompt or heal on open; it
 * is a cheap, read-only in-memory compare. A project is stale when its persisted
 * `aiContextVersion` stamp is older than the current `AI_CONTEXT_VERSION` constant
 * (or absent — catching every pre-feature project); stale → `warning` (which flips
 * the AI badge to "AI files out of date" and surfaces the existing Regenerate
 * action). It is NOT edsOnly (AI context is generated for all projects) and IS
 * reRunnable (re-evaluated each status refresh so the badge clears after Regenerate).
 */

import { createAiContextFreshnessCheck } from '@/features/dashboard/services/onOpenChecks/aiContextFreshnessCheck';
import { CHECK_IDS } from '@/types/messages';
import type { OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const CURRENT_VERSION = 2;

function makeCtx(aiContextVersion?: number): { ctx: OnOpenCheckContext; post: jest.Mock } {
    const post = jest.fn();
    return {
        ctx: {
            project: { path: '/proj', aiContextVersion } as Project,
            logger: mockLogger,
            post,
        },
        post,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

it('is the ai-context-freshness check: NOT edsOnly, reRunnable (cheap read-only compare)', () => {
    const check = createAiContextFreshnessCheck({ currentVersion: CURRENT_VERSION });
    expect(check.id).toBe(CHECK_IDS.AI_CONTEXT_FRESHNESS);
    expect(check.edsOnly).toBeFalsy();
    expect(check.reRunnable).toBe(true);
});

it('fresh (stamp == current) → ok, no side effects', async () => {
    const check = createAiContextFreshnessCheck({ currentVersion: CURRENT_VERSION });
    const { ctx, post } = makeCtx(CURRENT_VERSION);

    const outcome = await check.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(post).not.toHaveBeenCalled();
});

it('fresh (stamp newer than current) → ok', async () => {
    const check = createAiContextFreshnessCheck({ currentVersion: CURRENT_VERSION });
    const { ctx } = makeCtx(CURRENT_VERSION + 1);

    expect((await check.run(ctx)).status).toBe('ok');
});

it('stale (older stamp) → warning with the "out of date" message', async () => {
    const check = createAiContextFreshnessCheck({ currentVersion: CURRENT_VERSION });
    const { ctx } = makeCtx(1);

    const outcome = await check.run(ctx);

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toMatch(/out of date/i);
});

it('stale (absent stamp) → warning (catches every pre-feature project)', async () => {
    const check = createAiContextFreshnessCheck({ currentVersion: CURRENT_VERSION });
    const { ctx } = makeCtx(undefined);

    expect((await check.run(ctx)).status).toBe('warning');
});

it('never prompts or heals on open (returns synchronously from an in-memory compare)', async () => {
    const check = createAiContextFreshnessCheck({ currentVersion: CURRENT_VERSION });
    const { ctx, post } = makeCtx(1);

    const outcome = await check.run(ctx);

    // Detect-only: it reports staleness but performs no write/heal and posts nothing.
    expect(outcome.status).toBe('warning');
    expect(post).not.toHaveBeenCalled();
});
