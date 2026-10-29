/**
 * The gate every datapack WRITE passes before a request is built.
 *
 * Import, validate, reset and both export calls open the same way: the Data
 * Installer must be configured and signed in, a project must be open, and that
 * project must have a Commerce backend to write to. Only the verb in the copy
 * differs between import and export. One gate, so a new write handler cannot
 * skip a check and the two sides cannot drift (PL-69 pair 25).
 *
 * It no longer asks for Commerce credentials. The service stopped accepting a
 * caller's on purpose (DEMOSYS-1698) and signs in with its own, so requiring a
 * pair here only refused writes the service would have run (DI-6, 2026-10-28).
 *
 * The payload checks stay with each caller: they differ on purpose (an export
 * has no target scope; an import has no selections).
 *
 * @module features/data-installer/handlers/datapackWriteGate
 */

import { commerceBackendOf, type CommerceBackend } from '../services/commerceBackend';
import type { DataInstallerClient } from '../services/dataInstallerClient';
import type { JobStatusSource } from '../services/importJobRunner';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Which write is asking; picks the copy a refusal shows. */
export type DatapackWrite = 'import' | 'export';

/** What a write needs once the gate has passed. */
export interface DatapackWriteAccess {
    baseUrl: string;
    getToken: () => Promise<string>;
    /** The SC's IMS org code, for the gateway (`dataInstallerSignIn`). */
    orgCode?: string;
    /** The service's job reads, for the service engine (`datapackEngine`). */
    jobs: JobStatusSource;
    /** The service catalog's reads, where Demo Builder's engine reads a pack's rows from. */
    catalog: Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'>;
    project: Project;
    /** The project's Commerce backend: what an export's scope header is chosen by. */
    backend: CommerceBackend;
}

/** The refusal when no project is open, verbatim per write. */
const NO_PROJECT: Record<DatapackWrite, string> = {
    import: 'Open a project before importing a datapack.',
    export: 'Open a project before exporting.',
};

/** The refusal when the project has no Commerce backend, verbatim per write. */
const NO_BACKEND: Record<DatapackWrite, string> = {
    import: 'This project has no Adobe Commerce backend, so there is nothing to import into.',
    export: 'This project has no Adobe Commerce backend, so there is nothing to export from.',
};

/**
 * Open a datapack write: access, project, backend, in that order.
 *
 * @param context - The handler context the write was called with
 * @param write - Which write is asking; picks the refusal copy
 * @returns What the write needs, or the response to return instead
 */
export async function resolveDatapackWriteAccess(
    context: HandlerContext,
    write: DatapackWrite,
): Promise<DatapackWriteAccess | { response: HandlerResponse }> {
    const access = await resolveDataInstallerAccess(context);
    if (!access.ok) {
        return { response: access.response };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { response: { success: false, error: NO_PROJECT[write] } };
    }

    const backend = commerceBackendOf(project);
    if (!backend) {
        return {
            response: { success: false, error: NO_BACKEND[write], code: ErrorCode.INVALID_OPERATION },
        };
    }

    return {
        baseUrl: access.baseUrl,
        getToken: access.getToken,
        orgCode: access.orgCode,
        jobs: access.client,
        catalog: access.client,
        project,
        backend,
    };
}
