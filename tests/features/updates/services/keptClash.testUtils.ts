/**
 * The real-git fixture the kept-clash suites share (EDS-57): Adobe's template with two
 * commits, a storefront that started from the first and carries Khalil's header edit, and
 * the project's local copy of it. JustRite's clash in miniature: his quote-icon line and
 * Adobe's accessibility line are the same line.
 *
 * THIS FILE OWNS THE jest.mock CALLS and re-exports the code under test, so the mocks are
 * in place before it loads (webview-test-authoring §3). Import it FIRST.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { KeepClashRequest } from '@/features/updates/services/pendingClash';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { B2B_TEMPLATE_CHECKOUT_JSON } from '../../../helpers/placeholderLabelFixtures';
import { createMockProject } from '../../../helpers/projectFake';
import { realGitExecutor, runGit } from '../../../helpers/realGit';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

export const mockGetToken = jest.fn();
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: () => ({ tokenService: { getToken: () => mockGetToken() } }),
}));

export const REAL_GIT_TIMEOUT_MS = 60_000;
export const SC_REPO = 'skukla/kukla-justrite';
export const TEMPLATE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };

export const HEADER_BASE = "// nav start\nconst dropDown = 'drop-down line';\n// nav end\n";
export const HEADER_ADOBE = "// nav start\nconst dropDown = 'drop-down line with aria attributes';\n// nav end\n";
export const HEADER_KHALIL = "// nav start\nconst dropDown = 'drop-down line plus the quote icon';\n// nav end\n";

export interface Fixture {
    root: string;
    home: string;
    t1: string;
    t2: string;
    scBare: string;
    local: string;
}

/** The current test's fixture, rebuilt before each test. */
export const fx: Fixture = { root: '', home: '', t1: '', t2: '', scBare: '', local: '' };

export function git(cwd: string, ...args: string[]): string {
    return runGit(fx.home, cwd, ...args);
}

export function write(dir: string, file: string, content: string): void {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
}

export const read = (file: string) => fs.readFileSync(path.join(fx.local, file), 'utf8');

function bare(ownerRepo: string): string {
    const dir = path.join(fx.root, 'github', `${ownerRepo}.git`);
    fs.mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '--bare', '-b', 'main');
    return dir;
}

/** Adobe's template: T1 (where the storefront started) → T2 (the tested version). */
function buildTemplate(): { t1: string; t2: string } {
    const work = path.join(fx.root, 'template-work');
    fs.mkdirSync(work);
    git(work, 'init', '-q', '-b', 'main');
    write(work, 'blocks/header/header.js', HEADER_BASE);
    write(work, 'scripts/scripts.js', 'scripts 1\n');
    // Adobe's checkout labels, unchanged between T1 and T2, so they are in no update's change.
    write(work, 'placeholders/checkout.json', B2B_TEMPLATE_CHECKOUT_JSON);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'T1');
    const t1 = git(work, 'rev-parse', 'HEAD');
    write(work, 'blocks/header/header.js', HEADER_ADOBE);
    write(work, 'scripts/scripts.js', 'scripts 2\n');
    write(work, 'scripts/new.js', 'new in Adobe\n');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'T2');
    git(work, 'push', '-q', bare(`${TEMPLATE.owner}/${TEMPLATE.repo}`), 'main');
    return { t1, t2: git(work, 'rev-parse', 'HEAD') };
}

/** The storefront: its own first commit with T1's files, then Khalil's header edit. */
function buildStorefront(): string {
    const work = path.join(fx.root, 'sc-work');
    fs.mkdirSync(work);
    git(work, 'init', '-q', '-b', 'main');
    write(work, 'blocks/header/header.js', HEADER_BASE);
    write(work, 'scripts/scripts.js', 'scripts 1\n');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'Initial commit');
    write(work, 'blocks/header/header.js', HEADER_KHALIL);
    git(work, 'commit', '-q', '-am', 'edit nav bar and request a quote icon');
    const scBare = bare(SC_REPO);
    git(work, 'push', '-q', scBare, 'main');
    return scBare;
}

export function storefrontProject(metadata: Record<string, unknown> = {}): Project {
    return createMockProject({
        name: 'justrite',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: fx.local,
                metadata: { githubRepo: SC_REPO, ...metadata },
            },
        },
    });
}

export function updateContext(): UpdateContext {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: realGitExecutor(fx.root, fx.home, { alsoNode: true }),
        logger: createMockLogger(),
    };
}

export function request(conflicts = ['blocks/header/header.js']): KeepClashRequest {
    return {
        track: 'boilerplate',
        clash: { source: TEMPLATE, base: fx.t1, target: fx.t2, preserveFiles: ['fstab.yaml', 'config.json'] },
        conflicts,
        fixes: false,
    };
}

beforeEach(() => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kept-clash-test-')));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    Object.assign(fx, { root, home, t1: '', t2: '', scBare: '', local: path.join(root, 'local') });
    Object.assign(fx, buildTemplate());
    fx.scBare = buildStorefront();
    git(root, 'clone', '-q', fx.scBare, 'local');
    mockGetToken.mockResolvedValue({ token: 'gh-token' });
});

afterEach(() => {
    fs.rmSync(fx.root, { recursive: true, force: true });
});


// The code under test, loaded after the mock above (import this file first).
export { hasKeptClash, readKeptClash } from '@/features/eds/services/storefront/keptClashMark';
export { keepClash, readPendingClash, writePendingClash } from '@/features/updates/services/pendingClash';
export { finishClash, leaveClash } from '@/features/updates/services/pendingClashFinish';
