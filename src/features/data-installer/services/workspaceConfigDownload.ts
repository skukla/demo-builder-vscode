/**
 * Targeted workspace-config download — the impure half of credential
 * provisioning, kept out of `accsCredentialProvisioner` so that module stays
 * pure orchestration.
 *
 * EXPLICIT ids on the command, never the selected CLI context: the selected
 * workspace 404'd live ("Workspace not found") while the project's real binding
 * was fine. The downloaded JSON carries the client secret, so the temp-file
 * hygiene is the `runtimeCredentials.ts` pattern — private temp dir, deleted in
 * `finally`, content only ever RETURNED, never logged.
 *
 * @module features/data-installer/services/workspaceConfigDownload
 */

import * as crypto from 'crypto';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { CommandExecutor } from '@/core/shell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
} from '@/core/validation/validators/AdobeResourceValidator';

export interface WorkspaceTarget {
    orgId: string;
    projectId: string;
    workspaceId: string;
}

/**
 * Download one workspace's Console configuration and return the raw JSON.
 *
 * @throws when the download exits non-zero or produces no file — the caller
 *         (the provisioner) turns throws into user-facing reasons.
 */
export async function downloadWorkspaceConfigJson(
    executor: CommandExecutor,
    target: WorkspaceTarget,
): Promise<string> {
    // SECURITY: these ids are interpolated into a command that CommandExecutor
    // runs through a SHELL (it forces `shell: DEFAULT_SHELL` for anything
    // starting `aio `). They come from `project.adobe.*`, read verbatim out of a
    // `.demo-builder.json` on disk — and any folder containing one is picked up
    // by the projects scanner, so a shared demo folder is an injection vector.
    // Quoting would not be enough: `$(...)` survives double quotes.
    // `core/shell/README.md` requires shell-true call sites to validate; this is
    // that validation.
    validateOrgId(target.orgId);
    validateProjectId(target.projectId);
    validateWorkspaceId(target.workspaceId);

    const scratchDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'db-di-ws-'));
    const filePath = path.join(scratchDir, `ws-${crypto.randomBytes(6).toString('hex')}.json`);

    try {
        const result = await executor.execute(
            `aio console workspace download "${filePath}" ` +
                `--orgId ${target.orgId} --projectId ${target.projectId} --workspaceId ${target.workspaceId}`,
            { timeout: TIMEOUTS.LONG },
        );
        if (result.code !== 0) {
            // The stderr may echo ids; keep the thrown message generic.
            throw new Error(
                'Could not download the workspace configuration. Check the Adobe project binding and sign-in.',
            );
        }
        return await fsPromises.readFile(filePath, 'utf-8');
    } finally {
        // The file holds the client secret — always remove it.
        await fsPromises.rm(scratchDir, { recursive: true, force: true }).catch(() => {
            /* best-effort cleanup */
        });
    }
}
