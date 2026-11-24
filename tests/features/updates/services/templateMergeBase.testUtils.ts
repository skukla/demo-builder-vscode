/**
 * Shared real-git fixture for the template merge suites (`templateMergeBase.test.ts`,
 * `templateMergeBase-deletions.test.ts`). WHY REAL GIT, THE SEAM and SAFETY are explained in
 * `templateMergeBase.test.ts`'s header.
 *
 * This module owns the `jest.mock` calls and imports the services under test after them, so
 * specs import everything from here and never import the SUT themselves (the hoisting rule,
 * docs/testing/test-file-splitting-playbook.md).
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { ExecuteOptions } from '@/core/shell/types';
import { GitHubFileOperations, type RepoFileAccess } from '@/features/eds/services/github/githubFileOperations';
import { applyChangeKeepingConflicts, type GitStep } from '@/features/updates/services/templateMergeBase';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { Project } from '@/types/base';
import type { AddedComponentEntries, InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { githubAccessFor } from '../../../helpers/githubAccessFake';
import { createMockSecretStorage, githubTokenSecret } from '../../../helpers/secretStorageFake';
import { gitEnv } from '../../../helpers/realGit';


// A thin-layer storefront's network reads (EDS-51), faked; none is reached by a
// storefront with no lkgSource, so the cases above run exactly as before.
// The tested (LKG) version the patches repo names.
export const mockReadLkgSha = jest.fn();
jest.mock('@/features/eds/services/patches/lkgReader', () => ({
    readLkgSha: (...args: unknown[]) => mockReadLkgSha(...args),
}));
// The patch ledger: the REAL engine applies it to the checkout's files.
export const mockLedger = jest.fn();
jest.mock('@/features/eds/services/patches/externalPatchFetcher', () => ({
    fetchExternalPatches: async () => mockLedger(),
}));
// The project's storefront settings: which patches it carries, and its reset params.
export const mockStorefront = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    resolveStorefrontConfig: () => mockStorefront(),
    extractResetParams: () => ({
        success: true,
        params: { repoOwner: 'skukla', repoName: 'demo-storefront', daLiveOrg: 'skukla', daLiveSite: 'demo-storefront' },
    }),
}));
// The 404 handling and Quick Edit write through GitHub's API; asserted, not run.
export const mockInstall404 = jest.fn().mockResolvedValue({ smart404: { installed: true }, current: true });
export const mockInstallQuickEdit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/storefront/storefrontUpToDate', () => ({
    bringStorefrontUpToDate: (...args: unknown[]) => mockInstall404(...args),
}));
jest.mock('@/features/eds/services/quickEditPublisher', () => ({
    ...jest.requireActual('@/features/eds/services/quickEditPublisher'),
    installQuickEdit: (...args: unknown[]) => mockInstallQuickEdit(...args),
}));

export const REAL_GIT_TIMEOUT_MS = 60_000;
const LKG_SOURCE = { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' };
export const PATCH_SOURCE = { ...LKG_SOURCE, path: 'b2b' };
const SC_REPO = 'skukla/demo-storefront';
export const TEMPLATE = { owner: 'adobe', repo: 'aem-boilerplate-commerce' };
/** A GitHub https URL, with or without credentials in it, as the service builds it. */
const GITHUB_URL = /https:\/\/(?:[^@\s"]+@)?github\.com\/([^/\s"]+)\/([^/\s"]+?)\.git/g;

const BASE_A = 'line 1\nline 2\nline 3\n';
export const TEMPLATE_A = 'line 1\nline 2 from the template\nline 3\n';
export const SC_CONFLICTING_A = 'line 1\nline 2 from the SC\nline 3\n';
export const BINARY_B = Buffer.from([0, 1, 2, 255, 254, 0, 7]);
export const SC_CONFIG = '{"commerce-endpoint":"the SC\'s own"}\n';

export interface Fixture {
    root: string;
    home: string;
    scBare: string;
    t1: string;
    t2: string;
}

export function git(fx: Pick<Fixture, 'home'>, cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, env: gitEnv(fx.home), encoding: 'utf8' }).trim();
}

export function write(dir: string, file: string, content: string | Buffer): void {
    fs.writeFileSync(path.join(dir, file), content);
}

function bareRepo(fx: Pick<Fixture, 'root' | 'home'>, ownerRepo: string): string {
    const bare = path.join(fx.root, 'github', `${ownerRepo}.git`);
    fs.mkdirSync(bare, { recursive: true });
    git(fx, bare, 'init', '-q', '--bare', '-b', 'main');
    return bare;
}

/**
 * Files the template has at T1 and DELETES at T2 (Adobe's Universal Editor removal, EDS-71),
 * written into both repositories so the storefront's first tree still equals T1.
 */
type DeletedAtT2 = Record<string, string>;

/** The template: T1 (the recorded base) → T2 (changes A, adds binary B, changes config.json). */
function buildTemplate(fx: Pick<Fixture, 'root' | 'home'>, deleted: DeletedAtT2 = {}): { t1: string; t2: string } {
    const work = path.join(fx.root, 'template-work');
    fs.mkdirSync(work);
    git(fx, work, 'init', '-q', '-b', 'main');
    write(work, 'A.txt', BASE_A);
    write(work, 'C.txt', 'c from the template\n');
    write(work, 'config.json', '{"template":1}\n');
    for (const [file, content] of Object.entries(deleted)) write(work, file, content);
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'T1');
    const t1 = git(fx, work, 'rev-parse', 'HEAD');
    write(work, 'A.txt', TEMPLATE_A);
    write(work, 'B.bin', BINARY_B);
    write(work, 'config.json', '{"template":2}\n');
    for (const file of Object.keys(deleted)) fs.rmSync(path.join(work, file));
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'T2');
    const bare = bareRepo(fx, `${TEMPLATE.owner}/${TEMPLATE.repo}`);
    git(fx, work, 'push', '-q', bare, 'main');
    return { t1, t2: git(fx, work, 'rev-parse', 'HEAD') };
}

/**
 * The storefront: its OWN root commit ("Initial commit", as GitHub writes it)
 * whose tree equals T1, then the SC's edits, pushed to a bare origin.
 */
function buildStorefront(
    fx: Pick<Fixture, 'root' | 'home'>,
    scEdits: (work: string) => void,
    deleted: DeletedAtT2 = {},
): string {
    const work = path.join(fx.root, 'sc-work');
    fs.mkdirSync(work);
    git(fx, work, 'init', '-q', '-b', 'main');
    write(work, 'A.txt', BASE_A);
    write(work, 'C.txt', 'c from the template\n');
    write(work, 'config.json', '{"template":1}\n');
    for (const [file, content] of Object.entries(deleted)) write(work, file, content);
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'Initial commit');
    write(work, 'C.txt', 'c edited by the SC\n');
    write(work, 'config.json', SC_CONFIG);
    scEdits(work);
    git(fx, work, 'add', '-A');
    git(fx, work, 'commit', '-q', '-m', 'SC edits');
    const bare = bareRepo(fx, SC_REPO);
    git(fx, work, 'push', '-q', bare, 'main');
    return bare;
}

export function buildFixture(scEdits: (work: string) => void = () => undefined, deleted: DeletedAtT2 = {}): Fixture {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'template-merge-base-')));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    const { t1, t2 } = buildTemplate({ root, home }, deleted);
    const scBare = buildStorefront({ root, home }, scEdits, deleted);
    return { root, home, scBare, t1, t2 };
}

/** A CommandExecutor that runs git for real, against the local bare repositories. */
function realGitExecutor(fx: Fixture) {
    const execute = async (command: string, options: ExecuteOptions = {}) => {
        if (!command.startsWith('git ')) throw new Error(`not a git command: ${command}`);
        const local = command.replace(GITHUB_URL, (_url, owner: string, repo: string) =>
            pathToFileURL(path.join(fx.root, 'github', owner, `${repo}.git`)).href,
        );
        const run = spawnSync('/bin/bash', ['-c', local], {
            cwd: options.cwd, env: gitEnv(fx.home), encoding: 'utf8',
        });
        return { code: run.status, stdout: run.stdout, stderr: run.stderr, duration: 0 };
    };
    return createMockCommandExecutor({ execute });
}

function storefrontProject(lastSyncedCommit: string | undefined, thinLayer = false): Project {
    return createMockProject({
        name: 'demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                metadata: {
                    githubRepo: SC_REPO,
                    templateOwner: TEMPLATE.owner,
                    templateRepo: TEMPLATE.repo,
                    lastSyncedCommit,
                    ...(thinLayer ? { lkgSource: LKG_SOURCE } : {}),
                },
            },
        },
    });
}

export function merge(
    fx: Fixture,
    lastSyncedCommit: string | undefined,
    strategy: 'merge' | 'reset' = 'merge',
    thinLayer = false,
) {
    const logger = createMockLogger();
    const svc = new TemplateSyncService(
        githubAccessFor(createMockSecretStorage(githubTokenSecret('gh-token')).secrets, logger),
        logger,
        realGitExecutor(fx),
    );
    return svc.syncWithTemplate(storefrontProject(lastSyncedCommit, thinLayer), { strategy });
}

/** A block library an install before EDS-71 recorded, read from `acme/blocks` at `LIBRARY_SHA`. */
const LIBRARY_SHA = 'abc1234';
export function installedLibrary(addedEntries: AddedComponentEntries): InstalledBlockLibrary {
    return {
        name: 'Acme Blocks',
        source: { owner: 'acme', repo: 'blocks', branch: 'main' },
        commitSha: LIBRARY_SHA,
        blockIds: ['tabs'],
        installedAt: '2026-10-01T00:00:00.000Z',
        addedEntries,
    };
}

export const recorded = (ids: Partial<AddedComponentEntries>): AddedComponentEntries => ({
    definition: [], sectionFilter: [], filters: [], models: [], ...ids,
});

/**
 * A merge of a storefront with installed libraries. GitHub's file read is the one network
 * call: it answers the library's files at the recorded commit, and nothing else.
 */
export async function mergeWithLibraries(
    fx: Fixture,
    libraries: InstalledBlockLibrary[],
    libraryFiles: Record<string, string>,
    strategy: 'merge' | 'reset' = 'merge',
) {
    const logger = createMockLogger();
    const access = githubAccessFor(createMockSecretStorage(githubTokenSecret('gh-token')).secrets, logger);
    const read = jest.spyOn(access.fileOperations, 'getFileContent').mockImplementation(
        async (owner, repo, file, ref) => {
            const content = owner === 'acme' && repo === 'blocks' && ref === LIBRARY_SHA ? libraryFiles[file] : undefined;
            return content === undefined ? null : { content, sha: 'x', path: file, encoding: 'base64' };
        },
    );
    const project = { ...storefrontProject(fx.t1), installedBlockLibraries: libraries };
    const result = await new TemplateSyncService(access, logger, realGitExecutor(fx))
        .syncWithTemplate(project, { strategy });
    return { result, project, read };
}

export const originHead = (fx: Fixture): string => git(fx, fx.scBare, 'rev-parse', 'main');
export const originFile = (fx: Fixture, file: string): string =>
    git(fx, fx.scBare, 'show', `main:${file}`);

// The services under test, imported here after the mocks above (the hoisting rule).
export { applyChangeKeepingConflicts, GitHubFileOperations, TemplateSyncService, gitEnv };
export type { GitStep, Project, RepoFileAccess };
