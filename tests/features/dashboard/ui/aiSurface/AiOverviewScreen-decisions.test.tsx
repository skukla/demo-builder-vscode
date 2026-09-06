/**
 * AiOverviewScreen Tests — the decisions the CRUD suite does not reach
 *
 * The sibling suite drives one prompt at a time and asserts what was requested.
 * These cover what it cannot: which card an action actually targets, whether the
 * dialog closes, where a duplicate's id comes from, that the mount fetch reruns
 * for a new project and ignores the answer meant for the old one, and pinning —
 * which nothing exercised at all. Shared setup lives in AiOverviewScreen.testUtils.tsx.
 */

import { screen, fireEvent, act, within } from '@testing-library/react';
import {
    deferred,
    makeAiOverviewProject,
    renderScreen,
    renderWithProject,
    settleScreen,
} from './AiOverviewScreen.testUtils';
import type { AiPrompt } from '@/types/base';

/** Sorted alphabetically by PromptGrid, so index 1 is genuinely the SECOND card. */
const TWO_PROMPTS: AiPrompt[] = [
    { id: 'p-alpha', title: 'Alpha prompt', prompt: 'Alpha body' },
    { id: 'p-beta', title: 'Beta prompt', prompt: 'Beta body' },
];

const savedPayloads = (client: { request: jest.Mock }): AiPrompt[] =>
    client.request.mock.calls
        .filter((c) => c[0] === 'save-ai-prompt')
        .map((c) => (c[1] as { prompt: AiPrompt }).prompt);

/**
 * Choose `label` from the kebab of the card at `index`.
 *
 * Scoped to that card's wrapper on purpose: the Spectrum mock renders every
 * MenuTrigger's children inline and always, so a page-wide `getAllByText('Edit')`
 * finds one row per card and its first hit is the FIRST card whichever kebab was
 * pressed — which is exactly the mistake these tests exist to catch.
 */
async function chooseFromKebab(index: number, label: string): Promise<void> {
    const card = screen.getAllByTestId('ai-prompt-card-wrapper')[index];
    await act(async () => {
        within(card).getByLabelText(/more actions/i).click();
    });
    await act(async () => {
        within(card).getByText(label).click();
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe('AiOverviewScreen — decisions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('closing', () => {
        it('sends cancel when the SC closes the library', async () => {
            const { webviewClient } = await renderScreen();

            await act(async () => {
                fireEvent.click(
                    within(screen.getByTestId('page-footer')).getByRole('button', {
                        name: /close/i,
                    })
                );
            });

            expect(webviewClient.postMessage).toHaveBeenCalledWith('cancel');
        });

        it('closes the edit dialog when the SC dismisses it', async () => {
            await renderScreen({ projectOverrides: { aiPrompts: TWO_PROMPTS } });
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-new-prompt-tile'));
            });
            expect(screen.getByRole('heading', { name: /new prompt/i })).toBeInTheDocument();

            const dialog = screen.getByRole('dialog');
            await act(async () => {
                fireEvent.click(within(dialog).getByRole('button', { name: /^close$/i }));
            });

            expect(screen.queryByRole('heading', { name: /new prompt/i })).not.toBeInTheDocument();
        });

        it('closes the edit dialog once the save has been sent', async () => {
            const { webviewClient } = await renderScreen();
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: [{ id: 'new', title: 'Fresh', prompt: 'Fresh body' }],
            });

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-new-prompt-tile'));
            });
            fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Fresh' } });
            fireEvent.change(screen.getByLabelText(/prompt/i), { target: { value: 'Fresh body' } });
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(screen.queryByRole('heading', { name: /new prompt/i })).not.toBeInTheDocument();
        });
    });

    describe('which card an action targets', () => {
        it('edits the card whose kebab was used, not the first one', async () => {
            await renderScreen({ projectOverrides: { aiPrompts: TWO_PROMPTS } });
            await chooseFromKebab(1, 'Edit');

            expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
                'Beta prompt'
            );
        });

        it('duplicates the card whose kebab was used, not the first one', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: TWO_PROMPTS },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: TWO_PROMPTS,
            });

            await chooseFromKebab(1, 'Duplicate');

            expect(savedPayloads(webviewClient)).toEqual([
                expect.objectContaining({ title: 'Beta prompt (copy)', prompt: 'Beta body' }),
            ]);
        });

        it('adopts the list the duplicate came back with', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: TWO_PROMPTS },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: [
                    ...TWO_PROMPTS,
                    { id: 'copy-1', title: 'Alpha prompt (copy)', prompt: 'Alpha body' },
                ],
            });

            await chooseFromKebab(0, 'Duplicate');

            expect(screen.getByText('Alpha prompt (copy)')).toBeInTheDocument();
        });

        it('deletes the card whose kebab was used, not the first one', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: TWO_PROMPTS },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: [TWO_PROMPTS[0]],
            });

            await chooseFromKebab(1, 'Delete');

            const deletes = (webviewClient.request as jest.Mock).mock.calls.filter(
                (c) => c[0] === 'delete-ai-prompt'
            );
            expect(deletes).toEqual([['delete-ai-prompt', { promptId: 'p-beta' }]]);
        });
    });

    describe('pinning', () => {
        it('saves the whole prompt with pinned true, changing nothing else', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: TWO_PROMPTS },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: TWO_PROMPTS,
            });

            await chooseFromKebab(0, 'Pin');

            expect(savedPayloads(webviewClient)).toEqual([
                { id: 'p-alpha', title: 'Alpha prompt', prompt: 'Alpha body', pinned: true },
            ]);
        });

        it('saves pinned false when unpinning', async () => {
            const pinned: AiPrompt[] = [{ ...TWO_PROMPTS[0], pinned: true }, TWO_PROMPTS[1]];
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: pinned },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: pinned,
            });

            await chooseFromKebab(0, 'Unpin');

            expect(savedPayloads(webviewClient)).toEqual([
                { id: 'p-alpha', title: 'Alpha prompt', prompt: 'Alpha body', pinned: false },
            ]);
        });

        it('pins the card whose kebab was used, not the first one', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: TWO_PROMPTS },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: TWO_PROMPTS,
            });

            await chooseFromKebab(1, 'Pin');

            expect(savedPayloads(webviewClient)).toEqual([
                { id: 'p-beta', title: 'Beta prompt', prompt: 'Beta body', pinned: true },
            ]);
        });

        it('shows the pin indicator once the saved list comes back pinned', async () => {
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: TWO_PROMPTS },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: [{ ...TWO_PROMPTS[0], pinned: true }, TWO_PROMPTS[1]],
            });

            await chooseFromKebab(0, 'Pin');

            expect(screen.getAllByTestId('ai-prompt-pin-indicator')).toHaveLength(1);
        });
    });

    describe('acting on a prompt that arrived after mount', () => {
        // Each handler closes over `userPrompts`. If its dependency list is empty the
        // closure keeps the list it was born with, and every action against a prompt
        // that appeared later silently does nothing — the id is not in the old array,
        // so `find` misses and the guard returns.
        const GAMMA: AiPrompt = { id: 'p-gamma', title: 'Gamma prompt', prompt: 'Gamma body' };

        async function listGrows() {
            const rendered = await renderScreen({
                projectOverrides: { aiPrompts: [TWO_PROMPTS[0]] },
            });
            (rendered.webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: [TWO_PROMPTS[0], GAMMA],
            });
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-new-prompt-tile'));
            });
            fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Gamma prompt' } });
            fireEvent.change(screen.getByLabelText(/prompt/i), { target: { value: 'Gamma body' } });
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
                await Promise.resolve();
                await Promise.resolve();
            });
            expect(screen.getByText('Gamma prompt')).toBeInTheDocument();
            (rendered.webviewClient.request as jest.Mock).mockClear();
            return rendered;
        }

        it('edits it', async () => {
            await listGrows();

            await chooseFromKebab(1, 'Edit');

            expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
                'Gamma prompt'
            );
        });

        it('duplicates it', async () => {
            const { webviewClient } = await listGrows();

            await chooseFromKebab(1, 'Duplicate');

            expect(savedPayloads(webviewClient)).toEqual([
                expect.objectContaining({ title: 'Gamma prompt (copy)', prompt: 'Gamma body' }),
            ]);
        });

        it('pins it', async () => {
            const { webviewClient } = await listGrows();

            await chooseFromKebab(1, 'Pin');

            expect(savedPayloads(webviewClient)).toEqual([{ ...GAMMA, pinned: true }]);
        });
    });

    describe('the id a duplicate is given', () => {
        const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

        afterEach(() => {
            if (realCrypto) {
                Object.defineProperty(globalThis, 'crypto', realCrypto);
            }
        });

        function useCrypto(value: unknown): void {
            Object.defineProperty(globalThis, 'crypto', {
                value,
                configurable: true,
                writable: true,
            });
        }

        async function duplicateFirst(): Promise<AiPrompt> {
            const { webviewClient } = await renderScreen({
                projectOverrides: { aiPrompts: TWO_PROMPTS },
            });
            (webviewClient.request as jest.Mock).mockResolvedValue({
                success: true,
                aiPrompts: TWO_PROMPTS,
            });
            await chooseFromKebab(0, 'Duplicate');
            return savedPayloads(webviewClient)[0];
        }

        it('takes the id from crypto.randomUUID when the host provides one', async () => {
            useCrypto({ randomUUID: () => 'uuid-from-host' });

            expect((await duplicateFirst()).id).toBe('uuid-from-host');
        });

        it('falls back to a timestamped random id when randomUUID is missing', async () => {
            useCrypto({});
            jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
            jest.spyOn(Math, 'random').mockReturnValue(0.5);

            // 0.5 * 1_000_000 floored is 500000, which is "ao9k" in base 36. A mutant
            // that divides instead of multiplying floors to 0 and writes "0".
            expect((await duplicateFirst()).id).toBe(
                `ai-prompt-1700000000000-${(500000).toString(36)}`
            );
            expect((await duplicateFirst()).id).not.toMatch(/-0$/);
        });

        it('falls back when the host has no crypto object at all', async () => {
            useCrypto(undefined);

            expect((await duplicateFirst()).id).toMatch(/^ai-prompt-\d+-[a-z0-9]+$/);
        });
    });

    describe('following the project', () => {
        const listFor = (prompts: AiPrompt[]) => ({ success: true, aiPrompts: prompts });

        it('refetches the merged list when a different project is shown', async () => {
            const first = makeAiOverviewProject({ path: '/projects/one', aiPrompts: [] });
            const second = makeAiOverviewProject({ path: '/projects/two', aiPrompts: [] });
            let answer = listFor([{ id: 'a', title: 'From one', prompt: 'body' }]);
            const { webviewClient, showProject } = await renderWithProject(first, () =>
                Promise.resolve(answer)
            );
            expect(screen.getByText('From one')).toBeInTheDocument();

            answer = listFor([{ id: 'b', title: 'From two', prompt: 'body' }]);
            await showProject(second);

            expect(
                (webviewClient.request as jest.Mock).mock.calls.filter(
                    (c) => c[0] === 'list-ai-prompts'
                )
            ).toHaveLength(2);
            expect(screen.getByText('From two')).toBeInTheDocument();
        });

        it('ignores the answer meant for the project it has already left', async () => {
            const first = makeAiOverviewProject({ path: '/projects/one', aiPrompts: [] });
            const second = makeAiOverviewProject({ path: '/projects/two', aiPrompts: [] });
            const stale = deferred<unknown>();
            let pending: Promise<unknown> = stale.promise;
            const { showProject } = await renderWithProject(first, () => pending);

            pending = Promise.resolve(listFor([{ id: 'b', title: 'From two', prompt: 'body' }]));
            await showProject(second);
            expect(screen.getByText('From two')).toBeInTheDocument();

            // The first project's request finally answers, long after it stopped mattering.
            stale.resolve(listFor([{ id: 'a', title: 'From one', prompt: 'body' }]));
            await settleScreen();

            expect(screen.queryByText('From one')).not.toBeInTheDocument();
            expect(screen.getByText('From two')).toBeInTheDocument();
        });
    });
});
