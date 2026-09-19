/**
 * A failed deploy's WHOLE output, kept in a file.
 *
 * Debug Logs hold only the last lines of `aio app deploy`, and on 2026-09-19 the
 * cause of a failure (an app's package half-created in a new namespace) was in the
 * part those lines cut off. An agent cannot read an output channel; it can read a
 * file. Tokens are masked as they are for Debug Logs.
 *
 * @module features/app-builder/services/deployFailureLog
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { aioOutputTail } from './runtimeCredentials';
import type { Logger } from '@/types/logger';
import { toError } from '@/types/typeGuards';

/**
 * Keep a failed deploy's whole output (tokens masked) in a file, and say where.
 * Best-effort: a log that cannot be written never changes the deploy's answer.
 */
export async function writeFailureLog(
    file: string | undefined,
    result: { stdout?: string; stderr?: string },
    logger: Logger,
): Promise<void> {
    if (!file) return;
    try {
        await fsPromises.mkdir(path.dirname(file), { recursive: true });
        await fsPromises.writeFile(file, aioOutputTail(result.stdout, result.stderr, Infinity) + '\n');
        logger.info(`[App Builder] The whole deploy output is in ${file}`);
    } catch (error) {
        logger.debug(`[App Builder] could not write the deploy output to ${file}: ${toError(error).message}`);
    }
}

