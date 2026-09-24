/**
 * IntegrationRow — the List view's twin of IntegrationCard (owner, 2026-09-24).
 * Pins the same contract the card has: a keyboard-reachable control named by
 * name and status, the kind beside the name, and open on click/Enter/Space.
 */

import '../../../../helpers/integrationCardSpectrumMocks';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntegrationRow } from '@/core/ui/components/integrations/IntegrationRow';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/components/ui/StatusDot', () => ({
    StatusDot: ({ variant, className }: any) => (
        <span data-testid="status-dot" data-variant={variant} className={className} />
    ),
}));

function makeModel(overrides: Partial<IntegrationCardModel> = {}): IntegrationCardModel {
    return {
        id: 'erp-sync',
        isMesh: false,
        name: 'ERP Sync',
        kindLabel: 'Pre-built',
        sourceLine: 'acme/erp-sync',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://example.com/app',
        urlLabel: 'App URL',
        menuActions: ['open', 'manage-apis', 'remove'],
        canRename: false,
        ...overrides,
    };
}

function renderRow(model: IntegrationCardModel, withOpen = true) {
    const onOpen = jest.fn();
    const onAction = jest.fn();
    const onRename = jest.fn();
    render(
        <IntegrationRow
            model={model}
            onOpen={withOpen ? onOpen : undefined}
            onAction={onAction}
            onRename={onRename}
        />,
    );
    return { onOpen, onAction, onRename };
}

describe('IntegrationRow', () => {
    it('renders the name, the kind and the status on one row', () => {
        renderRow(makeModel());

        const row = screen.getByRole('button', { name: 'ERP Sync, Deployed' });
        expect(row).toHaveClass('integration-row');
        expect(row).toHaveTextContent('ERP Sync');
        expect(row).toHaveTextContent('Pre-built');
        expect(row).toHaveTextContent('Deployed');
        expect(screen.getByTestId('status-dot')).toHaveAttribute('data-variant', 'success');
    });

    it('names itself by name alone when there is no status', () => {
        renderRow(makeModel({ statusLabel: '' }));

        expect(screen.getByRole('button', { name: 'ERP Sync' })).toBeInTheDocument();
    });

    it('opens on click, Enter and Space', () => {
        const { onOpen } = renderRow(makeModel());
        const row = screen.getByRole('button', { name: 'ERP Sync, Deployed' });

        fireEvent.click(row);
        fireEvent.keyDown(row, { key: 'Enter' });
        fireEvent.keyDown(row, { key: ' ' });

        expect(onOpen).toHaveBeenCalledTimes(3);
        expect(onOpen).toHaveBeenCalledWith('erp-sync');
    });

    it('is not a control when nothing can be opened', () => {
        renderRow(makeModel(), false);

        expect(screen.queryByRole('button', { name: 'ERP Sync, Deployed' })).toBeNull();
        expect(screen.getByText('ERP Sync')).toBeInTheDocument();
    });
});
