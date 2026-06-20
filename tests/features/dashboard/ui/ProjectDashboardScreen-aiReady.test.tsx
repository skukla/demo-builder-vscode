/**
 * ProjectDashboardScreen - AI Ready Badge Tests
 *
 * Verifies the "AI Ready" StatusCard badge rendered alongside Frontend + API Mesh.
 *
 * On open the verification is delivered by the orchestrator's `ai-verify` check
 * via `checkResult{ai-verify}` (see `deliverVerify`) — the dashboard no longer
 * pulls verify-ai-setup on mount. The on-demand re-verify after Regenerate still
 * uses the `verify-ai-setup` request.
 */

import { screen, fireEvent, act } from '@testing-library/react';
import { setupTestContext, renderDashboard, type TestContext } from './ProjectDashboardScreen.testUtils';

/** A passing verify response carrying the given skills inventory. */
function verifyWithSkills(skills: Array<{ name: string; description: string | null; path: string; source: string }>) {
    return {
        status: 'ok',
        checks: [{ name: 'skill-files', status: 'ok' }],
        inventory: { skills, mcps: [], sessionMcps: [] },
    };
}

describe('ProjectDashboardScreen - AI Ready Badge', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    /** Deliver an on-open AI verification via checkResult{ai-verify}. */
    const deliverVerify = (response: unknown) =>
        ctx.triggerMessage('checkResult', { checkId: 'ai-verify', status: 'ok', data: response });

    /** Resolve the regenerate-ai-files + verify-ai-setup REQUESTS (regen re-verify path). */
    function mockAiRequests(response: unknown) {
        const { webviewClient } = require('@/core/ui/utils/WebviewClient');
        (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
            if (type === 'regenerate-ai-files') return Promise.resolve({ success: true });
            return Promise.resolve(response);
        });
        return webviewClient;
    }

    describe('Badge Presence', () => {
        it('renders the AI Ready status badge alongside Frontend + API Mesh', () => {
            renderDashboard({ hasMesh: true });
            expect(screen.getByTestId('status-card-Frontend')).toBeInTheDocument();
            expect(screen.getByTestId('status-card-API Mesh')).toBeInTheDocument();
            expect(screen.getByTestId('status-card-AI')).toBeInTheDocument();
        });

        it('renders the AI Ready badge even when project has no mesh', () => {
            renderDashboard();
            expect(screen.getByTestId('status-card-AI')).toBeInTheDocument();
        });
    });

    describe('Badge Color (initial state)', () => {
        it('shows blue color while the ai-verify outcome is pending', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI');
            expect(badge.getAttribute('data-color')).toBe('blue');
        });

        it('shows "Verifying" status text while pending', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI');
            expect(badge.textContent).toMatch(/Verifying/i);
        });
    });

    describe('Badge Color (resolved state)', () => {
        it('shows green color when ai-verify returns all OK', () => {
            renderDashboard();
            deliverVerify({
                status: 'ok',
                checks: [
                    { name: 'AGENTS.md', status: 'ok' },
                    { name: '.claude/mcp.json', status: 'ok' },
                    { name: 'mcp-binary', status: 'ok' },
                    { name: 'skill-files', status: 'ok' },
                ],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
            const badge = screen.getByTestId('status-card-AI');
            expect(badge.getAttribute('data-color')).toBe('green');
            expect(badge.textContent).toMatch(/Ready/i);
        });

        it('shows red color when any file check fails', () => {
            renderDashboard();
            deliverVerify({
                status: 'warning',
                checks: [
                    { name: 'AGENTS.md', status: 'warning', message: 'Missing' },
                    { name: '.claude/mcp.json', status: 'ok' },
                    { name: 'mcp-binary', status: 'ok' },
                    { name: 'skill-files', status: 'ok' },
                ],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
            const badge = screen.getByTestId('status-card-AI');
            expect(badge.getAttribute('data-color')).toBe('red');
            expect(badge.textContent).toMatch(/Broken/i);
        });
    });

    describe('Badge is display-only', () => {
        it('does not have an onClick handler (display-only badge)', () => {
            renderDashboard();
            const badge = screen.getByTestId('status-card-AI');
            expect(badge.tagName.toLowerCase()).not.toBe('button');
            expect(badge.tagName.toLowerCase()).not.toBe('a');
        });
    });

    describe('View AI Capabilities — capability discovery (separate from the badge)', () => {
        const SKILLS = [
            { name: 'Add a component', description: 'Adds a component to your project', path: '/p/.claude/skills/add-component.md', source: 'demo-builder' },
            { name: 'Sync changes', description: 'Picks the right sync operation', path: '/p/.claude/skills/sync-changes.md', source: 'demo-builder' },
        ];
        const MCPS = [
            { id: 'demo-builder', status: 'ok' as const, tools: [{ name: 'list_projects', description: 'd' }] },
        ];

        function verifyWithSkillsAndMcps(skills: typeof SKILLS, mcps: typeof MCPS) {
            return {
                status: 'ok',
                checks: [
                    { name: 'AGENTS.md', status: 'ok' as const },
                    { name: '.claude/mcp.json', status: 'ok' as const },
                    { name: 'mcp-binary', status: 'ok' as const },
                    { name: 'skill-files', status: 'ok' as const },
                ],
                inventory: { skills, mcps, sessionMcps: [] },
            };
        }

        it('renders a clickable "View AI Capabilities" link', () => {
            renderDashboard();
            deliverVerify(verifyWithSkillsAndMcps(SKILLS, MCPS));
            expect(screen.getByTestId('ai-view-capabilities-trigger').textContent)
                .toMatch(/View AI Capabilities/);
        });

        it('opens the capabilities modal showing both skills and MCPs when clicked', async () => {
            renderDashboard();
            deliverVerify(verifyWithSkillsAndMcps(SKILLS, MCPS));

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-view-capabilities-trigger'));
            });

            expect(screen.getByTestId('ai-capabilities-modal')).toBeInTheDocument();
            expect(screen.getByTestId('ai-capabilities-modal-skills-count').textContent).toBe('2');
            expect(screen.getByTestId('ai-capabilities-modal-mcps-count').textContent).toBe('1');
            const skillRows = screen.getAllByTestId('ai-capabilities-modal-skill').map(r => r.textContent);
            expect(skillRows).toContain('Add a component');
            const mcpRows = screen.getAllByTestId('ai-capabilities-modal-mcp').map(r => r.textContent);
            expect(mcpRows).toContain('demo-builder');
        });

        it('the modal Regenerate action dispatches regenerate-ai-files then re-verifies', async () => {
            const webviewClient = mockAiRequests(verifyWithSkillsAndMcps(SKILLS, MCPS));
            renderDashboard();
            deliverVerify(verifyWithSkillsAndMcps(SKILLS, MCPS));

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-view-capabilities-trigger'));
            });
            (webviewClient.request as jest.Mock).mockClear();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-capabilities-modal-regenerate'));
                await Promise.resolve();
                await Promise.resolve();
            });

            const types = (webviewClient.request as jest.Mock).mock.calls.map((c: unknown[]) => c[0]);
            expect(types).toContain('regenerate-ai-files');
            expect(types).toContain('verify-ai-setup');
        });
    });

    describe('Conditional Regenerate link (only when health needs attention)', () => {
        it('shows a "Regenerate AI files" link next to the badge when a check fails (red)', () => {
            renderDashboard();
            deliverVerify({
                status: 'warning',
                checks: [{ name: 'AGENTS.md', status: 'warning' }],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
            expect(screen.getByTestId('ai-regenerate-trigger')).toBeInTheDocument();
        });

        it('does NOT show the Regenerate link when health is green', () => {
            renderDashboard();
            deliverVerify(verifyWithSkills([]));
            expect(screen.getByTestId('status-card-AI').getAttribute('data-color')).toBe('green');
            expect(screen.queryByTestId('ai-regenerate-trigger')).not.toBeInTheDocument();
        });

        it('clicking the conditional Regenerate link dispatches regenerate-ai-files', async () => {
            const webviewClient = mockAiRequests({ status: 'ok', checks: [], inventory: { skills: [], mcps: [], sessionMcps: [] } });
            renderDashboard();
            deliverVerify({
                status: 'warning',
                checks: [{ name: 'AGENTS.md', status: 'warning' }],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
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
