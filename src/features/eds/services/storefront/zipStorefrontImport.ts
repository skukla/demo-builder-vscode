/**
 * Reading a storefront that arrived as a zip file (shareable-demo step 10):
 * unpack it in memory, drop what a repository would not carry, and say whether
 * what is left is an Edge Delivery storefront, by the same rule the probe
 * applies to a repository.
 *
 * The 2026-09-12 stand-in was exactly this case: a colleague's storefront as a
 * 47 MB zip with 9,944 files, no `.git`, a `.npm-cache/` folder that must not be
 * pushed, and its own `.gitignore`. Kept, it was 3,475 files and 9.9 MB.
 *
 * @module features/eds/services/storefront/zipStorefrontImport
 */

import AdmZip from 'adm-zip';
import { FALLBACK_CONTENT_INDEX_PATH } from '../contentIndex';
import { BUNDLE_SETUP_FILE, BUNDLE_STOREFRONT_DIR } from '../demoPackage/demoBundle';
import { parseFstabContentSource } from '../fstabGenerator';
import type { GitHubRepoLifecycle } from '../github/githubRepoLifecycle';
import { pushFiles, type TreePushOps } from '../github/githubTreePush';
import { isNeverShipped } from './neverShippedFiles';
import {
    CANONICAL_STOREFRONT_FILES,
    classifyRepoForStorefront,
    type RepoReadiness,
} from './repoStorefrontReadiness';
import { ZIP_COMMIT_MESSAGE } from './zipImportCommit';
import { readProjectFile, readSharedDemoDescription } from '@/core/state/projectFileReader';
import { parseIgnoreRules } from '@/core/utils/gitignoreRules';
import { normalizeRepositoryName } from '@/core/validation/normalizers';
import { addedDemoId } from '@/features/components/services/storefrontResolver';
import type { DaLiveContentSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import {
    SHARED_DEMO_FILE_NAME,
    type AddedDemo,
    type ImportedFrom,
    type ProjectFile,
} from '@/types/projectFile';


export interface ZipStorefront {
    /** Repository-relative path → bytes, the single root folder stripped. */
    files: Map<string, Buffer>;
    /** The zip's root folder name, when it had one (the repository name's default). */
    rootName?: string;
    /** How many entries were dropped as ignored or never-committed. */
    dropped: number;
    /** A demo bundle's setup part, when the zip is one and the file is valid. */
    setup?: ProjectFile;
    /** Why a setup file that was there could not be read. */
    setupError?: string;
}

/**
 * Unpack a zip into repository-relative files.
 *
 * @param zipPath - The zip file on disk
 * @returns The files a repository would hold, and what was dropped
 */
export function readStorefrontZip(zipPath: string): ZipStorefront {
    const entries = new AdmZip(zipPath).getEntries().filter((entry) => !entry.isDirectory);
    const firstSegments = new Set(entries.map((entry) => entry.entryName.split('/')[0]));
    const rootName =
        firstSegments.size === 1 && entries.every((entry) => entry.entryName.includes('/'))
            ? [...firstSegments][0]
            : undefined;
    const strip = rootName ? rootName.length + 1 : 0;
    const relative = entries.map((entry) => ({ path: entry.entryName.slice(strip), entry }));

    const rules = parseIgnoreRules(
        relative.find((file) => file.path === '.gitignore')?.entry.getData().toString('utf-8') ?? '',
    );

    const files = new Map<string, Buffer>();
    let dropped = 0;
    for (const { path, entry } of relative) {
        // Dropped whatever the zip's own ignore file says: secrets and never-committed folders.
        if (!path || isNeverShipped(path) || rules.some((rule) => rule(path))) {
            dropped += 1;
            continue;
        }
        files.set(path, entry.getData());
    }
    const setup = setupOfBundle(files);
    return { files: storefrontOfBundle(files), rootName, dropped, ...setup };
}

/** The bundle's setup part, parsed and validated, or why it could not be. */
function setupOfBundle(files: Map<string, Buffer>): Pick<ZipStorefront, 'setup' | 'setupError'> {
    const bytes = files.get(BUNDLE_SETUP_FILE);
    if (!bytes) return {};
    const read = readProjectFile(bytes.toString('utf-8'));
    return read.ok ? { setup: read.file } : { setupError: read.error };
}

/**
 * A demo bundle (what Export writes for "Send a file") keeps the storefront under
 * `storefront/`. When the zip is one, the repository is that folder; a bare
 * storefront zip is left as it is.
 */
function storefrontOfBundle(files: Map<string, Buffer>): Map<string, Buffer> {
    const atTop = CANONICAL_STOREFRONT_FILES.some((name) => files.has(name));
    const inBundle = CANONICAL_STOREFRONT_FILES.some((name) =>
        files.has(`${BUNDLE_STOREFRONT_DIR}${name}`),
    );
    if (atTop || !inBundle) return files;
    const storefront = new Map<string, Buffer>();
    for (const [path, bytes] of files) {
        if (path.startsWith(BUNDLE_STOREFRONT_DIR))
            storefront.set(path.slice(BUNDLE_STOREFRONT_DIR.length), bytes);
    }
    return storefront;
}

/** The same verdict the probe gives a repository, over the unpacked files. */
export async function classifyZipStorefront(
    files: Map<string, Buffer>,
    logger: Logger,
): Promise<RepoReadiness> {
    return classifyRepoForStorefront(
        {
            getFileContent: async (_owner: string, _repo: string, path: string) => {
                const bytes = files.get(path);
                return bytes
                    ? { content: bytes.toString('utf-8'), sha: '', path, encoding: 'utf-8' }
                    : null;
            },
        },
        'zip',
        'zip',
        logger,
    );
}

/**
 * A repository name from the zip's root folder: `citisignal-b2b-summit-main` →
 * `citisignal-b2b-summit`; a bundle's `bodea-demo-bundle` → `bodea`.
 */
export function suggestRepoName(rootName: string | undefined, fallback: string): string {
    const base = (rootName ?? fallback)
        .replace(/\.zip$/i, '')
        .replace(/-demo-bundle$/i, '')
        .replace(/-(main|master)$/i, '');
    return normalizeRepositoryName(base) || normalizeRepositoryName(fallback);
}

export interface CreatedRepository {
    owner: string;
    repo: string;
    fullName: string;
    defaultBranch: string;
    fileCount: number;
    /** The commit the files were pushed as: an imported project resets to it (EDS-72). */
    commit: string;
}

/** How the repository is made: its name and visibility, and for a project's own repository, where and unflagged. */
export interface CreateRepositoryOptions {
    repoName: string;
    isPrivate: boolean;
    leftOut?: number;
    /** The GitHub account or organization to create under; the signed-in account when absent. */
    namespace?: string;
    /** Flag it a template (the default): false for a project's own repository (EDS-72). */
    template?: boolean;
}

export interface CreateRepositoryDeps {
    repoOps: Pick<
        GitHubRepoLifecycle,
        'createEmptyRepository' | 'waitForContent' | 'setTemplateFlag'
    >;
    fileOps: TreePushOps;
    logger: Logger;
    /** Each step, for a person watching: the step's name and a detail such as a file count. */
    onProgress?: (message: string, detail?: string) => void;
}

const count = (n: number): string => n.toLocaleString('en-US');

/**
 * The unpacked storefront becomes a repository in the SC's own account (D28):
 * created public unless asked otherwise, the files pushed as one commit, the
 * repository flagged a template. Shared by the dialog's zip door and storefront
 * setup for a project imported from a bundle, which makes the project's own
 * repository: in the project's namespace, not flagged (EDS-72).
 *
 * @param deps - GitHub operations and a logger
 * @param files - Repository-relative path → bytes
 * @param opts - The repository's name, visibility, namespace and template flag
 * @returns The repository, as created, with the commit pushed
 */
export async function createRepositoryFromZip(
    deps: CreateRepositoryDeps,
    files: Map<string, Buffer>,
    opts: CreateRepositoryOptions,
): Promise<CreatedRepository> {
    deps.logger.info(
        `[Zip] Creating ${opts.repoName} (${opts.isPrivate ? 'private' : 'public'}): ${files.size} files`,
    );
    const leftOut = opts.leftOut ? `, ${count(opts.leftOut)} left out` : '';
    deps.onProgress?.(
        'Creating the repository',
        `${opts.repoName}, ${count(files.size)} files${leftOut}`,
    );
    const repository = opts.namespace
        ? await deps.repoOps.createEmptyRepository(opts.repoName, opts.isPrivate, opts.namespace)
        : await deps.repoOps.createEmptyRepository(opts.repoName, opts.isPrivate);
    const [owner, repo] = repository.fullName.split('/');
    await deps.repoOps.waitForContent(owner, repo);
    const pushed = await pushFiles(
        deps.fileOps,
        owner,
        repo,
        files,
        ZIP_COMMIT_MESSAGE,
        deps.logger,
        (p) =>
            deps.onProgress?.(
                p.kind === 'binary' ? 'Uploading binary files' : 'Pushing files',
                `${count(p.done)} of ${count(p.total)}`,
            ),
    );
    if (opts.template !== false) {
        deps.onProgress?.('Finishing up', 'Marking it as a template');
        await deps.repoOps.setTemplateFlag(owner, repo, true);
    }
    deps.logger.info(
        `[Zip] ${repository.fullName}: ${pushed.fileCount} files pushed${opts.template !== false ? ', marked as a template' : ''}`,
    );
    return {
        owner,
        repo,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch || 'main',
        fileCount: pushed.fileCount,
        commit: pushed.commitSha,
    };
}

/**
 * The sender's content site a bundle names (EDS-72): the description file Export writes into
 * the storefront (with the index it resolved), else the site its `fstab.yaml` mounts, read at
 * the usual index. Nothing when it names neither: the project then starts with no pages.
 */
export function contentSourceOfZip(files: Map<string, Buffer>): DaLiveContentSource | undefined {
    const description = files.get(SHARED_DEMO_FILE_NAME);
    const read = description ? readSharedDemoDescription(description.toString('utf-8')) : undefined;
    if (read?.ok && read.description.contentSource) return read.description.contentSource;
    const fstab = files.get('fstab.yaml');
    const mounted = fstab ? parseFstabContentSource(fstab.toString('utf-8')) : undefined;
    return mounted ? { ...mounted, indexPath: FALLBACK_CONTENT_INDEX_PATH } : undefined;
}

/**
 * What Import from File records of a bundle it makes a project from (EDS-72): the demo's name
 * as the wizard shows it (the setup's title, else its project), the bundle's path for storefront
 * setup to read, and the sender's repository as provenance. Shared by the projects list's door
 * and the agent's (`create_project_from_file`).
 */
export function importedFromBundle(setup: ProjectFile, bundlePath: string): ImportedFrom {
    const sourceRepository = setup.source.storefront?.githubRepo;
    return {
        bundleName: setup.title ?? setup.source.title ?? setup.source.project,
        bundlePath,
        ...(sourceRepository ? { sourceRepository } : {}),
    };
}

/**
 * A bundle's setup, made the colleague's own: the wizard starts on the card the
 * bundle's storefront became. The sender's repository and site are provenance
 * in the file, never a setting, so the colleague names theirs in the wizard.
 */
export function setupForCard(setup: ProjectFile, card: AddedDemo): ProjectFile {
    return { ...setup, demo: card, selectedPackage: addedDemoId(card) };
}
