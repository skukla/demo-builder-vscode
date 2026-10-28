/**
 * The `.node-version` file Demo Builder puts in a component's folder.
 *
 * Installation writes `<major>\n` when the catalog names a Node major and the folder has
 * no such file yet, so a terminal opened there with fnm's `--use-on-cd` picks the right
 * Node. Commands never read it: every one passes `fnm exec --using=<major>`.
 *
 * **Why this does not go through `generatedFileWriter`** (ADR-013's seam). The seam's
 * write rule treats a file it has no recorded hash for as unmodified ONCE and overwrites
 * it. Here the folder is a git clone, and the component's own repository may ship a
 * `.node-version`: overwriting that would rewrite a tracked upstream file. (None of the
 * four mesh and ingestion repos tracks one as of 2026-10-28, checked with `git ls-files`;
 * headless-commerce-mesh gitignores it. The guard is for a repo that starts to.) Its hash store is also the AI bundle's (`aiFileHashes`), which nothing on
 * the install path persists. So: create only when absent (exclusive, no symlink follow),
 * and rewrite an existing file only on positive proof it is ours.
 *
 * **What counts as proof** (`refreshNodeVersionFile`): the bytes equal what an earlier
 * install wrote for that component, AND the component's own git repository does not track
 * the file. Either alone is not enough: equal bytes could be the upstream repo's own file,
 * and an untracked file could be one a person wrote.
 *
 * @module features/components/services/nodeVersionFile
 */

import { execFile } from 'child_process';
import { constants as fsConstants } from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { ComponentInstance } from '@/types/base';
import type { RawComponentRegistry } from '@/types/components';
import type { Logger } from '@/types/logger';

const execFileAsync = promisify(execFile);

const NODE_VERSION_FILE = '.node-version';

/**
 * Exactly what installation wrote before the catalog moved every component to Node 24
 * (2026-10-28): `${configuredNodeVersion}\n` (`componentInstallation.ts`), for the four
 * components whose catalog version changed. Only these bytes are ever rewritten.
 */
const PREVIOUSLY_WRITTEN: Readonly<Record<string, readonly string[]>> = {
    'eds-commerce-mesh': ['20\n'],
    'eds-accs-mesh': ['20\n'],
    'headless-commerce-mesh': ['20\n'],
    'commerce-demo-ingestion': ['18\n'],
};

/** The file's content for a Node major, in the one format installation writes. */
function nodeVersionFileContent(major: string): string {
    return `${major}\n`;
}

/** Does the component's own git repository track this file? */
export type IsTrackedByRepo = (componentPath: string, fileName: string) => Promise<boolean>;

/** `git ls-files --error-unmatch` exits 0 only for a tracked file. */
export const isTrackedByRepo: IsTrackedByRepo = async (componentPath, fileName) => {
    try {
        await execFileAsync('git', ['-C', componentPath, 'ls-files', '--error-unmatch', fileName], {
            timeout: TIMEOUTS.QUICK,
        });
        return true;
    } catch {
        return false;
    }
};

/**
 * Write the file for a fresh install when the folder has none. Never overwrites, and
 * never follows a symlink at the target (`wx` + O_NOFOLLOW).
 *
 * @returns `'written'`, or `'present'` when a file (the repo's own, say) is already there
 */
export async function writeNodeVersionFileIfAbsent(
    componentPath: string,
    major: string,
): Promise<'written' | 'present'> {
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW;
    let handle;
    try {
        handle = await fsPromises.open(path.join(componentPath, NODE_VERSION_FILE), flags);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'present';
        throw err;
    }
    try {
        await handle.writeFile(nodeVersionFileContent(major), 'utf-8');
    } finally {
        await handle.close();
    }
    return 'written';
}

type NodeVersionRefresh = 'absent' | 'unchanged' | 'rewritten' | 'skipped';

/**
 * Bring an existing project's file up to the catalog's major, on proof it is ours.
 *
 * Absent stays absent: this never creates the file. A file already at the catalog's
 * major is left alone. Anything else is skipped and logged, never overwritten.
 */
export async function refreshNodeVersionFile(
    args: { componentPath: string; componentId: string; major: string },
    logger: Logger,
    isTracked: IsTrackedByRepo = isTrackedByRepo,
): Promise<NodeVersionRefresh> {
    const { componentPath, componentId, major } = args;
    const filePath = path.join(componentPath, NODE_VERSION_FILE);
    const onDisk = await readIfPresent(filePath);
    if (onDisk === undefined) return 'absent';

    const wanted = nodeVersionFileContent(major);
    if (onDisk === wanted) return 'unchanged';

    const where = `${componentId}/${NODE_VERSION_FILE}`;
    if (!(PREVIOUSLY_WRITTEN[componentId] ?? []).includes(onDisk)) {
        logger.info(`[Components] Kept ${where} — not what Demo Builder wrote; leaving your version in place`);
        return 'skipped';
    }
    if (await isTracked(componentPath, NODE_VERSION_FILE)) {
        logger.info(`[Components] Kept ${where} — the component's own repository tracks it`);
        return 'skipped';
    }

    // No O_CREAT: the file was just read, and a file removed since is not recreated.
    let handle;
    try {
        handle = await fsPromises.open(filePath, fsConstants.O_WRONLY | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ELOOP' && code !== 'ENOENT') throw err;
        logger.info(`[Components] Kept ${where} — ${code === 'ELOOP' ? 'it is a symlink' : 'it went away'}`);
        return 'skipped';
    }
    try {
        await handle.writeFile(wanted, 'utf-8');
    } finally {
        await handle.close();
    }
    logger.info(`[Components] Updated ${where} to Node ${major}`);
    return 'rewritten';
}

/** The components an earlier install wrote a now-outdated version for. */
function hadEarlierNodeVersion(componentId: string): boolean {
    return componentId in PREVIOUSLY_WRITTEN;
}

/**
 * The catalog's Node major per component id, across every section that names one
 * (`configuration.nodeVersion` in components.json).
 */
export async function catalogNodeVersions(extensionPath: string): Promise<Record<string, string>> {
    const registryPath = path.join(extensionPath, 'src', 'features', 'components', 'config', 'components.json');
    const raw = await new ConfigurationLoader<RawComponentRegistry>(registryPath).load({
        validationErrorMessage: 'Failed to read the component catalog',
    });
    const versions: Record<string, string> = {};
    for (const section of [raw.frontends, raw.backends, raw.mesh, raw.dependencies, raw.tools]) {
        for (const [id, def] of Object.entries(section ?? {})) {
            const major = def.configuration?.nodeVersion;
            if (major !== undefined) versions[id] = String(major);
        }
    }
    return versions;
}

/**
 * The activation sweep's pass over one project: every installed component an earlier
 * install wrote an outdated `.node-version` for, refreshed on proof it is ours.
 *
 * @returns How many files were rewritten and how many were kept
 */
export async function refreshProjectNodeVersionFiles(
    instances: Record<string, ComponentInstance> | undefined,
    catalog: Record<string, string>,
    logger: Logger,
    isTracked: IsTrackedByRepo = isTrackedByRepo,
): Promise<{ rewritten: number; skipped: number }> {
    const tally = { rewritten: 0, skipped: 0 };
    for (const [componentId, instance] of Object.entries(instances ?? {})) {
        const major = catalog[componentId];
        if (!instance.path || !major || !hadEarlierNodeVersion(componentId)) continue;
        const outcome = await refreshNodeVersionFile(
            { componentPath: instance.path, componentId, major },
            logger,
            isTracked,
        );
        if (outcome === 'rewritten') tally.rewritten += 1;
        if (outcome === 'skipped') tally.skipped += 1;
    }
    return tally;
}

async function readIfPresent(filePath: string): Promise<string | undefined> {
    try {
        return await fsPromises.readFile(filePath, 'utf-8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw err;
    }
}
