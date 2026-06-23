/**
 * CommerceSummary tests (v6 Commerce slice — Step 3)
 *
 * The right-hand persistent summary column, mirroring the prototype
 * renderSummary() but scoped to the Commerce group. Renders a derived
 * Architecture line (full label / "Frontend pending" / pending placeholder) and
 * a Commerce group of rows, each showing its value or a muted "Not set", with a
 * ✓ when done. Presentational only — Batch B computes label + rows from state.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    CommerceSummary,
    type SummaryRow,
} from '@/features/project-creation/ui/components/CommerceSummary';

const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

const ROWS: SummaryRow[] = [
    { label: 'Backend', value: 'PaaS', done: true },
    { label: 'Connection', done: false },
    { label: 'Business' },
    { label: 'Catalog' },
];

describe('CommerceSummary', () => {
    describe('architecture line', () => {
        it('renders the architecture label when provided', () => {
            renderWithProvider(
                <CommerceSummary architectureLabel="Edge Delivery + ACCS" rows={ROWS} />,
            );
            expect(screen.getByText('Edge Delivery + ACCS')).toBeInTheDocument();
        });

        it('renders "Frontend pending" when that is the label', () => {
            renderWithProvider(<CommerceSummary architectureLabel="Frontend pending" rows={ROWS} />);
            expect(screen.getByText('Frontend pending')).toBeInTheDocument();
        });

        it('renders a pending placeholder when the label is null', () => {
            renderWithProvider(<CommerceSummary architectureLabel={null} rows={ROWS} />);
            expect(screen.getByText('Architecture pending')).toBeInTheDocument();
        });

        it('renders the "Your project" title', () => {
            renderWithProvider(<CommerceSummary architectureLabel={null} rows={ROWS} />);
            expect(screen.getByText('Your project')).toBeInTheDocument();
        });
    });

    describe('rows', () => {
        it('shows the value for a row that has one', () => {
            renderWithProvider(<CommerceSummary architectureLabel={null} rows={ROWS} />);
            expect(screen.getByText('PaaS')).toBeInTheDocument();
        });

        it('shows a "Not set" placeholder for rows without a value', () => {
            renderWithProvider(<CommerceSummary architectureLabel={null} rows={ROWS} />);
            // Connection, Business, and Catalog have no value
            expect(screen.getAllByText('Not set')).toHaveLength(3);
        });

        it('marks a done row (with value) via the done modifier', () => {
            renderWithProvider(<CommerceSummary architectureLabel={null} rows={ROWS} />);
            const backendRow = screen.getByText('Backend').closest('.sum-row');
            expect(backendRow).toHaveClass('done');
        });

        it('does not mark an unset row as done', () => {
            renderWithProvider(<CommerceSummary architectureLabel={null} rows={ROWS} />);
            const connectionRow = screen.getByText('Connection').closest('.sum-row');
            expect(connectionRow).not.toHaveClass('done');
        });

        it('renders the Commerce group heading and every row label', () => {
            renderWithProvider(<CommerceSummary architectureLabel={null} rows={ROWS} />);
            expect(screen.getByText('Commerce')).toBeInTheDocument();
            expect(screen.getByText('Backend')).toBeInTheDocument();
            expect(screen.getByText('Connection')).toBeInTheDocument();
            expect(screen.getByText('Business')).toBeInTheDocument();
            expect(screen.getByText('Catalog')).toBeInTheDocument();
        });

        it('renders a Sign-in row only when one is present in rows', () => {
            const withSignin: SummaryRow[] = [
                { label: 'Backend', value: 'ACCS', done: true },
                { label: 'Sign-in', value: 'Required', done: false },
                ...ROWS.slice(1),
            ];
            const { rerender } = renderWithProvider(
                <CommerceSummary architectureLabel={null} rows={ROWS} />,
            );
            expect(screen.queryByText('Sign-in')).not.toBeInTheDocument();

            rerender(
                <Provider theme={defaultTheme}>
                    <CommerceSummary architectureLabel={null} rows={withSignin} />
                </Provider>,
            );
            expect(screen.getByText('Sign-in')).toBeInTheDocument();
        });
    });
});
