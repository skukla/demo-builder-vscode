/**
 * KindStage Tests (Add Integration flow — kind picker stage)
 *
 * Presentational stage: three choice tiles (API Mesh · Integration Catalog · Custom
 * Integration). Mesh renders ONLY when offered (hidden — never a disabled tile — when the
 * stack lacks mesh or it is already added). The catalog tile is disabled with a
 * "None available yet" note when the catalog is empty. The selected tile reflects `kind`.
 *
 * @jest-environment jsdom
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
            meshOffered={props.meshOffered ?? true}
            catalogCount={props.catalogCount ?? 3}
            kind={props.kind}
            onPickKind={onPickKind}
        />
    );
    return { onPickKind };
}

describe('KindStage', () => {
    it('renders the Integration Catalog and Custom Integration tiles', () => {
        renderStage();
        expect(screen.getByRole('button', { name: /Integration Catalog/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Custom Integration/ })).toBeInTheDocument();
    });

    it('renders the API Mesh tile when mesh is offered', () => {
        renderStage({ meshOffered: true });
        expect(screen.getByRole('button', { name: /API Mesh/ })).toBeInTheDocument();
    });

    it('hides the API Mesh tile entirely when mesh is not offered', () => {
        renderStage({ meshOffered: false });
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
    });

    it('hides (not disables) the mesh tile when not offered', () => {
        renderStage({ meshOffered: false });
        expect(screen.queryByRole('button', { name: /API Mesh/ })).not.toBeInTheDocument();
    });

    it('disables the catalog tile with a "None available yet" note when the catalog is empty', () => {
        renderStage({ catalogCount: 0 });
        expect(screen.getByRole('button', { name: /Integration Catalog/ })).toBeDisabled();
        expect(screen.getByText('None available yet')).toBeInTheDocument();
    });

    it('enables the catalog tile (no note) when the catalog has entries', () => {
        renderStage({ catalogCount: 2 });
        expect(screen.getByRole('button', { name: /Integration Catalog/ })).toBeEnabled();
        expect(screen.queryByText('None available yet')).not.toBeInTheDocument();
    });

    it('clicking API Mesh calls onPickKind("mesh")', () => {
        const { onPickKind } = renderStage();
        fireEvent.click(screen.getByRole('button', { name: /API Mesh/ }));
        expect(onPickKind).toHaveBeenCalledWith('mesh');
    });

    it('clicking Integration Catalog calls onPickKind("catalog")', () => {
        const { onPickKind } = renderStage();
        fireEvent.click(screen.getByRole('button', { name: /Integration Catalog/ }));
        expect(onPickKind).toHaveBeenCalledWith('catalog');
    });

    it('clicking Custom Integration calls onPickKind("custom")', () => {
        const { onPickKind } = renderStage();
        fireEvent.click(screen.getByRole('button', { name: /Custom Integration/ }));
        expect(onPickKind).toHaveBeenCalledWith('custom');
    });

    it('a disabled catalog tile does not fire onPickKind', () => {
        const { onPickKind } = renderStage({ catalogCount: 0 });
        fireEvent.click(screen.getByRole('button', { name: /Integration Catalog/ }));
        expect(onPickKind).not.toHaveBeenCalled();
    });

    it('marks the tile matching `kind` as selected and the others as not', () => {
        renderStage({ kind: 'custom' });
        expect(screen.getByRole('button', { name: /Custom Integration/ })).toHaveAttribute(
            'data-selected',
            'true'
        );
        expect(screen.getByRole('button', { name: /API Mesh/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
        expect(screen.getByRole('button', { name: /Integration Catalog/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
    });

    it('marks no tile selected when `kind` is undefined', () => {
        renderStage({ kind: undefined });
        expect(screen.getByRole('button', { name: /API Mesh/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
        expect(screen.getByRole('button', { name: /Integration Catalog/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
        expect(screen.getByRole('button', { name: /Custom Integration/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
    });
});
