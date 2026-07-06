/**
 * AddIntegrationModal Tests (Integration Catalog — modal flow)
 *
 * The modal is now the CATALOG picker only — a growing library warrants its own surface.
 * Custom (GitHub-URL) integrations add inline via their own row, not here. The modal opens
 * straight to the toggle-select tiles (no choose step, no Back): clicking a tile calls
 * onToggleCatalog and the modal STAYS open; the "Done" footer closes it (= added).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { AddIntegrationModal } from '@/features/project-creation/ui/components/AddIntegrationModal';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

function entry(id: string, name: string): AppBuilderComponentCatalogEntry {
    return {
        id,
        name,
        description: `${name} description`,
        kind: 'integration',
        source: { owner: 'o', repo: id, branch: 'main' },
    };
}

interface Handlers {
    onClose: jest.Mock;
    onToggleCatalog: jest.Mock;
}

function renderModal(
    props: Partial<React.ComponentProps<typeof AddIntegrationModal>> = {},
): Handlers {
    const onClose = jest.fn();
    const onToggleCatalog = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <AddIntegrationModal
                isOpen={props.isOpen ?? true}
                onClose={onClose}
                catalog={props.catalog ?? []}
                selectedIds={props.selectedIds ?? []}
                onToggleCatalog={onToggleCatalog}
            />
        </Provider>,
    );
    return { onClose, onToggleCatalog };
}

describe('AddIntegrationModal', () => {
    it('renders nothing when closed', () => {
        renderModal({ isOpen: false, catalog: [entry('acme-a', 'Widget A')] });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Widget A/ })).not.toBeInTheDocument();
    });

    it('opens straight to the catalog gallery — a tile per entry', () => {
        renderModal({ catalog: [entry('acme-a', 'Widget A'), entry('acme-b', 'Widget B')] });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Integration Catalog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Widget A/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Widget B/ })).toBeInTheDocument();
        // No leftover choose/custom scaffolding.
        expect(screen.queryByText('Pre-built')).not.toBeInTheDocument();
        expect(screen.queryByText('Custom app')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    });

    it('a selectedIds tile renders selected', () => {
        renderModal({
            catalog: [entry('acme-a', 'Widget A'), entry('acme-b', 'Widget B')],
            selectedIds: ['acme-b'],
        });
        expect(screen.getByRole('button', { name: /Widget A/ })).toBeEnabled();
        expect(screen.getByRole('button', { name: /Widget B/ })).toHaveAttribute(
            'data-selected',
            'true',
        );
    });

    it('clicking a tile calls onToggleCatalog(id, true) and the modal STAYS open', () => {
        const { onToggleCatalog } = renderModal({ catalog: [entry('acme-a', 'Widget A')] });
        fireEvent.click(screen.getByRole('button', { name: /Widget A/ }));
        expect(onToggleCatalog).toHaveBeenCalledWith('acme-a', true);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Widget A/ })).toBeInTheDocument();
    });

    it('clicking a SELECTED tile calls onToggleCatalog(id, false)', () => {
        const { onToggleCatalog } = renderModal({
            catalog: [entry('acme-a', 'Widget A')],
            selectedIds: ['acme-a'],
        });
        fireEvent.click(screen.getByRole('button', { name: /Widget A/ }));
        expect(onToggleCatalog).toHaveBeenCalledWith('acme-a', false);
    });

    it('the single "Done" footer button closes the modal', () => {
        const { onClose } = renderModal({ catalog: [entry('acme-a', 'Widget A')] });
        // One footer button (the Modal close, relabelled "Done") — no separate Close.
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows an empty-state message when the catalog is empty', () => {
        renderModal({ catalog: [] });
        expect(screen.getByText(/No integrations match/)).toBeInTheDocument();
    });
});
