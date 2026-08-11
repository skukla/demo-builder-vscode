/**
 * RenameIntegrationModal Tests (shell instancing — Step 10, wizard rename)
 *
 * The one-field rename surface for AI-built instance rows. Display name ONLY —
 * the instance id (folder, ow.package, keyed key, picks) is immutable, so the
 * modal never re-derives an id; it evaluates the display name against the OTHER
 * rows' display names (case-insensitive, trimmed) with BlankStage's
 * evaluate-and-emit + inline errorMessage idiom. The instance's CURRENT name is
 * always allowed (a no-op rename). Mirrors AddIntegrationFlowModal's shell:
 * DialogContainer host + conditional mount (the reset-on-open seam; also
 * mandatory because the Spectrum test mock renders dialogs eagerly).
 *
 * @jest-environment jsdom
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { RenameIntegrationModal } from '@/features/project-creation/ui/components/integration-flow/RenameIntegrationModal';

type Props = React.ComponentProps<typeof RenameIntegrationModal>;

function renderModal(props: Partial<Props> = {}) {
    const onClose = jest.fn();
    const onRename = jest.fn();
    const view = render(
        <Provider theme={defaultTheme}>
            <RenameIntegrationModal
                isOpen={props.isOpen ?? true}
                currentName={props.currentName ?? 'Firefly Image Gen'}
                takenNames={props.takenNames ?? ['Order Sync', 'Commerce API Mesh']}
                onClose={onClose}
                onRename={onRename}
            />
        </Provider>
    );
    return { onClose, onRename, view };
}

/** The one name field (the modal renders a single textbox). */
function nameField(): HTMLElement {
    return screen.getByRole('textbox');
}

function saveButton(): HTMLElement {
    return screen.getByRole('button', { name: 'Save' });
}

describe('RenameIntegrationModal — shell', () => {
    it('renders nothing while closed (conditional mount — the reset-on-open seam)', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('prefills the field with the current display name', () => {
        renderModal();
        expect(nameField()).toHaveValue('Firefly Image Gen');
    });

    it('Cancel fires onClose and never onRename', () => {
        const { onClose, onRename } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onRename).not.toHaveBeenCalled();
    });
});

describe('RenameIntegrationModal — validation (evaluate-and-emit)', () => {
    it('the unchanged current name stays saveable (a no-op rename is allowed)', () => {
        const { onRename } = renderModal();
        expect(saveButton()).toHaveAttribute('aria-disabled', 'false');
        fireEvent.click(saveButton());
        expect(onRename).toHaveBeenCalledWith('Firefly Image Gen');
    });

    it('the current name in a different CASE is still allowed (self-match, not a duplicate)', () => {
        renderModal();
        fireEvent.change(nameField(), { target: { value: 'FIREFLY image gen' } });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
        expect(saveButton()).toHaveAttribute('aria-disabled', 'false');
    });

    it('an empty field disables Save without an error message (incomplete, not invalid)', () => {
        const { onRename } = renderModal();
        fireEvent.change(nameField(), { target: { value: '   ' } });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
        expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(saveButton());
        expect(onRename).not.toHaveBeenCalled();
    });

    it("another row's display name is rejected inline (case-insensitive, trimmed)", () => {
        const { onRename } = renderModal();
        fireEvent.change(nameField(), { target: { value: '  order SYNC  ' } });
        expect(screen.getByTestId('spectrum-textfield-error')).toBeInTheDocument();
        expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(saveButton());
        expect(onRename).not.toHaveBeenCalled();
    });

    it("the mesh row's fixed display name is rejected like any other taken name", () => {
        renderModal();
        fireEvent.change(nameField(), { target: { value: 'Commerce API Mesh' } });
        expect(screen.getByTestId('spectrum-textfield-error')).toBeInTheDocument();
        expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    });

    it('a valid new name saves TRIMMED via onRename', () => {
        const { onRename } = renderModal();
        fireEvent.change(nameField(), { target: { value: '  Firefly Video Gen  ' } });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
        fireEvent.click(saveButton());
        expect(onRename).toHaveBeenCalledWith('Firefly Video Gen');
    });

    it('recovering from a duplicate re-enables Save', () => {
        const { onRename } = renderModal();
        fireEvent.change(nameField(), { target: { value: 'Order Sync' } });
        expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
        fireEvent.change(nameField(), { target: { value: 'Order Sync v2' } });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
        fireEvent.click(saveButton());
        expect(onRename).toHaveBeenCalledWith('Order Sync v2');
    });
});
