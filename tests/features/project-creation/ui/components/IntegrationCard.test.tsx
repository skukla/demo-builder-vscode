/**
 * IntegrationCard Tests
 *
 * IntegrationCard is a selection-aware, expandable card for one deployable in the
 * Integrations "Services" screen. Selection uses the Commerce choice-card language
 * (blue border/tint + a ✓ badge) rather than an On/Off pill; when selected the card
 * expands to host its config (passed as children). An N/A card shows a muted label and
 * no action. Presentational — the parent owns selection state + handlers.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { IntegrationCard } from '@/features/project-creation/ui/components/IntegrationCard';

const renderWithProvider = (ui: React.ReactElement) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );

describe('IntegrationCard', () => {
    it('renders the name and description', () => {
        renderWithProvider(
            <IntegrationCard name="API Mesh" description="GraphQL bridge" selected={false} />
        );

        expect(screen.getByText('API Mesh')).toBeInTheDocument();
        expect(screen.getByText('GraphQL bridge')).toBeInTheDocument();
    });

    it('when unselected: no check, no expanded children, shows the Add action', () => {
        const { container } = renderWithProvider(
            <IntegrationCard
                name="API Mesh"
                description="GraphQL bridge"
                selected={false}
                action={{ label: 'Add', onPress: jest.fn() }}
            >
                <div data-testid="config">config body</div>
            </IntegrationCard>
        );

        expect(container.querySelector('.selection-check')).not.toBeInTheDocument();
        expect(screen.queryByTestId('config')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        // Card is not marked selected.
        expect(container.querySelector('[data-selected="true"]')).not.toBeInTheDocument();
    });

    it('when selected: shows the ✓ badge, expands children, shows the Remove action', () => {
        const { container } = renderWithProvider(
            <IntegrationCard
                name="API Mesh"
                description="GraphQL bridge"
                selected
                action={{ label: 'Remove', onPress: jest.fn() }}
            >
                <div data-testid="config">config body</div>
            </IntegrationCard>
        );

        expect(container.querySelector('.selection-check')).toBeInTheDocument();
        expect(screen.getByTestId('config')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(container.querySelector('[data-selected="true"]')).toBeInTheDocument();
    });

    it('N/A card: shows the naLabel, no action, no check, no children', () => {
        const { container } = renderWithProvider(
            <IntegrationCard
                name="API Mesh"
                description="GraphQL bridge"
                selected={false}
                naLabel="N/A for this architecture"
            >
                <div data-testid="config">config body</div>
            </IntegrationCard>
        );

        expect(screen.getByText('N/A for this architecture')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(container.querySelector('.selection-check')).not.toBeInTheDocument();
        expect(screen.queryByTestId('config')).not.toBeInTheDocument();
    });

    it('fires the action onPress when clicked', () => {
        const onPress = jest.fn();
        renderWithProvider(
            <IntegrationCard
                name="API Mesh"
                description="GraphQL bridge"
                selected={false}
                action={{ label: 'Add', onPress }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(onPress).toHaveBeenCalledTimes(1);
    });
});
