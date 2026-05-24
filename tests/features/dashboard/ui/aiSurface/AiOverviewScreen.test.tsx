/**
 * AiOverviewScreen Tests
 *
 * Centered single-column body using PageLayout + .page-container-padded
 * (matches projects-dashboard). The skills inventory drill-down opens from
 * a quiet "View installed skills (N)" link via InstalledSkillsModal, which
 * carries the Regenerate AI files action in its footer. Opening the modal
 * triggers a background inspect-mcp + verify-ai-setup refresh — there is
 * no standalone Refresh control on the surface.
 */

import { render, screen, fireEvent, act, within } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AiOverviewScreen } from '@/features/dashboard/ui/aiSurface/AiOverviewScreen';
import '@testing-library/jest-dom';
import type { Project } from '@/types/base';
import type { AiInventory, SkillInventoryEntry } from '@/types/ai';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

// Mock the page chrome to keep tests focused on composition.
jest.mock('@/core/ui/components/layout', () => ({
    PageLayout: ({
        header,
        footer,
        children,
    }: {
        header?: React.ReactNode;
        footer?: React.ReactNode;
        children: React.ReactNode;
    }) => (
        <div data-testid="page-layout">
            <div data-testid="page-layout-header">{header}</div>
            <div data-testid="page-layout-body">{children}</div>
            <div data-testid="page-layout-footer">{footer}</div>
        </div>
    ),
    PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <h3 data-testid="page-header-subtitle">{subtitle}</h3>}
        </div>
    ),
    PageFooter: ({ leftContent, rightContent }: { leftContent?: React.ReactNode; rightContent?: React.ReactNode }) => (
        <div data-testid="page-footer">
            <div data-testid="footer-left">{leftContent}</div>
            <div data-testid="footer-right">{rightContent}</div>
        </div>
    ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'My Demo Project',
        path: '/projects/my-demo',
        ...overrides,
    } as Project;
}

function makeSkill(overrides: Partial<SkillInventoryEntry> = {}): SkillInventoryEntry {
    return {
        name: 'add-component',
        description: 'Adds a component to a project.',
        path: '/p/.claude/skills/add-component.md',
        source: 'demo-builder',
        ...overrides,
    };
}

function makeFullInventory(): AiInventory {
    return {
        skills: [
            makeSkill({
                name: 'add-component',
                description: 'Adds a component to a project.',
                path: '/p/.claude/skills/add-component.md',
                source: 'demo-builder',
            }),
            makeSkill({
                name: 'sync-changes',
                description: 'Chooses the correct sync operation.',
                path: '/p/.claude/skills/sync-changes.md',
                source: 'demo-builder',
            }),
            makeSkill({
                name: 'aem-block-developer',
                description: 'Develops EDS blocks for Adobe Commerce storefronts.',
                path: '/p/.claude/skills/aem-block-developer/SKILL.md',
                source: 'adobe',
            }),
        ],
        mcps: [],
        sessionMcps: [],
    };
}

async function renderScreen(opts: {
    projectOverrides?: Partial<Project>;
    inventory?: AiInventory;
    status?: 'ok' | 'warning' | 'error';
} = {}) {
    const { webviewClient } = jest.requireMock('@/core/ui/utils/WebviewClient') as {
        webviewClient: { request: jest.Mock; postMessage: jest.Mock; onMessage: jest.Mock };
    };
    webviewClient.request.mockResolvedValue({
        success: true,
        status: opts.status ?? 'ok',
        checks: [],
        inventory: opts.inventory ?? makeFullInventory(),
        globalMcpRegistration: 'registered',
    });

    const project = makeProject(opts.projectOverrides);
    let result!: ReturnType<typeof render>;
    await act(async () => {
        result = render(
            <Provider theme={defaultTheme}>
                <AiOverviewScreen project={project} />
            </Provider>,
        );
        jest.runAllTimers();
    });
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return { ...result, project, webviewClient };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AiOverviewScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('page chrome', () => {
        it('renders PageHeader with title "AI"', async () => {
            await renderScreen();
            const header = screen.getByTestId('page-header');
            expect(header.querySelector('h1')?.textContent).toBe('AI');
        });

        it('renders PageHeader subtitle with the project name', async () => {
            await renderScreen({ projectOverrides: { name: 'Citi Signal Demo' } });
            expect(screen.getByTestId('page-header-subtitle').textContent).toBe('Citi Signal Demo');
        });

        it('renders PageLayout shell with header, body, footer + Close button', async () => {
            await renderScreen();
            expect(screen.getByTestId('page-layout')).toBeInTheDocument();
            expect(screen.getByTestId('page-layout-body')).toBeInTheDocument();
            expect(screen.getByTestId('page-footer')).toBeInTheDocument();
            expect(within(screen.getByTestId('page-footer')).getByRole('button', { name: /close/i })).toBeInTheDocument();
        });

        it('wraps body content in the centered .page-container-padded class', async () => {
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(body.querySelector('.page-container-padded')).not.toBeNull();
        });
    });

    describe('body (F4 single-column)', () => {
        it('does not render the inline capability list', async () => {
            await renderScreen();
            expect(screen.queryByTestId('ai-capability-list')).not.toBeInTheDocument();
        });

        it('does not render the removed "Open in Claude Code" CTA', async () => {
            await renderScreen();
            expect(screen.queryByRole('button', { name: /open in claude code/i })).not.toBeInTheDocument();
        });

        it('does not render the removed Learn more link', async () => {
            await renderScreen();
            expect(screen.queryByText(/learn more about ai integration/i)).not.toBeInTheDocument();
        });

        it('does not render the inline InstalledSkillsList (it now lives in a modal)', async () => {
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(within(body).queryByTestId('ai-installed-skills-list')).not.toBeInTheDocument();
        });

        it('renders the PromptGrid in the body (no curated section after G1)', async () => {
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(within(body).queryByText(/suggested prompts/i)).not.toBeInTheDocument();
            // With no user prompts, only the "+ New prompt" tile renders.
            expect(within(body).getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
            expect(within(body).queryAllByTestId('ai-prompt-card').length).toBe(0);
        });

        it('does NOT render a Refresh or Regenerate button in the body', async () => {
            // Both actions moved off the surface: Refresh is implicit on modal
            // open; Regenerate lives in the modal footer.
            await renderScreen();
            const body = screen.getByTestId('page-layout-body');
            expect(within(body).queryByRole('button', { name: /^refresh$/i })).not.toBeInTheDocument();
            expect(within(body).queryByRole('button', { name: /regenerate ai files/i })).not.toBeInTheDocument();
        });

        it('renders the quiet "View installed skills (N)" link beneath the grid', async () => {
            await renderScreen();
            const trigger = screen.getByTestId('ai-installed-skills-trigger');
            expect(trigger).toBeInTheDocument();
            expect(trigger.textContent).toMatch(/view installed skills \(3\)/i);
        });
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

    describe('user prompt launch', () => {
        it('clicking a user prompt card dispatches openInClaude with the prompt payload', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: {
                    aiPrompts: [
                        { id: 'u1', title: 'My launchable', prompt: 'Body to launch' },
                    ],
                } as Partial<Project>,
            });
            const body = screen.getByTestId('page-layout-body');
            const cards = within(body).getAllByTestId('ai-prompt-card');
            await act(async () => {
                fireEvent.click(cards[0]);
            });
            expect(webviewClient.postMessage).toHaveBeenCalledWith('openInClaude', {
                prompt: 'Body to launch',
            });
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

    describe('user prompts CRUD', () => {
        function makeProjectWithUserPrompts(): Project {
            return makeProject({
                aiPrompts: [
                    { id: 'u1', title: 'My first user prompt', prompt: 'Do thing one' },
                    { id: 'u2', title: 'My second user prompt', prompt: 'Do thing two' },
                ],
            } as Partial<Project>);
        }

        it('renders user prompts from project.aiPrompts', async () => {
            await renderScreen({ projectOverrides: { aiPrompts: [
                { id: 'u1', title: 'My first user prompt', prompt: 'Do thing one' },
            ] } as Partial<Project> });
            expect(screen.getByText('My first user prompt')).toBeInTheDocument();
            expect(screen.queryAllByTestId('ai-prompt-card').length).toBe(1);
        });

        it('renders only the "+ New" tile when aiPrompts is undefined', async () => {
            await renderScreen();
            expect(screen.queryAllByTestId('ai-prompt-card').length).toBe(0);
            expect(screen.getByTestId('ai-new-prompt-tile')).toBeInTheDocument();
        });

        it('clicking "+ New" opens PromptEditDialog in create mode (empty fields)', async () => {
            await renderScreen();
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-new-prompt-tile'));
            });
            expect(screen.getByRole('heading', { name: /new prompt/i })).toBeInTheDocument();
            const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
            const promptInput = screen.getByLabelText(/prompt/i) as HTMLTextAreaElement;
            expect(titleInput.value).toBe('');
            expect(promptInput.value).toBe('');
        });

        it('clicking Edit on a user prompt opens PromptEditDialog with values prefilled', async () => {
            await renderScreen({
                projectOverrides: makeProjectWithUserPrompts(),
            });
            const kebabs = screen.getAllByLabelText(/more actions/i);
            await act(async () => {
                kebabs[0].click();
            });
            await act(async () => {
                screen.getAllByText('Edit')[0].click();
            });
            const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
            const promptInput = screen.getByLabelText(/prompt/i) as HTMLTextAreaElement;
            expect(titleInput.value).toBe('My first user prompt');
            expect(promptInput.value).toBe('Do thing one');
        });

        it('saving a new prompt dispatches save-ai-prompt and refreshes view', async () => {
            const { webviewClient } = await renderScreen();
            (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
                if (type === 'save-ai-prompt') {
                    return Promise.resolve({
                        success: true,
                        aiPrompts: [{ id: 'new-id', title: 'New title', prompt: 'New body' }],
                    });
                }
                return Promise.resolve({
                    success: true,
                    status: 'ok',
                    checks: [],
                    inventory: makeFullInventory(),
                    globalMcpRegistration: 'registered',
                });
            });

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-new-prompt-tile'));
            });
            const titleInput = screen.getByLabelText(/title/i);
            const promptInput = screen.getByLabelText(/prompt/i);
            fireEvent.change(titleInput, { target: { value: 'New title' } });
            fireEvent.change(promptInput, { target: { value: 'New body' } });

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
                await Promise.resolve();
                await Promise.resolve();
            });

            const saveCalls = (webviewClient.request as jest.Mock).mock.calls.filter(c => c[0] === 'save-ai-prompt');
            expect(saveCalls.length).toBe(1);
            const payload = saveCalls[0][1] as { prompt: { title: string; prompt: string } };
            expect(payload.prompt.title).toBe('New title');
            expect(payload.prompt.prompt).toBe('New body');
        });

        it('saving an edit dispatches save-ai-prompt with the existing id preserved', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: makeProjectWithUserPrompts(),
            });
            (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
                if (type === 'save-ai-prompt') {
                    return Promise.resolve({
                        success: true,
                        aiPrompts: [
                            { id: 'u1', title: 'Edited title', prompt: 'Edited body' },
                            { id: 'u2', title: 'My second user prompt', prompt: 'Do thing two' },
                        ],
                    });
                }
                return Promise.resolve({
                    success: true,
                    status: 'ok',
                    checks: [],
                    inventory: makeFullInventory(),
                    globalMcpRegistration: 'registered',
                });
            });

            const kebabs = screen.getAllByLabelText(/more actions/i);
            await act(async () => {
                kebabs[0].click();
            });
            await act(async () => {
                screen.getAllByText('Edit')[0].click();
            });

            const titleInput = screen.getByLabelText(/title/i);
            const promptInput = screen.getByLabelText(/prompt/i);
            fireEvent.change(titleInput, { target: { value: 'Edited title' } });
            fireEvent.change(promptInput, { target: { value: 'Edited body' } });

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
                await Promise.resolve();
                await Promise.resolve();
            });

            const saveCalls = (webviewClient.request as jest.Mock).mock.calls.filter(c => c[0] === 'save-ai-prompt');
            expect(saveCalls.length).toBe(1);
            const payload = saveCalls[0][1] as { prompt: { id: string; title: string } };
            expect(payload.prompt.id).toBe('u1');
            expect(payload.prompt.title).toBe('Edited title');
        });

        it('clicking Duplicate dispatches save-ai-prompt with a new id and "(copy)" title suffix', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: makeProjectWithUserPrompts(),
            });
            (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
                if (type === 'save-ai-prompt') {
                    return Promise.resolve({ success: true, aiPrompts: [] });
                }
                return Promise.resolve({
                    success: true,
                    status: 'ok',
                    checks: [],
                    inventory: makeFullInventory(),
                    globalMcpRegistration: 'registered',
                });
            });

            const kebabs = screen.getAllByLabelText(/more actions/i);
            await act(async () => {
                kebabs[0].click();
            });
            await act(async () => {
                screen.getAllByText('Duplicate')[0].click();
                await Promise.resolve();
                await Promise.resolve();
            });

            const saveCalls = (webviewClient.request as jest.Mock).mock.calls.filter(c => c[0] === 'save-ai-prompt');
            expect(saveCalls.length).toBe(1);
            const payload = saveCalls[0][1] as { prompt: { id: string; title: string; prompt: string } };
            expect(payload.prompt.id).not.toBe('u1');
            expect(payload.prompt.id.length).toBeGreaterThan(0);
            expect(payload.prompt.title).toBe('My first user prompt (copy)');
            expect(payload.prompt.prompt).toBe('Do thing one');
        });

        it('clicking Delete dispatches delete-ai-prompt with the promptId', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: makeProjectWithUserPrompts(),
            });
            (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
                if (type === 'delete-ai-prompt') {
                    return Promise.resolve({ success: true, aiPrompts: [] });
                }
                return Promise.resolve({
                    success: true,
                    status: 'ok',
                    checks: [],
                    inventory: makeFullInventory(),
                    globalMcpRegistration: 'registered',
                });
            });

            const kebabs = screen.getAllByLabelText(/more actions/i);
            await act(async () => {
                kebabs[0].click();
            });
            await act(async () => {
                screen.getAllByText('Delete')[0].click();
                await Promise.resolve();
                await Promise.resolve();
            });

            const deleteCalls = (webviewClient.request as jest.Mock).mock.calls.filter(c => c[0] === 'delete-ai-prompt');
            expect(deleteCalls.length).toBe(1);
            expect(deleteCalls[0][1]).toEqual({ promptId: 'u1' });
        });

        it('after saving a new prompt, local view reflects the new state', async () => {
            const { webviewClient } = await renderScreen();
            const newPrompt = { id: 'new-id', title: 'Brand new', prompt: 'Brand new body' };
            (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
                if (type === 'save-ai-prompt') {
                    return Promise.resolve({ success: true, aiPrompts: [newPrompt] });
                }
                return Promise.resolve({
                    success: true,
                    status: 'ok',
                    checks: [],
                    inventory: makeFullInventory(),
                    globalMcpRegistration: 'registered',
                });
            });

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-new-prompt-tile'));
            });
            fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Brand new' } });
            fireEvent.change(screen.getByLabelText(/prompt/i), { target: { value: 'Brand new body' } });

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(screen.getByText('Brand new')).toBeInTheDocument();
        });

        it('after deleting a prompt, local view reflects the new state', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: makeProjectWithUserPrompts(),
            });
            (webviewClient.request as jest.Mock).mockImplementation((type: string) => {
                if (type === 'delete-ai-prompt') {
                    return Promise.resolve({
                        success: true,
                        aiPrompts: [
                            { id: 'u2', title: 'My second user prompt', prompt: 'Do thing two' },
                        ],
                    });
                }
                return Promise.resolve({
                    success: true,
                    status: 'ok',
                    checks: [],
                    inventory: makeFullInventory(),
                    globalMcpRegistration: 'registered',
                });
            });

            expect(screen.getByText('My first user prompt')).toBeInTheDocument();

            const kebabs = screen.getAllByLabelText(/more actions/i);
            await act(async () => {
                kebabs[0].click();
            });
            await act(async () => {
                screen.getAllByText('Delete')[0].click();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(screen.queryByText('My first user prompt')).not.toBeInTheDocument();
            expect(screen.getByText('My second user prompt')).toBeInTheDocument();
        });
    });
});
