/**
 * Demo Builder's own pieces, set aside around an Adobe boilerplate change and put back after
 * (`setAsidePieces.ts`). Real files in a temp folder: the subject reads and writes a checkout.
 *
 * The shapes are the real ones: the ledger's patches (`knownPatchFixtures.ts`) and Quick Edit's
 * own transform over the canonical scripts.js fixture.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { buildQuickEditScriptsJs, QUICK_EDIT_SIDEKICK_MARKER } from '@/features/eds/services/quickEditSnippet';
import {
    blockLibraryFolders,
    filesSetAside,
    putBackOwnPieces,
    setAsideOwnPieces,
} from '@/features/updates/services/setAsidePieces';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { CANONICAL_SCRIPTS_JS } from '../../eds/services/quickEditScriptsFixture';
import {
    ASSETS_SKU_SANITIZATION,
    HEADER_JS,
    HEADER_NAV_TOOLS,
    KNOWN_PATCHES,
    TEASER_IMPORT,
    TEASER_JS,
    TEASER_LINK,
} from '../../../helpers/knownPatchFixtures';
import { createMockProject } from '../../../helpers/projectFake';

const ASSETS = ASSETS_SKU_SANITIZATION.target;
const ASSETS_ADOBE = `export function x(e){${ASSETS_SKU_SANITIZATION.precondition};return o}`;
const ASSETS_OURS = ASSETS_ADOBE.replace(ASSETS_SKU_SANITIZATION.precondition, ASSETS_SKU_SANITIZATION.replacement);
const SCRIPTS_WIRED = buildQuickEditScriptsJs(CANONICAL_SCRIPTS_JS);
const LIVE = [...KNOWN_PATCHES, ASSETS_SKU_SANITIZATION];

let dir: string;

async function write(file: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), text);
}
const read = (file: string) => fs.readFile(path.join(dir, file), 'utf8');

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'set-aside-'));
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('setAsideOwnPieces', () => {
    it("takes out an applied patch and Quick Edit's wiring, and putting back gives the same files", async () => {
        await write(ASSETS, ASSETS_OURS);
        await write('scripts/scripts.js', SCRIPTS_WIRED);

        const aside = await setAsideOwnPieces(dir, LIVE);

        expect(aside.patches.map((p) => p.id)).toEqual([ASSETS_SKU_SANITIZATION.id]);
        expect(aside.quickEdit).toBe(true);
        expect(await read(ASSETS)).toBe(ASSETS_ADOBE);
        expect(await read('scripts/scripts.js')).not.toContain(QUICK_EDIT_SIDEKICK_MARKER);
        expect(filesSetAside(aside).sort()).toEqual([ASSETS, 'scripts/scripts.js'].sort());

        expect(await putBackOwnPieces(dir, aside)).toStrictEqual([]);
        expect(await read(ASSETS)).toBe(ASSETS_OURS);
        expect(await read('scripts/scripts.js')).toBe(SCRIPTS_WIRED);
    });

    it('leaves a file whose patch is not exactly ours, and a file with no patch, alone', async () => {
        const edited = ASSETS_OURS.replace('sanitizedAlias=m.replace', 'sanitizedAlias = m.replace');
        await write(ASSETS, edited);
        await write('blocks/header/header.js', HEADER_JS);

        const aside = await setAsideOwnPieces(dir, LIVE);

        expect(aside).toStrictEqual({ patches: [], quickEdit: false });
        expect(await read(ASSETS)).toBe(edited);
        expect(await read('blocks/header/header.js')).toBe(HEADER_JS);
    });

    it('takes out both parts of a two-part fix on one file together', async () => {
        const patched = TEASER_JS.replace(TEASER_IMPORT.precondition, TEASER_IMPORT.replacement)
            .replace(TEASER_LINK.precondition, TEASER_LINK.replacement);
        await write(TEASER_LINK.target, patched);

        const aside = await setAsideOwnPieces(dir, LIVE);

        expect(aside.patches.map((p) => p.id).sort()).toEqual([TEASER_IMPORT.id, TEASER_LINK.id].sort());
        expect(await read(TEASER_LINK.target)).toBe(TEASER_JS);
    });

    it('takes nothing out when applying again would not give the same file back', async () => {
        // A second copy of the original line: applying again could not tell which one was fixed.
        const original = HEADER_JS.replace(HEADER_NAV_TOOLS.precondition, HEADER_NAV_TOOLS.replacement);
        const twice = `${original}\n// ${HEADER_NAV_TOOLS.precondition}\n`;
        await write(HEADER_NAV_TOOLS.target, twice);

        const aside = await setAsideOwnPieces(dir, LIVE);

        expect(aside.patches).toStrictEqual([]);
        expect(await read(HEADER_NAV_TOOLS.target)).toBe(twice);
    });
});

describe('putBackOwnPieces', () => {
    it("puts a patch back into Adobe's changed file when its line is still there", async () => {
        await write(ASSETS, ASSETS_OURS);
        const aside = await setAsideOwnPieces(dir, LIVE);
        // Adobe's change: a new build around the same line.
        await write(ASSETS, `/* build 2 */${ASSETS_ADOBE}`);

        expect(await putBackOwnPieces(dir, aside)).toStrictEqual([]);
        expect(await read(ASSETS)).toBe(`/* build 2 */${ASSETS_OURS}`);
    });

    it("says so, in plain words, when Adobe's change took away the line a patch fixes", async () => {
        await write(ASSETS, ASSETS_OURS);
        const aside = await setAsideOwnPieces(dir, LIVE);
        await write(ASSETS, 'export function x(){return 1}');

        expect(await putBackOwnPieces(dir, aside)).toEqual([
            "A Demo Builder fix could not be put back: aem-assets-sku-sanitization (Adobe's change no longer has the code it fixes).",
        ]);
    });

    it('says so when the lines Quick Edit hooks into are gone', async () => {
        await write('scripts/scripts.js', SCRIPTS_WIRED);
        const aside = await setAsideOwnPieces(dir, LIVE);
        await write('scripts/scripts.js', 'export async function loadPage() {}\n');

        const lines = await putBackOwnPieces(dir, aside);

        expect(lines).toEqual([expect.stringContaining('Quick Edit could not be put back')]);
    });

    it('leaves the files it is told to skip, and a second run changes nothing', async () => {
        await write(ASSETS, ASSETS_OURS);
        await write('scripts/scripts.js', SCRIPTS_WIRED);
        const aside = await setAsideOwnPieces(dir, LIVE);

        await putBackOwnPieces(dir, aside, [ASSETS]);
        expect(await read(ASSETS)).toBe(ASSETS_ADOBE);
        expect(await read('scripts/scripts.js')).toBe(SCRIPTS_WIRED);

        await putBackOwnPieces(dir, aside);
        await putBackOwnPieces(dir, aside);
        expect(await read(ASSETS)).toBe(ASSETS_OURS);
        expect(await read('scripts/scripts.js')).toBe(SCRIPTS_WIRED);
    });
});

describe('blockLibraryFolders', () => {
    const library = (blockIds: string[]): InstalledBlockLibrary => ({
        name: 'Demo Builder Blocks',
        source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
        commitSha: '461746a4d9ff3b5ed6678d14cd420fe02ba75f47',
        blockIds,
        installedAt: '2026-10-09T03:30:00.646Z',
    });

    it("names each installed library's block folders once", () => {
        const project = createMockProject({ installedBlockLibraries: [library(['catalog-menu']), library(['catalog-menu', 'hero-x'])] });

        expect(blockLibraryFolders(project)).toEqual(['blocks/catalog-menu', 'blocks/hero-x']);
    });

    it('ignores an id that is not a plain folder name, so nothing odd reaches a git command', () => {
        const project = createMockProject({ installedBlockLibraries: [library(['../x', 'a"b', 'ok_1'])] });

        expect(blockLibraryFolders(project)).toEqual(['blocks/ok_1']);
    });

    it('is empty with no installed library', () => {
        expect(blockLibraryFolders(createMockProject({}))).toStrictEqual([]);
    });
});
