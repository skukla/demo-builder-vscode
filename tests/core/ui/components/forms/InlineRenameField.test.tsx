/**
 * InlineRenameField tests — the shared rename-in-place affordance.
 *
 * Display mode shows the name + a hover-revealed pencil; clicking the pencil
 * swaps in a prefilled, focused input. Enter/blur commit through the async
 * `onRename` (null = success → display mode; string = error → stay editing,
 * show it inline); Escape cancels; trimmed-empty or unchanged input exits
 * silently without calling `onRename`. `disabled` renders the text only.
 * The wrapper stops click/keydown propagation so a hosting click-to-open card
 * neither opens on interaction nor hijacks Enter.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';

type Props = React.ComponentProps<typeof InlineRenameField>;

function renderField(props: Partial<Props> = {}): {
    onRename: jest.Mock;
    outerClick: jest.Mock;
    outerKeyDown: jest.Mock;
} {
    const onRename = props.onRename
        ? (props.onRename as jest.Mock)
        : jest.fn().mockResolvedValue(null);
    const outerClick = jest.fn();
    const outerKeyDown = jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            {/* Simulates the hosting click-to-open card tile. */}
            <div onClick={outerClick} onKeyDown={outerKeyDown} data-testid="host-tile">
                <InlineRenameField
                    name={props.name ?? 'My Project'}
                    onRename={onRename}
                    disabled={props.disabled}
                    textClassName={props.textClassName}
                    normalize={props.normalize}
                />
            </div>
        </Provider>
    );
    return { onRename, outerClick, outerKeyDown };
}

function pencil(): HTMLElement {
    return screen.getByRole('button', { name: 'Rename My Project' });
}

function enterEditMode(): HTMLInputElement {
    fireEvent.click(pencil());
    return screen.getByRole('textbox') as HTMLInputElement;
}

describe('InlineRenameField', () => {
    describe('display mode', () => {
        it('renders the name text with the caller class and a pencil button', () => {
            renderField({ textClassName: 'project-card-spectrum-name' });
            const text = screen.getByText('My Project');
            expect(text).toHaveClass('project-card-spectrum-name');
            expect(pencil()).toBeInTheDocument();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        });

        it('renders text only (no pencil) when disabled', () => {
            renderField({ disabled: true });
            expect(screen.getByText('My Project')).toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });

    describe('entering edit mode', () => {
        it('pencil click swaps in a prefilled, focused input', () => {
            renderField();
            const input = enterEditMode();
            expect(input.value).toBe('My Project');
            expect(input).toHaveFocus();
            expect(screen.queryByText('My Project')).not.toBeInTheDocument();
        });
    });

    describe('commit and cancel', () => {
        it('Enter commits the trimmed name through onRename and returns to display mode', async () => {
            const { onRename } = renderField();
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: '  New Name  ' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await waitFor(() => {
                expect(onRename).toHaveBeenCalledWith('New Name');
            });
            await waitFor(() => {
                expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            });
        });

        it('Escape cancels without calling onRename', () => {
            const { onRename } = renderField();
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Changed' } });
            fireEvent.keyDown(input, { key: 'Escape' });
            expect(onRename).not.toHaveBeenCalled();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            expect(screen.getByText('My Project')).toBeInTheDocument();
        });

        it('blur commits a changed name', async () => {
            const { onRename } = renderField();
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Blur Name' } });
            fireEvent.blur(input);
            await waitFor(() => {
                expect(onRename).toHaveBeenCalledWith('Blur Name');
            });
        });

        it('an unchanged name exits silently without calling onRename', () => {
            const { onRename } = renderField();
            const input = enterEditMode();
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(onRename).not.toHaveBeenCalled();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        });

        it('a trimmed-empty name exits silently without calling onRename', () => {
            const { onRename } = renderField();
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: '   ' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(onRename).not.toHaveBeenCalled();
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        });
    });

    describe('normalize', () => {
        // Reuse the create-flow normalizer: spaces → hyphens, lowercase, etc.
        const normalize = (raw: string): string =>
            raw
                .toLowerCase()
                .replace(/[\s_]+/g, '-')
                .replace(/[^a-z0-9-]/g, '');

        it('transforms typed input live so a space becomes a hyphen', () => {
            renderField({ normalize });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'My New Name' } });
            expect(input.value).toBe('my-new-name');
        });

        it('commits the normalized value, not the raw keystrokes', async () => {
            const { onRename } = renderField({ normalize });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Cool Demo!' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await waitFor(() => expect(onRename).toHaveBeenCalledWith('cool-demo'));
        });

        it('leaves input untouched when no normalize is supplied (generic default)', () => {
            renderField();
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'My New Name' } });
            expect(input.value).toBe('My New Name');
        });
    });

    describe('rejection safety and focus', () => {
        it('a REJECTING onRename shows a fallback error and does not wedge the field', async () => {
            const onRename = jest.fn().mockRejectedValue(new Error('boom'));
            renderField({ onRename });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'New Name' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await waitFor(() => {
                expect(screen.getByText('Rename failed')).toBeInTheDocument();
            });
            // Not wedged: input re-enabled and a later commit still goes through.
            expect(screen.getByRole('textbox')).not.toBeDisabled();
            onRename.mockResolvedValue(null);
            fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
            await waitFor(() => {
                expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            });
        });

        it('refocuses the input after a failed commit even when focus was lost in flight', async () => {
            // Real browsers drop focus when the focused input is disabled during
            // the pending request — simulate the focus loss explicitly so the
            // refocus mechanism (post-render effect) is what this pin exercises.
            let resolveRename!: (value: string | null) => void;
            const onRename = jest.fn(
                () =>
                    new Promise<string | null>((res) => {
                        resolveRename = res;
                    })
            );
            renderField({ onRename });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Taken' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            // Focus drops while the input is disabled mid-flight (jsdom ignores
            // blur() on a disabled input, so steal focus with a decoy instead).
            const decoy = document.createElement('button');
            document.body.appendChild(decoy);
            decoy.focus();
            expect(screen.getByRole('textbox')).not.toHaveFocus();

            resolveRename('taken');
            await waitFor(() => {
                expect(screen.getByText('taken')).toBeInTheDocument();
            });
            expect(screen.getByRole('textbox')).toHaveFocus();
            decoy.remove();
        });

        it('a blur while a commit is in flight never double-commits (busy guard)', async () => {
            let resolveRename!: (value: string | null) => void;
            const onRename = jest.fn(
                () =>
                    new Promise<string | null>((res) => {
                        resolveRename = res;
                    })
            );
            renderField({ onRename });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Pending Name' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            // The disable-triggered blur fires while the request is pending.
            fireEvent.blur(screen.getByRole('textbox'));
            resolveRename(null);
            await waitFor(() => {
                expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            });
            expect(onRename).toHaveBeenCalledTimes(1);
        });
    });

    describe('pending and error states', () => {
        it('disables the input while the rename is in flight', async () => {
            let resolveRename!: (value: string | null) => void;
            const onRename = jest.fn(
                () =>
                    new Promise<string | null>((res) => {
                        resolveRename = res;
                    })
            );
            renderField({ onRename });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Pending Name' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(screen.getByRole('textbox')).toBeDisabled();
            resolveRename(null);
            await waitFor(() => {
                expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            });
        });

        it('an error keeps edit mode and shows the message inline', async () => {
            const onRename = jest
                .fn()
                .mockResolvedValue('A project folder named "Taken" already exists');
            renderField({ onRename });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Taken' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await waitFor(() => {
                expect(
                    screen.getByText('A project folder named "Taken" already exists')
                ).toBeInTheDocument();
            });
            expect(screen.getByRole('textbox')).toBeInTheDocument();
            expect(screen.getByRole('textbox')).not.toBeDisabled();
        });

        it('a retry after an error can still succeed', async () => {
            const onRename = jest.fn().mockResolvedValueOnce('taken').mockResolvedValueOnce(null);
            renderField({ onRename });
            const input = enterEditMode();
            fireEvent.change(input, { target: { value: 'Taken' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            await waitFor(() => {
                expect(screen.getByText('taken')).toBeInTheDocument();
            });
            fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Free Name' } });
            fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
            await waitFor(() => {
                expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
            });
            expect(onRename).toHaveBeenCalledTimes(2);
        });
    });

    describe('propagation containment (hosting card tile)', () => {
        it('clicking the display-mode NAME reaches the host tile (card click-to-open keeps working)', () => {
            const { outerClick } = renderField();
            fireEvent.click(screen.getByText('My Project'));
            expect(outerClick).toHaveBeenCalledTimes(1);
        });

        it('pencil click does not reach the host tile', () => {
            const { outerClick } = renderField();
            fireEvent.click(pencil());
            expect(outerClick).not.toHaveBeenCalled();
        });

        it('typing and Enter in the input do not reach the host tile', () => {
            const { outerClick, outerKeyDown } = renderField();
            const input = enterEditMode();
            fireEvent.click(input);
            fireEvent.keyDown(input, { key: 'a' });
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(outerClick).not.toHaveBeenCalled();
            expect(outerKeyDown).not.toHaveBeenCalled();
        });
    });
});
