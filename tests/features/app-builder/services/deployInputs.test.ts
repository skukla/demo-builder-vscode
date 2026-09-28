/**
 * deployInputs — what an app deploys WITH, and what it provides once deployed.
 *
 * The ERP pair is the first component whose inputs are not credentials: the
 * ERP's display name (typed once, on the integration; defaulted otherwise) and
 * the ERP's base URL (provided by the ERP to the integration). Both resolve here,
 * for add and redeploy alike.
 */

import {
    deriveProvidedValues,
    deriveWebBase,
    displayNameInProject,
    listIdOf,
    resolveDeployInputs,
    resolveDisplayName,
} from '@/features/app-builder/services/deployInputs';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { createMockProject } from '../../../helpers/projectFake';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    providesEnvVars: ['ERP_BASE_URL'],
    envSchema: [{ name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' }],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    layout: 'extension',
    lifecycle: 'app-management',
    envSchema: [
        { name: 'ERP_BASE_URL', type: 'text', label: 'ERP address', providedBy: 'demo-erp' },
        { name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' },
        { name: 'ERP_TOKEN', type: 'secret', label: 'never in the env' },
    ],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const ERP_URLS = {
    'runtime/demo-erp/health': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/health',
    'runtime/demo-erp/orders': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp/orders',
};

describe('resolveDeployInputs', () => {
    it('a text var with nothing configured takes its default', () => {
        expect(resolveDeployInputs(createMockProject(), SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Acme ERP' });
    });

    it("Configure's own value wins over the default; blank counts as nothing", () => {
        const typed = createMockProject({ componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: 'Nordwind' } } });
        expect(resolveDeployInputs(typed, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
        const blank = createMockProject({ componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: '   ' } } });
        expect(resolveDeployInputs(blank, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Acme ERP' });
    });

    it('a bound system reads the value typed on ITS INTEGRATION when it has none of its own', () => {
        // The SC names the ERP once, on the integration they picked (decision 10).
        const project = createMockProject({
            componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind' } },
        });
        expect(resolveDeployInputs(project, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
    });

    it("the integration's value wins over an old one set on the bound system", () => {
        // Configure Project once edited each app's copy on its own tab, so the two could
        // disagree. The setting now lives on the integration's tile only (AB-21), and a
        // stale copy on the ERP must not keep the old name on its screen.
        const project = createMockProject({
            componentConfigs: {
                'erp-integration': { ERP_DISPLAY_NAME: 'Nordwind' },
                'demo-erp': { ERP_DISPLAY_NAME: 'Old name' },
            },
        });
        expect(resolveDeployInputs(project, SYSTEM)).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
    });

    it('a provided var comes from the provider component that is already deployed; secrets never ride the env', () => {
        const project = createMockProject({
            appBuilderComponents: {
                'demo-erp': {
                    kind: 'system',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'demo-erp' },
                    providesEnvVars: { ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp' },
                },
            },
        });
        expect(resolveDeployInputs(project, INTEGRATION)).toEqual({
            ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp',
            ERP_DISPLAY_NAME: 'Acme ERP',
        });
    });

    it('a provided var whose provider is absent is simply not there (the add door guards it)', () => {
        expect(resolveDeployInputs(createMockProject(), INTEGRATION)).toEqual({ ERP_DISPLAY_NAME: 'Acme ERP' });
    });

    // Commerce knows an App Management app by the id it declares, and names its webhooks
    // and events from it. A second copy on the same Commerce store needs its own, so the
    // app is told which copy it is; the first copy is told nothing and keeps today's id,
    // which Commerce refuses to change on an installed app (AB-15).
    it('a second copy is told its copy number; the first copy is not', () => {
        const copy = { ...INTEGRATION, id: 'erp-integration-2', catalogId: 'erp-integration' };

        expect(resolveDeployInputs(createMockProject(), copy)).toStrictEqual({
            DEMO_BUILDER_COPY_NUMBER: '2',
            ERP_DISPLAY_NAME: 'Acme ERP',
        });
        expect(resolveDeployInputs(createMockProject(), INTEGRATION)).not.toHaveProperty('DEMO_BUILDER_COPY_NUMBER');
    });
});

/*
 * A listed system is told its id in its integration's list (AB-16). The integration's own
 * ERP is "erp", the id the integration gives an event or key map row that names none; an
 * ERP added from the card is its component id. The legacy numbered pair (an
 * erp-integration-2 in the project) keeps "erp" inside its own integration.
 */
describe('resolveDeployInputs — listed systems', () => {
    const LISTED = { ...SYSTEM, listedAs: { envVar: 'ERP_ID', firstId: 'erp', adapter: 'demo-erp' } };
    const added = { ...LISTED, id: 'demo-erp-2', catalogId: 'demo-erp' };
    const withIntegration = (...ids: string[]) =>
        createMockProject({
            appBuilderComponents: Object.fromEntries(ids.map((id) => [id, { kind: 'integration' as const, status: 'deployed' as const, source: { owner: 'skukla', repo: 'x' } }])),
        });

    it("the integration's own ERP is told the single-ERP id", () => {
        expect(resolveDeployInputs(withIntegration('erp-integration'), LISTED)).toMatchObject({ ERP_ID: 'erp' });
        expect(listIdOf(createMockProject(), LISTED)).toBe('erp');
    });

    it('an ERP added from the card is told its own component id', () => {
        expect(resolveDeployInputs(withIntegration('erp-integration'), added)).toMatchObject({ ERP_ID: 'demo-erp-2' });
    });

    it("a legacy numbered pair's ERP is its own integration's first ERP", () => {
        expect(listIdOf(withIntegration('erp-integration', 'erp-integration-2'), added)).toBe('erp');
    });

    it('an entry with no listing is told no id', () => {
        expect(resolveDeployInputs(createMockProject(), SYSTEM)).not.toHaveProperty('ERP_ID');
    });
});

describe('deriveWebBase / deriveProvidedValues', () => {
    it('cuts the first web URL after its package segment', () => {
        expect(deriveWebBase(ERP_URLS)).toBe('https://ns.adobeioruntime.net/api/v1/web/demo-erp');
    });

    it('a package with a renamed isolation name still yields its own base', () => {
        expect(
            deriveWebBase({ 'runtime/demo-erp-a1b2/health': 'https://ns.adobeioruntime.net/api/v1/web/demo-erp-a1b2/health' }),
        ).toBe('https://ns.adobeioruntime.net/api/v1/web/demo-erp-a1b2');
    });

    it('no web URL, no base', () => {
        expect(deriveWebBase({ 'runtime/erp/timer': 'https://ns.adobeioruntime.net/api/v1/erp/timer' })).toBeUndefined();
        expect(deriveWebBase(undefined)).toBeUndefined();
    });

    it('every provided name maps to the web base; the mesh endpoint is not this module\'s to set', () => {
        expect(deriveProvidedValues(SYSTEM, ERP_URLS)).toEqual({
            ERP_BASE_URL: 'https://ns.adobeioruntime.net/api/v1/web/demo-erp',
        });
        expect(deriveProvidedValues({ ...SYSTEM, providesEnvVars: ['MESH_ENDPOINT'] }, ERP_URLS)).toBeUndefined();
        expect(deriveProvidedValues(INTEGRATION, ERP_URLS)).toBeUndefined();
        expect(deriveProvidedValues(SYSTEM, {})).toBeUndefined();
    });
});

describe('resolveDisplayName', () => {
    it('reads the row name from the named input, else the entry name', () => {
        expect(resolveDisplayName(SYSTEM, { ERP_DISPLAY_NAME: 'Nordwind' })).toBe('Nordwind');
        expect(resolveDisplayName(SYSTEM, { ERP_DISPLAY_NAME: '  ' })).toBe('ERP');
        // An entry that does not name itself from an input ignores the input.
        expect(resolveDisplayName(INTEGRATION, { ERP_DISPLAY_NAME: 'Nordwind' })).toBe('ERP integration');
    });

    // The shipped catalog, not a fixture: this is the contract the dashboard row,
    // the agent's get_erp_status and the add's progress title all read. The integration
    // has a name of its own (AB-16o, owner 2026-09-28), not its first ERP's.
    it('the shipped ERP integration is called by its own name — ERP Integration by default', () => {
        const entry = shippedEntry('erp-integration');

        expect(resolveDisplayName(entry, resolveDeployInputs(createMockProject(), entry))).toBe('ERP Integration');
        const named = createMockProject({
            componentConfigs: {
                'erp-integration': { ERP_DISPLAY_NAME: 'Northwind ERP', INTEGRATION_DISPLAY_NAME: 'Bodea ERP Hub' },
            },
        });
        expect(displayNameInProject(named, entry)).toBe('Bodea ERP Hub');
    });
});

/** A project made before the integration had a name of its own, as Bodea's file holds it. */
function projectFromBeforeOwnName() {
    return createMockProject({
        appBuilderComponents: {
            'demo-erp': {
                kind: 'system',
                status: 'deployed',
                name: 'Northwind ERP',
                source: { owner: 'skukla', repo: 'demo-erp' },
            },
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                name: 'Northwind ERP Integration',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
            },
        },
        componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Northwind ERP' } },
    });
}

function shippedEntry(id: string): AppBuilderComponentCatalogEntry {
    const entry = getAppBuilderComponentCatalog().find((candidate) => candidate.id === id);
    expect(entry).toBeDefined();
    return entry as AppBuilderComponentCatalogEntry;
}

describe("the integration's own name (AB-16o)", () => {
    // Existing projects keep their names (owner rule): nothing changes under anyone.
    it('a project from before keeps its recorded name, and its next deploy sends that name to Commerce', () => {
        const project = projectFromBeforeOwnName();
        const entry = shippedEntry('erp-integration');

        const inputs = resolveDeployInputs(project, entry);

        expect(inputs.INTEGRATION_DISPLAY_NAME).toBe('Northwind ERP Integration');
        expect(resolveDisplayName(entry, inputs)).toBe('Northwind ERP Integration');
        expect(displayNameInProject(project, entry)).toBe('Northwind ERP Integration');
    });

    it('a new integration, with no record yet, is ERP Integration', () => {
        const project = createMockProject({
            componentConfigs: { 'erp-integration': { ERP_DISPLAY_NAME: 'Northwind ERP' } },
        });

        expect(resolveDeployInputs(project, shippedEntry('erp-integration')).INTEGRATION_DISPLAY_NAME).toBe(
            'ERP Integration',
        );
    });

    it('a name set on the integration (a rename) wins over the recorded one', () => {
        const project = projectFromBeforeOwnName();
        project.componentConfigs = {
            'erp-integration': { ERP_DISPLAY_NAME: 'Northwind ERP', INTEGRATION_DISPLAY_NAME: 'Bodea ERP Hub' },
        };

        expect(resolveDeployInputs(project, shippedEntry('erp-integration')).INTEGRATION_DISPLAY_NAME).toBe(
            'Bodea ERP Hub',
        );
    });

    // The ERP reads its integration's values first; it must not take the integration's name.
    it("the ERP keeps its own ERP_DISPLAY_NAME and is never sent the integration's name", () => {
        const project = projectFromBeforeOwnName();
        project.componentConfigs = {
            'erp-integration': { ERP_DISPLAY_NAME: 'Northwind ERP', INTEGRATION_DISPLAY_NAME: 'Bodea ERP Hub' },
        };
        const erp = shippedEntry('demo-erp');

        const inputs = resolveDeployInputs(project, erp);

        expect(inputs.ERP_DISPLAY_NAME).toBe('Northwind ERP');
        expect(inputs).not.toHaveProperty('INTEGRATION_DISPLAY_NAME');
        expect(resolveDisplayName(erp, inputs)).toBe('Northwind ERP');
    });
});

describe('displayNameInProject', () => {
    it("the component's recorded name wins — a rename, or the name typed at add", () => {
        const project = createMockProject({
            appBuilderComponents: {
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Northwind sync',
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                },
            },
        });

        expect(displayNameInProject(project, INTEGRATION)).toBe('Northwind sync');
    });

    // The case the workspace title needs: a bound system names its integration's
    // workspace BEFORE the integration has any record.
    it('with no record yet, what its inputs make it, else the catalog name', () => {
        const typed = createMockProject({ componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: 'Northwind ERP' } } });

        expect(displayNameInProject(typed, SYSTEM)).toBe('Northwind ERP');
        expect(displayNameInProject(createMockProject(), INTEGRATION)).toBe('ERP integration');
    });
});
