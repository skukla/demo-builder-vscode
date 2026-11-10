/**
 * What the save screens say, one line each (walk F83 then F85): `saveWords.ts`.
 */

import { PICKS_INTRO, SAVE_AS_INTRO, UNUSED_INTRO, saveIntro } from '@/features/data-installer/ui/components/create-flow/saveWords';

describe('the save screens, one line each', () => {
    it('Save Changes: everything the demo uses, as a new version of your pack', () => {
        expect(saveIntro('Acme Test')).toBe('Saves everything this demo uses as a new version of Acme Test.');
    });

    it('Save As New Datapack: everything the demo uses, as a new pack of yours, whoever owned the one it started from', () => {
        expect(SAVE_AS_INTRO).toBe("Saves this demo's data as a new datapack.");
    });

    it('Add Unused Items: what the list is, and that choosing is yours', () => {
        expect(UNUSED_INTRO).toBe("This demo doesn't use these yet. Select any to include.");
    });

    it('Create Datapack, from nothing: what to include', () => {
        expect(PICKS_INTRO).toBe("Select what to include from this demo's Commerce instance.");
    });
});
