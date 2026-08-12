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

import { screen, fireEvent, act, within } from '@testing-library/react';
import {
    setupTestContext,
    renderDashboard,
    type TestContext,
} from './ProjectDashboardScreen.testUtils';

/** A passing verify response carrying the given skills inventory. */
function verifyWithSkills(
    skills: Array<{ name: string; description: string | null; path: string; source: string }>
) {
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
        // The masthead holds ENVIRONMENT health only — AI (+ IMS Org). Artifact
        // state moved to the zone that owns it: the mesh to the integrations
        // list (D3 Step 08), and the frontend to the ActionGrid's
        // Primary/Storefront zone, where its Restart/Republish fixes already
        // lived. Being separated from those fixes is why the Frontend badge was
        // the only one that named a problem and offered nothing.
        it('renders the AI Ready badge, and no artifact badges beside it', () => {
            renderDashboard({ hasMesh: true });
            expect(screen.getByTestId('status-card-AI')).toBeInTheDocument();
            expect(screen.queryByTestId('status-card-Frontend')).not.toBeInTheDocument();
            expect(screen.queryByTestId('status-card-API Mesh')).not.toBeInTheDocument();
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
            {
                name: 'Add a component',
                description: 'Adds a component to your project',
                path: '/p/.claude/skills/add-component.md',
                source: 'demo-builder',
            },
            {
                name: 'Sync changes',
                description: 'Picks the right sync operation',
                path: '/p/.claude/skills/sync-changes.md',
                source: 'demo-builder',
            },
        ];
        const MCPS = [
            {
                id: 'demo-builder',
                status: 'ok' as const,
                tools: [{ name: 'list_projects', description: 'd' }],
            },
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
            expect(screen.getByTestId('ai-view-capabilities-trigger').textContent).toMatch(
                /View AI Capabilities/
            );
        });

        it('sits on its OWN line beneath the badges, not on the AI status line', () => {
            // It lived on the AI line to save a row. The cost: it followed a
            // variable-width StatusCard, so its position moved with the status
            // text ("Ready" vs "Setup incomplete") and again whenever the
            // Regenerate remediation appeared beside it. Nothing outside that card
            // can hold it still, because the thing that displaces it is INSIDE.
            //
            // The row is free: the band reserves min-height 122px and two badge
            // rows at row-gap 4px use about 44px of it.
            renderDashboard();
            deliverVerify(verifyWithSkillsAndMcps(SKILLS, MCPS));

            const row = screen.getByTestId('ai-status-row');
            expect(within(row).getByTestId('status-card-AI')).toBeInTheDocument();
            expect(within(row).queryByTestId('ai-view-capabilities-trigger')).toBeNull();
            expect(screen.getByTestId('ai-view-capabilities-trigger')).toBeInTheDocument();
        });

        it('comes LAST in the badge stack, directly after the AI row', () => {
            // This is what makes the standalone line read correctly, and it is why
            // AI moved below IMS Org in the markup: a link under the LAST badge
            // continues it, whereas one under a stack led by AI hung off IMS Org
            // and looked like it belonged there, or to nothing.
            //
            // The IMS-before-AI order itself is not asserted here: this fixture
            // renders no IMS badge (no `status-card-IMS Org` anywhere in it), so a
            // check for it would pass vacuously rather than mean anything.
            renderDashboard();
            deliverVerify(verifyWithSkillsAndMcps(SKILLS, MCPS));

            const badges = screen.getByTestId('ai-status-row').parentElement!;
            const children = Array.from(badges.children);
            const aiIndex = children.findIndex(
                (el) => el.getAttribute('data-testid') === 'ai-status-row'
            );
            const link = screen.getByTestId('ai-view-capabilities-trigger');

            expect(children[children.length - 1]).toContainElement(link);
            expect(aiIndex).toBe(children.length - 2);
        });

        it('coexists with the Regenerate remediation, which stays ON the badge', () => {
            // Both show at once: Regenerate is the fix for an unhealthy badge and
            // belongs to it; the capabilities link is always-on navigation and
            // belongs to the surface. Regenerate living inside the StatusCard is
            // exactly why the link could not be pinned while it sat alongside.
            renderDashboard();
            deliverVerify({ checks: [{ name: 'skills', status: 'error' }] } as never);

            const row = screen.getByTestId('ai-status-row');
            expect(within(row).getByTestId('ai-regenerate-trigger')).toBeInTheDocument();
            expect(within(row).queryByTestId('ai-view-capabilities-trigger')).toBeNull();
            expect(screen.getByTestId('ai-view-capabilities-trigger')).toBeInTheDocument();
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
            const skillRows = screen
                .getAllByTestId('ai-capabilities-modal-skill')
                .map((r) => r.textContent);
            expect(skillRows).toContain('Add a component');
            const mcpRows = screen
                .getAllByTestId('ai-capabilities-modal-mcp')
                .map((r) => r.textContent);
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

            const types = (webviewClient.request as jest.Mock).mock.calls.map(
                (c: unknown[]) => c[0]
            );
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
            const webviewClient = mockAiRequests({
                status: 'ok',
                checks: [],
                inventory: { skills: [], mcps: [], sessionMcps: [] },
            });
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
            const types = (webviewClient.request as jest.Mock).mock.calls.map(
                (c: unknown[]) => c[0]
            );
            expect(types).toContain('regenerate-ai-files');
        });
    });
});
