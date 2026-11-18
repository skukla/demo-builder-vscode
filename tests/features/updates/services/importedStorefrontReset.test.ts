/**
 * A storefront update never resets an imported project's code to the brand's template (walk F249,
 * EDS-72). The project's own code IS its source: it came from the sender's storefront, and the
 * brand it records is only what that code was built on. A merge still brings the template's later
 * changes, keeping the code; resetting to the bare template would throw the sender's work away.
 */

import { COMPONENT_IDS } from '@/core/constants';
import { IMPORTED_RESET_REFUSED, templateResetRefusal } from '@/features/updates/services/thinLayerUpdate';
import { canResetOnClash } from '@/features/updates/services/updateClash';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

/** A storefront on a template with no patches layer, so only the import decides. */
function storefront(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { templateOwner: 'adobe', templateRepo: 'boilerplate' },
            },
        },
        ...overrides,
    });
}

describe('resetting an imported storefront to its template', () => {
    it('is refused for an imported project, with the reason, and not offered on a clash', () => {
        const imported = storefront({ importedFrom: { bundleName: 'scratch-1028-demo-bundle.zip', commit: 'a'.repeat(40) } });

        expect(templateResetRefusal(imported)).toBe(IMPORTED_RESET_REFUSED);
        expect(canResetOnClash(imported, 'template')).toBe(false);
    });

    it('stays offered for a project built on the template itself', () => {
        const built = storefront();

        expect(templateResetRefusal(built)).toBeUndefined();
        expect(canResetOnClash(built, 'template')).toBe(true);
    });
});
