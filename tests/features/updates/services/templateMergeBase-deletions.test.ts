/**
 * A template update that DELETES files, run against real git (the fixture and why it is real
 * git: `templateMergeBase.test.ts` and `templateMergeBase.testUtils.ts`).
 */

// FIRST: the shared fixture owns the jest.mock calls the services under test must see.
import {
    REAL_GIT_TIMEOUT_MS, TEMPLATE, TEMPLATE_A, applyChangeKeepingConflicts, buildFixture, git, gitEnv,
    installedLibrary, merge, mergeWithLibraries, originFile, originHead, recorded, write,
    type Fixture, type GitStep,
} from './templateMergeBase.testUtils';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Adobe deleted its Universal Editor files from the templates (EDS-71). Before this, a
// deletion of a file the storefront had changed failed the whole update with git's bare
// "patch failed", and nothing was offered (reported from a colleague's B2B storefront,
// 2026-11-23).
describe('when the template deletes a file', () => {
    let fx: Fixture;

    afterEach(() => {
        if (fx) fs.rmSync(fx.root, { recursive: true, force: true });
    });

    const UE_BASE = '{"groups":[{"components":[{"id":"cards"}]}]}\n';
    const originHas = (file: string): boolean =>
        spawnSync('git', ['cat-file', '-e', `main:${file}`], { cwd: fx.scBare, env: gitEnv(fx.home) }).status === 0;

    // Nothing reads the Universal Editor files after EDS-71 steps 2 to 6, so the update takes
    // Adobe's deletion once Demo Builder's own recorded entries are accounted for.
    const DEFINITION = 'component-definition.json';
    const TABS = { id: 'tabs', title: 'Tabs' };
    const CARDS_HTML = '<div class="cards"><div><div>Card</div></div></div>';
    /** The storefront's copy as an install wrote it: re-indented, so only its content can match. */
    const asInstalled = (components: object[]): string => `${JSON.stringify({ groups: [{ components }] }, null, 2)}\n`;
    const LIBRARY_FILES = {
        [DEFINITION]: asInstalled([TABS, { id: 'cards', plugins: { da: { unsafeHTML: CARDS_HTML } } }]),
    };
    const DEFINITION_CHANGED_STOP =
        'The template update could not be applied: the template deletes component-definition.json, which '
        + "this storefront changed. Delete it from the storefront's repository on GitHub (save a copy first "
        + 'if you need it) or put it back as the template had it, then update again.';
    const definitionFixture = (components: object[]): Fixture =>
        buildFixture((work) => write(work, DEFINITION, asInstalled(components)), { [DEFINITION]: UE_BASE });

    it('deletes component-definition.json when only Demo Builder\'s recorded entries differ, and applies the rest', async () => {
        fx = definitionFixture([{ id: 'cards' }, TABS]);

        const { result, project } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ definition: ['tabs'] }))], LIBRARY_FILES,
        );

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHas(DEFINITION)).toBe(false);
        expect(originFile(fx, 'A.txt')).toBe(TEMPLATE_A.trim());
        // The file is gone, so the record of what was added to it goes too.
        expect(project.installedBlockLibraries?.[0].addedEntries).toBeUndefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('stops, naming the file, when it holds an entry nothing recorded, and pushes nothing', async () => {
        fx = definitionFixture([{ id: 'cards' }, TABS, { id: 'hero' }]);
        const before = originHead(fx);

        const { result, project } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ definition: ['tabs'] }))], LIBRARY_FILES,
        );

        expect(result.success).toBe(false);
        expect(result.conflicts).toBeUndefined();
        expect(result.error).toBe(DEFINITION_CHANGED_STOP);
        expect(originHead(fx)).toBe(before);
        expect(project.installedBlockLibraries?.[0].addedEntries).toEqual(recorded({ definition: ['tabs'] }));
    }, REAL_GIT_TIMEOUT_MS);

    it('stops when the SC changed an entry Demo Builder recorded', async () => {
        fx = definitionFixture([{ id: 'cards' }, { ...TABS, title: 'Our Tabs' }]);
        const before = originHead(fx);

        const { result } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ definition: ['tabs'] }))], LIBRARY_FILES,
        );

        expect(result.error).toBe(DEFINITION_CHANGED_STOP);
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('takes out an HTML example Demo Builder filled into one of the template\'s own entries', async () => {
        fx = definitionFixture([{ id: 'cards', plugins: { da: { unsafeHTML: CARDS_HTML } } }]);

        const { result } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ htmlExamples: ['cards'] }))], LIBRARY_FILES,
        );

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHas(DEFINITION)).toBe(false);
    }, REAL_GIT_TIMEOUT_MS);

    it('stops when the library\'s own files cannot be read, since nothing proves the entries are ours', async () => {
        fx = definitionFixture([{ id: 'cards' }, TABS]);

        const { result } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ definition: ['tabs'] }))], {},
        );

        expect(result.error).toBe(DEFINITION_CHANGED_STOP);
    }, REAL_GIT_TIMEOUT_MS);

    // A reset to a template without the file drops it too, whatever the storefront had.
    it('a reset forgets the record of every file the reset storefront does not have', async () => {
        fx = definitionFixture([{ id: 'cards' }, { ...TABS, title: 'Our Tabs' }]);

        const { result, project } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ definition: ['tabs'], models: ['tabs'] }))], LIBRARY_FILES, 'reset',
        );

        expect(result).toEqual({ success: true, strategy: 'reset', syncedCommit: fx.t2 });
        expect(originHas(DEFINITION)).toBe(false);
        // No component-models.json in the template either, so nothing is left to track.
        expect(project.installedBlockLibraries?.[0].addedEntries).toBeUndefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('clears the record only for the file the update deleted', async () => {
        fx = buildFixture((work) => {
            write(work, DEFINITION, asInstalled([{ id: 'cards' }, TABS]));
            write(work, 'component-models.json', '[{"id":"tabs"}]\n');
        }, { [DEFINITION]: UE_BASE });

        const { result, project } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ definition: ['tabs'], models: ['tabs'] }))], LIBRARY_FILES,
        );

        expect(result.success).toBe(true);
        expect(originHas('component-models.json')).toBe(true);
        expect(project.installedBlockLibraries?.[0].addedEntries).toEqual(recorded({ models: ['tabs'] }));
    }, REAL_GIT_TIMEOUT_MS);

    it('deletes a Universal Editor file the storefront never changed', async () => {
        fx = buildFixture(() => undefined, { 'component-models.json': '[]\n' });

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHas('component-models.json')).toBe(false);
    }, REAL_GIT_TIMEOUT_MS);

    // A storefront with no record left (rewritten in two spaces by an older install, or its
    // library uninstalled since) still holds only the template's content.
    it('deletes a reformatted copy with the template\'s content when nothing is recorded', async () => {
        fx = definitionFixture([{ id: 'cards' }]);

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHas(DEFINITION)).toBe(false);
    }, REAL_GIT_TIMEOUT_MS);

    it('stops on a copy with one extra entry when nothing is recorded', async () => {
        fx = definitionFixture([{ id: 'cards' }, { id: 'hero' }]);
        const before = originHead(fx);

        const result = await merge(fx, fx.t1);

        expect(result.error).toBe(DEFINITION_CHANGED_STOP);
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('deletes component-filters.json when only the recorded filter and section entry differ', async () => {
        const FILTERS = 'component-filters.json';
        const base = [{ id: 'main', components: ['section'] }, { id: 'section', components: ['text'] }];
        const tabsFilter = { id: 'tabs', components: ['tabs-item'] };
        fx = buildFixture((work) => write(work, FILTERS, `${JSON.stringify([
            base[0], { id: 'section', components: ['text', 'tabs'] }, tabsFilter,
        ], null, 2)}\n`), { [FILTERS]: `${JSON.stringify(base)}\n` });

        const { result, project } = await mergeWithLibraries(
            fx,
            [installedLibrary(recorded({ sectionFilter: ['tabs'], filters: ['tabs'] }))],
            { [FILTERS]: JSON.stringify([tabsFilter]) },
        );

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHas(FILTERS)).toBe(false);
        expect(project.installedBlockLibraries?.[0].addedEntries).toBeUndefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('deletes component-models.json when only the recorded model differs', async () => {
        const MODELS = 'component-models.json';
        const tabsModel = { id: 'tabs', fields: [{ name: 'title' }] };
        fx = buildFixture((work) => write(work, MODELS, `${JSON.stringify([{ id: 'cards' }, tabsModel], null, 2)}\n`), {
            [MODELS]: '[{"id":"cards"}]\n',
        });

        const { result } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ models: ['tabs'] }))], { [MODELS]: JSON.stringify([tabsModel]) },
        );

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHas(MODELS)).toBe(false);
    }, REAL_GIT_TIMEOUT_MS);

    it('skips a Universal Editor file the storefront already removed', async () => {
        fx = buildFixture((work) => fs.rmSync(path.join(work, DEFINITION)), { [DEFINITION]: UE_BASE });

        const { result } = await mergeWithLibraries(
            fx, [installedLibrary(recorded({ definition: ['tabs'] }))], LIBRARY_FILES,
        );

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originFile(fx, 'A.txt')).toBe(TEMPLATE_A.trim());
    }, REAL_GIT_TIMEOUT_MS);

    it('stops on another file the storefront changed, says what to do, and pushes nothing', async () => {
        fx = buildFixture((work) => write(work, 'D.txt', 'd edited by the SC\n'), { 'D.txt': 'd from the template\n' });
        const before = originHead(fx);

        const result = await merge(fx, fx.t1);

        // Not offered as a clash: Fix with AI cannot settle a deletion in the local copy.
        expect(result.success).toBe(false);
        expect(result.conflicts).toBeUndefined();
        expect(result.error).toBe(
            'The template update could not be applied: the template deletes D.txt, which this storefront '
            + "changed. Delete it from the storefront's repository on GitHub (save a copy first if you need "
            + 'it) or put it back as the template had it, then update again.',
        );
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    // A name double quotes cannot hold in both bash and cmd.exe never reaches a command:
    // were `$(...)` expanded, git would be asked about a different name and find no change.
    const UNSAFE_NAME_STOP =
        'The template update could not be applied: the template deletes D$(touch ran-marker).txt, whose '
        + 'name Demo Builder cannot handle safely. Reset the storefront to take this update.';

    it('stops on a deleted file whose name it cannot put in a command, and names it', async () => {
        fx = buildFixture((work) => write(work, 'D$(touch ran-marker).txt', 'd edited by the SC\n'), {
            'D$(touch ran-marker).txt': 'd from the template\n',
        });
        const before = originHead(fx);

        const result = await merge(fx, fx.t1);

        expect(result.success).toBe(false);
        expect(result.error).toBe(UNSAFE_NAME_STOP);
        expect(originHead(fx)).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    // Leaving it out of the change would put the name in a command too, so this rare case
    // stops as well, rather than failing inside git with no name given.
    it('stops on such a file even once the storefront no longer has it', async () => {
        fx = buildFixture((work) => fs.rmSync(path.join(work, 'D$(touch ran-marker).txt')), {
            'D$(touch ran-marker).txt': 'd from the template\n',
        });

        const result = await merge(fx, fx.t1);

        expect(result.success).toBe(false);
        expect(result.error).toBe(UNSAFE_NAME_STOP);
    }, REAL_GIT_TIMEOUT_MS);

    it('never stops on a file the update always leaves alone, like fstab.yaml', async () => {
        fx = buildFixture((work) => write(work, 'fstab.yaml', 'mountpoints: the SC\'s own\n'), {
            'fstab.yaml': 'mountpoints: the template\'s\n',
        });

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originFile(fx, 'fstab.yaml')).toBe('mountpoints: the SC\'s own');
    }, REAL_GIT_TIMEOUT_MS);

    /** The change applied in a local copy of the storefront (Fix with AI), as `pendingClash` applies it. */
    async function applyInLocalCopy(components: object[]) {
        fx = definitionFixture(components);
        const copy = path.join(fx.root, 'local-copy');
        git(fx, fx.root, 'clone', '-q', fx.scBare, copy);
        git(fx, copy, 'fetch', '-q', path.join(fx.root, 'github', TEMPLATE.owner, `${TEMPLATE.repo}.git`), 'main');
        const step: GitStep = async (command) => {
            const run = spawnSync('/bin/bash', ['-c', command], { cwd: copy, env: gitEnv(fx.home), encoding: 'utf8' });
            return { code: run.status ?? 1, stdout: run.stdout, stderr: run.stderr, duration: 0 };
        };
        const outcome = await applyChangeKeepingConflicts(step, {
            base: fx.t1,
            target: fx.t2,
            // As the real flow passes them: the SC's config.json is never touched.
            preserveFiles: ['config.json'],
            patchFile: path.join(fx.root, 'local.patch'),
            recordedEntries: async () => [{ ids: recorded({ definition: ['tabs'] }), library: LIBRARY_FILES }],
        });
        return { outcome, copy };
    }

    it('the local copy (Fix with AI) also deletes it when only Demo Builder\'s entries differ', async () => {
        const { outcome, copy } = await applyInLocalCopy([{ id: 'cards' }, TABS]);

        expect(outcome).toEqual({ kind: 'applied' });
        expect(fs.existsSync(path.join(copy, DEFINITION))).toBe(false);
        expect(git(fx, copy, 'diff', '--cached', '--name-status', '--', DEFINITION)).toBe(`D\t${DEFINITION}`);
        expect(fs.readFileSync(path.join(copy, 'A.txt'), 'utf8')).toBe(TEMPLATE_A);
    }, REAL_GIT_TIMEOUT_MS);

    it('the local copy stops the same way on an entry nothing recorded', async () => {
        const { outcome, copy } = await applyInLocalCopy([{ id: 'cards' }, TABS, { id: 'hero' }]);

        expect(outcome).toEqual({ kind: 'failed', reason: expect.stringContaining('deletes component-definition.json') });
        expect(fs.existsSync(path.join(copy, DEFINITION))).toBe(true);
    }, REAL_GIT_TIMEOUT_MS);

    it('deletes a file the storefront left as the template had it', async () => {
        fx = buildFixture(() => undefined, { 'D.txt': 'd from the template\n' });

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originHas('D.txt')).toBe(false);
    }, REAL_GIT_TIMEOUT_MS);

    it('skips the deletion of a file the storefront already removed', async () => {
        fx = buildFixture((work) => fs.rmSync(path.join(work, 'D.txt')), { 'D.txt': 'd from the template\n' });

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originFile(fx, 'A.txt')).toBe(TEMPLATE_A.trim());
    }, REAL_GIT_TIMEOUT_MS);

    // Read as a pattern, `?.txt` would match A.txt and leave the template's change to it out.
    it('skips a removed file whose name looks like a pattern, and nothing else', async () => {
        fx = buildFixture((work) => fs.rmSync(path.join(work, '?.txt')), { '?.txt': 'q from the template\n' });

        const result = await merge(fx, fx.t1);

        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: fx.t2 });
        expect(originFile(fx, 'A.txt')).toBe(TEMPLATE_A.trim());
    }, REAL_GIT_TIMEOUT_MS);
});
