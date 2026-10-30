/**
 * ACCEPTANCE REPLAY: JustRite's two stopped updates, run through the extension's own
 * `syncBoilerplate` and `syncWithTemplate` against local copies of the three real repositories.
 * Off unless `JUSTRITE_REPLAY_DIR` names a folder holding them; it needs ~200 MB of clones and
 * a network read of the patch ledgers, so it is not part of the normal run.
 *
 * Measured 2026-10-30 before the fix: the Adobe boilerplate update (71a67e0 → d538506) stopped
 * on 3 files and the colleague's update (kmanns/justrite 5ac7b52 → 9e2b4d2) on 2. After it:
 * exactly one, `blocks/header/header.js` (Khalil's own edit), and none.
 *
 * Set up the folder once (read-only clones of public repositories; the two Adobe commits are
 * fetched by full sha because Adobe's nightly rewrite force-pushes them off `main`):
 *
 *   D=/tmp/g6-replay
 *   git clone -q https://github.com/skukla/kukla-justrite.git $D/skukla_kukla-justrite
 *   git clone -q https://github.com/kmanns/justrite.git $D/kmanns_justrite
 *   git init -q --bare $D/b2b && cd $D/b2b \
 *     && git fetch -q https://github.com/adobe-commerce/boilerplate-b2b-template.git \
 *        71a67e027b4b288a67f5cda1fc106d2df9a34805 d53850699f2db66976791921dd5b0e482919efc2 main \
 *     && git update-ref refs/heads/main FETCH_HEAD   # then point main at Adobe's real main
 *
 * Run: JUSTRITE_REPLAY_DIR=$D JUSTRITE_REPLAY_OUT=/tmp/replay.json npx jest <this file>
 * `JUSTRITE_REPLAY_EXPECT=without-fix` asserts the clashes measured before the fix, for running
 * this same file against the code before it (the positive control).
 *
 * SAFETY. Every push lands in a throwaway bare copy under a temp folder (`realGitExecutor`
 * rewrites every github.com URL to it), and GitHub's file API refuses every call here.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readBoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import type { Project } from '@/types/base';
import { githubAccessFor } from '../../../helpers/githubAccessFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { realGitExecutor, runGit } from '../../../helpers/realGit';
import { createMockSecretStorage, githubTokenSecret } from '../../../helpers/secretStorageFake';

const SOURCE = process.env.JUSTRITE_REPLAY_DIR;
const WITHOUT_FIX = process.env.JUSTRITE_REPLAY_EXPECT === 'without-fix';
const REPLAY_TIMEOUT_MS = 300_000;

const ADOBE_BASE = '71a67e027b4b288a67f5cda1fc106d2df9a34805';
const ADOBE_TESTED = 'd53850699f2db66976791921dd5b0e482919efc2';
const COLLEAGUE_SYNCED = '5ac7b52a52a5af2fa71137a591c8a6e5e3826a9b';

/**
 * JustRite's project, with the fields the two updates read, as its manifest recorded them
 * (`~/.demo-builder/projects/justrite/.demo-builder.json`, read 2026-10-30).
 */
function justrite(): Project {
    return createMockProject({
        name: 'justrite',
        selectedPackage: 'added:kmanns/justrite',
        selectedStack: 'eds-accs',
        installedBlockLibraries: [{
            name: 'Demo Builder Blocks',
            source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
            commitSha: '461746a4d9ff3b5ed6678d14cd420fe02ba75f47',
            blockIds: ['catalog-menu'],
            installedAt: '2026-10-09T03:30:00.646Z',
        }],
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                metadata: {
                    githubRepo: 'skukla/kukla-justrite',
                    daLiveOrg: 'skukla',
                    templateOwner: 'kmanns',
                    templateRepo: 'justrite',
                    templateBranch: 'main',
                    lastSyncedCommit: COLLEAGUE_SYNCED,
                    boilerplateBase: {
                        template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
                        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
                        commit: ADOBE_BASE,
                        found: 'first-commit',
                    },
                },
            },
        },
    });
}

let root = '';
let home = '';

/** A throwaway bare copy of `from` at `<root>/github/<ownerRepo>.git`, servable by sha as GitHub is. */
function bareCopy(from: string, ownerRepo: string): void {
    const bare = path.join(root, 'github', `${ownerRepo}.git`);
    fs.mkdirSync(path.dirname(bare), { recursive: true });
    runGit(home, root, 'clone', '-q', '--bare', from, bare);
    runGit(home, bare, 'config', 'uploadpack.allowReachableSHA1InWant', 'true');
}

function service(): TemplateSyncService {
    const logger = createMockLogger();
    const access = githubAccessFor(createMockSecretStorage(githubTokenSecret('gh-token')).secrets, logger);
    jest.spyOn(access.fileOperations, 'getFileContent').mockRejectedValue(new Error('no GitHub API in the replay'));
    jest.spyOn(access.fileOperations, 'createOrUpdateFile').mockRejectedValue(new Error('no GitHub API in the replay'));
    return new TemplateSyncService(
        { ...access, tokenService: { getToken: async () => ({ token: 'gh-token', tokenType: 'bearer', scopes: [] }) } },
        logger,
        realGitExecutor(root, home),
    );
}

const pushedHead = () => runGit(home, path.join(root, 'github', 'skukla/kukla-justrite.git'), 'rev-parse', 'main');

function record(name: string, result: TemplateSyncResult): void {
    const out = process.env.JUSTRITE_REPLAY_OUT;
    if (!out) return;
    const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
    const { success, conflicts, edits, error, notes } = result;
    fs.writeFileSync(out, JSON.stringify({ ...previous, [name]: { success, conflicts, edits, error, notes } }, null, 2));
}

(SOURCE ? describe : describe.skip)('JustRite replay (needs JUSTRITE_REPLAY_DIR)', () => {
    beforeEach(() => {
        root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'justrite-replay-')));
        home = path.join(root, 'home');
        fs.mkdirSync(home);
        const dir = SOURCE as string;
        bareCopy(path.join(dir, 'skukla_kukla-justrite'), 'skukla/kukla-justrite');
        bareCopy(path.join(dir, 'kmanns_justrite'), 'kmanns/justrite');
        bareCopy(path.join(dir, 'b2b'), 'adobe-commerce/boilerplate-b2b-template');
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("Adobe's boilerplate update 71a67e0 → d538506", async () => {
        const project = justrite();
        // Read the way the update check reads it, so the replay starts where the real one did.
        const base = readBoilerplateBase(project);
        if (!base) throw new Error('the recorded Adobe base did not read back');
        const before = pushedHead();

        const result = await service().syncBoilerplate(project, { base, tested: ADOBE_TESTED });
        record('boilerplate', result);

        const expected = WITHOUT_FIX
            ? ['blocks/header/header.js', 'scripts/__dropins__/tools/lib/aem/assets.js', 'scripts/scripts.js']
            : ['blocks/header/header.js'];
        expect([...(result.conflicts ?? [])].sort()).toEqual(expected);
        // A stop pushes nothing by git. (Before the fix the repairs went through GitHub's
        // API instead, which refuses every call here.)
        expect(pushedHead()).toBe(before);
    }, REPLAY_TIMEOUT_MS);

    it("the colleague's update kmanns/justrite 5ac7b52 → 9e2b4d2", async () => {
        const result = await service().syncWithTemplate(justrite(), { strategy: 'merge' });
        record('template', result);

        const expected = WITHOUT_FIX
            ? { success: false, conflicts: ['blocks/catalog-menu/catalog-menu-core.js', 'blocks/catalog-menu/catalog-menu.js'] }
            : { success: true, conflicts: [] };
        expect({ success: result.success, conflicts: [...(result.conflicts ?? [])].sort() }).toEqual(expected);
    }, REPLAY_TIMEOUT_MS);
});
