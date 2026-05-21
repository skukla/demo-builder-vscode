/**
 * AiConfigurationTab Tests
 *
 * Replaces AiSetupTab tests. Covers the Cycle D AI Configuration tab that
 * consumes the Cycle C inventory payload via AiVerificationResult.inventory.
 *
 * Test groups:
 * - Rendering (4 Status rows, headers, action buttons)
 * - StatusCard color (green/yellow based on inventory & *Error fields)
 * - Drill-down (useSetToggle-driven expand/collapse, ChevronDown/Right)
 * - Per-section content (skills, project MCPs, session MCPs)
 * - Empty states (zero skills / zero project MCPs / zero session MCPs)
 * - Error states (inventory.*Error rendered under the row label)
 * - Actions (refresh = inspect-mcp, regenerate = regenerate-ai-files + verify, register = register-global-mcp)
 * - useAsyncOperation integration (loading state disables buttons, reset on mount)
 * - Register button (only when globalMcpRegistration !== 'registered')
 */

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AiConfigurationTab } from '@/features/dashboard/ui/tabs/AiConfigurationTab';
import '@testing-library/jest-dom';
import type { AiInventory } from '@/types/ai';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        request: jest.fn(),
        postMessage: jest.fn(),
    },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEmptyInventory(): AiInventory {
    return {
        skills: [],
        mcps: [],
        sessionMcps: [],
    };
}

function makeFullInventory(): AiInventory {
    return {
        skills: [
            {
                name: 'add-component',
                description: 'Add a new component to a Demo Builder project',
                path: '/p/.claude/skills/add-component.md',
                source: 'demo-builder',
            },
            {
                name: 'sync-changes',
                description: 'Sync content changes from Demo Builder to upstream',
                path: '/p/.claude/skills/sync-changes.md',
                source: 'demo-builder',
            },
            {
                name: 'storefront-build',
                description: 'Build the EDS storefront for production',
                path: '/p/.claude/skills/eds-storefront/storefront-build.md',
                source: 'adobe',
            },
            {
                name: 'my-custom',
                description: null,
                path: '/p/.claude/skills/my-custom.md',
                source: 'unknown',
            },
        ],
        mcps: [
            {
                id: 'demo-builder',
                status: 'ok',
                tools: [
                    { name: 'list_projects', description: 'List all Demo Builder projects' },
                    { name: 'get_project', description: 'Get details about a project' },
                ],
            },
            {
                id: 'adobe-commerce',
                status: 'ok',
                tools: [
                    { name: 'get_catalog', description: 'Get catalog data' },
                ],
            },
        ],
        sessionMcps: [
            { displayName: 'claude.ai AEM Content - Prod', needsAuth: false },
            { displayName: 'claude.ai Adobe Analytics', needsAuth: true },
        ],
    };
}

function makeVerifyResult(
    overrides: Partial<{
        inventory: AiInventory;
        globalMcpRegistration: 'registered' | 'declined' | 'unregistered';
    }> = {},
): {
    success: true;
    status: 'ok';
    checks: [];
    inventory: AiInventory;
    globalMcpRegistration: 'registered' | 'declined' | 'unregistered';
} {
    return {
        success: true,
        status: 'ok',
        checks: [],
        inventory: overrides.inventory ?? makeFullInventory(),
        globalMcpRegistration: overrides.globalMcpRegistration ?? 'registered',
    };
}

async function renderTab(projectPath = '/projects/test') {
    let result!: ReturnType<typeof render>;
    await act(async () => {
        result = render(
            <Provider theme={defaultTheme}>
                <AiConfigurationTab projectPath={projectPath} />
            </Provider>,
        );
        jest.runAllTimers();
    });
    // Drain pending promises so the initial verify resolves.
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AiConfigurationTab', () => {
    const { webviewClient } = jest.requireMock('@/core/ui/utils/WebviewClient') as {
        webviewClient: { request: jest.Mock; postMessage: jest.Mock };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        webviewClient.request.mockResolvedValue(makeVerifyResult());
    });

    // ─── Rendering ────────────────────────────────────────────────────────────

    describe('rendering', () => {
        it('calls verify-ai-setup on mount', async () => {
            await renderTab('/projects/myproject');
            expect(webviewClient.request).toHaveBeenCalledWith(
                'verify-ai-setup',
                { projectPath: '/projects/myproject' },
            );
        });

        it('renders Skills status row', async () => {
            await renderTab();
            expect(screen.getByText(/Skills/i)).toBeInTheDocument();
        });

        it('renders Project MCP Servers status row', async () => {
            await renderTab();
            expect(screen.getByText(/Project MCP Servers/i)).toBeInTheDocument();
        });

        it('renders Session MCP Servers status row', async () => {
            await renderTab();
            expect(screen.getByText(/Session MCP Servers/i)).toBeInTheDocument();
        });

        it('renders Global MCP Registration status row', async () => {
            await renderTab();
            expect(screen.getByText(/Global MCP Registration/i)).toBeInTheDocument();
        });

        it('renders a Refresh action button', async () => {
            await renderTab();
            expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
        });

        it('renders a Regenerate AI Files action button', async () => {
            await renderTab();
            expect(screen.getByRole('button', { name: /regenerate ai files/i })).toBeInTheDocument();
        });
    });

    // ─── StatusCard colors ────────────────────────────────────────────────────

    describe('StatusCard color', () => {
        it('Skills row is green when skills exist and no error', async () => {
            await renderTab();
            const skillsRow = screen.getByTestId('ai-config-row-skills');
            expect(skillsRow.querySelector('[data-color="green"]')).toBeInTheDocument();
        });

        it('Skills row is yellow when inventory.skillsError is set', async () => {
            const inventory: AiInventory = {
                ...makeEmptyInventory(),
                skillsError: 'Skill directory unreadable',
            };
            webviewClient.request.mockResolvedValue(makeVerifyResult({ inventory }));
            await renderTab();
            const skillsRow = screen.getByTestId('ai-config-row-skills');
            expect(skillsRow.querySelector('[data-color="yellow"]')).toBeInTheDocument();
        });

        it('Project MCPs row is green when mcps exist and no error', async () => {
            await renderTab();
            const row = screen.getByTestId('ai-config-row-project-mcps');
            expect(row.querySelector('[data-color="green"]')).toBeInTheDocument();
        });

        it('Project MCPs row is yellow when inventory.mcpsError is set', async () => {
            const inventory: AiInventory = {
                ...makeEmptyInventory(),
                mcpsError: 'Could not spawn MCP servers',
            };
            webviewClient.request.mockResolvedValue(makeVerifyResult({ inventory }));
            await renderTab();
            const row = screen.getByTestId('ai-config-row-project-mcps');
            expect(row.querySelector('[data-color="yellow"]')).toBeInTheDocument();
        });

        it('Session MCPs row is yellow when inventory.sessionMcpsError is set', async () => {
            const inventory: AiInventory = {
                ...makeEmptyInventory(),
                sessionMcpsError: 'Claude Code config not readable',
            };
            webviewClient.request.mockResolvedValue(makeVerifyResult({ inventory }));
            await renderTab();
            const row = screen.getByTestId('ai-config-row-session-mcps');
            expect(row.querySelector('[data-color="yellow"]')).toBeInTheDocument();
        });

        it('Global MCP Registration row is green when registered', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ globalMcpRegistration: 'registered' }),
            );
            await renderTab();
            const row = screen.getByTestId('ai-config-row-global-mcp');
            expect(row.querySelector('[data-color="green"]')).toBeInTheDocument();
        });

        it('Global MCP Registration row is yellow when not registered', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ globalMcpRegistration: 'unregistered' }),
            );
            await renderTab();
            const row = screen.getByTestId('ai-config-row-global-mcp');
            expect(row.querySelector('[data-color="yellow"]')).toBeInTheDocument();
        });
    });

    // ─── Drill-down toggling ──────────────────────────────────────────────────

    describe('drill-down toggle', () => {
        it('Skills section is collapsed by default (ChevronRight)', async () => {
            await renderTab();
            const skillsRow = screen.getByTestId('ai-config-row-skills');
            expect(skillsRow.getAttribute('data-expanded')).toBe('false');
            expect(skillsRow.querySelector('[data-testid="ai-config-chevron-right"]')).toBeInTheDocument();
        });

        it('clicking Skills row expands it and shows ChevronDown', async () => {
            await renderTab();
            const skillsButton = screen.getByTestId('ai-config-row-skills-toggle');
            await act(async () => { fireEvent.click(skillsButton); });
            const skillsRow = screen.getByTestId('ai-config-row-skills');
            expect(skillsRow.getAttribute('data-expanded')).toBe('true');
            expect(skillsRow.querySelector('[data-testid="ai-config-chevron-down"]')).toBeInTheDocument();
        });

        it('clicking Skills row twice collapses it again', async () => {
            await renderTab();
            const skillsButton = screen.getByTestId('ai-config-row-skills-toggle');
            await act(async () => { fireEvent.click(skillsButton); });
            await act(async () => { fireEvent.click(skillsButton); });
            const skillsRow = screen.getByTestId('ai-config-row-skills');
            expect(skillsRow.getAttribute('data-expanded')).toBe('false');
            expect(skillsRow.querySelector('[data-testid="ai-config-chevron-right"]')).toBeInTheDocument();
        });

        it('expanded Skills section renders per-skill rows with name', async () => {
            await renderTab();
            const skillsButton = screen.getByTestId('ai-config-row-skills-toggle');
            await act(async () => { fireEvent.click(skillsButton); });
            expect(screen.getByText('add-component')).toBeInTheDocument();
            expect(screen.getByText('sync-changes')).toBeInTheDocument();
            expect(screen.getByText('storefront-build')).toBeInTheDocument();
        });

        it('expanded Skills section renders source classification labels', async () => {
            await renderTab();
            const skillsButton = screen.getByTestId('ai-config-row-skills-toggle');
            await act(async () => { fireEvent.click(skillsButton); });
            const detail = screen.getByTestId('ai-config-detail-skills');
            expect(detail.textContent).toMatch(/demo-builder/i);
            expect(detail.textContent).toMatch(/adobe/i);
            expect(detail.textContent).toMatch(/unknown/i);
        });

        it('expanded Project MCPs section shows each server id and its tools', async () => {
            await renderTab();
            const button = screen.getByTestId('ai-config-row-project-mcps-toggle');
            await act(async () => { fireEvent.click(button); });
            expect(screen.getByText('demo-builder')).toBeInTheDocument();
            expect(screen.getByText('list_projects')).toBeInTheDocument();
            expect(screen.getByText('get_project')).toBeInTheDocument();
            expect(screen.getByText('adobe-commerce')).toBeInTheDocument();
            expect(screen.getByText('get_catalog')).toBeInTheDocument();
        });

        it('expanded Session MCPs section shows display names', async () => {
            await renderTab();
            const button = screen.getByTestId('ai-config-row-session-mcps-toggle');
            await act(async () => { fireEvent.click(button); });
            expect(screen.getByText('claude.ai AEM Content - Prod')).toBeInTheDocument();
            expect(screen.getByText('claude.ai Adobe Analytics')).toBeInTheDocument();
        });

        it('expanded Session MCPs section shows needsAuth indicator for sessions requiring auth', async () => {
            await renderTab();
            const button = screen.getByTestId('ai-config-row-session-mcps-toggle');
            await act(async () => { fireEvent.click(button); });
            const detail = screen.getByTestId('ai-config-detail-session-mcps');
            // The session with needsAuth=true should have a visible auth indicator.
            expect(detail.querySelector('[data-testid="session-mcp-needs-auth"]')).toBeInTheDocument();
        });
    });

    // ─── Empty states ─────────────────────────────────────────────────────────

    describe('empty states', () => {
        it('Skills shows empty message when zero skills and no error', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ inventory: makeEmptyInventory() }),
            );
            await renderTab();
            const button = screen.getByTestId('ai-config-row-skills-toggle');
            await act(async () => { fireEvent.click(button); });
            const detail = screen.getByTestId('ai-config-detail-skills');
            expect(detail.textContent).toMatch(/no skills/i);
        });

        it('Project MCPs shows empty message when zero servers and no error', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ inventory: makeEmptyInventory() }),
            );
            await renderTab();
            const button = screen.getByTestId('ai-config-row-project-mcps-toggle');
            await act(async () => { fireEvent.click(button); });
            const detail = screen.getByTestId('ai-config-detail-project-mcps');
            expect(detail.textContent).toMatch(/no project mcp/i);
        });

        it('Session MCPs shows empty message when zero sessions and no error', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ inventory: makeEmptyInventory() }),
            );
            await renderTab();
            const button = screen.getByTestId('ai-config-row-session-mcps-toggle');
            await act(async () => { fireEvent.click(button); });
            const detail = screen.getByTestId('ai-config-detail-session-mcps');
            expect(detail.textContent).toMatch(/no session mcp/i);
        });
    });

    // ─── Error states ─────────────────────────────────────────────────────────

    describe('error states', () => {
        it('renders skillsError message under Skills row label', async () => {
            const inventory: AiInventory = {
                ...makeEmptyInventory(),
                skillsError: 'Skill directory unreadable',
            };
            webviewClient.request.mockResolvedValue(makeVerifyResult({ inventory }));
            await renderTab();
            const row = screen.getByTestId('ai-config-row-skills');
            const errorEl = row.querySelector('[data-testid="ai-config-row-error"]');
            expect(errorEl).toBeInTheDocument();
            expect(errorEl?.textContent).toMatch(/Skill directory unreadable/);
        });

        it('renders mcpsError message under Project MCPs row label', async () => {
            const inventory: AiInventory = {
                ...makeEmptyInventory(),
                mcpsError: 'Could not spawn MCP servers',
            };
            webviewClient.request.mockResolvedValue(makeVerifyResult({ inventory }));
            await renderTab();
            const row = screen.getByTestId('ai-config-row-project-mcps');
            const errorEl = row.querySelector('[data-testid="ai-config-row-error"]');
            expect(errorEl).toBeInTheDocument();
            expect(errorEl?.textContent).toMatch(/Could not spawn MCP servers/);
        });

        it('renders sessionMcpsError message under Session MCPs row label', async () => {
            const inventory: AiInventory = {
                ...makeEmptyInventory(),
                sessionMcpsError: 'Claude Code config not readable',
            };
            webviewClient.request.mockResolvedValue(makeVerifyResult({ inventory }));
            await renderTab();
            const row = screen.getByTestId('ai-config-row-session-mcps');
            const errorEl = row.querySelector('[data-testid="ai-config-row-error"]');
            expect(errorEl).toBeInTheDocument();
            expect(errorEl?.textContent).toMatch(/Claude Code config not readable/);
        });

        it('renders the row even when an error is present (does NOT hide)', async () => {
            const inventory: AiInventory = {
                ...makeEmptyInventory(),
                skillsError: 'Skill directory unreadable',
            };
            webviewClient.request.mockResolvedValue(makeVerifyResult({ inventory }));
            await renderTab();
            // The row container is still present
            expect(screen.getByTestId('ai-config-row-skills')).toBeInTheDocument();
        });
    });

    // ─── Refresh action ───────────────────────────────────────────────────────

    describe('refresh action', () => {
        it('clicking Refresh dispatches inspect-mcp', async () => {
            await renderTab();
            const refresh = screen.getByRole('button', { name: /refresh/i });
            await act(async () => { fireEvent.click(refresh); });
            const inspectCall = webviewClient.request.mock.calls.find(
                ([type]: [string]) => type === 'inspect-mcp',
            );
            expect(inspectCall).toBeDefined();
        });

        it('clicking Refresh triggers re-verification after inspect-mcp resolves', async () => {
            // Initial verify (mount) + inspect-mcp + re-verify
            webviewClient.request
                .mockResolvedValueOnce(makeVerifyResult())
                .mockResolvedValueOnce({ success: true, mcps: [] })
                .mockResolvedValueOnce(makeVerifyResult());
            await renderTab();
            const refresh = screen.getByRole('button', { name: /refresh/i });
            await act(async () => { fireEvent.click(refresh); });
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });
            const verifyCalls = webviewClient.request.mock.calls.filter(
                ([type]: [string]) => type === 'verify-ai-setup',
            );
            expect(verifyCalls.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ─── Regenerate action ────────────────────────────────────────────────────

    describe('regenerate action', () => {
        it('clicking Regenerate dispatches regenerate-ai-files', async () => {
            webviewClient.request
                .mockResolvedValueOnce(makeVerifyResult()) // initial verify
                .mockResolvedValueOnce({ success: true })  // regenerate
                .mockResolvedValueOnce(makeVerifyResult()); // re-verify

            await renderTab('/projects/test');
            const regen = screen.getByRole('button', { name: /regenerate ai files/i });
            await act(async () => { fireEvent.click(regen); });

            const regenCall = webviewClient.request.mock.calls.find(
                ([type]: [string]) => type === 'regenerate-ai-files',
            );
            expect(regenCall).toBeDefined();
            expect(regenCall?.[1]).toMatchObject({ projectPath: '/projects/test' });
        });

        it('re-runs verification after regeneration completes', async () => {
            webviewClient.request
                .mockResolvedValueOnce(makeVerifyResult())
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValueOnce(makeVerifyResult());

            await renderTab();
            const regen = screen.getByRole('button', { name: /regenerate ai files/i });
            await act(async () => { fireEvent.click(regen); });
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });
            const verifyCalls = webviewClient.request.mock.calls.filter(
                ([type]: [string]) => type === 'verify-ai-setup',
            );
            expect(verifyCalls.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ─── Register button ──────────────────────────────────────────────────────

    describe('register button', () => {
        it('is NOT shown when globalMcpRegistration is "registered"', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ globalMcpRegistration: 'registered' }),
            );
            await renderTab();
            expect(screen.queryByRole('button', { name: /^register$/i })).not.toBeInTheDocument();
        });

        it('is shown when globalMcpRegistration is "unregistered"', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ globalMcpRegistration: 'unregistered' }),
            );
            await renderTab();
            expect(screen.getByRole('button', { name: /^register$/i })).toBeInTheDocument();
        });

        it('is shown when globalMcpRegistration is "declined"', async () => {
            webviewClient.request.mockResolvedValue(
                makeVerifyResult({ globalMcpRegistration: 'declined' }),
            );
            await renderTab();
            expect(screen.getByRole('button', { name: /^register$/i })).toBeInTheDocument();
        });

        it('clicking Register dispatches register-global-mcp', async () => {
            webviewClient.request
                .mockResolvedValueOnce(makeVerifyResult({ globalMcpRegistration: 'unregistered' })) // initial verify
                .mockResolvedValueOnce({ success: true }) // register
                .mockResolvedValueOnce(makeVerifyResult({ globalMcpRegistration: 'registered' })); // re-verify

            await renderTab();
            const register = screen.getByRole('button', { name: /^register$/i });
            await act(async () => { fireEvent.click(register); });

            const call = webviewClient.request.mock.calls.find(
                ([type]: [string]) => type === 'register-global-mcp',
            );
            expect(call).toBeDefined();
        });

        it('re-runs verification after registration completes', async () => {
            webviewClient.request
                .mockResolvedValueOnce(makeVerifyResult({ globalMcpRegistration: 'unregistered' }))
                .mockResolvedValueOnce({ success: true })
                .mockResolvedValueOnce(makeVerifyResult({ globalMcpRegistration: 'registered' }));

            await renderTab();
            const register = screen.getByRole('button', { name: /^register$/i });
            await act(async () => { fireEvent.click(register); });
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });
            const verifyCalls = webviewClient.request.mock.calls.filter(
                ([type]: [string]) => type === 'verify-ai-setup',
            );
            expect(verifyCalls.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ─── useAsyncOperation integration ────────────────────────────────────────

    describe('useAsyncOperation', () => {
        it('Refresh button is disabled while inspect-mcp is in flight', async () => {
            // Initial verify resolves; refresh request is left pending until we resolve it.
            let resolveInspect: ((value: unknown) => void) | undefined;
            const inspectPromise = new Promise(res => { resolveInspect = res; });

            webviewClient.request
                .mockResolvedValueOnce(makeVerifyResult())
                .mockReturnValueOnce(inspectPromise);

            await renderTab();
            const refresh = screen.getByRole('button', { name: /refresh/i });
            await act(async () => { fireEvent.click(refresh); });

            // After clicking, while inspect-mcp is still pending, the button is disabled
            expect(refresh).toBeDisabled();

            // Resolve so cleanup is happy
            await act(async () => {
                resolveInspect?.({ success: true, mcps: [] });
                await Promise.resolve();
            });
        });

        it('does not throw or warn when unmounted mid-operation', async () => {
            let resolveInspect: ((value: unknown) => void) | undefined;
            const inspectPromise = new Promise(res => { resolveInspect = res; });
            webviewClient.request
                .mockResolvedValueOnce(makeVerifyResult())
                .mockReturnValueOnce(inspectPromise);

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const utils = await renderTab();
            const refresh = screen.getByRole('button', { name: /refresh/i });
            await act(async () => { fireEvent.click(refresh); });

            // Unmount while inspect-mcp is still pending
            await act(async () => { utils.unmount(); });

            // Now resolve — should not warn or throw
            await act(async () => {
                resolveInspect?.({ success: true, mcps: [] });
                await Promise.resolve();
            });

            const setStateWarnings = consoleErrorSpy.mock.calls.filter(args =>
                String(args[0]).includes('unmounted'),
            );
            expect(setStateWarnings).toHaveLength(0);
            consoleErrorSpy.mockRestore();
        });

        it('surfaces an error message when the initial verify fails', async () => {
            webviewClient.request.mockReset();
            webviewClient.request.mockRejectedValue(new Error('Network failure'));
            await renderTab();
            await waitFor(() => {
                expect(screen.getByText(/Network failure/i)).toBeInTheDocument();
            });
        });
    });
});
