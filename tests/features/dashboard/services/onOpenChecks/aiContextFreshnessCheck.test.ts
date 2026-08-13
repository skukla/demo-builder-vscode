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

const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
};

const CURRENT_VERSION = 2;

/**
 * Benign composition-axis deps: nothing applies, nothing installed — the
 * version-axis tests exercise their branch in isolation through these.
 */
function makeCheck(over?: {
    applicablePackages?: (project: Project) => string[];
    installedPackages?: (projectPath: string) => Promise<string[]>;
}) {
    return createAiContextFreshnessCheck({
        currentVersion: CURRENT_VERSION,
        applicablePackages: over?.applicablePackages ?? (() => []),
        installedPackages: over?.installedPackages ?? (async () => []),
    });
}

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
    const check = makeCheck();
    expect(check.id).toBe(CHECK_IDS.AI_CONTEXT_FRESHNESS);
    expect(check.edsOnly).toBeFalsy();
    expect(check.reRunnable).toBe(true);
});

it('fresh (stamp == current) → ok, no side effects', async () => {
    const check = makeCheck();
    const { ctx, post } = makeCtx(CURRENT_VERSION);

    const outcome = await check.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(post).not.toHaveBeenCalled();
});

it('fresh (stamp newer than current) → ok', async () => {
    const check = makeCheck();
    const { ctx } = makeCtx(CURRENT_VERSION + 1);

    expect((await check.run(ctx)).status).toBe('ok');
});

it('stale (older stamp) → warning with the "out of date" message', async () => {
    const check = makeCheck();
    const { ctx } = makeCtx(1);

    const outcome = await check.run(ctx);

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toMatch(/out of date/i);
});

it('stale (absent stamp) → warning (catches every pre-feature project)', async () => {
    const check = makeCheck();
    const { ctx } = makeCtx(undefined);

    expect((await check.run(ctx)).status).toBe('warning');
});

it('never prompts or heals on open (returns synchronously from an in-memory compare)', async () => {
    const check = makeCheck();
    const { ctx, post } = makeCtx(1);

    const outcome = await check.run(ctx);

    // Detect-only: it reports staleness but performs no write/heal and posts nothing.
    expect(outcome.status).toBe('warning');
    expect(post).not.toHaveBeenCalled();
});

// =============================================================================
// The composition axis (the 2026-08-13 under-fire: a project that GAINS a
// qualifying component after creation got no new packages, no new skills, and
// no prompt — the check watched only the version stamp, so a fresh stamp read
// as healthy while the bundle no longer matched the project).
// =============================================================================

describe('composition axis — bundle vs what the project now qualifies for', () => {
    const PKG = '@adobe-commerce/commerce-extensibility-tools';

    it('fresh stamp but a qualifying package is NOT installed → warning (the under-fire case)', async () => {
        const check = makeCheck({
            applicablePackages: () => [PKG],
            installedPackages: async () => [], // .demo-builder-mcp/ has nothing
        });
        const { ctx } = makeCtx(CURRENT_VERSION);

        const outcome = await check.run(ctx);

        expect(outcome.status).toBe('warning');
        expect(outcome.message).toBeTruthy();
    });

    it('fresh stamp and every applicable package installed → ok', async () => {
        const check = makeCheck({
            applicablePackages: () => [PKG],
            installedPackages: async () => [PKG],
        });
        const { ctx } = makeCtx(CURRENT_VERSION);

        expect((await check.run(ctx)).status).toBe('ok');
    });

    it('extra installed packages beyond the applicable set do not warn', async () => {
        const check = makeCheck({
            applicablePackages: () => [],
            installedPackages: async () => [PKG], // left over from a removed component
        });
        const { ctx } = makeCtx(CURRENT_VERSION);

        expect((await check.run(ctx)).status).toBe('ok');
    });

    it('names the missing packages in the log line (the WHY, for support)', async () => {
        const check = makeCheck({
            applicablePackages: () => [PKG],
            installedPackages: async () => [],
        });
        const { ctx } = makeCtx(CURRENT_VERSION);

        await check.run(ctx);

        const logged = (mockLogger.info as jest.Mock).mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toContain(PKG);
    });
});

// The logging-ambiguity requirement: a HEALTHY verdict must leave a line too,
// or "checked and fine" and "never ran" read as the same silence in Debug Logs.
describe('decision logging — silence must stop being ambiguous', () => {
    it('logs the decision on the healthy path, not only when unhappy', async () => {
        const check = makeCheck();
        const { ctx } = makeCtx(CURRENT_VERSION);

        const outcome = await check.run(ctx);

        expect(outcome.status).toBe('ok');
        const debugCalls = (mockLogger.debug as jest.Mock).mock.calls.length;
        const infoCalls = (mockLogger.info as jest.Mock).mock.calls.length;
        expect(debugCalls + infoCalls).toBeGreaterThan(0);
    });
});
