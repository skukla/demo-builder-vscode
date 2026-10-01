/**
 * SetupChecklistSection — the flyout's demo setup line (AB-26x): the summary and the way
 * into the guide. The steps themselves live in SetupGuideModal (its own suite), since the
 * full list in the flyout read badly (owner, 2026-09-27).
 */

import '../../../../../helpers/integrationCardSpectrumMocks';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import { SetupChecklistSection } from '@/features/dashboard/ui/components/integrations/SetupChecklistSection';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const step = (overrides: Partial<SetupChecklistItem>): SetupChecklistItem => ({
    id: 'confirmed-status',
    title: 'Create the "Confirmed in ERP" order status',
    why: 'why',
    where: 'Stores > Settings > Order Status',
    state: 'open',
    checkable: false,
    ...overrides,
});

const model = (items?: SetupChecklistItem[]) => ({ id: 'erp-integration', setupChecklist: items }) as IntegrationCardModel;

describe('SetupChecklistSection', () => {
    it('renders nothing for an integration with no steps', () => {
        const { container } = render(<SetupChecklistSection model={model()} onOpenGuide={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the summary and the next step by name, not the steps', () => {
        render(<SetupChecklistSection model={model([step({}), step({ id: 'b', title: 'B', state: 'done' })])} onOpenGuide={jest.fn()} />);
        expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
        expect(screen.getByText('Create the "Confirmed in ERP" order status')).toBeInTheDocument();
        expect(screen.queryByText('Stores > Settings > Order Status')).not.toBeInTheDocument();
        expect(screen.queryByText('Mark as done')).not.toBeInTheDocument();
    });

    it('opens the setup guide', () => {
        const onOpenGuide = jest.fn();
        render(<SetupChecklistSection model={model([step({})])} onOpenGuide={onOpenGuide} />);
        fireEvent.click(screen.getByRole('link', { name: 'Open setup guide' }));
        expect(onOpenGuide).toHaveBeenCalledTimes(1);
    });

    it('offers a review instead once nothing is left to do', () => {
        render(<SetupChecklistSection model={model([step({ state: 'done' }), step({ id: 'b', state: 'dismissed' })])} onOpenGuide={jest.fn()} />);
        expect(screen.getByText('All done')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Review setup' })).toBeInTheDocument();
    });
});
