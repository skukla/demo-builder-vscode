/**
 * Whether a project may have an add-on (PL-60 P1): the stack must offer it, and the demo package
 * may require it or exclude it (`demo-packages.json` `addons`, the schema's blacklist model: an
 * add-on a package does not list is allowed). One rule for the wizard's Catalog step and Configure.
 * Replaces BrandGallery's `filterAddonsByPackage`, which had no caller.
 */

import { addonOffer } from '@/features/components/services/addonOffer';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

const ACO = 'adobe-commerce-aco';
const stack = (optionalAddons?: Stack['optionalAddons']): Pick<Stack, 'optionalAddons'> => ({ optionalAddons });
const pkg = (addons?: DemoPackage['addons']): Pick<DemoPackage, 'addons'> => ({ addons });

describe('addonOffer', () => {
    it('is not offered where the stack does not offer it, whatever the package says', () => {
        expect(addonOffer(ACO, stack([]), pkg({ [ACO]: 'required' }))).toBe('not-offered');
        expect(addonOffer(ACO, stack(undefined), pkg())).toBe('not-offered');
        expect(addonOffer(ACO, undefined, pkg())).toBe('not-offered');
    });

    it('is not offered where the package excludes it', () => {
        expect(addonOffer(ACO, stack([{ id: ACO }]), pkg({ [ACO]: 'excluded' }))).toBe('not-offered');
    });

    it('is required where the package requires it', () => {
        expect(addonOffer(ACO, stack([{ id: ACO }]), pkg({ [ACO]: 'required' }))).toBe('required');
    });

    it('is optional where the package marks it so, or does not list it', () => {
        expect(addonOffer(ACO, stack([{ id: ACO }]), pkg({ [ACO]: 'optional' }))).toBe('optional');
        expect(addonOffer(ACO, stack([{ id: ACO }]), pkg({}))).toBe('optional');
        expect(addonOffer(ACO, stack([{ id: ACO }]), undefined)).toBe('optional');
    });
});
