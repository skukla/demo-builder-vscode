/**
 * The wizard must be able to REACH the datapack catalog.
 *
 * The sample-data body has always called `find-datapacks`. That handler is
 * registered by `showDataInstaller` — the Data Installer panel's own command —
 * and the wizard is a different webview with its own composite map, which had no
 * data-installer entry at all. So the request had no handler, failed every time,
 * and the step could render nothing but "The sample data catalog could not be
 * loaded". It never worked once.
 *
 * The counterpart rule is the reason this file pins BOTH directions: datapack
 * WRITES are deliberately withheld from surfaces other than the panel. The panel
 * registers the union of the read and write maps; the wizard gets the one read
 * it needs and nothing else. Registering the union here would hand project
 * creation the ability to start an import, a reset, or an export.
 */

import { projectCreationHandlers } from '@/features/project-creation/handlers';
import { importHandlers } from '@/features/data-installer/handlers';

describe('the wizard handler map', () => {
    it('can read the datapack catalog', () => {
        expect(projectCreationHandlers['find-datapacks']).toBeInstanceOf(Function);
    });

    /**
     * Every datapack WRITE stays out. Derived from the write map rather than
     * listed by hand, so a write added later is caught without editing this.
     */
    it('cannot write datapacks — no import, reset or export', () => {
        const writeTypes = Object.keys(importHandlers);
        const leaked = writeTypes.filter((type) => type in projectCreationHandlers);

        expect(leaked).toEqual([]);
        // Positive control: the write map is non-empty, so an empty `leaked`
        // means "none reached the wizard", not "there was nothing to check".
        expect(writeTypes.length).toBeGreaterThan(0);
    });
});
