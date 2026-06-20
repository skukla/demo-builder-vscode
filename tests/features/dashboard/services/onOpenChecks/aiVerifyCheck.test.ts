/**
 * ai-verify on-open check (Step 5) — P2: which MCP/skill failed and why.
 *
 * Moves the AI setup verification onto the orchestrator and maps it to a typed
 * outcome that carries the SPECIFIC failure (the failing server id + reason) in
 * both the message and `data` — replacing the generic yellow badge that hid the
 * diagnostic in logs. `data` always carries {checks, inventory} so the webview
 * keeps driving the AI badge + skills/MCP modal exactly as before. The verify is
 * injected for clean unit testing (the real wiring spawns the servers once).
 */

import { createAiVerifyCheck } from '@/features/dashboard/services/onOpenChecks/aiVerifyCheck';
import { CHECK_IDS } from '@/types/messages';
import type { CheckOutcome, OnOpenCheckContext } from '@/features/dashboard/services/onOpenChecks';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function makeCtx(): OnOpenCheckContext {
    return { project: { path: '/proj' } as Project, logger: mockLogger, post: jest.fn() };
}

const okChecks = [
    { name: 'AGENTS.md', status: 'ok' as const },
    { name: '.claude/mcp.json', status: 'ok' as const },
    { name: 'mcp-binary', status: 'ok' as const },
    { name: 'skill-files', status: 'ok' as const },
];

const emptyInventory = { skills: [], mcps: [], sessionMcps: [] };

function makeCheck(verifyResult: unknown) {
    return createAiVerifyCheck({ verify: jest.fn().mockResolvedValue(verifyResult) });
}

it('is the ai-verify check (guarded — verify spawns servers, run once per session)', () => {
    const check = makeCheck({ status: 'ok', checks: okChecks, inventory: emptyInventory });
    expect(check.id).toBe(CHECK_IDS.AI_VERIFY);
    expect(check.reRunnable).toBeFalsy();
});

it('all checks ok + healthy inventory → ok; data carries checks + inventory', async () => {
    const check = makeCheck({ status: 'ok', checks: okChecks, inventory: emptyInventory });

    const outcome = await check.run(makeCtx()) as CheckOutcome<{ checks: unknown[]; inventory: unknown }>;

    expect(outcome.status).toBe('ok');
    expect(outcome.data?.checks).toHaveLength(4);
    expect(outcome.data?.inventory).toEqual(emptyInventory);
});

it('a failed file check → error (red), with the data still attached', async () => {
    const checks = [
        { name: 'AGENTS.md', status: 'error' as const, message: 'missing' },
        ...okChecks.slice(1),
    ];
    const check = makeCheck({ status: 'error', checks, inventory: emptyInventory });

    const outcome = await check.run(makeCtx()) as CheckOutcome;

    expect(outcome.status).toBe('error');
    expect(outcome.message).toBeTruthy();
});

it('inventory inspector failure names the failing MCP server + reason (which/why)', async () => {
    const inventory = {
        skills: [],
        mcps: [{ id: 'playwright', status: 'error', error: 'MODULE_NOT_FOUND: @playwright/mcp' }],
        sessionMcps: [],
    };
    const check = makeCheck({ status: 'ok', checks: okChecks, inventory });

    const outcome = await check.run(makeCtx()) as CheckOutcome<{ inventory: unknown }>;

    expect(outcome.status).toBe('warning');
    // The which (server id) AND the why (reason) are in the message, not just logs.
    expect(outcome.message).toMatch(/playwright/);
    expect(outcome.message).toMatch(/MODULE_NOT_FOUND/);
    // …and the inventory is still in data for the modal.
    expect(outcome.data?.inventory).toEqual(inventory);
});

it('an mcpsError (whole inspector failed) → warning naming the inspector failure', async () => {
    const inventory = { skills: [], mcps: [], sessionMcps: [], mcpsError: 'spawn EACCES' };
    const check = makeCheck({ status: 'ok', checks: okChecks, inventory });

    const outcome = await check.run(makeCtx()) as CheckOutcome;

    expect(outcome.status).toBe('warning');
    expect(outcome.message).toMatch(/spawn EACCES/);
});
