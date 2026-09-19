/**
 * Keeping `aio app deploy`'s "already deployed" record honest when an app moves.
 *
 * THE RECORD. `aio app deploy` writes `dist/last-deployed-actions.json` in the app's
 * folder — one content hash per action — and skips every action whose hash matches
 * (`aio-lib-runtime` `deployWsk`, read 2026-09-19). The record does not say WHERE
 * those actions were deployed.
 *
 * WHAT THAT BROKE. Moving Bodea to another Adobe project pointed the same app folder
 * at a new Runtime namespace. The record still described the old one, so the CLI sent
 * nothing it considered deployed: the new namespace got 2 of the 10 `app-management`
 * actions (only those whose code had changed since), and Commerce's post-deploy hook
 * answered 404 for the missing `installation` action. The deploy log said it plainly:
 * "Deployment completed successfully … No actions deployed".
 *
 * THE FIX. Beside Adobe's record, note which namespace it describes. A deploy to any
 * other namespace — or with no note yet — deletes Adobe's record first, so every
 * action is sent. A deploy to the same namespace keeps the CLI's fast path. The CLI's
 * own bypass, `--force-deploy`, is not used: it also changes how an app published to
 * Adobe Exchange is treated.
 *
 * @module features/app-builder/services/deployRecord
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/** Adobe's record, written by `aio app deploy`. */
const ADOBE_RECORD = path.join('dist', 'last-deployed-actions.json');
/** Ours: the namespace Adobe's record describes. */
const TARGET_NOTE = path.join('dist', '.demo-builder-deploy-target');

/** The namespace last noted for this app, or `undefined` when there is no readable note. */
async function readNote(appRoot: string): Promise<string | undefined> {
    try {
        const text = await fsPromises.readFile(path.join(appRoot, TARGET_NOTE), 'utf-8');
        return typeof text === 'string' ? text.trim() : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Before a deploy: when the app was last deployed somewhere else (or we cannot tell
 * where), delete Adobe's "already deployed" record so every action is sent.
 */
export async function forgetDeployRecordOnNewTarget(
    appRoot: string,
    namespace: string,
    logger: Logger,
): Promise<void> {
    const noted = await readNote(appRoot);
    if (noted === namespace) return;
    await fsPromises.rm(path.join(appRoot, ADOBE_RECORD), { force: true });
    logger.debug(
        `[App Builder] deploying to ${namespace}${noted ? ` (was ${noted})` : ''}: every action is sent`,
    );
}

/** After a successful deploy: note which namespace Adobe's record now describes. */
export async function rememberDeployTarget(appRoot: string, namespace: string, logger: Logger): Promise<void> {
    try {
        await fsPromises.mkdir(path.join(appRoot, 'dist'), { recursive: true });
        await fsPromises.writeFile(path.join(appRoot, TARGET_NOTE), `${namespace}\n`);
    } catch (error) {
        // Without the note the next deploy simply sends everything again — slower, still right.
        logger.debug(`[App Builder] could not note the deploy target: ${toError(error).message}`);
    }
}
