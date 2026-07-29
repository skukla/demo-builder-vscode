/**
 * Diagnostics — copyable report
 *
 * Getting a diagnostic report out of a colleague's machine has cost a
 * round-trip every time. The existing paths are "Export Log" (a file to find,
 * save, and email) or select-all in the output channel, which copies EVERY run
 * in the session — that is how a report arrives at 45 KB with a duplicated
 * section in the middle.
 *
 * A "Copy Report" action on the completion notification hands them the current
 * run, curated, in one click.
 *
 * The summary is safe to paste by construction: the credential section prints a
 * login, a credential TYPE prefix, granted scopes, a boolean, status codes, and
 * Adobe's x-error — never the token. The leak guard below is what keeps that
 * true as the summary grows.
 */

import * as vscode from 'vscode';
import { buildSummaryLines, runDiagnosticsAction } from '@/commands/diagnostics';
import type { DiagnosticsReport } from '@/commands/diagnostics';

const TOKEN = 'gho_SUPERSECRETVALUE0000000000000000000';

function makeReport(overrides: Partial<DiagnosticsReport> = {}): DiagnosticsReport {
    return {
        timestamp: '2026-07-29T00:00:00Z',
        system: { platform: 'darwin', release: '25.5.0' },
        vscode: { version: '1.99.0' },
        tools: {
            node: { installed: true, output: 'v22.0.0', duration: 1 },
            git: { installed: false, duration: 1 },
        },
        adobe: { installed: true, version: '11.0.1', authConfigured: true, tokenExpired: false },
        environment: {},
        tests: {
            browserLaunch: { available: true },
            adobeLoginCommand: { available: true },
            fileSystem: { canWrite: true },
        },
        mcp: { running: true, tools: ['sign_in'], hasSignIn: true },
        githubCredential: {
            github: {
                reachable: true,
                login: 'skukla',
                tokenType: 'gho_',
                grantedScopes: ['repo', 'workflow'],
            },
            repo: { fullName: 'owner/repo', canPush: true },
            adminApi: { httpStatus: 401, xError: '[admin] not authenticated' },
            verdict: 'Not a scope or permission problem — AEM is refusing the credential itself.',
        },
        ...overrides,
    } as unknown as DiagnosticsReport;
}

describe('buildSummaryLines', () => {
    it('produces the whole summary as lines', () => {
        const text = buildSummaryLines(makeReport()).join('\n');

        expect(text).toContain('DIAGNOSTICS SUMMARY');
        expect(text).toContain('Tools Status:');
        expect(text).toContain('Adobe CLI Status:');
        expect(text).toContain('Diagnostic Tests:');
        expect(text).toContain('MCP Server (in-extension):');
        expect(text).toContain('GitHub / AEM credential:');
    });

    it('ends the credential section with the verdict', () => {
        const lines = buildSummaryLines(makeReport());
        const verdict = lines.findIndex((l) => l.startsWith('  → '));
        const admin = lines.findIndex((l) => l.includes('AEM admin API:'));

        expect(verdict).toBeGreaterThan(admin);
    });

    it('carries the credential type but never the credential', () => {
        // This is the property that makes the report safe to paste into a
        // ticket. If it ever breaks, the copy button becomes a leak.
        const text = buildSummaryLines(makeReport()).join('\n');

        expect(text).toContain('gho_');
        expect(text).not.toContain(TOKEN);
        expect(text).not.toMatch(/gho_[A-Za-z0-9]/);
    });
});

describe('runDiagnosticsAction', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        show: jest.fn(),
        exportDebugLog: jest.fn(),
    };
    const SUMMARY = '=== DIAGNOSTICS SUMMARY ===\nSystem: darwin';

    beforeEach(() => jest.clearAllMocks());

    it('copies the summary when Copy Report is chosen', async () => {
        await runDiagnosticsAction('Copy Report', SUMMARY, logger as never);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(SUMMARY);
    });

    it('confirms the copy so the user knows it worked', async () => {
        await runDiagnosticsAction('Copy Report', SUMMARY, logger as never);

        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('still reveals the channel for Show Logs', async () => {
        await runDiagnosticsAction('Show Logs', SUMMARY, logger as never);

        expect(logger.show).toHaveBeenCalled();
        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('still exports for Export Log', async () => {
        await runDiagnosticsAction('Export Log', SUMMARY, logger as never);

        expect(logger.exportDebugLog).toHaveBeenCalled();
        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('does nothing when the notification is dismissed', async () => {
        await runDiagnosticsAction(undefined, SUMMARY, logger as never);

        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
        expect(logger.show).not.toHaveBeenCalled();
        expect(logger.exportDebugLog).not.toHaveBeenCalled();
    });
});
