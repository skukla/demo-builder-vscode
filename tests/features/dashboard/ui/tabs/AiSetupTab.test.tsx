/**
 * AiSetupTab Tests
 *
 * Tests for the AI Setup tab component:
 * - Calls verify-ai-setup on mount
 * - Renders check results with status indicators
 * - "Verify Now" button re-runs verification
 * - "Regenerate AI Files" button runs regeneration then re-verifies
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AiSetupTab } from '@/features/dashboard/ui/tabs/AiSetupTab';
import '@testing-library/jest-dom';
import type { AiVerificationResult } from '@/features/ai/aiSetupVerifier';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        request: jest.fn(),
        postMessage: jest.fn(),
    },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOkResult(): AiVerificationResult {
    return {
        status: 'ok',
        checks: [
            { name: 'CLAUDE.md', status: 'ok' },
            { name: '.claude/mcp.json', status: 'ok' },
            { name: 'mcp-binary', status: 'ok' },
            { name: 'skill-files', status: 'ok' },
        ],
    };
}

function makeWarningResult(): AiVerificationResult {
    return {
        status: 'warning',
        checks: [
            { name: 'CLAUDE.md', status: 'ok' },
            { name: '.claude/mcp.json', status: 'ok' },
            { name: 'mcp-binary', status: 'warning', message: 'MCP server binary not built — Phase 2 not yet shipped' },
            { name: 'skill-files', status: 'ok' },
        ],
    };
}

async function renderTab(projectPath = '/projects/test') {
    let result!: ReturnType<typeof render>;
    await act(async () => {
        result = render(
            <Provider theme={defaultTheme}>
                <AiSetupTab projectPath={projectPath} />
            </Provider>,
        );
        jest.runAllTimers();
    });
    return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AiSetupTab', () => {
    const { webviewClient } = jest.requireMock('@/core/ui/utils/WebviewClient') as {
        webviewClient: { request: jest.Mock; postMessage: jest.Mock };
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('on mount', () => {
        it('sends verify-ai-setup message with projectPath only', async () => {
            webviewClient.request.mockResolvedValue(makeOkResult());
            await renderTab('/projects/myproject');

            expect(webviewClient.request).toHaveBeenCalledWith(
                'verify-ai-setup',
                { projectPath: '/projects/myproject' },
            );
        });

        it('displays an error message when verification fails', async () => {
            webviewClient.request.mockRejectedValue(new Error('Network error'));
            await renderTab();

            await waitFor(() => {
                expect(screen.getByText(/Network error/i)).toBeInTheDocument();
            });
        });

        it('renders check names after loading', async () => {
            webviewClient.request.mockResolvedValue(makeOkResult());
            await renderTab();

            expect(screen.getByText(/CLAUDE\.md/)).toBeInTheDocument();
            expect(screen.getByText(/\.claude\/mcp\.json/)).toBeInTheDocument();
            expect(screen.getByText(/mcp-binary/)).toBeInTheDocument();
            expect(screen.getByText(/skill-files/)).toBeInTheDocument();
        });

        it('renders warning message for warning checks', async () => {
            webviewClient.request.mockResolvedValue(makeWarningResult());
            await renderTab();

            expect(screen.getByText(/MCP server binary not built/i)).toBeInTheDocument();
        });
    });

    describe('Verify Now button', () => {
        it('re-sends verify-ai-setup when clicked', async () => {
            webviewClient.request.mockResolvedValue(makeOkResult());
            await renderTab();

            const verifyButton = screen.getByRole('button', { name: /verify now/i });
            await act(async () => { fireEvent.click(verifyButton); });

            expect(webviewClient.request).toHaveBeenCalledTimes(2);
        });
    });

    describe('Regenerate AI Files button', () => {
        it('sends regenerate-ai-files then re-verifies', async () => {
            webviewClient.request
                .mockResolvedValueOnce(makeOkResult()) // initial verify
                .mockResolvedValueOnce({ success: true }) // regenerate
                .mockResolvedValueOnce(makeOkResult()); // re-verify

            await renderTab('/projects/test');

            const regenerateButton = screen.getByRole('button', { name: /regenerate ai files/i });
            await act(async () => { fireEvent.click(regenerateButton); });

            const calls = webviewClient.request.mock.calls;
            const regenerateCall = calls.find(([type]: [string]) => type === 'regenerate-ai-files');
            expect(regenerateCall).toBeDefined();
            expect(regenerateCall?.[1]).toMatchObject({ projectPath: '/projects/test' });
        });

        it('re-runs verification after regeneration', async () => {
            webviewClient.request
                .mockResolvedValueOnce(makeOkResult()) // initial verify
                .mockResolvedValueOnce({ success: true }) // regenerate
                .mockResolvedValueOnce(makeOkResult()); // re-verify

            await renderTab();

            const regenerateButton = screen.getByRole('button', { name: /regenerate ai files/i });
            await act(async () => { fireEvent.click(regenerateButton); });

            const verifyCalls = webviewClient.request.mock.calls.filter(
                ([type]: [string]) => type === 'verify-ai-setup',
            );
            expect(verifyCalls.length).toBeGreaterThanOrEqual(2);
        });
    });
});
