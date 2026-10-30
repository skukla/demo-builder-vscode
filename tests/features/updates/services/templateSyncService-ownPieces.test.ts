/**
 * An update never clashes with Demo Builder's OWN additions, and a stop pushes nothing (real git).
 *
 * JustRite in miniature (2026-10-30). Adobe's tested boilerplate changed three lines our pieces
 * sit beside or inside: the `loadHeader` line under the Quick Edit Sidekick listener, the one-line
 * AEM Assets dropin our SKU patch edits, and a header line Khalil had edited himself. The update
 * stopped on all three. Only the last is somebody's edit and must still stop it (CLAUDE.md, rule 2).
 *
 * The colleague's track had its own: the colleague's repository gained an OLDER copy of the
 * catalog-menu block the storefront's block library had already updated, and the two clashed.
 *
 * Every case runs the service against local bare repositories (`realGitExecutor`). Each fix
 * has a control that switches it off by its own rule, and the clash comes back.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';
import type { ShippedPatches } from '@/features/eds/services/patches/shippedPatchLedger';
import { buildQuickEditScriptsJs, QUICK_EDIT_SIDEKICK_MARKER } from '@/features/eds/services/quickEditSnippet';
import type { BoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { Project } from '@/types/base';
import { CANONICAL_SCRIPTS_JS } from '../../eds/services/quickEditScriptsFixture';
import { githubAccessFor } from '../../../helpers/githubAccessFake';
import { ASSETS_SKU_SANITIZATION } from '../../../helpers/knownPatchFixtures';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { realGitExecutor, runGit } from '../../../helpers/realGit';
import { createMockSecretStorage, githubTokenSecret } from '../../../helpers/secretStorageFake';

// The shipped ledgers' live patches, read from GitHub in production.
const mockShipped = jest.fn<Promise<ShippedPatches>, []>();
jest.mock('@/features/eds/services/patches/shippedPatchLedger', () => ({
    readShippedPatches: () => mockShipped(),
}));

const REAL_GIT_TIMEOUT_MS = 60_000;
const SC_REPO = 'skukla/kukla-justrite';
const ADOBE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const COLLEAGUE = { owner: 'kmanns', repo: 'justrite' };

const ASSETS = ASSETS_SKU_SANITIZATION.target;
const ASSETS_1 = `export function x(e){${ASSETS_SKU_SANITIZATION.precondition};return o}\n`;
// Adobe's next dropin build: the same one-line file, changed beside our patch.
const ASSETS_2 = `/* build 2 */${ASSETS_1}`;
const ours = (text: string, patch: CodePatch) => text.replace(patch.precondition, patch.replacement);

const LOAD_HEADER = "  loadHeader(doc.querySelector('header'));";
const SCRIPTS_1 = CANONICAL_SCRIPTS_JS;
const SCRIPTS_2 = CANONICAL_SCRIPTS_JS.replace(LOAD_HEADER, "  loadHeader(doc.querySelector('header'), { a11y: true });");

const HEADER_1 = "const navTools = 1;\nconst quote = 'Request a Quote';\nconst end = 1;\n";
const HEADER_2 = "const navTools = 1;\nconst quote = 'Request a Quote';\nconst end = 'aria';\n";
const HEADER_KHALIL = "const navTools = 1;\nconst quote = 'nav-quote';\nconst end = 1;\n";

const CATALOG = 'blocks/catalog-menu/catalog-menu.js';

let root = '';
let home = '';
const git = (cwd: string, ...args: string[]) => runGit(home, cwd, ...args);

function write(dir: string, file: string, text: string): void {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
}

/** A repository with one commit per tree, pushed to `<root>/github/<ownerRepo>.git`; the commits. */
function repoOf(ownerRepo: string, trees: Array<Record<string, string>>): string[] {
    const work = path.join(root, 'work', ownerRepo);
    fs.mkdirSync(work, { recursive: true });
    git(work, 'init', '-q', '-b', 'main');
    const commits = trees.map((tree, i) => {
        for (const [file, text] of Object.entries(tree)) write(work, file, text);
        git(work, 'add', '-A');
        git(work, 'commit', '-q', '-m', `commit ${i + 1}`);
        return git(work, 'rev-parse', 'HEAD');
    });
    const bare = path.join(root, 'github', `${ownerRepo}.git`);
    fs.mkdirSync(bare, { recursive: true });
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(work, 'push', '-q', bare, 'main');
    return commits;
}

const originHead = () => git(path.join(root, 'github', `${SC_REPO}.git`), 'rev-parse', 'main');
const originFile = (file: string) => git(path.join(root, 'github', `${SC_REPO}.git`), 'show', `main:${file}`);

/** Adobe's template: the storefront's base, then the tested version. */
function adobeTemplate(): { b1: string; b2: string } {
    const [b1, b2] = repoOf(`${ADOBE.owner}/${ADOBE.repo}`, [
        { 'scripts/scripts.js': SCRIPTS_1, [ASSETS]: ASSETS_1, 'blocks/header/header.js': HEADER_1 },
        { 'scripts/scripts.js': SCRIPTS_2, [ASSETS]: ASSETS_2, 'blocks/header/header.js': HEADER_2 },
    ]);
    return { b1, b2 };
}

/** The SC's storefront: Adobe's base under its own root commit, then Demo Builder's pieces and `extra`. */
function storefront(extra: Record<string, string> = {}, scripts = buildQuickEditScriptsJs(SCRIPTS_1)): void {
    repoOf(SC_REPO, [
        { 'scripts/scripts.js': SCRIPTS_1, [ASSETS]: ASSETS_1, 'blocks/header/header.js': HEADER_1 },
        { 'scripts/scripts.js': scripts, [ASSETS]: ours(ASSETS_1, ASSETS_SKU_SANITIZATION), ...extra },
    ]);
}

function project(metadata: Record<string, unknown>, libraries: InstalledBlockLibrary[] = []): Project {
    return createMockProject({
        name: 'justrite',
        installedBlockLibraries: libraries,
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', metadata: { githubRepo: SC_REPO, ...metadata } },
        },
    });
}

/** The service with GitHub's file API refusing everything: no write may go that way. */
function service(): { svc: TemplateSyncService; apiWrites: jest.SpyInstance } {
    const logger = createMockLogger();
    const access = githubAccessFor(createMockSecretStorage(githubTokenSecret('gh-token')).secrets, logger);
    jest.spyOn(access.fileOperations, 'getFileContent').mockRejectedValue(new Error('no GitHub API in this test'));
    const apiWrites = jest.spyOn(access.fileOperations, 'createOrUpdateFile').mockRejectedValue(new Error('no GitHub API'));
    const svc = new TemplateSyncService(
        { ...access, tokenService: { getToken: async () => ({ token: 'gh-token', tokenType: 'bearer', scopes: [] }) } },
        logger,
        realGitExecutor(root, home),
    );
    return { svc, apiWrites };
}

function boilerplate(b1: string): BoilerplateBase {
    return {
        template: ADOBE,
        commit: b1,
        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
        found: 'first-commit',
    };
}

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'own-pieces-')));
    home = path.join(root, 'home');
    fs.mkdirSync(home);
    mockShipped.mockResolvedValue({ live: [ASSETS_SKU_SANITIZATION], retired: [], complete: true });
});
afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("Adobe's boilerplate update with Demo Builder's pieces set aside", () => {
    it("lands Adobe's change and puts our pieces back, in one commit, through no API", async () => {
        const { b1, b2 } = adobeTemplate();
        storefront();
        const before = originHead();
        const { svc, apiWrites } = service();

        const result = await svc.syncBoilerplate(project({}), { base: boilerplate(b1), tested: b2 });

        expect(result).toMatchObject({ success: true, syncedCommit: b2 });
        expect(originFile('scripts/scripts.js')).toBe(buildQuickEditScriptsJs(SCRIPTS_2).trimEnd());
        expect(originFile(ASSETS)).toBe(ours(ASSETS_2, ASSETS_SKU_SANITIZATION).trimEnd());
        expect(originFile('blocks/header/header.js')).toBe(HEADER_2.trimEnd());
        expect(git(path.join(root, 'github', `${SC_REPO}.git`), 'rev-list', '--count', `${before}..main`)).toBe('1');
        expect(apiWrites).not.toHaveBeenCalled();
    }, REAL_GIT_TIMEOUT_MS);

    it("still stops on somebody's own edit, names it as theirs, and pushes nothing", async () => {
        const { b1, b2 } = adobeTemplate();
        // Khalil's edit reached the storefront with his demo: the same file is in his repository.
        const [k1] = repoOf(`${COLLEAGUE.owner}/${COLLEAGUE.repo}`, [{ 'blocks/header/header.js': HEADER_KHALIL }]);
        storefront({ 'blocks/header/header.js': HEADER_KHALIL });
        const before = originHead();
        const { svc } = service();
        const copied = { templateOwner: COLLEAGUE.owner, templateRepo: COLLEAGUE.repo, lastSyncedCommit: k1 };

        const result = await svc.syncBoilerplate(project(copied), { base: boilerplate(b1), tested: b2 });

        expect(result.success).toBe(false);
        expect(result.conflicts).toEqual(['blocks/header/header.js']);
        expect(result.edits).toEqual([{ file: 'blocks/header/header.js', whose: 'copied-demo', from: 'kmanns/justrite' }]);
        expect(result.error).toContain('an edit that came with kmanns/justrite');
        expect(result.clash).toMatchObject({ ownPiecesAside: true });
        expect(originHead()).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('CONTROL: a patch no ledger lists is not provably ours, so it stays and clashes', async () => {
        const { b1, b2 } = adobeTemplate();
        storefront();
        mockShipped.mockResolvedValue({ live: [], retired: [], complete: true });
        const { svc } = service();

        const result = await svc.syncBoilerplate(project({}), { base: boilerplate(b1), tested: b2 });

        expect(result.conflicts).toEqual([ASSETS]);
        expect(result.edits).toEqual([{ file: ASSETS, whose: 'storefront' }]);
    }, REAL_GIT_TIMEOUT_MS);

    it('CONTROL: a Quick Edit listener someone changed is not ours any more, so it stays and clashes', async () => {
        const { b1, b2 } = adobeTemplate();
        const edited = buildQuickEditScriptsJs(SCRIPTS_1).replace(
            `${QUICK_EDIT_SIDEKICK_MARKER}\n  const loadQuickEdit`,
            `${QUICK_EDIT_SIDEKICK_MARKER}\n  // hand-edited\n  const loadQuickEdit`,
        );
        storefront({}, edited);
        const { svc } = service();

        const result = await svc.syncBoilerplate(project({}), { base: boilerplate(b1), tested: b2 });

        expect(result.conflicts).toEqual(['scripts/scripts.js']);
    }, REAL_GIT_TIMEOUT_MS);
});

describe("a colleague's template update leaves a block library's folders to the library", () => {
    const library: InstalledBlockLibrary = {
        name: 'Demo Builder Blocks',
        source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
        commitSha: '461746a4d9ff3b5ed6678d14cd420fe02ba75f47',
        blockIds: ['catalog-menu'],
        installedAt: '2026-10-09T03:30:00.646Z',
    };

    /** The colleague gains an older copy of the block; the storefront already has the library's newer one. */
    function setUp(): { c1: string } {
        const [c1] = repoOf(`${COLLEAGUE.owner}/${COLLEAGUE.repo}`, [
            { 'README.md': 'justrite\n' },
            { 'README.md': 'justrite\n', [CATALOG]: 'catalog menu, version 1\n', 'other.js': 'colleague change\n' },
        ]);
        repoOf(SC_REPO, [{ 'README.md': 'justrite\n' }, { [CATALOG]: 'catalog menu, version 2\n' }]);
        return { c1 };
    }
    const colleagueTrack = (c1: string) => ({ templateOwner: COLLEAGUE.owner, templateRepo: COLLEAGUE.repo, lastSyncedCommit: c1 });

    it("applies the colleague's other changes and keeps the library's newer block", async () => {
        const { c1 } = setUp();
        const { svc } = service();

        const result = await svc.syncWithTemplate(project(colleagueTrack(c1), [library]), { strategy: 'merge' });

        expect(result.success).toBe(true);
        expect(originFile('other.js')).toBe('colleague change');
        expect(originFile(CATALOG)).toBe('catalog menu, version 2');
    }, REAL_GIT_TIMEOUT_MS);

    it('CONTROL: with no library recorded, the two copies clash', async () => {
        const { c1 } = setUp();
        const { svc } = service();

        const result = await svc.syncWithTemplate(project(colleagueTrack(c1)), { strategy: 'merge' });

        expect(result.conflicts).toEqual([CATALOG]);
    }, REAL_GIT_TIMEOUT_MS);
});
