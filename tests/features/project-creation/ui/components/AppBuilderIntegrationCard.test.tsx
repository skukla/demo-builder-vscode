/**
 * AppBuilderIntegrationCard Tests
 *
 * A simpler sibling of MeshIntegrationCard: renders an ADDED App Builder integration as
 * its own compact card on the Integrations "Services" screen. It REFERENCES the ONE shared
 * Adobe I/O workspace (established by AdobeIoStep in the "Adobe I/O" sub-step) —
 * the card itself never signs in or picks a workspace. The source reads in the card
 * description (not repeated as a row); "Deploys to" shows only once the shared destination
 * is configured; Remove is always exposed, Change only for catalog integrations.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { AppBuilderIntegrationCard } from '@/features/project-creation/ui/components/AppBuilderIntegrationCard';
import type { SelectedIntegration } from '@/features/project-creation/ui/components/appBuilderIntegrationList';
import type { WizardState } from '@/types/webview';

const SIGNED_IN: Partial<WizardState> = {
    adobeAuth: { isAuthenticated: true, isChecking: false },
    adobeOrg: { id: 'org-1', name: 'Acme', code: 'ACME' } as WizardState['adobeOrg'],
};

const INTEGRATION: SelectedIntegration = {
    id: 'acme-widget',
    name: 'widget',
    owner: 'acme',
    repo: 'widget',
};

function renderCard(overrides: {
    state?: Partial<WizardState>;
    onRemove?: jest.Mock;
    onChange?: jest.Mock;
    integration?: SelectedIntegration;
} = {}) {
    const onRemove = overrides.onRemove ?? jest.fn();
    const onChange = overrides.onChange ?? jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <AppBuilderIntegrationCard
                integration={overrides.integration ?? INTEGRATION}
                state={(overrides.state ?? {}) as WizardState}
                onRemove={onRemove}
                onChange={onChange}
            />
        </Provider>,
    );
    return { onRemove, onChange };
}

describe('AppBuilderIntegrationCard', () => {
    it('renders the integration name + owner/repo description', () => {
        renderCard({ state: {} });

        expect(screen.getByText('widget')).toBeInTheDocument();
        expect(screen.getByText('App Builder app · acme/widget')).toBeInTheDocument();
    });

    it('signed out: renders NO sign-in/pickers and no body until configured', () => {
        renderCard({ state: {} });

        expect(screen.queryByTestId('adobe-auth-step')).not.toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        // The source reads in the card DESCRIPTION; it is not repeated as a "Source" row.
        expect(screen.queryByText('Source')).not.toBeInTheDocument();
        expect(screen.queryByText('Deploys to')).not.toBeInTheDocument();
    });

    it('signed in but destination unset: still no pickers, no "Deploys to"', () => {
        renderCard({ state: { ...SIGNED_IN } });

        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        expect(screen.queryByText('Source')).not.toBeInTheDocument();
        expect(screen.queryByText('Deploys to')).not.toBeInTheDocument();
    });

    it('project set but no workspace: still no pickers, still no "Deploys to"', () => {
        renderCard({
            state: { ...SIGNED_IN, adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' } },
        });

        expect(screen.queryByTestId('workspace-field')).not.toBeInTheDocument();
        expect(screen.queryByTestId('project-field')).not.toBeInTheDocument();
        expect(screen.queryByText('Deploys to')).not.toBeInTheDocument();
    });

    it('configured: shows the read-only Deploys to row (no redundant Source row)', () => {
        renderCard({
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
            },
        });

        expect(screen.getByText('Deploys to')).toBeInTheDocument();
        expect(screen.getByText('Demo Project · Stage')).toBeInTheDocument();
        expect(screen.queryByText('Source')).not.toBeInTheDocument();
    });

    it('catalog integration: Change fires onChange(id) — swap out of the destination flow', () => {
        const { onChange } = renderCard({ state: { ...SIGNED_IN } });

        fireEvent.click(screen.getByRole('button', { name: 'Change' }));

        expect(onChange).toHaveBeenCalledWith('acme-widget');
    });

    it('custom integration: shows Remove only, no Change (a custom is defined by its URL)', () => {
        renderCard({
            state: {
                ...SIGNED_IN,
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            },
        });

        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    });

    it('configured: is collapsible (a collapse chevron appears)', () => {
        renderCard({
            state: {
                ...SIGNED_IN,
                adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' },
                adobeWorkspace: { id: 'w1', name: 'Stage', title: 'Stage' },
            },
        });

        const collapse = screen.getByRole('button', { name: /collapse widget/i });
        expect(collapse).toBeInTheDocument();
        fireEvent.click(collapse);
        // Collapsed → the summary replaces the rows.
        expect(screen.getByText('acme/widget · Stage')).toBeInTheDocument();
    });

    it('not collapsible until configured (no chevron before a workspace is chosen)', () => {
        renderCard({
            state: { ...SIGNED_IN, adobeProject: { id: 'p1', name: 'proj', title: 'Demo Project' } },
        });
        expect(
            screen.queryByRole('button', { name: /collapse widget/i }),
        ).not.toBeInTheDocument();
    });

    it('Remove fires onRemove(id)', () => {
        const { onRemove } = renderCard({ state: { ...SIGNED_IN } });

        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(onRemove).toHaveBeenCalledWith('acme-widget');
    });
});
