/**
 * IntegrationResultRow tests (Integrations flow redesign — Step 8)
 *
 * The presentational collapsed result row: name line, quiet sourceLine, the
 * destination line ("Deploys to {label}" + Change when committed vs
 * "Deploys to — Not set" + Set up when the row needs setup), the quiet Remove
 * button, the mesh-only `meshEnableSlot`, and the apiCount line gating.
 *
 * @jest-environment jsdom
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { IntegrationResultRow } from '@/features/project-creation/ui/components/integration-flow/IntegrationResultRow';
import type { IntegrationRow } from '@/features/project-creation/ui/components/integration-flow/integrationRows';

const MESH_ROW: IntegrationRow = {
    id: 'commerce-eds-mesh',
    kind: 'mesh',
    name: 'Commerce API Mesh',
    sourceLine: 'GraphQL bridge · deploys to Adobe I/O',
    needsSetup: false,
    apiCount: 0,
};

const CATALOG_ROW: IntegrationRow = {
    id: 'erp-sync',
    kind: 'catalog',
    name: 'ERP Sync',
    sourceLine: 'Syncs orders into an ERP backend',
    needsSetup: true,
    apiCount: 0,
};

const CUSTOM_ROW: IntegrationRow = {
    id: 'acme-widget',
    kind: 'custom',
    name: 'widget',
    sourceLine: 'App Builder app · acme/widget',
    needsSetup: false,
    apiCount: 2,
};

interface RenderOverrides {
    row?: IntegrationRow;
    destinationLabel?: string;
    onSetUpDestination?: () => void;
    onChangeDestination?: () => void;
    onRemove?: () => void;
    onChangeApis?: () => void;
    meshEnableSlot?: React.ReactNode;
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

describe('IntegrationResultRow — mesh enable slot', () => {
    it('renders the meshEnableSlot below a mesh row', () => {
        renderRow({
            row: MESH_ROW,
            destinationLabel: 'Kukla Mesh · Stage',
            meshEnableSlot: <div data-testid="mesh-slot">API access</div>,
        });

        expect(screen.getByTestId('mesh-slot')).toBeInTheDocument();
    });

    it('does NOT render the meshEnableSlot for a non-mesh row even when provided', () => {
        renderRow({
            row: CATALOG_ROW,
            meshEnableSlot: <div data-testid="mesh-slot">API access</div>,
        });

        expect(screen.queryByTestId('mesh-slot')).not.toBeInTheDocument();
    });
});

describe('IntegrationResultRow — editable API line (custom/import rows)', () => {
    it('shows "APIs: {n} selected" + Change for a custom row and fires onChangeApis', () => {
        const onChangeApis = jest.fn();
        // Committed row → the destination line ALSO shows a Change; scope to the API line.
        renderRow({ row: { ...CUSTOM_ROW, apiCount: 2 }, destinationLabel: 'X · Y', onChangeApis });

        const apiLine = screen
            .getByText('APIs: 2 selected')
            .closest('.int-row-apis') as HTMLElement;
        within(apiLine).getByRole('button', { name: 'Change' }).click();
        expect(onChangeApis).toHaveBeenCalledTimes(1);
    });

    it('shows the line with "none selected" + Change even when apiCount is 0', () => {
        const onChangeApis = jest.fn();
        renderRow({ row: { ...CUSTOM_ROW, apiCount: 0, needsSetup: true }, onChangeApis });

        expect(screen.getByText('APIs — none selected')).toBeInTheDocument();
        // The row's destination Change is absent (needs setup shows Set up), so the
        // only Change button is the API one.
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(onChangeApis).toHaveBeenCalledTimes(1);
    });

    it('renders NO API line for a deterministic catalog/mesh row', () => {
        renderRow({ row: { ...CATALOG_ROW, apiCount: 0 }, onChangeApis: jest.fn() });
        expect(screen.queryByText(/APIs/)).not.toBeInTheDocument();
    });

    it('renders no API line when onChangeApis is not provided', () => {
        renderRow({ row: { ...CUSTOM_ROW, apiCount: 2 } });
        expect(screen.queryByText(/APIs:/)).not.toBeInTheDocument();
    });
});
