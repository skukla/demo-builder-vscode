/**
 * The one place a datapack engine is chosen and built (DI-5).
 *
 * Every write builds its engine here: the Data Installer screen's import, dry run and removal,
 * the wizard's creation install, and project reset's removal. The choice is the
 * `demoBuilder.dataInstaller.engine` setting, read by the caller and passed in, so this stays a
 * plain function the tests drive with either id.
 *
 * - `service`: the Data Installer service does the work (`buildServiceEngine`, unchanged).
 * - `demo-builder`: Demo Builder does it, over the project's own signed Commerce access (the
 *   client the ERP work opens, `commerceClientForProject`), reading the pack's rows from the
 *   service's catalog through the reader the datapack file and library tools use
 *   (`readPackFromStore`). Reading from the library and from a file comes with step 03's
 *   item 6.
 *
 * @module features/data-installer/services/buildDatapackEngine
 */

import type { DatapackId, DatapackStoreName } from '../types';
import type { DataInstallerClient } from './dataInstallerClient';
import { type DatapackEngine, type DatapackEngineId, type ServiceEngineAccess, buildServiceEngine } from './datapackEngine';
import { readPackFromStore } from './datapackTransfer';
import { type DemoBuilderEngineDeps, demoBuilderEngine } from './demoBuilderEngine/engine';
import { type RecordFiles, nodeRecordFiles, readInstallRecord } from './demoBuilderEngine/installRecord';
import type { PackItems } from './demoBuilderEngine/runPack';
import type { CredentialStore } from '@/features/ai/server/savedRestCredential';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { commerceClientForProject } from '@/features/project-creation/services/erpFillForProject';
import type { Project } from '@/types/base';

/** What either engine needs: the service's access, and the project Demo Builder's writes into. */
export interface DatapackEngineAccess extends ServiceEngineAccess {
    project: Project;
    /** The service catalog's reads, where Demo Builder's engine reads a pack's rows from. */
    catalog: Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'>;
    /** The datapack library's reads, opened only when a pack is read from it. */
    libraryCatalog?: () => Promise<Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'>>;
    authManager: AuthenticationService | undefined;
    secrets: CredentialStore | undefined;
}

/**
 * A pack's rows by kind, read from the store that holds it. Shared by the engine and by the
 * preview and save of store changes (step 05), which read a pack the same way.
 */
export async function readPackItems(
    access: Pick<DatapackEngineAccess, 'catalog' | 'libraryCatalog'>,
    id: DatapackId,
    source: DatapackStoreName,
): Promise<PackItems> {
    if (source === 'library' && !access.libraryCatalog) throw new Error('The datapack library cannot be read from here.');
    const catalog = source === 'library' && access.libraryCatalog ? await access.libraryCatalog() : access.catalog;
    const file = await readPackFromStore(catalog, id, source);
    return Object.fromEntries(file.items.map((item) => [item.dataType, item.records]));
}

/**
 * The chosen engine, built for one project.
 *
 * @param id - which engine, from `selectedDatapackEngine()`
 * @param access - the service's access and the project
 * @param log - one line per call, for Debug Logs
 */
export function buildDatapackEngine(id: DatapackEngineId, access: DatapackEngineAccess, log: (line: string) => void): DatapackEngine {
    if (id === 'service') return buildServiceEngine(access, log);
    return demoBuilderEngine({
        commerce: projectCommerce(access),
        readPack: (pack, _dataTypes, source) => readPackItems(access, pack, source),
        projectPath: access.project.path,
        log,
    });
}

/**
 * The project's own signed Commerce access, the one the ERP work opens, or why there is none.
 * Shared by the engine and by the preview and save of store changes (step 05).
 */
export function projectCommerce(
    access: Pick<DatapackEngineAccess, 'project' | 'authManager' | 'secrets'>,
): DemoBuilderEngineDeps['commerce'] {
    const { authManager } = access;
    return async () =>
        authManager
            ? commerceClientForProject(access.project, authManager, access.secrets)
            : { refusal: 'Adobe sign-in is required to write to this project\'s store.' };
}

/**
 * Which engine removes a pack from a project: the one that installed it. Demo Builder's engine
 * leaves its install record beside the project, so a record there means it installed the pack;
 * otherwise the service did. Removal never goes through the other one, so nothing either
 * created is stranded or taken by the wrong hand (plan, "The shape").
 *
 * @throws InstallRecordError when a record is there but cannot be read: guessing would remove
 *   nothing and call it done
 */
export async function engineThatInstalled(
    projectPath: string,
    pack: DatapackId,
    files: RecordFiles = nodeRecordFiles,
): Promise<DatapackEngineId> {
    return (await readInstallRecord(files, projectPath, pack)) ? 'demo-builder' : 'service';
}
