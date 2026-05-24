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

function renderDialog(
    props: Partial<React.ComponentProps<typeof PromptEditDialog>> = {},
) {
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
        </Provider>,
    );
    return { ...utils, ...merged };
}

function getTitleInput(): HTMLInputElement {
    return screen.getByLabelText(/title/i) as HTMLInputElement;
}

function getPromptInput(): HTMLTextAreaElement {
    return screen.getByLabelText(/prompt/i) as HTMLTextAreaElement;
}

function getSaveButton(): HTMLElement {
    return screen.getByRole('button', { name: /^save$/i });
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
});
