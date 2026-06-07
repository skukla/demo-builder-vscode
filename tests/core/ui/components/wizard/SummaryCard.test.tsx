/**
 * SummaryCard + LabelValue — the shared read-only "review before a terminal
 * action" presentation, extracted from ReviewStep and reused by the Join screen.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { SummaryCard, LabelValue } from '@/core/ui/components/wizard';

describe('SummaryCard + LabelValue', () => {
    it('renders the card title and label/value rows', () => {
        render(
            <SummaryCard title="You're joining">
                <LabelValue label="Brand" value="citisignal" />
                <LabelValue label="Shared by" value="commerce-sc/citisignal" />
            </SummaryCard>,
        );

        expect(screen.getByText("You're joining")).toBeInTheDocument();
        expect(screen.getByText('Brand')).toBeInTheDocument();
        expect(screen.getByText('citisignal')).toBeInTheDocument();
        expect(screen.getByText('Shared by')).toBeInTheDocument();
        expect(screen.getByText('commerce-sc/citisignal')).toBeInTheDocument();
    });

    it('renders sub-items as a secondary line joined with a separator', () => {
        render(<LabelValue label="GitHub Repository" value="me/site" subItems={['New repository']} />);
        expect(screen.getByText('New repository')).toBeInTheDocument();
    });
});
