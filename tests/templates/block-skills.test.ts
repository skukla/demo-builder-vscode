/**
 * The generated block skills describe the block tools as they now behave (EDS-71
 * step 5, owner 2026-11-23: one rule, no hide list). The DA.live block list follows
 * the storefront's code, so:
 *   - register-custom-block gives a block its example and title; Refresh Blocks lists
 *     a block from its code, and nothing writes component-definition.json;
 *   - remove-custom-block deletes the block's code, then its page and row, and undo is
 *     restoring the code.
 * An agent reading the old text would tell the SC a block can be hidden while its code
 * stays, or edit a file Adobe's template no longer has.
 */

import * as fs from 'fs';
import * as path from 'path';

const SKILLS_DIR = path.resolve(__dirname, '../../src/features/project-creation/templates/skills');
const skill = (name: string): string =>
    fs.readFileSync(path.join(SKILLS_DIR, `${name}.md`), 'utf-8');

describe('generated block skills', () => {
    it.each(['register-custom-block', 'remove-custom-block', 'sync-changes'])(
        '%s does not send the agent to component-definition.json',
        (name) => {
            expect(skill(name)).not.toMatch(/component-definition/);
        },
    );

    it('register-custom-block names Refresh Blocks as what lists a block from its code', () => {
        const text = skill('register-custom-block');

        expect(text).toContain('refresh_block_library');
        expect(text).not.toMatch(/`description`/);
    });

    it("remove-custom-block deletes the block's code and says how to undo it", () => {
        const text = skill('remove-custom-block');

        expect(text).toMatch(/deletes the block's code/i);
        expect(text).toContain('blocks/<blockId>/');
        expect(text).toMatch(/restor(e|ing) the block's code/i);
        expect(text).not.toMatch(/does NOT delete/i);
    });

    // skipped-duplicate also comes back when ANOTHER block's row has the title, and then
    // this block gets no row (daLiveBlockLibrarySheet.ts mergeBlockRow).
    it('register-custom-block says skipped-duplicate can mean another block has the title', () => {
        expect(skill('register-custom-block')).toMatch(/`skipped-duplicate`[^\n]*another block/);
    });

    // syncAndPublish can fail before it commits (the kept-clash check, the fetch, the stage),
    // and once committed, a later sync_storefront has nothing new to commit and skips the push.
    it('remove-custom-block does not claim a failed push left the deletion committed', () => {
        const text = skill('remove-custom-block');

        expect(text).not.toMatch(/committed locally only/);
        expect(text).not.toMatch(/`sync_storefront` pushes the committed deletion/);
        expect(text).toMatch(/may not be committed/);
    });

    it('remove-custom-block names the code-folder failure and how the list heals', () => {
        expect(skill('remove-custom-block')).toMatch(
            /`codeFolder` — [^\n]*`failed`[^\n]*Refresh Blocks/,
        );
    });

    it.each(['header-nav-footer', 'commerce-block-mapper'])(
        '%s does not call promotion what makes a block appear in the picker',
        (name) => {
            expect(skill(name)).not.toMatch(/so the block appears in DA\.live's authoring picker/);
        },
    );
});
