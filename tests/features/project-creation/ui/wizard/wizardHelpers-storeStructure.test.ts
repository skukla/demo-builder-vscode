/**
 * A new project carries the store hierarchy the wizard already fetched.
 *
 * `storeDiscoveryData` lives in wizard state — cached there purely to avoid a
 * re-fetch on back navigation — and was dropped on the floor at creation. It is
 * the only thing that can turn a store CODE back into the NAME the user picked,
 * so passing it through is what lets a brand-new project show names on the
 * Integrations flyout without ever calling Commerce again.
 *
 * The wizard cannot use Configure's persisting handler: at this point there is
 * no project to write to.
 */

import { buildProjectConfig } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { WizardState } from '@/types/webview';
import type { CommerceStoreStructure } from '@/types/commerceStore';

const STRUCTURE: CommerceStoreStructure = {
    websites: [{ id: 2, code: 'citisignal', name: 'CitiSignal' }],
    storeGroups: [
        {
            id: 2,
            code: 'citisignal_store',
            name: 'CitiSignal Store',
            website_id: 2,
            root_category_id: 3,
        },
    ],
    storeViews: [
        {
            id: 3,
            code: 'citisignal_us',
            name: 'CitiSignal US',
            store_group_id: 2,
            website_id: 2,
            is_active: true,
        },
    ],
};

function stateWith(overrides: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'review',
        projectName: 'test-project',
        selectedPackage: 'citisignal',
        selectedStack: 'eds-accs',
        componentConfigs: {
            'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'citisignal' },
        },
        storeDiscoveryData: STRUCTURE,
        ...overrides,
    } as WizardState;
}

describe('buildProjectConfig — commerceStoreStructure', () => {
    it('carries the discovered hierarchy onto the new project', () => {
        expect(buildProjectConfig(stateWith()).commerceStoreStructure).toEqual(STRUCTURE);
    });

    it('carries nothing when discovery never ran', () => {
        const config = buildProjectConfig(stateWith({ storeDiscoveryData: undefined }));

        expect(config.commerceStoreStructure).toBeUndefined();
        // The control: the deployable config is identical either way, so nothing
        // about the project depends on whether names were resolvable.
        expect(config.componentConfigs).toEqual(stateWith().componentConfigs);
    });

    it('keeps the structure OUT of componentConfigs', () => {
        // It is a catalog for humans, not a deployable value. Anything inside
        // componentConfigs is a candidate for a generated `.env`.
        const config = buildProjectConfig(stateWith());

        expect(JSON.stringify(config.componentConfigs)).not.toContain('CitiSignal Store');
        expect(JSON.stringify(config.componentConfigs)).toContain('citisignal');
    });
});
