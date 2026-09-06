/**
 * configureSections tests
 *
 * `buildConfigureSections` is the ONE ordered list of everything the Configure screen
 * renders. Before it, sections came from three unrelated sources and only one of them
 * (the service groups) reached the nav — so the "Sections" sidebar was not the list of
 * sections on screen.
 *
 * Scope note: this function takes the service groups ALREADY filtered by
 * `useServiceGroups` (empty groups dropped, API Mesh dropped when no mesh component is
 * selected). Those two rules are pinned by `hooks/useServiceGroups.test.tsx`
 * ("omits the API Mesh section when no mesh component is selected" + siblings) and are
 * deliberately NOT re-asserted here — re-asserting them against a hand-filtered input
 * would pass no matter what the rule did. What IS asserted here is the pass-through:
 * every group handed in becomes a section, and nothing else does.
 */

import { mockComponentsData } from './ConfigureScreen.testUtils';
import {
    buildConfigureSections,
    toStepRailTabs,
} from '@/features/dashboard/ui/configure/configureSections';
import {
    ACCS_GRAPHQL_ENDPOINT,
    ACCS_OAUTH_CLIENT_ID,
    PAAS_STORE_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import type { AppBuilderComponentFieldGroup } from '@/features/dashboard/ui/configure/appBuilderComponentFieldModel';
import type { ServiceGroup, UniqueField } from '@/features/dashboard/ui/configure/configureTypes';

/** A UniqueField built from the real env-var definitions in the shared fixtures. */
function field(
    key: keyof typeof mockComponentsData.envVars,
    componentIds = ['headless']
): UniqueField {
    return { ...mockComponentsData.envVars[key], componentIds };
}

/**
 * A field the shared fixtures do not carry — the store-code cascade and the
 * commerce credentials, which is what the connection group is SLICED on.
 *
 * Built with the real key constants rather than string literals: the slice
 * rules read `isStoreCodeField` / `CREDENTIAL_FIELDS`, so a hand-typed key that
 * drifts from `envVarKeys` would land the field in the wrong tab and the test
 * would still pass.
 */
function keyedField(key: string, required: boolean): UniqueField {
    return { key, label: key, type: 'text', required, componentIds: ['headless'] };
}

const COMMERCE_GROUP: ServiceGroup = {
    id: 'adobe-commerce',
    label: 'Adobe Commerce',
    fields: [field('ADOBE_COMMERCE_URL'), field('OPTIONAL_WITH_DEFAULT')],
};

const CATALOG_GROUP: ServiceGroup = {
    id: 'catalog-service',
    label: 'Catalog Service',
    fields: [field('ADOBE_CATALOG_API_KEY', ['catalog-service'])],
};

const APP_BUILDER_GROUP: AppBuilderComponentFieldGroup = {
    id: 'eds-commerce-mesh',
    label: 'EDS Commerce Mesh',
    textFields: [{ name: 'ERP_URL', type: 'text', label: 'ERP URL' }],
    secretFields: [],
    connectedFields: [],
};

/** Everything complete — the default for tests that are not about completeness. */
const allComplete = () => true;
/** Nothing invalid — the default for tests that are not about errors. */
const noErrors = () => false;

const baseInput = {
    serviceGroups: [COMMERCE_GROUP, CATALOG_GROUP],
    isFieldComplete: allComplete,
    fieldHasError: noErrors,
    appBuilderGroups: [APP_BUILDER_GROUP],
    isEds: true,
    isProjectNameValid: true,
};

describe('buildConfigureSections', () => {
    describe('order and kinds', () => {
        it('returns Project → service groups → App Builder components → Authoring', () => {
            const sections = buildConfigureSections(baseInput);
            expect(sections.map((s) => s.kind)).toEqual([
                'project',
                'serviceGroup',
                'serviceGroup',
                'appBuilderComponent',
                'authoring',
            ]);
        });

        it('uses the existing anchor ids so nothing else has to be renamed', () => {
            const sections = buildConfigureSections(baseInput);
            expect(sections.map((s) => s.id)).toEqual([
                'project-info',
                'adobe-commerce',
                'catalog-service',
                'appBuilderComponent-eds-commerce-mesh',
                'authoring-experience',
            ]);
        });

        it('carries each source label through unchanged', () => {
            const sections = buildConfigureSections(baseInput);
            expect(sections.map((s) => s.label)).toEqual([
                'Project',
                'Adobe Commerce',
                'Catalog Service',
                'EDS Commerce Mesh',
                'Authoring',
            ]);
        });

        it('keeps the service groups in the order given (useServiceGroups already sorted them)', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [CATALOG_GROUP, COMMERCE_GROUP],
            });
            expect(sections.filter((s) => s.kind === 'serviceGroup').map((s) => s.id)).toEqual([
                'catalog-service',
                'adobe-commerce',
            ]);
        });
    });

    describe('membership', () => {
        it('emits exactly one section per service group handed in, and no others', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                appBuilderGroups: [],
                isEds: false,
            });
            expect(sections.filter((s) => s.kind === 'serviceGroup')).toHaveLength(2);
            expect(sections).toHaveLength(3); // + Project
        });

        it('emits one section per App Builder field group', () => {
            const second: AppBuilderComponentFieldGroup = {
                ...APP_BUILDER_GROUP,
                id: 'custom-app',
                label: 'Custom App',
            };
            const sections = buildConfigureSections({
                ...baseInput,
                appBuilderGroups: [APP_BUILDER_GROUP, second],
            });
            expect(
                sections.filter((s) => s.kind === 'appBuilderComponent').map((s) => s.id)
            ).toEqual(['appBuilderComponent-eds-commerce-mesh', 'appBuilderComponent-custom-app']);
        });

        it('emits no App Builder sections when no component has visible fields', () => {
            const sections = buildConfigureSections({ ...baseInput, appBuilderGroups: [] });
            expect(sections.some((s) => s.kind === 'appBuilderComponent')).toBe(false);
        });

        it('includes Authoring only for EDS projects', () => {
            const eds = buildConfigureSections({ ...baseInput, isEds: true });
            const nonEds = buildConfigureSections({ ...baseInput, isEds: false });
            expect(eds.some((s) => s.id === 'authoring-experience')).toBe(true);
            expect(nonEds.some((s) => s.id === 'authoring-experience')).toBe(false);
        });

        it('still returns the Project section when there is nothing else to configure', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [],
                appBuilderGroups: [],
                isEds: false,
            });
            expect(sections).toEqual([
                expect.objectContaining({ id: 'project-info', kind: 'project' }),
            ]);
        });
    });

    describe('completeness', () => {
        it('counts only REQUIRED fields — the optional one is ignored', () => {
            const sections = buildConfigureSections(baseInput);
            const commerce = sections.find((s) => s.id === 'adobe-commerce');
            // COMMERCE_GROUP has 2 fields; only ADOBE_COMMERCE_URL is required.
            expect(commerce).toMatchObject({
                requiredTotal: 1,
                requiredComplete: 1,
                isComplete: true,
            });
        });

        it('is NOT complete when a required field is incomplete (the control)', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                isFieldComplete: (f: UniqueField) => f.key !== 'ADOBE_COMMERCE_URL',
            });
            expect(sections.find((s) => s.id === 'adobe-commerce')).toMatchObject({
                requiredTotal: 1,
                requiredComplete: 0,
                isComplete: false,
            });
            // Control the other way: the sibling group's required field IS complete.
            expect(sections.find((s) => s.id === 'catalog-service')).toMatchObject({
                requiredTotal: 1,
                requiredComplete: 1,
                isComplete: true,
            });
        });

        it('treats a group with zero required fields as complete', () => {
            const optionalOnly: ServiceGroup = {
                id: 'other',
                label: 'Additional Settings',
                fields: [field('OPTIONAL_WITH_DEFAULT')],
            };
            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [optionalOnly],
                isFieldComplete: () => false,
            });
            expect(sections.find((s) => s.id === 'other')).toMatchObject({
                requiredTotal: 0,
                requiredComplete: 0,
                isComplete: true,
            });
        });

        it('tracks the Project section against the project-name validity', () => {
            const valid = buildConfigureSections(baseInput);
            const invalid = buildConfigureSections({ ...baseInput, isProjectNameValid: false });
            expect(valid.find((s) => s.id === 'project-info')).toMatchObject({
                requiredTotal: 1,
                requiredComplete: 1,
                isComplete: true,
            });
            expect(invalid.find((s) => s.id === 'project-info')).toMatchObject({
                requiredTotal: 1,
                requiredComplete: 0,
                isComplete: false,
            });
        });

        it('reports Authoring complete with zero required fields (a radio is always set)', () => {
            const sections = buildConfigureSections({ ...baseInput, isFieldComplete: () => false });
            expect(sections.find((s) => s.id === 'authoring-experience')).toMatchObject({
                requiredTotal: 0,
                requiredComplete: 0,
                isComplete: true,
            });
        });

        it('reports App Builder sections complete — nothing gates Save on them today', () => {
            const sections = buildConfigureSections({ ...baseInput, isFieldComplete: () => false });
            expect(sections.find((s) => s.kind === 'appBuilderComponent')).toMatchObject({
                requiredTotal: 0,
                requiredComplete: 0,
                isComplete: true,
            });
        });
    });

    describe('errors', () => {
        it('flags only the section holding the invalid field', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                fieldHasError: (f: UniqueField) => f.key === 'ADOBE_COMMERCE_URL',
            });
            expect(sections.find((s) => s.id === 'adobe-commerce')?.hasError).toBe(true);
            expect(sections.find((s) => s.id === 'catalog-service')?.hasError).toBe(false);
        });

        it('flags nothing when no field is invalid (the control)', () => {
            const sections = buildConfigureSections(baseInput);
            expect(sections.some((s) => s.hasError)).toBe(false);
        });

        it('flags a section whose OPTIONAL field is invalid — a bad URL blocks Save too', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                fieldHasError: (f: UniqueField) => f.key === 'OPTIONAL_WITH_DEFAULT',
            });
            const commerce = sections.find((s) => s.id === 'adobe-commerce');
            // Complete (every REQUIRED field has a value) yet still in error.
            expect(commerce).toMatchObject({ isComplete: true, hasError: true });
        });

        it('flags the Project section when the name is invalid', () => {
            const sections = buildConfigureSections({ ...baseInput, isProjectNameValid: false });
            expect(sections.find((s) => s.id === 'project-info')?.hasError).toBe(true);
        });
    });

    /**
     * The PLAIN service-group path — the one a non-connection group takes.
     *
     * The two tests above that look like they cover it do not: `adobe-commerce`
     * is a CONNECTION group, so it is sliced instead, and `catalog-service` has
     * one field that is always complete and never in error. So the counting and
     * the error rule were only ever read on inputs that could not tell a right
     * answer from a wrong one.
     */
    describe('a plain (non-connection) service group', () => {
        const TWO_REQUIRED: ServiceGroup = {
            id: 'catalog-service',
            label: 'Catalog Service',
            fields: [
                field('ADOBE_CATALOG_API_KEY', ['catalog-service']),
                keyedField('CATALOG_ENDPOINT', true),
            ],
        };

        it('counts the required fields that are complete, not all of them', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [TWO_REQUIRED],
                isFieldComplete: (f: UniqueField) => f.key === 'CATALOG_ENDPOINT',
            });

            expect(sections.find((s) => s.id === 'catalog-service')).toMatchObject({
                requiredTotal: 2,
                requiredComplete: 1,
                isComplete: false,
            });
        });

        it('is in error when ANY one of its fields is — not only when all are', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [TWO_REQUIRED],
                fieldHasError: (f: UniqueField) => f.key === 'CATALOG_ENDPOINT',
            });

            expect(sections.find((s) => s.id === 'catalog-service')?.hasError).toBe(true);
        });
    });

    /**
     * The Commerce group is TWO tabs — Connection and Business Structure — and
     * each tab's counts come from its OWN fields. The fixtures above carry no
     * store code and no credential, so the split itself, the suffixed id, and
     * the per-slice accounting had nothing exercising them.
     */
    describe('the sliced connection group', () => {
        const SCOPED_COMMERCE: ServiceGroup = {
            id: 'adobe-commerce',
            label: 'Adobe Commerce',
            fields: [
                field('ADOBE_COMMERCE_URL'),
                keyedField(PAAS_WEBSITE_CODE, true),
                keyedField(PAAS_STORE_CODE, true),
            ],
        };

        const scopedSections = () =>
            buildConfigureSections({
                ...baseInput,
                serviceGroups: [SCOPED_COMMERCE],
                appBuilderGroups: [],
                isEds: false,
            });

        it('emits a Business Structure tab beside the connection one', () => {
            expect(scopedSections().map((s) => s.id)).toEqual([
                'project-info',
                'adobe-commerce',
                'adobe-commerce:business-structure',
            ]);
        });

        it('labels the second tab Business Structure, keeping the group label on the first', () => {
            expect(scopedSections().map((s) => s.label)).toEqual([
                'Project',
                'Adobe Commerce',
                'Business Structure',
            ]);
        });

        it('counts each tab against its OWN fields, never the whole group', () => {
            const sections = scopedSections();

            // Connection holds the URL alone; the store-code cascade is the
            // other tab's, and counting it here is what would put "1 of 3" on a
            // tab holding one field.
            expect(sections.find((s) => s.id === 'adobe-commerce')).toMatchObject({
                requiredTotal: 1,
            });
            expect(
                sections.find((s) => s.id === 'adobe-commerce:business-structure')
            ).toMatchObject({ requiredTotal: 2 });
        });

        it('flags the tab holding the invalid field, and only that tab', () => {
            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [SCOPED_COMMERCE],
                fieldHasError: (f: UniqueField) => f.key === PAAS_STORE_CODE,
            });

            expect(sections.find((s) => s.id === 'adobe-commerce')?.hasError).toBe(false);
            expect(
                sections.find((s) => s.id === 'adobe-commerce:business-structure')?.hasError
            ).toBe(true);
        });

        it('keeps the credentials with the connection tab, which is what renders them', () => {
            const accs: ServiceGroup = {
                id: 'accs',
                label: 'Adobe Commerce as a Cloud Service',
                fields: [
                    keyedField(ACCS_GRAPHQL_ENDPOINT, true),
                    keyedField(ACCS_OAUTH_CLIENT_ID, true),
                ],
            };

            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [accs],
                appBuilderGroups: [],
                isEds: false,
            });

            // Both fields, counted once, on the tab whose body renders them.
            expect(sections.find((s) => s.id === 'accs')).toMatchObject({ requiredTotal: 2 });
            // No scope to choose, so no second tab — a permanently empty one
            // reads as broken rather than as not applying.
            expect(sections.some((s) => s.id === 'accs:business-structure')).toBe(false);
        });

        it('a slice with no fields of its own carries no error, whatever the group holds', () => {
            const scopeOnly: ServiceGroup = {
                id: 'adobe-commerce',
                label: 'Adobe Commerce',
                fields: [keyedField(PAAS_WEBSITE_CODE, true)],
            };

            const sections = buildConfigureSections({
                ...baseInput,
                serviceGroups: [scopeOnly],
                fieldHasError: () => true,
            });

            // Every field is invalid, and every one of them is on the OTHER
            // tab — so this tab has nothing to badge.
            expect(sections.find((s) => s.id === 'adobe-commerce')).toMatchObject({
                requiredTotal: 0,
                hasError: false,
            });
            expect(
                sections.find((s) => s.id === 'adobe-commerce:business-structure')?.hasError
            ).toBe(true);
        });
    });
});

describe('toStepRailTabs', () => {
    it('marks every section reachable — the active one current, the rest done', () => {
        const sections = buildConfigureSections(baseInput);
        const tabs = toStepRailTabs(sections, 'catalog-service');
        expect(tabs.map((t) => t.status)).toEqual(['done', 'done', 'current', 'done', 'done']);
    });

    it('carries each section id and label onto the tab', () => {
        const sections = buildConfigureSections(baseInput);
        const tabs = toStepRailTabs(sections, 'project-info');
        expect(tabs[0]).toEqual({
            id: 'project-info',
            title: 'Project',
            status: 'current',
            hasError: false,
        });
        expect(tabs[1]).toEqual({
            id: 'adobe-commerce',
            title: 'Adobe Commerce',
            status: 'done',
            hasError: false,
        });
    });

    it('carries the error flag onto the tab so an off-screen error is findable', () => {
        const sections = buildConfigureSections({
            ...baseInput,
            fieldHasError: (f: UniqueField) => f.key === 'ADOBE_COMMERCE_URL',
        });
        const tabs = toStepRailTabs(sections, 'project-info');
        expect(tabs.find((t) => t.id === 'adobe-commerce')?.hasError).toBe(true);
        expect(tabs.find((t) => t.id === 'catalog-service')?.hasError).toBe(false);
    });

    it('leaves every tab reachable when the active id matches nothing', () => {
        const tabs = toStepRailTabs(buildConfigureSections(baseInput), 'nope');
        expect(tabs.every((t) => t.status === 'done')).toBe(true);
        expect(tabs.some((t) => t.status === 'locked' || t.status === 'upcoming')).toBe(false);
    });

    it('returns no tabs for no sections', () => {
        expect(toStepRailTabs([], 'anything')).toEqual([]);
    });
});
