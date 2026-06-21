/**
 * AppBuilderComponent Config Fields Tests (D2 Track B — Step 04)
 *
 * The Configure surface renders ANY appBuilderComponent's user-provided inputs (bucket 3)
 * from its catalog `envSchema`, applying the 3-bucket rule (Step 01 classifier):
 *   - bucket 1 (auto-provisioned / derivedFrom) → NOT rendered
 *   - bucket 2 (auto-wired / providedBy)        → read-only "connected" row
 *   - bucket 3 text                              → TextField → componentConfigs → .env
 *   - bucket 3 secret                            → MASKED input → SecretStorage
 *
 * Secrets MUST be masked and MUST NOT be written into componentConfigs.
 * Safe fixture convention: `fake-test-pw-not-a-secret`.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { AppBuilderComponentFieldsSection } from '@/features/dashboard/ui/configure/AppBuilderComponentFieldsSection';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

const FAKE_SECRET = 'fake-test-pw-not-a-secret';

const EMPTY_PROVIDED: Record<string, string> = {};
const EMPTY_FLAGS: Record<string, Record<string, boolean>> = {};

const erpEntry: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'Test integration',
    kind: 'integration',
    source: { owner: 'acme', repo: 'erp', branch: 'main' },
    envSchema: [
        { name: 'ERP_HOST', type: 'text', label: 'ERP Host' },
        { name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' },
    ],
};

const consumerEntry: AppBuilderComponentCatalogEntry = {
    id: 'storefront-consumer',
    name: 'Storefront',
    description: 'Consumes mesh',
    kind: 'integration',
    source: { owner: 'acme', repo: 'sf', branch: 'main' },
    envSchema: [
        { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh endpoint', providedBy: 'commerce-paas-mesh' },
    ],
};

const seedMeshEntry: AppBuilderComponentCatalogEntry = {
    id: 'commerce-paas-mesh',
    name: 'Commerce PaaS API Mesh',
    description: 'Mesh',
    kind: 'mesh',
    source: { owner: 'skukla', repo: 'commerce-paas-mesh', branch: 'main' },
    envSchema: [
        { name: 'COMMERCE_ENDPOINT', type: 'text', label: 'Commerce endpoint', derivedFrom: 'connect-commerce' },
    ],
};

function renderSection(props: Partial<React.ComponentProps<typeof AppBuilderComponentFieldsSection>> = {}) {
    const onTextChange = jest.fn();
    const onSecretChange = jest.fn();
    const utils = render(
        <Provider theme={defaultTheme}>
            <AppBuilderComponentFieldsSection
                catalog={props.catalog ?? [erpEntry]}
                configs={props.configs ?? {}}
                provided={props.provided ?? EMPTY_PROVIDED}
                secretFlags={props.secretFlags ?? EMPTY_FLAGS}
                onTextChange={props.onTextChange ?? onTextChange}
                onSecretChange={props.onSecretChange ?? onSecretChange}
            />
        </Provider>,
    );
    return { ...utils, onTextChange, onSecretChange };
}

describe('AppBuilderComponentFieldsSection', () => {
    it('renders a section labeled by the appBuilderComponent name', () => {
        renderSection({ catalog: [erpEntry] });
        expect(screen.getByText('ERP Integration')).toBeInTheDocument();
    });

    it('renders a TextField for a bucket-3 text var and writes edits to componentConfigs', () => {
        const { onTextChange } = renderSection({ catalog: [erpEntry] });

        const input = document.getElementById('field-ERP_HOST')?.querySelector('input');
        expect(input).toBeInTheDocument();

        fireEvent.change(input as HTMLInputElement, { target: { value: 'erp.example.com' } });
        expect(onTextChange).toHaveBeenCalledWith('erp-integration', 'ERP_HOST', 'erp.example.com');
    });

    it('renders a MASKED input for a bucket-3 secret var', () => {
        renderSection({ catalog: [erpEntry] });

        const secretInput = document.getElementById('field-ERP_API_KEY')?.querySelector('input');
        expect(secretInput).toBeInTheDocument();
        expect(secretInput).toHaveAttribute('type', 'password');
    });

    it('routes secret edits through onSecretChange (never componentConfigs)', () => {
        const { onSecretChange, onTextChange } = renderSection({ catalog: [erpEntry] });

        const secretInput = document.getElementById('field-ERP_API_KEY')?.querySelector('input');
        fireEvent.change(secretInput as HTMLInputElement, { target: { value: FAKE_SECRET } });

        expect(onSecretChange).toHaveBeenCalledWith('erp-integration', 'ERP_API_KEY', FAKE_SECRET);
        // The secret edit must NOT travel the componentConfigs (text) path.
        expect(onTextChange).not.toHaveBeenCalledWith('erp-integration', 'ERP_API_KEY', expect.anything());
    });

    it('does not echo a stored secret value back into the field (only "is set")', () => {
        renderSection({
            catalog: [erpEntry],
            secretFlags: { 'erp-integration': { ERP_API_KEY: true } },
        });

        const secretInput = document.getElementById('field-ERP_API_KEY')?.querySelector('input') as HTMLInputElement;
        // Field shows empty (value never round-trips); a "set" affordance is shown instead.
        expect(secretInput.value).toBe('');
        expect(screen.getByText(/set/i)).toBeInTheDocument();
    });

    it('renders a bucket-2 providedBy var as a read-only "connected" row (no input)', () => {
        renderSection({
            catalog: [consumerEntry],
            provided: { MESH_ENDPOINT: 'https://mesh.example.com/graphql' },
        });

        const connected = document.getElementById('field-MESH_ENDPOINT');
        expect(connected).toBeInTheDocument();
        expect(connected?.querySelector('input')).toBeNull();
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
        expect(screen.getByText(/commerce-paas-mesh/i)).toBeInTheDocument();
    });

    it('renders NO field for a bucket-1 (derivedFrom) var', () => {
        renderSection({ catalog: [seedMeshEntry] });

        expect(document.getElementById('field-COMMERCE_ENDPOINT')).toBeNull();
    });

    it('renders no new editable fields for a seed mesh (mesh = zero input)', () => {
        const { onTextChange, onSecretChange } = renderSection({ catalog: [seedMeshEntry] });

        // No section, no inputs at all for an App Builder component whose only var is derived.
        expect(screen.queryByText('Commerce PaaS API Mesh')).not.toBeInTheDocument();
        const inputs = document.querySelectorAll('input');
        expect(inputs.length).toBe(0);
        expect(onTextChange).not.toHaveBeenCalled();
        expect(onSecretChange).not.toHaveBeenCalled();
    });
});
