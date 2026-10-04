/**
 * The manifest carries the display title, and its absence stays absent.
 *
 * A project has two names. `name` is the SLUG — the folder, the dedupe key, the
 * path `renameProjectCore` moves. `title` is what the user typed, and exists
 * only to be read.
 *
 * `title` is optional forever: every project created before it existed has only
 * a slug and must keep rendering exactly as it does today. Two consequences,
 * both easy to undo with a well-meant tidy-up:
 *
 * 1. The writer must OMIT the key when there is no title. `title: undefined`
 *    serialises a null into every legacy manifest for no gain. (Same contract
 *    as `commerceStoreStructure` — see projectConfigWriter-storeStructure.test.ts.)
 * 2. Nothing may backfill it from the slug. Seeding `title = name` renders
 *    identically today and then persists the slug as a genuine user title; a
 *    later rename would move the folder and leave that stale title on screen.
 */

import {
    createTestProject,
    resetFsMocks,
    write,
    writtenManifest,
} from './projectConfigWriter.testUtils';

beforeEach(resetFsMocks);

describe('a project with a title', () => {
    it('writes the title alongside the slug, not instead of it', async () => {
        await write(createTestProject({ title: 'Bodea B2B Demo' }));

        expect(writtenManifest().title).toBe('Bodea B2B Demo');
        // The slug is what the folder and the dedupe key are built from; a title
        // must never displace it.
        expect(writtenManifest().name).toBe('bodea-demo');
    });
});

describe('a project with no title — everything that predates this', () => {
    // Rule 2 above too: a title backfilled from the slug would put the key here.
    it('omits the key entirely rather than writing a null', async () => {
        await write(createTestProject());

        expect('title' in writtenManifest()).toBe(false);
    });

    it('still writes the slug, so the project is not orphaned', async () => {
        await write(createTestProject());

        expect(writtenManifest().name).toBe('bodea-demo');
    });
});
