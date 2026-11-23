/**
 * The datapack engine: what installs a pack into Commerce, removes it again, and reports
 * how far a job has got (DI-5, owner 2026-10-27).
 *
 * Every write the Data Installer screen, the wizard's creation step, project reset and the
 * agent tools make goes through this. There is one engine, Demo Builder's own
 * (`demoBuilderEngine/engine.ts`), which writes the pack into Commerce from the extension over
 * the project's own access. The Data Installer service's engine, which asked the service to do
 * the writing, was deleted on 2026-11-06 (DI-12): since 2026-10-27 the service ignores the
 * Commerce credentials a caller sends, so it installed nothing for us. A pack the Data Installer
 * holds is still read from its catalog and installed by Demo Builder (`readPackItems`).
 *
 * @module features/data-installer/services/datapackEngine
 */

import type { ImportStart, ValidationResult } from '../types';
import type { JobStatusSource } from './importJobRunner';
import type { CredentialCheck, ImportRequest } from './importRequest';

/**
 * Installs, removes, and reports on jobs. A job is started by `startImport` or
 * `startDelete`, which answer with the job's id; the job is followed through
 * `getJobStatus` and `getJobFailureReason`, as `watchImportJob` does.
 */
export interface DatapackEngine extends JobStatusSource {
    /** Whether the credentials in the request reach its Commerce instance. Writes nothing. */
    checkCredentials(request: ImportRequest): Promise<CredentialCheck>;
    /** The dry run: whether the request would be accepted. Writes nothing. */
    validateImport(request: ImportRequest): Promise<ValidationResult>;
    /** Whether a removal of the request's pack would be accepted. Writes nothing. */
    validateRemoval(request: ImportRequest): Promise<ValidationResult>;
    /** Start installing the pack's data types into the instance. */
    startImport(request: ImportRequest): Promise<ImportStart>;
    /** Start removing what an install of this pack put there. */
    startDelete(request: ImportRequest): Promise<ImportStart>;
}
