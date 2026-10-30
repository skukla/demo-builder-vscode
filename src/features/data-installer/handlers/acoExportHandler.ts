/**
 * "Make an ACO pack": the export screen's and `start_datapack_export`'s ACO choice
 * (`aco: true`), datapack-engine step 14 item 19 (PL-60). Reached through `start-datapack-export`
 * so the human and the agent export from the one place they already do.
 *
 * Unlike the Commerce export (the Data Installer service's, into the shared catalog), this runs
 * on Demo Builder's own reads of the project's store and writes into the SC's datapack LIBRARY,
 * private to them, whichever engine is chosen. Undone by deleting the pack from the library
 * (`delete-library-datapack`). Nothing is written to Commerce.
 *
 * It opens as every datapack write does (`resolveDatapackWriteAccess`), then checks the sign-in
 * is in the org that owns the store (`orgGuard`, adobe-org-context), since it reads the store
 * with the project's own credential.
 *
 * @module features/data-installer/handlers/acoExportHandler
 */

import { type AcoExportOutcome, exportAcoPack } from '../services/acoExport/acoPackExport';
import { type AcoCommerce, AcoExportError } from '../services/acoExport/acoStoreReads';
import { DatapackStoreWriter } from '../services/datapackStoreWriter';
import { writePackToStore } from '../services/datapackTransfer';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { resolveDatapackWriteAccess } from './datapackWriteGate';
import { orgGuard } from '@/features/authentication/services/projectOrgGuard';
import { commerceClientForProject } from '@/features/project-creation/services/erpFillForProject';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** The store-wide scope the engine reads in (`projectCommerce`): Commerce's `all`. */
const STORE_WIDE = 'all';

/** What the ACO choice is sent: the pack to make, and from which store views. */
export interface AcoExportPayload {
    datapackName?: string;
    version?: string;
    /** Store view codes; none means every one. */
    storeViews?: string[];
    /** ACO kinds; none means all five. */
    dataTypes?: string[];
}

/** The project's Commerce reads: store-wide, or through one store view's `Store` header. */
function projectReads(context: HandlerContext, project: Project): AcoCommerce {
    const { authManager } = context;
    return async (storeView) => {
        if (!authManager)
            return { refusal: "Adobe sign-in is required to read this project's store." };
        const client = await commerceClientForProject(
            project,
            authManager,
            context.context?.secrets,
            undefined,
            storeView ?? STORE_WIDE,
        );
        return 'refusal' in client ? client : client.get;
    };
}

/** Each kind's verdict in the User Logs, a failure as a warning in its own words. */
function logVerdicts(context: HandlerContext, outcome: AcoExportOutcome, pack: string): void {
    for (const type of outcome.perType) {
        if (type.success)
            context.logger.info(`${LOG_PREFIX} Made ${type.exported} ${type.dataType} for ${pack}`);
        else
            context.logger.warn(
                `${LOG_PREFIX} ${type.dataType} for ${pack} could not be made: ${type.reason ?? 'no reason given'}`,
            );
    }
}

/**
 * Make the ACO pack and save it into the library.
 *
 * @returns the outcome per kind, in the shape the export screen reads, and the sentence as the note
 */
export async function startAcoExport(
    context: HandlerContext,
    payload: AcoExportPayload | undefined,
): Promise<HandlerResponse> {
    const name = payload?.datapackName;
    const version = payload?.version;
    if (!name || !version)
        return {
            success: false,
            error: 'An export needs a datapack name and a version — together they name what it writes.',
        };
    const gate = await resolveDatapackWriteAccess(context, 'export');
    if ('response' in gate) return gate.response;
    if (context.authManager) {
        const mismatch = await orgGuard(context, gate.project, context.authManager);
        if (mismatch)
            return { success: false, error: mismatch.error, code: ErrorCode.ORG_MISMATCH };
    }
    const library = await resolveDataInstallerAccess(context, 'library');
    if (!library.ok) return library.response;
    const writer = new DatapackStoreWriter({
        baseUrl: library.baseUrl,
        getToken: library.getToken,
        ...(library.orgCode ? { orgCode: library.orgCode } : {}),
        log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
    });
    const id = { name, version };
    try {
        const outcome = await exportAcoPack(
            {
                commerce: projectReads(context, gate.project),
                log: (line) => context.debugLogger.debug(`${LOG_PREFIX} ${line}`),
            },
            {
                id,
                ...(payload.storeViews ? { storeViews: payload.storeViews } : {}),
                ...(payload.dataTypes ? { dataTypes: payload.dataTypes } : {}),
            },
            (file) => writePackToStore(writer, file),
        );
        logVerdicts(context, outcome, `${name}@${version}`);
        return { success: true, note: outcome.sentence, data: outcome };
    } catch (error) {
        if (error instanceof AcoExportError) return { success: false, error: error.message };
        context.logger.warn(
            `${LOG_PREFIX} The ACO pack ${name}@${version} could not be made: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
            success: false,
            error: 'The ACO pack could not be made. Details are in Debug Logs.',
            code: ErrorCode.UNKNOWN,
        };
    }
}
