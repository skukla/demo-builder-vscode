/**
 * logAiVerification — secret redaction of the MCP stderr tail.
 *
 * `logAiVerification` logs each failed MCP server's captured child-process stderr
 * tail (`entry.error`) at `warn` (User Logs channel). `warn`/`info` do NOT pass
 * through the redactor, so a user who adds a credential-bearing env to a
 * third-party server in `.claude/mcp.json` could leak that secret to the logs if
 * the server echoes its environment on a startup crash. The tail must be redacted
 * before logging, WITHOUT collapsing the multi-line socket/connect diagnostic
 * (which is load-bearing for MCP-timeout debugging).
 */

import { logAiVerification } from '@/features/dashboard/handlers/aiHandlers';
import { createMockContext } from './aiHandlers.testUtils';
import type { AiVerificationResult } from '@/features/ai';

function resultWithMcpError(error: string): AiVerificationResult {
    return {
        status: 'error',
        checks: [{ name: 'skills', status: 'ok' }],
        inventory: {
            skills: [],
            mcps: [{ id: 'user-added-server', status: 'error', error }],
            sessionMcps: [],
        },
    } as unknown as AiVerificationResult;
}

function mcpWarnText(warn: jest.Mock): string {
    const call = warn.mock.calls.find(([msg]) => String(msg).includes('[AI Verify] mcp'));
    return call ? String(call[0]) : '';
}

it('redacts a credential-bearing env in the MCP stderr tail', () => {
    const ctx = createMockContext();
    const secret = 'ghp_0123456789abcdef0123456789abcdef';
    const stderr = [
        'Error: connect ECONNREFUSED /var/folders/ab/xyz/demo-builder-mcp.sock',
        '    at TCPConnectWrap.afterConnect',
        `INJECTED_TOKEN=${secret}`,
    ].join('\n');

    logAiVerification(ctx, resultWithMcpError(stderr));

    const logged = mcpWarnText(ctx.logger.warn as jest.Mock);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('INJECTED_TOKEN=ghp_');
});

it('preserves the multi-line connect diagnostic (does not collapse to one line)', () => {
    const ctx = createMockContext();
    const stderr = [
        'Error: connect ECONNREFUSED demo-builder-mcp.sock',
        '    at TCPConnectWrap.afterConnect',
        '    at Socket.emit',
    ].join('\n');

    logAiVerification(ctx, resultWithMcpError(stderr));

    const logged = mcpWarnText(ctx.logger.warn as jest.Mock);
    // The connect-error keyword and the multi-line stack survive redaction.
    expect(logged).toContain('connect ECONNREFUSED');
    expect(logged).toContain('TCPConnectWrap.afterConnect');
    expect(logged).toContain('Socket.emit');
});

it('does not throw on a missing stderr tail', () => {
    const ctx = createMockContext();
    const result = {
        status: 'error',
        checks: [],
        inventory: { skills: [], mcps: [{ id: 's', status: 'error' }], sessionMcps: [] },
    } as unknown as AiVerificationResult;

    expect(() => logAiVerification(ctx, result)).not.toThrow();
});
