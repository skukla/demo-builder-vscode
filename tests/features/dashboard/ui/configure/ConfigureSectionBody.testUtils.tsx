/**
 * Shared setup for the ConfigureSectionBody suites.
 *
 * Fixtures and one render harness. The Spectrum module mock CANNOT live here —
 * `jest.mock` hoists above the imports of the file it appears in, not across
 * modules, so each spec keeps its own preamble and this file owns the SUT
 * import instead (skill: webview-test-authoring §3). Specs render through
 * `renderSectionBody` and never import the component directly.
 *
 * The harness fills every required prop with something inert, so a spec names
 * only what it is about: a section kind, a group, a catalog.
 */

import { render } from '@testing-library/react';
import React from 'react';
import {
    ConfigureSectionBody,
    type ConfigureSectionBodyProps,
} from '@/features/dashboard/ui/configure/ConfigureSectionBody';
import type { ConfigureSection } from '@/features/dashboard/ui/configure/configureSections';
import type { ServiceGroup, UniqueField } from '@/features/dashboard/ui/configure/configureTypes';

export const field = (key: string): UniqueField =>
    ({ key, label: key, type: 'text', required: false, componentIds: ['c'] }) as UniqueField;

export const COMMERCE: ServiceGroup = {
    id: 'adobe-commerce',
    label: 'Adobe Commerce',
    fields: [
        field('ADOBE_COMMERCE_URL'),
        field('ADOBE_COMMERCE_ADMIN_USERNAME'),
        field('ADOBE_COMMERCE_WEBSITE_CODE'),
        field('ADOBE_COMMERCE_STORE_CODE'),
    ],
};

/** The ACCS half: the only backend with the brokered OAuth pair. */
export const ACCS: ServiceGroup = {
    id: 'accs',
    label: 'Adobe Commerce Cloud Service',
    fields: [
        field('ACCS_GRAPHQL_ENDPOINT'),
        field('ACCS_OAUTH_CLIENT_ID'),
        field('ACCS_OAUTH_CLIENT_SECRET'),
        field('ACCS_WEBSITE_CODE'),
    ],
};

export const CATALOG: ServiceGroup = {
    id: 'catalog-service',
    label: 'Catalog Service',
    fields: [field('ADOBE_CATALOG_API_KEY')],
};

/** A rail section of any kind; the body branches on `kind` and `id` only. */
export const sectionOf = (
    kind: ConfigureSection['kind'],
    id: string,
    label: string
): ConfigureSection => ({
    id,
    label,
    kind,
    isComplete: true,
    requiredTotal: 0,
    requiredComplete: 0,
    hasError: false,
});

/** A rail section for a service group. */
export const serviceGroupSection = (id: string, label: string): ConfigureSection =>
    sectionOf('serviceGroup', id, label);

/** Records which group each field row was handed — the store cascade depends on it. */
export const seen: { key: string; groupId: string }[] = [];

/** The `renderFieldRow` callback every suite hands in, recording into `seen`. */
export const recordFieldRow = (f: UniqueField, g: ServiceGroup): React.ReactNode => {
    seen.push({ key: f.key, groupId: g.id });
    return <div data-testid={`row-${f.key}`} />;
};

/** Render the body with inert defaults, naming only what the test is about. */
export function renderSectionBody(overrides: Partial<ConfigureSectionBodyProps> = {}) {
    seen.length = 0;
    return render(
        <ConfigureSectionBody
            section={serviceGroupSection(COMMERCE.id, COMMERCE.label)}
            serviceGroups={[COMMERCE, CATALOG]}
            renderFieldRow={recordFieldRow}
            projectName="p"
            onProjectNameChange={jest.fn()}
            projectNameTouched={false}
            appBuilderComponentCatalog={[]}
            componentConfigs={{}}
            providedEnvVars={{}}
            appBuilderComponentSecretFlags={{}}
            onAppBuilderValueChange={jest.fn()}
            authoringExperience="da-live-classic"
            onAuthoringExperienceChange={jest.fn()}
            storeStructureReady={true}
            {...overrides}
        />
    );
}
