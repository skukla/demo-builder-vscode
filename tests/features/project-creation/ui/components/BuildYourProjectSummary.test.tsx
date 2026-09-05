/**
 * BuildYourProjectSummary tests (v6 unified scaffold)
 *
 * The single persistent "Your project" summary column for the whole Build Your
 * Project step: a derived Architecture line + one GROUP per visible area, each
 * with its heading and rows (value or muted "Not set", ✓ when done+value).
 * Presentational only — the providers compute label + groups from state.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    BuildYourProjectSummary,
    type SummaryGroup,
} from '@/features/project-creation/ui/components/BuildYourProjectSummary';

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

const GROUPS: SummaryGroup[] = [
    {
        heading: 'Commerce',
        rows: [
            { label: 'Backend', value: 'Adobe Commerce (PaaS)', done: true },
            { label: 'Connection', done: false },
        ],
    },
    {
        heading: 'Storefront',
        rows: [{ label: 'Frontend', value: 'Edge Delivery Storefront', done: true }],
    },
];

describe('BuildYourProjectSummary', () => {
    it('renders the "Your project" title', () => {
        renderWithProvider(<BuildYourProjectSummary architectureLabel="Edge Delivery + ACCS" groups={GROUPS} />);
        expect(screen.getByText('Your project')).toBeInTheDocument();
    });

    it('renders the architecture label when provided', () => {
        renderWithProvider(<BuildYourProjectSummary architectureLabel="Edge Delivery + ACCS" groups={[]} />);
        expect(screen.getByText('Edge Delivery + ACCS')).toBeInTheDocument();
    });

    it('renders the pending placeholder when the architecture label is null', () => {
        renderWithProvider(<BuildYourProjectSummary architectureLabel={null} groups={[]} />);
        expect(screen.getByText('Architecture pending')).toBeInTheDocument();
    });

    it('renders each group heading in order', () => {
        renderWithProvider(<BuildYourProjectSummary architectureLabel={null} groups={GROUPS} />);
        expect(screen.getByText('Commerce')).toBeInTheDocument();
        expect(screen.getByText('Storefront')).toBeInTheDocument();
    });

    it('renders a row value when set and "Not set" when absent', () => {
        renderWithProvider(<BuildYourProjectSummary architectureLabel={null} groups={GROUPS} />);
        expect(screen.getByText('Adobe Commerce (PaaS)')).toBeInTheDocument();
        // The Connection row has no value → muted "Not set".
        expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(1);
    });

    it('marks a row done (✓ + done class) only when it has both a value and done=true', () => {
        const { container } = renderWithProvider(
            <BuildYourProjectSummary architectureLabel={null} groups={GROUPS} />,
        );
        // Two done+value rows (Backend, Frontend) get the `.done` modifier; the
        // value-less Connection row does not.
        expect(container.querySelectorAll('.sum-row.done')).toHaveLength(2);
    });

    // The ✓ is the only signal that a row is FINISHED rather than merely filled in,
    // and it renders inside the row label — so it has to be counted where it sits,
    // not just totalled. A ✓ on an unfinished row tells the SC the step is done.
    it('renders the ✓ on the done rows and on no others', () => {
        const { container } = renderWithProvider(
            <BuildYourProjectSummary architectureLabel={null} groups={GROUPS} />,
        );

        expect(container.querySelectorAll('.sum-check')).toHaveLength(2);
        expect(container.querySelectorAll('.sum-row.done .sum-check')).toHaveLength(2);
        expect(container.querySelectorAll('.sum-row:not(.done) .sum-check')).toHaveLength(0);
    });

    // done is a CLAIM the provider makes; the value is the evidence. A row needs
    // both, so neither half alone marks the row complete.
    it('does not mark a row done when it has a value but done is false', () => {
        const groups: SummaryGroup[] = [
            { heading: 'Commerce', rows: [{ label: 'Catalog', value: 'Citisignal', done: false }] },
        ];

        const { container } = renderWithProvider(
            <BuildYourProjectSummary architectureLabel={null} groups={groups} />,
        );

        expect(container.querySelectorAll('.sum-row.done')).toHaveLength(0);
        expect(container.querySelectorAll('.sum-check')).toHaveLength(0);
    });

    it('does not mark a row done when it is flagged done but has no value', () => {
        const groups: SummaryGroup[] = [
            { heading: 'Commerce', rows: [{ label: 'Catalog', done: true }] },
        ];

        const { container } = renderWithProvider(
            <BuildYourProjectSummary architectureLabel={null} groups={groups} />,
        );

        expect(container.querySelectorAll('.sum-row.done')).toHaveLength(0);
        expect(container.querySelectorAll('.sum-check')).toHaveLength(0);
        expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('renders nothing for groups when none are provided (architecture line only)', () => {
        renderWithProvider(<BuildYourProjectSummary architectureLabel="X" groups={[]} />);
        expect(screen.queryByText('Commerce')).not.toBeInTheDocument();
    });
});
