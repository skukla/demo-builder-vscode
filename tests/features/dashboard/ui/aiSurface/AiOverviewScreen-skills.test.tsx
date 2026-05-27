/**
 * AiOverviewScreen Tests — Skills inventory & sessions
 *
 * The installed-skills drill-down modal, the background inventory refresh +
 * Regenerate action it carries, and the "Browse Claude sessions" link (gated on
 * extension + onboarding + surface). Shared setup lives in
 * AiOverviewScreen.testUtils.tsx.
 */

import { screen, fireEvent, act } from '@testing-library/react';
import {
    makeFullInventory,
    makeProject,
    renderScreen,
    renderScreenRaw,
} from './AiOverviewScreen.testUtils';

describe('AiOverviewScreen — skills & sessions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('installed skills modal', () => {
        it('modal is closed by default', async () => {
            await renderScreen();
            // Modal title is "Installed skills" — should not appear before the trigger is clicked
            expect(screen.queryByRole('heading', { name: /installed skills/i })).not.toBeInTheDocument();
        });

        it('opens the modal when the trigger is clicked', async () => {
            await renderScreen();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-installed-skills-trigger'));
            });
            expect(screen.getByRole('heading', { name: /installed skills/i })).toBeInTheDocument();
            // Modal body contains the grouped list
            expect(screen.getByTestId('ai-installed-skills-list')).toBeInTheDocument();
        });

        it('modal shows one group per distinct skill source', async () => {
            await renderScreen();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-installed-skills-trigger'));
            });
            expect(screen.getByTestId('ai-skill-group-demo-builder')).toBeInTheDocument();
            expect(screen.getByTestId('ai-skill-group-adobe')).toBeInTheDocument();
        });

        it('clicking the modal Close button dismisses the modal', async () => {
            await renderScreen();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-installed-skills-trigger'));
            });
            // Choose the Close button inside the modal (there's also one in the page footer).
            const closeButtons = screen.getAllByRole('button', { name: /close/i });
            const modalClose = closeButtons.find(b => b.closest('.modal-footer-actions') !== null);
            expect(modalClose).toBeDefined();
            await act(async () => {
                fireEvent.click(modalClose!);
            });
            expect(screen.queryByTestId('ai-installed-skills-list')).not.toBeInTheDocument();
        });
    });

    describe('inventory refresh and Regenerate action', () => {
        it('opening the installed-skills modal triggers a background inspect-mcp + verify-ai-setup', async () => {
            const { webviewClient } = await renderScreen();
            // Clear the initial verify call so we only observe the modal-open refresh.
            (webviewClient.request as jest.Mock).mockClear();

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-installed-skills-trigger'));
                jest.runAllTimers();
                await Promise.resolve();
                await Promise.resolve();
            });

            const requestCalls = (webviewClient.request as jest.Mock).mock.calls.map(c => c[0]);
            expect(requestCalls).toContain('inspect-mcp');
            expect(requestCalls.filter(t => t === 'verify-ai-setup').length).toBeGreaterThanOrEqual(1);
        });

        it('Regenerate AI files action in the modal calls regenerate-ai-files then verify-ai-setup', async () => {
            const { webviewClient } = await renderScreen();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-installed-skills-trigger'));
            });
            // Drain microtasks so the modal-open background refresh completes
            // and isBusy clears before we attempt to click Regenerate.
            await act(async () => {
                jest.runAllTimers();
                await Promise.resolve();
                await Promise.resolve();
                await Promise.resolve();
            });

            const regen = screen.getByRole('button', { name: /regenerate ai files/i });
            (webviewClient.request as jest.Mock).mockClear();
            await act(async () => {
                fireEvent.click(regen);
                jest.runAllTimers();
                await Promise.resolve();
                await Promise.resolve();
            });

            const requestCalls = (webviewClient.request as jest.Mock).mock.calls.map(c => c[0]);
            expect(requestCalls).toContain('regenerate-ai-files');
            expect(requestCalls.filter(t => t === 'verify-ai-setup').length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Browse Claude sessions link', () => {
        it('renders the link when extensionInstalled AND onboardingCompleted are both true AND surface is extension', async () => {
            await renderScreen({
                extensionInstalled: true,
                onboardingCompleted: true,
                surface: 'extension',
            });
            expect(screen.getByTestId('ai-browse-sessions-trigger')).toBeInTheDocument();
        });

        it('does NOT render the link when extensionInstalled is false', async () => {
            await renderScreen({ extensionInstalled: false, onboardingCompleted: true });
            expect(screen.queryByTestId('ai-browse-sessions-trigger')).not.toBeInTheDocument();
        });

        it('does NOT render the link when onboarding has not been completed (even with extension installed)', async () => {
            await renderScreen({ extensionInstalled: true, onboardingCompleted: false });
            expect(screen.queryByTestId('ai-browse-sessions-trigger')).not.toBeInTheDocument();
        });

        it('does NOT render the link when surface is terminal (even with extension installed and onboarding done)', async () => {
            await renderScreen({
                extensionInstalled: true,
                onboardingCompleted: true,
                surface: 'terminal',
            });
            expect(screen.queryByTestId('ai-browse-sessions-trigger')).not.toBeInTheDocument();
        });

        it('clicking the link dispatches browseClaudeSessions via postMessage', async () => {
            const { webviewClient } = await renderScreen({
                extensionInstalled: true,
                onboardingCompleted: true,
            });
            (webviewClient.postMessage as jest.Mock).mockClear();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-browse-sessions-trigger'));
            });
            const calls = (webviewClient.postMessage as jest.Mock).mock.calls;
            const browseCalls = calls.filter(c => c[0] === 'browseClaudeSessions');
            expect(browseCalls.length).toBe(1);
        });

        it('appears live when surface flips terminal→extension via a surface-changed push', async () => {
            const { webviewClient } = jest.requireMock('@/core/ui/utils/WebviewClient') as {
                webviewClient: { request: jest.Mock; postMessage: jest.Mock; onMessage: jest.Mock };
            };

            // Capture incoming-message handlers so we can fire `surface-changed`
            // from the test as if the backend pushed it.
            const handlers = new Map<string, (data?: unknown) => void>();
            (webviewClient.onMessage as jest.Mock).mockImplementation(
                (type: string, handler: (data?: unknown) => void) => {
                    handlers.set(type, handler);
                    return () => handlers.delete(type);
                },
            );

            // Two successive verify-ai-setup responses: first terminal, then extension.
            const terminalResponse = {
                success: true,
                status: 'ok',
                checks: [],
                inventory: makeFullInventory(),
                globalMcpRegistration: 'registered',
                extensionInstalled: true,
                onboardingCompleted: true,
                surface: 'terminal',
            };
            const extensionResponse = { ...terminalResponse, surface: 'extension' };
            (webviewClient.request as jest.Mock)
                .mockResolvedValueOnce(terminalResponse)
                .mockResolvedValue(extensionResponse);

            await renderScreenRaw(makeProject());

            expect(screen.queryByTestId('ai-browse-sessions-trigger')).not.toBeInTheDocument();

            // Backend pushes surface-changed → component re-runs verify and the
            // next response carries surface='extension'.
            await act(async () => {
                handlers.get('surface-changed')?.();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(screen.getByTestId('ai-browse-sessions-trigger')).toBeInTheDocument();
        });
    });

    // The one-time sessions-browser auto-open is now fired from the
    // extension-surface launch path (see openInClaude.ts), not from the AI
    // dashboard's mount effect — so a terminal-surface user never sees the
    // extension's sessions browser open unexpectedly. The auto-open tests
    // live in tests/features/lifecycle/commands/openInClaude.test.ts.
});
