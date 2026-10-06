/**
 * fillCreationDefaults — the defaults a project is saved with, whichever door made it.
 *
 * Driven against the REAL catalog (components.json, demo-packages.json, stacks.json):
 * the bug this pins was a gap between two readers of that catalog, and a hand-built
 * registry would agree with whatever this module assumes.
 *
 * REGRESSION (JustRite, 2026-10-06): an agent created the project through
 * create_project, which never mounts the wizard's settings screen — the only place
 * defaults were filled. "Product Images from AEM Assets" (default Enabled) was never
 * saved, the storefront published `commerce-assets-enabled: false`, and every
 * product image broke.
 */

import * as path from 'path';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { fillCreationDefaults } from '@/features/project-creation/services/creationConfigDefaults';
import type { ComponentRegistry } from '@/types/components';
import type { ComponentConfigs } from '@/types/webview';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

let registry: ComponentRegistry;

beforeAll(async () => {
    registry = await new ComponentRegistryManager(REPO_ROOT).loadRegistry();
});

/** What creation receives for a stack + package, as buildProjectConfig shapes it. */
function creation(
    stackId: 'eds-accs' | 'eds-paas' | 'headless-paas',
    selectedPackage = 'citisignal',
): Pick<ProjectCreationConfig, 'components' | 'selectedPackage' | 'selectedStack' | 'demo'> {
    const [frontend, backend] = {
        'eds-accs': ['eds-storefront', 'adobe-commerce-accs'],
        'eds-paas': ['eds-storefront', 'adobe-commerce-paas'],
        'headless-paas': ['headless', 'adobe-commerce-paas'],
    }[stackId];
    return {
        components: { frontend, backend, dependencies: [], integrations: [], appBuilder: [] },
        selectedPackage,
        selectedStack: stackId,
    };
}

describe('fillCreationDefaults', () => {
    it('saves AEM Assets as enabled on an agent-made EDS project — the JustRite case', () => {
        const filled = fillCreationDefaults(creation('eds-accs'), registry, {});

        expect(filled['eds-storefront']?.AEM_ASSETS_ENABLED).toBe('true');
    });

    it("saves the brand's store codes, on the backend only", () => {
        // The wizard fills these from the package; an agent that passed no
        // storeScope used to get none at all.
        const filled = fillCreationDefaults(creation('eds-accs', 'bodea'), registry, {});

        expect(filled['adobe-commerce-accs']).toMatchObject({
            ACCS_WEBSITE_CODE: 'bodea',
            ACCS_STORE_CODE: 'bodea_store',
            ACCS_STORE_VIEW_CODE: 'bodea_us',
        });
    });

    it('falls back to the catalog default where the package names none', () => {
        const filled = fillCreationDefaults(creation('eds-paas'), registry, {});

        expect(filled['adobe-commerce-paas']?.PAAS_CATALOG_SERVICE_ENDPOINT).toBe(
            'https://catalog-service-sandbox.adobe.io/graphql',
        );
    });

    it('never overrides a store scope the caller chose', () => {
        const stated: ComponentConfigs = {
            'adobe-commerce-accs': {
                ACCS_WEBSITE_CODE: 'justrite',
                ACCS_STORE_CODE: 'justrite_store',
                ACCS_STORE_VIEW_CODE: 'justrite_us',
            },
        };

        const filled = fillCreationDefaults(creation('eds-accs', 'bodea'), registry, stated);

        expect(filled['adobe-commerce-accs']).toMatchObject(stated['adobe-commerce-accs']);
    });

    it('keeps a saved "false" and a value the user cleared', () => {
        const filled = fillCreationDefaults(creation('eds-accs'), registry, {
            'eds-storefront': { AEM_ASSETS_ENABLED: 'false' },
            'adobe-commerce-accs': { ACCS_STORE_CODE: '' },
        });

        expect(filled['eds-storefront']?.AEM_ASSETS_ENABLED).toBe('false');
        expect(filled['adobe-commerce-accs']?.ACCS_STORE_CODE).toBe('');
    });

    it('fills nothing for a component the stack does not have', () => {
        const filled = fillCreationDefaults(creation('headless-paas'), registry, {});

        expect(filled['eds-storefront']).toBeUndefined();
    });

    it('leaves a wizard creation exactly as it was — the screen already filled it', () => {
        const wizardFilled = fillCreationDefaults(creation('eds-accs'), registry, {});

        expect(fillCreationDefaults(creation('eds-accs'), registry, wizardFilled)).toBe(wizardFilled);
    });

    it('does not edit the object it was handed', () => {
        const input: ComponentConfigs = { 'eds-storefront': {} };

        fillCreationDefaults(creation('eds-accs'), registry, input);

        expect(input).toEqual({ 'eds-storefront': {} });
    });

    it('changes nothing with no stack selection', () => {
        const input: ComponentConfigs = {};

        expect(fillCreationDefaults({ selectedPackage: 'citisignal' }, registry, input)).toBe(input);
    });
});
