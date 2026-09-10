/**
 * PromptEditDialog Tests
 *
 * The PromptEditDialog is a Modal wrapper used in two modes:
 *   - 'create' — fields empty, Save generates a new id
 *   - 'edit'   — fields prefilled from initialPrompt, Save preserves the id
 *
 * The dialog composes the shared `Modal` and uses Spectrum TextField + TextArea.
 * Save is disabled until both title and prompt are non-empty.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PromptEditDialog } from '@/features/dashboard/ui/aiSurface/components/PromptEditDialog';
import type { AiPrompt } from '@/types/base';
import '@testing-library/jest-dom';

function renderDialog(props: Partial<React.ComponentProps<typeof PromptEditDialog>> = {}) {
    const defaults: React.ComponentProps<typeof PromptEditDialog> = {
        mode: 'create',
        initialPrompt: undefined,
        onSave: jest.fn().mockResolvedValue(undefined),
        onClose: jest.fn(),
    };
    const merged = { ...defaults, ...props };
    const utils = render(
        <Provider theme={defaultTheme}>
            <PromptEditDialog {...merged} />
        </Provider>
    );
    return { ...utils, ...merged };
}

function getTitleInput(): HTMLInputElement {
    return screen.getByLabelText(/title/i);
}

function getPromptInput(): HTMLTextAreaElement {
    return screen.getByLabelText(/prompt/i);
}

function getSaveButton(): HTMLElement {
    return screen.getByRole('button', { name: /^save$/i });
}

/**
 * Swap `globalThis.crypto` for the duration of one test, then put it back.
 *
 * `generateId` reads the crypto GLOBAL, not a Node import — the dialog runs in a
 * webview. jsdom supplies its own `crypto`, so without this the branch taken is
 * whichever jsdom happens to satisfy, and neither is chosen by the test.
 */
async function withCrypto(value: unknown, run: () => Promise<void>): Promise<void> {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
    try {
        await run();
    } finally {
        if (original) {
            Object.defineProperty(globalThis, 'crypto', original);
        } else {
            delete (globalThis as { crypto?: unknown }).crypto;
        }
    }
}

/** Fill both fields and press Save. */
async function fillAndSave(titleText = 'My title', promptText = 'My prompt'): Promise<void> {
    fireEvent.change(getTitleInput(), { target: { value: titleText } });
    fireEvent.change(getPromptInput(), { target: { value: promptText } });
    await act(async () => {
        fireEvent.click(getSaveButton());
    });
}

/** The prompt `onSave` was handed on its only call. */
function saved(onSave: jest.Mock): AiPrompt {
    return onSave.mock.calls[0][0] as AiPrompt;
}

describe('PromptEditDialog', () => {
    describe('create mode', () => {
        it('renders title and prompt fields empty', () => {
            renderDialog({ mode: 'create' });
            expect(getTitleInput().value).toBe('');
            expect(getPromptInput().value).toBe('');
        });

        it('disables Save when title and prompt are both empty', () => {
            renderDialog({ mode: 'create' });
            const save = getSaveButton();
            expect(save).toHaveAttribute('aria-disabled', 'true');
        });

        it('disables Save when only title is filled', () => {
            renderDialog({ mode: 'create' });
            fireEvent.change(getTitleInput(), { target: { value: 'My title' } });
            expect(getSaveButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('disables Save when only prompt is filled', () => {
            renderDialog({ mode: 'create' });
            fireEvent.change(getPromptInput(), { target: { value: 'My prompt body' } });
            expect(getSaveButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('enables Save when both title and prompt are filled', () => {
            renderDialog({ mode: 'create' });
            fireEvent.change(getTitleInput(), { target: { value: 'My title' } });
            fireEvent.change(getPromptInput(), { target: { value: 'My prompt' } });
            expect(getSaveButton()).not.toHaveAttribute('aria-disabled', 'true');
        });

        it('clicking Save calls onSave with a generated id, the title, and the prompt', async () => {
            const onSave = jest.fn().mockResolvedValue(undefined);
            renderDialog({ mode: 'create', onSave });

            fireEvent.change(getTitleInput(), { target: { value: 'My title' } });
            fireEvent.change(getPromptInput(), { target: { value: 'My prompt' } });

            await act(async () => {
                fireEvent.click(getSaveButton());
            });

            expect(onSave).toHaveBeenCalledTimes(1);
            const callArg = onSave.mock.calls[0][0] as AiPrompt;
            expect(callArg.title).toBe('My title');
            expect(callArg.prompt).toBe('My prompt');
            expect(callArg.id).toEqual(expect.any(String));
            expect(callArg.id.length).toBeGreaterThan(0);
        });
    });

    describe('edit mode', () => {
        const EXISTING: AiPrompt = {
            id: 'existing-id-123',
            title: 'Existing title',
            prompt: 'Existing prompt body',
        };

        it('prefills the title from initialPrompt', () => {
            renderDialog({ mode: 'edit', initialPrompt: EXISTING });
            expect(getTitleInput().value).toBe('Existing title');
        });

        it('prefills the prompt body from initialPrompt', () => {
            renderDialog({ mode: 'edit', initialPrompt: EXISTING });
            expect(getPromptInput().value).toBe('Existing prompt body');
        });

        it('clicking Save calls onSave with the existing id preserved', async () => {
            const onSave = jest.fn().mockResolvedValue(undefined);
            renderDialog({ mode: 'edit', initialPrompt: EXISTING, onSave });

            fireEvent.change(getTitleInput(), { target: { value: 'Updated title' } });
            fireEvent.change(getPromptInput(), { target: { value: 'Updated prompt' } });

            await act(async () => {
                fireEvent.click(getSaveButton());
            });

            expect(onSave).toHaveBeenCalledTimes(1);
            const callArg = onSave.mock.calls[0][0] as AiPrompt;
            expect(callArg.id).toBe('existing-id-123');
            expect(callArg.title).toBe('Updated title');
            expect(callArg.prompt).toBe('Updated prompt');
        });

        it('disables Save when title is cleared in edit mode', () => {
            renderDialog({ mode: 'edit', initialPrompt: EXISTING });
            fireEvent.change(getTitleInput(), { target: { value: '' } });
            expect(getSaveButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('disables Save when prompt is cleared in edit mode', () => {
            renderDialog({ mode: 'edit', initialPrompt: EXISTING });
            fireEvent.change(getPromptInput(), { target: { value: '' } });
            expect(getSaveButton()).toHaveAttribute('aria-disabled', 'true');
        });
    });

    describe('cancel / close', () => {
        it('clicking Close calls onClose without saving', () => {
            const onSave = jest.fn();
            const onClose = jest.fn();
            renderDialog({ mode: 'create', onSave, onClose });
            // The Modal renders a "Close" button by default
            const closeButtons = screen.getAllByRole('button', { name: /close/i });
            // PromptEditDialog renders inside a Modal — the modal's footer Close
            // is the one we want. There should only be one Close on screen here.
            fireEvent.click(closeButtons[0]);
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(onSave).not.toHaveBeenCalled();
        });
    });

    /**
     * Which id a save carries, and where it comes from.
     *
     * `generateId` picks between the host's `crypto.randomUUID` and a
     * time-plus-random string. Both branches are reachable — VS Code webviews on
     * older hosts have no `randomUUID` — and neither was chosen by a test, so the
     * dialog could have minted a constant and nothing would have noticed.
     */
    describe('the id a save carries', () => {
        const FALLBACK_ID = /^ai-prompt-\d+-[0-9a-z]+$/;

        const COPY_SOURCE: AiPrompt = {
            id: 'source-id-999',
            title: 'Source title',
            prompt: 'Source body',
        };

        it('takes the id from the host crypto.randomUUID when it has one', async () => {
            await withCrypto({ randomUUID: () => 'uuid-from-host' }, async () => {
                const onSave = jest.fn().mockResolvedValue(undefined);
                renderDialog({ mode: 'create', onSave });

                await fillAndSave();

                expect(saved(onSave).id).toBe('uuid-from-host');
            });
        });

        it('falls back to a time-and-random id when crypto has no randomUUID', async () => {
            await withCrypto({}, async () => {
                const onSave = jest.fn().mockResolvedValue(undefined);
                renderDialog({ mode: 'create', onSave });

                await fillAndSave();

                expect(saved(onSave).id).toMatch(FALLBACK_ID);
            });
        });

        it('falls back when the host exposes no crypto at all', async () => {
            await withCrypto(undefined, async () => {
                const onSave = jest.fn().mockResolvedValue(undefined);
                renderDialog({ mode: 'create', onSave });

                await fillAndSave();

                expect(saved(onSave).id).toMatch(FALLBACK_ID);
            });
        });

        // The random suffix is what separates two fallback ids minted inside the
        // same millisecond. Without it the timestamp alone collides and the second
        // prompt overwrites the first.
        it('separates two fallback ids minted in the same millisecond', async () => {
            await withCrypto(undefined, async () => {
                jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
                let call = 0;
                jest.spyOn(Math, 'random').mockImplementation(() => {
                    call = (call % 9) + 1;
                    return call / 10;
                });

                const first = jest.fn().mockResolvedValue(undefined);
                const opened = renderDialog({ mode: 'create', onSave: first });
                await fillAndSave();
                opened.unmount();

                const second = jest.fn().mockResolvedValue(undefined);
                renderDialog({ mode: 'create', onSave: second });
                await fillAndSave();

                expect(saved(first).id).not.toBe(saved(second).id);
            });
        });

        // Duplicating a prompt: create mode is handed one to prefill from, and the
        // copy must NOT come back wearing the original's id.
        it('mints a new id in create mode even when handed a prompt to prefill from', async () => {
            await withCrypto({ randomUUID: () => 'fresh-id' }, async () => {
                const onSave = jest.fn().mockResolvedValue(undefined);
                renderDialog({ mode: 'create', initialPrompt: COPY_SOURCE, onSave });

                await fillAndSave('Copied title', 'Copied body');

                expect(saved(onSave).id).toBe('fresh-id');
            });
        });
    });

    describe('whitespace is not content', () => {
        it('leaves Save disabled when the title is only spaces', () => {
            renderDialog({ mode: 'create' });

            fireEvent.change(getTitleInput(), { target: { value: '   ' } });
            fireEvent.change(getPromptInput(), { target: { value: 'My prompt' } });

            expect(getSaveButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('leaves Save disabled when the prompt is only spaces', () => {
            renderDialog({ mode: 'create' });

            fireEvent.change(getTitleInput(), { target: { value: 'My title' } });
            fireEvent.change(getPromptInput(), { target: { value: '   ' } });

            expect(getSaveButton()).toHaveAttribute('aria-disabled', 'true');
        });

        it('trims the padding off both fields before saving', async () => {
            const onSave = jest.fn().mockResolvedValue(undefined);
            renderDialog({ mode: 'create', onSave });

            await fillAndSave('  My title  ', '  My prompt  ');

            expect(saved(onSave).title).toBe('My title');
            expect(saved(onSave).prompt).toBe('My prompt');
        });
    });

    describe('what the mode changes about the chrome', () => {
        const EXISTING: AiPrompt = { id: 'e1', title: 'T', prompt: 'P' };

        it('titles the dialog "New prompt" in create mode', () => {
            renderDialog({ mode: 'create' });

            expect(screen.getByRole('heading')).toHaveTextContent('New prompt');
        });

        it('titles the dialog "Edit prompt" in edit mode', () => {
            renderDialog({ mode: 'edit', initialPrompt: EXISTING });

            expect(screen.getByRole('heading')).toHaveTextContent('Edit prompt');
        });

        // The PROP, not the resulting focus: jsdom has no layout and react-aria's
        // focus-on-mount never fires here, so `toHaveFocus` would fail whatever the
        // dialog passed. The Spectrum stub surfaces the argument instead.
        it('asks the title field to take focus in create mode', () => {
            renderDialog({ mode: 'create' });

            expect(getTitleInput()).toHaveAttribute('data-autofocus', 'true');
        });

        it('does not claim focus when opening an existing prompt to edit', () => {
            renderDialog({ mode: 'edit', initialPrompt: EXISTING });

            expect(getTitleInput()).not.toHaveAttribute('data-autofocus');
        });
    });
});
