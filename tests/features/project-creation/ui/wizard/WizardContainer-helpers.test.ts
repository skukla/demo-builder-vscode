/**
 * Tests for WizardContainer helper functions (SOP §3 compliance)
 */
import { getNextButtonText, filterRemovedCustomLibraries } from '@/features/project-creation/ui/wizard/wizardHelpers';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

describe('getNextButtonText', () => {
    it('returns Continue when confirming selection', () => {
        expect(getNextButtonText(true, 0, 5)).toBe('Continue');
        expect(getNextButtonText(true, 3, 5)).toBe('Continue');
    });

    it('returns Create on review step (second-to-last)', () => {
        expect(getNextButtonText(false, 3, 5, undefined, 'review')).toBe('Create'); // index 3, total 5
    });

    it('returns Continue on non-review second-to-last step (e.g., storefront-setup)', () => {
        expect(getNextButtonText(false, 3, 5, undefined, 'storefront-setup')).toBe('Continue');
    });

    it('returns Continue on other steps', () => {
        expect(getNextButtonText(false, 0, 5)).toBe('Continue');
        expect(getNextButtonText(false, 1, 5)).toBe('Continue');
    });

    it('handles edge cases correctly', () => {
        // Last step (index = total - 1) should still be Continue (not "Create Project")
        expect(getNextButtonText(false, 4, 5)).toBe('Continue');
        // First step
        expect(getNextButtonText(false, 0, 10)).toBe('Continue');
    });
});

/**
 * Regression test for: custom block libraries removed from VS Code settings
 * still appearing on brand tiles despite disappearing from the modal.
 */
describe('filterRemovedCustomLibraries', () => {
    const buildright: CustomBlockLibrary = {
        name: 'Buildright Eds',
        source: { owner: 'skukla', repo: 'buildright-eds', branch: 'main' },
    };
    const myBlocks: CustomBlockLibrary = {
        name: 'My Blocks',
        source: { owner: 'acme', repo: 'my-blocks', branch: 'main' },
    };

    it('should remove libraries no longer in defaults', () => {
        const selected = [buildright, myBlocks];
        const defaults = [myBlocks]; // buildright removed from settings
        expect(filterRemovedCustomLibraries(selected, defaults)).toEqual([myBlocks]);
    });

    it('should keep all libraries when defaults unchanged', () => {
        const selected = [buildright, myBlocks];
        const defaults = [buildright, myBlocks];
        expect(filterRemovedCustomLibraries(selected, defaults)).toEqual([buildright, myBlocks]);
    });

    it('should return empty array when all removed', () => {
        const selected = [buildright];
        const defaults: CustomBlockLibrary[] = [];
        expect(filterRemovedCustomLibraries(selected, defaults)).toEqual([]);
    });

    it('should return empty array when selected is empty', () => {
        expect(filterRemovedCustomLibraries([], [myBlocks])).toEqual([]);
    });

    it('should return empty array when selected is undefined', () => {
        expect(filterRemovedCustomLibraries(undefined, [myBlocks])).toEqual([]);
    });

    it('should return selected unchanged when defaults is undefined', () => {
        expect(filterRemovedCustomLibraries([buildright], undefined)).toEqual([buildright]);
    });
});
