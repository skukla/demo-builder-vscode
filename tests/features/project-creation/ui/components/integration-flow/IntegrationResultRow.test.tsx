/**
 * IntegrationResultRow tests (Integrations flow redesign — Step 8)
 *
 * The presentational collapsed result row: name line, quiet sourceLine, the
 * destination line ("Deploys to {label}" + Change when committed vs
 * "Deploys to — Not set" + Set up when the row needs setup), the quiet Remove
 * button, and the uniform "APIs in use" list (rendered for every kind; the
 * Change action appears only on editable custom/import rows).
 *
 * @jest-environment jsdom
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { IntegrationResultRow } from '@/features/project-creation/ui/components/integration-flow/IntegrationResultRow';
import type { IntegrationRow } from '@/features/project-creation/ui/components/integration-flow/integrationRows';
import { BASELINE_CODE } from '@/features/project-creation/ui/components/integration-flow/apiAccessConstants';

const MESH_ROW: IntegrationRow = {
    id: 'commerce-eds-mesh',
    kind: 'mesh',
    name: 'Commerce API Mesh',
    sourceLine: 'GraphQL bridge · deploys to Adobe I/O',
    needsSetup: false,
    apis: [BASELINE_CODE, 'GraphQLServiceSDK'],
};

const CATALOG_ROW: IntegrationRow = {
    id: 'erp-sync',
    kind: 'catalog',
    name: 'ERP Sync',
    sourceLine: 'Syncs orders into an ERP backend',
    needsSetup: true,
    apis: [BASELINE_CODE, 'CampaignSDK'],
};

const CUSTOM_ROW: IntegrationRow = {
    id: 'acme-widget',
    kind: 'custom',
    name: 'widget',
    sourceLine: 'App Builder app · acme/widget',
    needsSetup: false,
    apis: [BASELINE_CODE, 'FireflyServicesSDK'],
};

interface RenderOverrides {
    row?: IntegrationRow;
    destinationLabel?: string;
    onSetUpDestination?: () => void;
    onChangeDestination?: () => void;
    onRemove?: () => void;
    onChangeApis?: () => void;
}

function renderRow(overrides: RenderOverrides = {}) {
    const props = {
        row: CATALOG_ROW,
        onSetUpDestination: jest.fn(),
        onChangeDestination: jest.fn(),
        onRemove: jest.fn(),
        ...overrides,
    };
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <IntegrationResultRow {...props} />
        </Provider>
    );
    return props;
}

describe('IntegrationResultRow — anatomy', () => {
    it('renders the integration name', () => {
        renderRow();
        expect(screen.getByText('ERP Sync')).toBeInTheDocument();
    });

    it('renders the quiet source line', () => {
        renderRow();
        expect(screen.getByText('Syncs orders into an ERP backend')).toBeInTheDocument();
    });
});

describe('IntegrationResultRow — destination affordance', () => {
    it('committed: shows "Deploys to {label}" with a Change link and no Set up', () => {
        renderRow({
            row: { ...CATALOG_ROW, needsSetup: false },
            destinationLabel: 'Kukla Mesh · Stage',
        });

        expect(screen.getByText(/Deploys to Kukla Mesh · Stage/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Set up' })).not.toBeInTheDocument();
    });

    it('committed: Change fires onChangeDestination', () => {
        const props = renderRow({
            row: { ...CATALOG_ROW, needsSetup: false },
            destinationLabel: 'Kukla Mesh · Stage',
        });

        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(props.onChangeDestination).toHaveBeenCalledTimes(1);
        expect(props.onSetUpDestination).not.toHaveBeenCalled();
    });

    it('needs setup: shows "Deploys to — Not set" with a Set up link and no Change', () => {
        renderRow({ row: { ...CATALOG_ROW, needsSetup: true } });

        expect(screen.getByText(/Deploys to — Not set/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Set up' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    });

    it('needs setup: Set up fires onSetUpDestination', () => {
        const props = renderRow({ row: { ...CATALOG_ROW, needsSetup: true } });

        fireEvent.click(screen.getByRole('button', { name: 'Set up' }));
        expect(props.onSetUpDestination).toHaveBeenCalledTimes(1);
        expect(props.onChangeDestination).not.toHaveBeenCalled();
    });
});

describe('IntegrationResultRow — Remove', () => {
    it('renders a Remove button that fires onRemove', () => {
        const props = renderRow();

        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(props.onRemove).toHaveBeenCalledTimes(1);
    });
});

describe('IntegrationResultRow — "APIs in use" list (uniform across kinds)', () => {
    it('custom row: lists APIs by name — baseline label + sdk-code fallback — with a Change', () => {
        const onChangeApis = jest.fn();
        // Committed row → the destination line ALSO shows a Change; scope to the API line.
        renderRow({ row: CUSTOM_ROW, destinationLabel: 'X · Y', onChangeApis });

        const apiLine = screen.getByText('APIs in use').closest('.int-row-apis') as HTMLElement;
        // Baseline resolves to its friendly label; the unmapped pick shows its raw sdk code.
        expect(within(apiLine).getByText('I/O Management API')).toBeInTheDocument();
        expect(within(apiLine).getByText('FireflyServicesSDK')).toBeInTheDocument();
        within(apiLine).getByRole('button', { name: 'Change' }).click();
        expect(onChangeApis).toHaveBeenCalledTimes(1);
    });

    it('custom row on needs-setup: API line renders and Change fires', () => {
        const onChangeApis = jest.fn();
        renderRow({ row: { ...CUSTOM_ROW, needsSetup: true }, onChangeApis });

        expect(screen.getByText('APIs in use')).toBeInTheDocument();
        expect(screen.getByText('I/O Management API')).toBeInTheDocument();
        // needs setup shows Set up (not a destination Change), so the only Change is the API one.
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(onChangeApis).toHaveBeenCalledTimes(1);
    });

    it('mesh row: lists baseline + API Mesh by name, with NO Change (deterministic)', () => {
        renderRow({
            row: MESH_ROW,
            destinationLabel: 'Kukla Mesh · Stage',
            onChangeApis: jest.fn(),
        });

        const apiLine = screen.getByText('APIs in use').closest('.int-row-apis') as HTMLElement;
        expect(within(apiLine).getByText('I/O Management API')).toBeInTheDocument();
        expect(within(apiLine).getByText('API Mesh')).toBeInTheDocument();
        expect(within(apiLine).queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    });

    it('catalog row: lists its APIs by name, with NO Change (deterministic)', () => {
        renderRow({ row: CATALOG_ROW, onChangeApis: jest.fn() });

        const apiLine = screen.getByText('APIs in use').closest('.int-row-apis') as HTMLElement;
        expect(within(apiLine).getByText('I/O Management API')).toBeInTheDocument();
        expect(within(apiLine).getByText('CampaignSDK')).toBeInTheDocument();
        expect(within(apiLine).queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    });

    it('renders the API line even when onChangeApis is absent (feedback, not an action)', () => {
        // needs-setup row → the destination line shows "Set up", not "Change", so any
        // "Change" would be the API one (absent here because onChangeApis is not passed).
        renderRow({ row: { ...CUSTOM_ROW, needsSetup: true } });

        expect(screen.getByText('APIs in use')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    });
});
