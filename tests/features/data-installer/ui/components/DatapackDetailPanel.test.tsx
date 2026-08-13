/**
 * DatapackDetailPanel tests — the catalog's detail flyout.
 *
 * `core/ui/Drawer`'s second consumer, which is the trigger its docstring named
 * when it was promoted out of the integrations feature. Structure mirrors
 * `IntegrationDetailPanel`: an always-mounted Drawer whose `isOpen` is "is
 * something selected", with head/body built from the shared `db-drawer-*` and
 * `integration-panel-row*` classes (both live in custom-spectrum.css, so they
 * reach this bundle — a feature-scoped class would not).
 *
 * The inventory is the payload that earns the flyout. `get-datapack-detail`
 * returns which of the pack's declared data types the service actually HOLDS,
 * and a pack can declare a type it has no item for — the card cannot show that
 * and the count alone would be a lie.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DatapackDetailPanel } from '@/features/data-installer/ui/components/DatapackDetailPanel';
import type { DatapackDetail, DataItemInventory } from '@/features/data-installer/types';

function makeDetail(overrides: Partial<DatapackDetail> = {}): DatapackDetail {
    return {
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        description: 'B2B office supplies',
        owner: 'CoreTech',
        shared: true,
        dataTypes: ['categories', 'products', 'giftcards'],
        art: {},
        updatedAt: '2026-08-06T18:12:13.115Z',
        ...overrides,
    };
}

const INVENTORY: DataItemInventory = {
    present: ['categories', 'products'],
    missing: ['giftcards'],
    presentCount: 2,
    missingCount: 1,
    requestedCount: 3,
};

function renderPanel(
    over: Partial<React.ComponentProps<typeof DatapackDetailPanel>> = {},
) {
    const onClose = jest.fn();
    const view = render(
        <DatapackDetailPanel
            selected={{ name: 'bodea', version: 'main' }}
            detail={makeDetail()}
            inventory={INVENTORY}
            loading={false}
            failure={null}
            onClose={onClose}
            onRetry={jest.fn()}
            onImport={jest.fn()}
            {...over}
        />,
    );
    return { ...view, onClose };
}

describe('DatapackDetailPanel', () => {
    it('is closed — but mounted — when nothing is selected', () => {
        renderPanel({ selected: undefined, detail: null, inventory: null });

        // Always mounted so the panel can SLIDE; `.open` drives the transform.
        const dialog = screen.getByRole('dialog', { hidden: true });
        expect(dialog).toBeInTheDocument();
        expect(dialog).not.toHaveClass('open');
    });

    it('opens when a datapack is selected', () => {
        renderPanel();

        expect(screen.getByRole('dialog')).toHaveClass('open');
    });

    it('names the selected pack in the accessible label', () => {
        renderPanel();

        expect(screen.getByRole('dialog')).toHaveAttribute(
            'aria-label',
            expect.stringContaining('Bodea'),
        );
    });

    it('closes from the close button', () => {
        const { onClose } = renderPanel();

        fireEvent.click(screen.getByRole('button', { name: /close/i }));

        expect(onClose).toHaveBeenCalled();
    });

    describe('body', () => {
        it('shows the identity the service keys on', () => {
            renderPanel();

            expect(screen.getByText('Bodea')).toBeInTheDocument();
            expect(screen.getByText('main')).toBeInTheDocument();
        });

        it('shows the description and owner', () => {
            renderPanel();

            expect(screen.getByText('B2B office supplies')).toBeInTheDocument();
            expect(screen.getByText('CoreTech')).toBeInTheDocument();
        });

        it('lists the data types the service actually holds', () => {
            renderPanel();

            expect(screen.getByText('categories')).toBeInTheDocument();
            expect(screen.getByText('products')).toBeInTheDocument();
        });

        // A pack can DECLARE a type it holds no item for. That gap is the whole
        // reason the handler pairs the detail with a batch inventory lookup.
        it('calls out declared types the service has no item for', () => {
            renderPanel();

            expect(screen.getByTestId('datapack-detail-missing')).toHaveTextContent('giftcards');
        });

        it('renders no missing section when the pack holds everything it declares', () => {
            renderPanel({
                inventory: {
                    present: ['categories', 'products', 'giftcards'],
                    missing: [],
                    presentCount: 3,
                    missingCount: 0,
                    requestedCount: 3,
                },
            });

            expect(screen.queryByTestId('datapack-detail-missing')).not.toBeInTheDocument();
        });

        it('omits the description row when the pack carries none', () => {
            renderPanel({ detail: makeDetail({ description: undefined }) });

            expect(screen.queryByText('Description')).not.toBeInTheDocument();
        });
    });

    /**
     * The panel RAISES import; it does not own the modal.
     *
     * It used to render `ImportDatapackModal` as a child of the Drawer — a dialog
     * nested inside a drawer, which no other surface here does. The view mounts it
     * now, the way `IntegrationsScreen` mounts its flow modal beside the list, so
     * this panel is view-only like `IntegrationDetailPanel`.
     */
    describe('importing', () => {
        it('offers an Import affordance for a pack the service actually stores', () => {
            renderPanel();

            expect(screen.getByRole('button', { name: /import/i })).toBeInTheDocument();
        });

        // The types you can import are the ones the service HOLDS, not the ones
        // the pack declares — a pack can declare a type it stores no item for.
        it('withholds Import when the service stores nothing', () => {
            renderPanel({
                inventory: {
                    present: [],
                    missing: ['categories'],
                    presentCount: 0,
                    missingCount: 1,
                    requestedCount: 1,
                },
            });

            expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
        });

        it('raises import with the pack it is showing', () => {
            const onImport = jest.fn();
            renderPanel({ onImport });

            fireEvent.click(screen.getByRole('button', { name: /import/i }));

            expect(onImport).toHaveBeenCalledWith({ name: 'bodea', version: 'main' });
        });

        it('renders no modal of its own', () => {
            renderPanel();

            fireEvent.click(screen.getByRole('button', { name: /import/i }));

            expect(screen.queryByText('Commerce instance')).not.toBeInTheDocument();
        });
    });

    describe('states', () => {
        it('shows a loading message while the detail is in flight', () => {
            renderPanel({ detail: null, inventory: null, loading: true });

            expect(screen.getByText(/loading/i)).toBeInTheDocument();
        });

        it('shows the failure treatment with a retry', () => {
            renderPanel({
                detail: null,
                inventory: null,
                failure: { message: 'Could not load the datapack.' },
            });

            expect(screen.getByText('Could not load the datapack.')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        });

        it('offers sign-in rather than retry for an auth refusal', () => {
            renderPanel({
                detail: null,
                inventory: null,
                failure: { message: 'Adobe sign-in is required.', code: 'AUTH_REQUIRED' },
            });

            expect(screen.getByRole('button', { name: /sign in with adobe/i })).toBeInTheDocument();
        });
    });
});
