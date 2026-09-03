/**
 * KindStage Tests (Add Integration flow — kind picker stage)
 *
 * Presentational: four flat choice tiles (API Mesh · Pre-built integration ·
 * Build custom · Import a repo). Mesh renders ONLY when offered (hidden —
 * never a disabled tile — when the stack lacks mesh or it's already added). The
 * pre-built catalog tile is disabled with a "None available yet" note when the
 * finished catalog is empty. The selected tile reflects `kind`.
 *
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KindStage } from '@/features/project-creation/ui/components/integration-flow/stages/KindStage';

type Props = React.ComponentProps<typeof KindStage>;

function renderStage(props: Partial<Props> = {}): { onPickKind: jest.Mock } {
    const onPickKind = jest.fn();
    render(
        <KindStage
            meshAvailable={props.meshAvailable ?? true}
            meshAlreadyAdded={props.meshAlreadyAdded ?? false}
            catalogCount={props.catalogCount ?? 3}
            kind={props.kind}
            onPickKind={onPickKind}
        />
    );
    return { onPickKind };
}

describe('KindStage', () => {
    it('renders the four kind tiles when mesh is offered', () => {
        renderStage();
        expect(screen.getByRole('button', { name: /API Mesh/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Pre-built integration/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Build custom/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Import a repo/ })).toBeInTheDocument();
    });

    // Absent and disabled answer DIFFERENT questions, so the two inputs stay
    // separate. No mesh for this stack: nothing to explain, so no tile.
    it('hides the API Mesh tile when the stack has no mesh', () => {
        renderStage({ meshAvailable: false });
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
        // The other three still render.
        expect(screen.getByRole('button', { name: /Build custom/ })).toBeInTheDocument();
    });

    // A project gets exactly one mesh. Vanishing the tile looked identical to a
    // stack that never offered one, so it stays and says why.
    it('disables the API Mesh tile with a reason once the project has one', () => {
        renderStage({ meshAlreadyAdded: true });
        expect(screen.getByRole('button', { name: /API Mesh/ })).toBeDisabled();
        expect(screen.getByText('Already added — one per project')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Build custom/ })).toBeEnabled();
    });

    it('does not fire onPickKind for a disabled mesh tile', () => {
        const { onPickKind } = renderStage({ meshAlreadyAdded: true });
        fireEvent.click(screen.getByRole('button', { name: /API Mesh/ }));
        expect(onPickKind).not.toHaveBeenCalled();
    });

    it('disables the pre-built tile with a "None available yet" note when the catalog is empty', () => {
        renderStage({ catalogCount: 0 });
        expect(screen.getByRole('button', { name: /Pre-built integration/ })).toBeDisabled();
        expect(screen.getByText('None available yet')).toBeInTheDocument();
        // Build custom and Import a repo are never gated on the catalog.
        expect(screen.getByRole('button', { name: /Build custom/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Import a repo/ })).toBeEnabled();
    });

    it('enables the pre-built tile (no note) when the catalog has entries', () => {
        renderStage({ catalogCount: 2 });
        expect(screen.getByRole('button', { name: /Pre-built integration/ })).toBeEnabled();
        expect(screen.queryByText('None available yet')).not.toBeInTheDocument();
    });

    it('each tile fires onPickKind with its kind', () => {
        const { onPickKind } = renderStage();
        fireEvent.click(screen.getByRole('button', { name: /API Mesh/ }));
        fireEvent.click(screen.getByRole('button', { name: /Pre-built integration/ }));
        fireEvent.click(screen.getByRole('button', { name: /Build custom/ }));
        fireEvent.click(screen.getByRole('button', { name: /Import a repo/ }));
        expect(onPickKind).toHaveBeenNthCalledWith(1, 'mesh');
        expect(onPickKind).toHaveBeenNthCalledWith(2, 'catalog');
        expect(onPickKind).toHaveBeenNthCalledWith(3, 'blank');
        expect(onPickKind).toHaveBeenNthCalledWith(4, 'custom');
    });

    it('a disabled pre-built tile does not fire onPickKind', () => {
        const { onPickKind } = renderStage({ catalogCount: 0 });
        fireEvent.click(screen.getByRole('button', { name: /Pre-built integration/ }));
        expect(onPickKind).not.toHaveBeenCalled();
    });

    it('marks the tile matching `kind` selected and the others not', () => {
        renderStage({ kind: 'blank' });
        expect(screen.getByRole('button', { name: /Build custom/ })).toHaveAttribute(
            'data-selected',
            'true'
        );
        expect(screen.getByRole('button', { name: /Import a repo/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
        expect(screen.getByRole('button', { name: /API Mesh/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
    });

    it('marks no tile selected when `kind` is undefined', () => {
        renderStage({ kind: undefined });
        for (const name of [
            /API Mesh/,
            /Pre-built integration/,
            /Build custom/,
            /Import a repo/,
        ]) {
            expect(screen.getByRole('button', { name })).toHaveAttribute('data-selected', 'false');
        }
    });
});
