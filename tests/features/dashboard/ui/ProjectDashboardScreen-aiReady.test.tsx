/**
 * ProjectDashboardScreen - AI Ready Badge Tests
 *
 * Verifies the new third StatusCard badge "AI Ready" is rendered alongside
 * Frontend + API Mesh on the project dashboard header.
 */

import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import { setupTestContext, renderDashboard } from './ProjectDashboardScreen.testUtils';

/** A passing verify response carrying the given skills inventory. */
function verifyWithSkills(skills: Array<{ name: string; description: string | null; path: string; source: string }>) {
    return {
        success: true,
        status: 'ok',
        checks: [{ name: 'skill-files', status: 'ok' }],
        inventory: { skills, mcps: [], sessionMcps: [] },
    };
}

/** Route verify-ai-setup to `response` and resolve regenerate-ai-files. */
function mockAiRequests(response: unknown) {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
        if (type === 'regenerate-ai-files') return Promise.resolve({ success: true });
        return Promise.resolve(response);
    });
    return webviewClient;
}

describe('ProjectDashboardScreen - AI Ready Badge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupTestContext();
    });

    describe('Badge Presence', () => {
        it('renders the AI Ready status badge alongside Frontend + API Mesh', () => {
            renderDashboard({ hasMesh: true });
            // Frontend (mocked StatusCard renders as `status-card-${label}`)
            expect(screen.getByTestId('status-card-Frontend')).toBeInTheDocument();
            // API Mesh
            expect(screen.getByTestId('status-card-API Mesh')).toBeInTheDocument();
            // AI Ready (new in F1)
            expect(screen.getByTestId('status-card-AI Ready')).toBeInTheDocument();
        });

        it('renders the AI Ready badge even when project has no mesh', () => {
            renderDashboard();
            // AI Ready should still show
            expect(screen.getByTestId('status-card-AI Ready')).toBeInTheDocument();
        });
    });

    describe('Badge Color (initial state)', () => {
        it('shows gray color while verify is pending', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI Ready');
            expect(badge.getAttribute('data-color')).toBe('gray');
        });

        it('shows "Verifying" status text while verify is pending', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI Ready');
            expect(badge.textContent).toMatch(/Verifying/i);
        });
    });

    describe('Badge Color (resolved state)', () => {
        it('shows green color when verify-ai-setup returns all OK', async () => {
            const { webviewClient } = require('@/core/ui/utils/WebviewClient');
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                status: 'ok',
                checks: [
                    { name: 'AGENTS.md', status: 'ok' },
                    { name: '.claude/mcp.json', status: 'ok' },
                    { name: 'mcp-binary', status: 'ok' },
                    { name: 'skill-files', status: 'ok' },
                ],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
            renderDashboard();
            await waitFor(() => {
                const badge = screen.getByTestId('status-card-AI Ready');
                expect(badge.getAttribute('data-color')).toBe('green');
                expect(badge.textContent).toMatch(/Ready/i);
            });
        });

        it('shows red color when any file check fails', async () => {
            const { webviewClient } = require('@/core/ui/utils/WebviewClient');
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                status: 'warning',
                checks: [
                    { name: 'AGENTS.md', status: 'warning', message: 'Missing' },
                    { name: '.claude/mcp.json', status: 'ok' },
                    { name: 'mcp-binary', status: 'ok' },
                    { name: 'skill-files', status: 'ok' },
                ],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
            renderDashboard();
            await waitFor(() => {
                const badge = screen.getByTestId('status-card-AI Ready');
                expect(badge.getAttribute('data-color')).toBe('red');
                expect(badge.textContent).toMatch(/Broken/i);
            });
        });
    });

    describe('Badge is display-only', () => {
        it('does not have an onClick handler (display-only badge)', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI Ready');
            // The mocked StatusCard component does not forward any onClick prop
            // (it isn't part of the StatusCardProps interface). Confirm by
            // ensuring the rendered node is not a button or link.
            expect(badge.tagName.toLowerCase()).not.toBe('button');
            expect(badge.tagName.toLowerCase()).not.toBe('a');
        });
    });

    describe('View Skills — capability discovery (separate from the badge)', () => {
        const SKILLS = [
            { name: 'Add a component', description: 'Adds a component to your project', path: '/p/.claude/skills/add-component.md', source: 'demo-builder' },
            { name: 'Sync changes', description: 'Picks the right sync operation', path: '/p/.claude/skills/sync-changes.md', source: 'demo-builder' },
        ];

        it('renders a clickable "View Skills (N)" link reflecting the skill count', async () => {
            mockAiRequests(verifyWithSkills(SKILLS));
            renderDashboard();
            await waitFor(() => {
                expect(screen.getByTestId('ai-view-skills-trigger').textContent).toMatch(/View Skills \(2\)/);
            });
        });

        it('opens the skills modal listing the skills by name when clicked', async () => {
            mockAiRequests(verifyWithSkills(SKILLS));
            renderDashboard();
            await waitFor(() => {
                expect(screen.getByTestId('ai-view-skills-trigger').textContent).toMatch(/\(2\)/);
            });

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-view-skills-trigger'));
            });

            expect(screen.getByTestId('ai-skills-modal')).toBeInTheDocument();
            expect(screen.getByTestId('ai-skills-modal-count').textContent).toBe('2');
            const rows = screen.getAllByTestId('ai-skills-modal-skill').map(r => r.textContent);
            expect(rows).toContain('Add a component');
            expect(rows).toContain('Sync changes');
        });

        it('the modal Regenerate action dispatches regenerate-ai-files then re-verifies', async () => {
            const webviewClient = mockAiRequests(verifyWithSkills(SKILLS));
            renderDashboard();
            await waitFor(() => screen.getByTestId('ai-view-skills-trigger'));

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-view-skills-trigger'));
            });
            (webviewClient.request as jest.Mock).mockClear();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-skills-modal-regenerate'));
                await Promise.resolve();
                await Promise.resolve();
            });

            const types = (webviewClient.request as jest.Mock).mock.calls.map((c: unknown[]) => c[0]);
            expect(types).toContain('regenerate-ai-files');
            expect(types).toContain('verify-ai-setup');
        });
    });

    describe('Conditional Regenerate link (only when health needs attention)', () => {
        it('shows a "Regenerate AI files" link next to the badge when a check fails (red)', async () => {
            mockAiRequests({
                success: true,
                status: 'warning',
                checks: [{ name: 'AGENTS.md', status: 'warning' }],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
            renderDashboard();
            await waitFor(() => {
                expect(screen.getByTestId('ai-regenerate-trigger')).toBeInTheDocument();
            });
        });

        it('does NOT show the Regenerate link when health is green', async () => {
            mockAiRequests(verifyWithSkills([]));
            renderDashboard();
            await waitFor(() => {
                expect(screen.getByTestId('status-card-AI Ready').getAttribute('data-color')).toBe('green');
            });
            expect(screen.queryByTestId('ai-regenerate-trigger')).not.toBeInTheDocument();
        });

        it('clicking the conditional Regenerate link dispatches regenerate-ai-files', async () => {
            const webviewClient = mockAiRequests({
                success: true,
                status: 'warning',
                checks: [{ name: 'AGENTS.md', status: 'warning' }],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
            renderDashboard();
            await waitFor(() => screen.getByTestId('ai-regenerate-trigger'));
            (webviewClient.request as jest.Mock).mockClear();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-regenerate-trigger'));
                await Promise.resolve();
                await Promise.resolve();
            });
            const types = (webviewClient.request as jest.Mock).mock.calls.map((c: unknown[]) => c[0]);
            expect(types).toContain('regenerate-ai-files');
        });
    });
});
