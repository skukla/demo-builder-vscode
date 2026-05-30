/**
 * AiOverviewScreen Tests — User prompts
 *
 * Launching a user prompt into Claude, the full prompt CRUD flow (create, edit,
 * duplicate, delete, local-view refresh), and the "Copy prompt" kebab wiring.
 * Shared setup lives in AiOverviewScreen.testUtils.tsx.
 */

import { screen, fireEvent, act, within } from '@testing-library/react';
import {
    makeFullInventory,
    makeProjectWithUserPrompts,
    renderScreen,
} from './AiOverviewScreen.testUtils';
import type { Project } from '@/types/base';

describe('AiOverviewScreen — user prompts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

    describe('user prompts CRUD', () => {
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

    describe('copyAiPrompt wiring through PromptCard', () => {
        it('clicking the "Copy prompt" kebab item dispatches copyAiPrompt with the prompt body', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: {
                    aiPrompts: [
                        { id: 'u1', title: 'Copy me', prompt: 'This is the body' },
                    ],
                } as Partial<Project>,
            });
            (webviewClient.postMessage as jest.Mock).mockClear();

            const kebab = screen.getByLabelText(/more actions/i);
            await act(async () => {
                kebab.click();
            });
            await act(async () => {
                screen.getByText('Copy prompt').click();
            });

            const calls = (webviewClient.postMessage as jest.Mock).mock.calls;
            const copyCalls = calls.filter(c => c[0] === 'copyAiPrompt');
            expect(copyCalls.length).toBe(1);
            expect(copyCalls[0][1]).toEqual(expect.objectContaining({ prompt: 'This is the body' }));
        });
    });
});
