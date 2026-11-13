/**
 * The failed-install record (step-04 S7), typed to the real interface so `typecheck:tests` rejects
 * an invented field. One project naming the pack, and the record for it.
 */

import type { DatapackInstallFailure, ProjectDatapack } from '@/types/datapack';

/** The datapack the project names and the failure is about. */
export const FAILED_PACK: ProjectDatapack = { name: 'bodea', version: '1.0.0', store: 'installer' };

/** A creation install of {@link FAILED_PACK} that ended partly installed. */
export const DATAPACK_INSTALL_FAILURE: DatapackInstallFailure = {
    name: 'bodea',
    version: '1.0.0',
    reason: 'Products could not be installed.',
    at: '2026-11-12T10:00:00.000Z',
    retries: 0,
};
