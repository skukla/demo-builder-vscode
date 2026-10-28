/**
 * The datapack engine: what installs a pack into Commerce, removes it again, and reports
 * how far a job has got (DI-5, owner 2026-10-27).
 *
 * Every write the Data Installer screen, the wizard's creation step, project reset and the
 * agent tools make goes through one of these. Today there is one engine, the service's: the
 * Data Installer service does the work and Demo Builder asks it how it is going. The second,
 * Demo Builder's own, writes the pack into Commerce from the extension, because since
 * 2026-10-27 the service ignores the Commerce credentials a caller sends and every dry run
 * and import it is given fails pre-flight. Both sit behind this interface so the screens
 * neither know nor care which one ran, and so returning to the service, if it is fixed, is a
 * matter of which engine is chosen.
 *
 * Reading the catalog (packs, their items) is not an engine's job: both engines read packs
 * from the service's catalog through `DataInstallerClient`.
 *
 * @module features/data-installer/services/datapackEngine
 */

import type { DatapackEngineId, ImportStart, ValidationResult } from '../types';

export type { DatapackEngineId };
import type { DataInstallerSignIn } from './dataInstallerSignIn';
import { type CredentialCheck, DataInstallerWriteClient, type ImportRequest } from './dataInstallerWriteClient';
import type { JobStatusSource } from './importJobRunner';


/**
 * Installs, removes, and reports on jobs. A job is started by `startImport` or
 * `startDelete`, which answer with the job's id; the job is followed through
 * `getJobStatus` and `getJobFailureReason`, as `watchImportJob` does for either engine.
 */
export interface DatapackEngine extends JobStatusSource {
    readonly id: DatapackEngineId;
    /** Whether the credentials in the request reach its Commerce instance. Writes nothing. */
    checkCredentials(request: ImportRequest): Promise<CredentialCheck>;
    /** The dry run: whether the request would be accepted. Writes nothing. */
    validateImport(request: ImportRequest): Promise<ValidationResult>;
    /** Start installing the pack's data types into the instance. */
    startImport(request: ImportRequest): Promise<ImportStart>;
    /** Start removing what an install of this pack put there. */
    startDelete(request: ImportRequest): Promise<ImportStart>;
}

/** The parts of the service's two clients the service engine drives. */
type ServiceWrites = Pick<DataInstallerWriteClient, 'checkCredentials' | 'validateImport' | 'startImport' | 'startDelete'>;

/**
 * The service engine: the Data Installer service does the work. Writes go through its
 * write client; job progress comes from its read client, the only one that can answer.
 *
 * @param writes - the write client
 * @param jobs - the read client's job reads
 * @returns the engine
 */
export function serviceEngine(writes: ServiceWrites, jobs: JobStatusSource): DatapackEngine {
    return {
        id: 'service',
        checkCredentials: (request) => writes.checkCredentials(request),
        validateImport: (request) => writes.validateImport(request),
        startImport: (request) => writes.startImport(request),
        startDelete: (request) => writes.startDelete(request),
        getJobStatus: (activationId) => jobs.getJobStatus(activationId),
        getJobFailureReason: (activationId) => jobs.getJobFailureReason(activationId),
    };
}

/** What building the service engine needs: where the service is, how to sign, and its job reads. */
export interface ServiceEngineAccess extends DataInstallerSignIn {
    baseUrl: string;
    /** The read client, the only one that can say how a job is going. */
    jobs: JobStatusSource;
}

/**
 * The service engine, built the one way every caller builds it: the Data Installer screen's
 * import and reset, and the wizard's creation install and project reset's removal. Those two
 * built the write client separately, line for line, before this.
 *
 * @param access - the service's address, sign-in and job reads
 * @param log - one line per service call, for Debug Logs: the first live dry run refused with
 *   an EMPTY channel, undebuggable for the SC and for us
 * @returns the engine
 */
export function buildServiceEngine(access: ServiceEngineAccess, log: (line: string) => void): DatapackEngine {
    const writes = new DataInstallerWriteClient({
        baseUrl: access.baseUrl,
        getToken: access.getToken,
        orgCode: access.orgCode,
        log,
    });
    return serviceEngine(writes, access.jobs);
}
