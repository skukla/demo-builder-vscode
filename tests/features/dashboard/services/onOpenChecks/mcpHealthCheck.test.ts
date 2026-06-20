/**
 * mcp-health on-open check (Step 3) — the silent-MCP self-heal (P2).
 *
 * On a confirmed stale-path drift it posts a VISIBLE `warning` ("Updating AI
 * configuration…"), runs the existing regenerate heal, then resolves `ok` (or
 * `error` if the heal fails) — replacing the old silent MODULE_NOT_FOUND. The
 * drift probe + heal are injected, so this unit test drives every branch without
 * touching disk or the handler layer. The `edsOnly` gate + once-per-session
 * re-entrancy are the orchestrator's job (covered in its own tests).
 */

import { createMcpHealthCheck } from '@/features/dashboard/services/onOpenChecks/mcpHealthCheck';
import { CHECK_IDS } from '@/types/messages';
import type { CheckOutcome, OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function makeCtx(): { ctx: OnOpenCheckContext; post: jest.Mock } {
    const post = jest.fn();
    return { ctx: { project: { path: '/proj' } as Project, logger: mockLogger, post }, post };
}

it('is the mcp-health check: edsOnly, guarded (not reRunnable)', () => {
    const check = createMcpHealthCheck({ detectDrift: jest.fn(), heal: jest.fn() });
    expect(check.id).toBe(CHECK_IDS.MCP_HEALTH);
    expect(check.edsOnly).toBe(true);
    expect(check.reRunnable).toBeFalsy();
});

it('healthy (no drift) → ok, no warning posted, heal not run', async () => {
    const detectDrift = jest.fn().mockResolvedValue({ drifted: false, missing: [] });
    const heal = jest.fn();
    const check = createMcpHealthCheck({ detectDrift, heal });
    const { ctx, post } = makeCtx();

    const outcome = await check.run(ctx);

    expect(outcome.status).toBe('ok');
    expect(heal).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'warning' }));
});

it('drift → posts a visible warning, heals once, then resolves ok', async () => {
    const detectDrift = jest.fn().mockResolvedValue({ drifted: true, missing: ['/proj/.demo-builder-mcp/x.js'] });
    const heal = jest.fn().mockResolvedValue({ success: true });
    const check = createMcpHealthCheck({ detectDrift, heal });
    const { ctx, post } = makeCtx();

    const outcome = await check.run(ctx) as CheckOutcome;

    // Telegraphs the heal BEFORE doing the work (P2: visible, not silent).
    expect(post).toHaveBeenCalledWith(expect.objectContaining({
        checkId: CHECK_IDS.MCP_HEALTH,
        status: 'warning',
        message: expect.stringMatching(/updating ai configuration/i),
    }));
    expect(heal).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('ok');
});

it('heal returns failure → error outcome (with a retry hint)', async () => {
    const detectDrift = jest.fn().mockResolvedValue({ drifted: true, missing: ['/proj/x.js'] });
    const heal = jest.fn().mockResolvedValue({ success: false, error: 'npm install failed' });
    const check = createMcpHealthCheck({ detectDrift, heal });
    const { ctx } = makeCtx();

    const outcome = await check.run(ctx) as CheckOutcome;

    expect(outcome.status).toBe('error');
    expect(outcome.message).toBeTruthy();
});

it('heal throws → error outcome (no rejection escapes)', async () => {
    const detectDrift = jest.fn().mockResolvedValue({ drifted: true, missing: ['/proj/x.js'] });
    const heal = jest.fn().mockRejectedValue(new Error('boom'));
    const check = createMcpHealthCheck({ detectDrift, heal });
    const { ctx } = makeCtx();

    const outcome = await check.run(ctx) as CheckOutcome;

    expect(outcome.status).toBe('error');
    expect(outcome.message).toMatch(/boom/);
});
