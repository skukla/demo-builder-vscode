/**
 * The one place the datapack engine is built (DI-5).
 *
 * Every write builds its engine here: the Data Installer screen's import, dry run and removal,
 * the wizard's creation install, and project reset's removal. Demo Builder does the work, over
 * the project's own signed Commerce access (the client the ERP work opens,
 * `commerceClientForProject`), reading the pack's rows from the store that holds it (Demo
 * Builder's datapack store first, else the Data Installer's catalog, `readPackItems`) through the
 * reader the datapack file and library tools use (`readPackFromStore`).
 *
 * The Data Installer service's own engine, and the setting that chose between the two, were
 * deleted on 2026-11-06 (DI-12): the service had ignored the Commerce credentials a caller sends
 * since 2026-10-27, so it installed nothing for us.
 *
 * @module features/data-installer/services/buildDatapackEngine
 */

import type { DataInstallerClient } from './dataInstallerClient';
import type { DatapackEngine } from './datapackEngine';
import { readPackFromStore } from './datapackTransfer';
import { type DemoBuilderEngineDeps, demoBuilderEngine } from './demoBuilderEngine/engine';
import { type RecordFiles, nodeRecordFiles, readInstallRecord } from './demoBuilderEngine/installRecord';
import type { PackItems } from './demoBuilderEngine/runPack';
import { nodeActivityFiles, recordJobEnd } from './engineActivityLog';
import { deriveImportInstance } from './importInstance';
import { type LayerReads, findSettingsLayer } from './settingsLayer';
import { openCommerceAdmin } from '@/core/utils/commerceAdmin';
import { askDuringOperation } from '@/core/vscode/operationPrompt';
import type { CredentialStore } from '@/features/ai/server/savedRestCredential';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { commerceClientForProject } from '@/features/project-creation/services/erpFillForProject';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What the engine needs: the project it writes into, and where a pack's rows are read from. */
export interface DatapackEngineAccess {
    project: Project;
    /** The service catalog's reads, where Demo Builder's engine reads a pack's rows from. */
    catalog: Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'>;
    /** The datapack library's reads, opened only when a pack or its settings layer is read from it. */
    libraryCatalog?: () => Promise<Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'> & LayerReads>;
    authManager: AuthenticationService | undefined;
    secrets: CredentialStore | undefined;
}

/**
 * A pack's rows by kind. Demo Builder's datapack store comes first whatever the pack names, so a
 * project made from the Data Installer's Frescopa still installs from the same name and version
 * here, whether or not the Data Installer answers, and every SC gets the same data. Only a pack the
 * store does not hold is read from the Data Installer. Shared by the engine and by the preview and
 * save of store changes (step 05), which read a pack the same way.
 */
export async function readPackItems(
    access: Pick<DatapackEngineAccess, 'catalog' | 'libraryCatalog'>,
    id: DatapackId,
    source: DatapackStoreName,
): Promise<PackItems> {
    if (source === 'library' && !access.libraryCatalog) throw new Error('The datapack library cannot be read from here.');
    const rows = (file: Awaited<ReturnType<typeof readPackFromStore>>): PackItems =>
        Object.fromEntries(file.items.map((item) => [item.dataType, item.records]));
    if (source === 'library') return rows(await readPackFromStore(await (access.libraryCatalog as NonNullable<typeof access.libraryCatalog>)(), id, 'library'));
    if (access.libraryCatalog) {
        try {
            return rows(await readPackFromStore(await access.libraryCatalog(), id, 'library'));
        } catch {
            // Not held there, or the store did not answer: the Data Installer may still have it.
        }
    }
    return rows(await readPackFromStore(access.catalog, id, source));
}

/**
 * How Demo Builder's engine, its preview and a save find a pack's settings layer (step 09): in the
 * library, whichever store holds the pack.
 */
export function layerFinder(access: Pick<DatapackEngineAccess, 'libraryCatalog'>): Pick<DemoBuilderEngineDeps, 'findLayer'> {
    const { libraryCatalog } = access;
    return libraryCatalog ? { findLayer: async (pack) => findSettingsLayer(await libraryCatalog(), pack.name) } : {};
}

/**
 * The engine, built for one project.
 *
 * @param access - the project and the stores a pack is read from
 * @param log - one line per call, for Debug Logs
 */
export function buildDatapackEngine(access: DatapackEngineAccess, log: (line: string) => void): DatapackEngine {
    // Each finished job goes in the project's activity log (step 14): the service logs its own runs.
    const writeActivity = recordJobEnd({
        files: nodeActivityFiles,
        projectPath: access.project.path,
        commerceInstance: deriveImportInstance(access.project.componentConfigs),
        log,
    });
    return demoBuilderEngine({
        commerce: projectCommerce(access),
        readPack: (pack, source) => readPackItems(access, pack, source),
        projectPath: access.project.path,
        log,
        onJobEnd: (end) => void writeActivity(end),
        ...layerFinder(access),
        // Step 12: the one Admin step a pack can leave is asked where the SC is looking (PL-59).
        asker: {
            ask: (question, ...actions) => askDuringOperation(question, ...actions),
            openAdmin: async () => {
                // The question that offered it has closed, so the notification shows Chrome starting.
                const opening = await openCommerceAdmin(access.project, { notify: true });
                if (opening.outcome !== 'opened') log(`could not open the Admin: ${opening.outcome === 'no-url' ? 'no Admin URL is set for this project' : 'its URL is not valid'}`);
            },
        },
    });
}

/**
 * The store-wide scope, as the Store header names it. The service writes there too (catalog
 * spec §0), so a pack's values are the store's defaults on whichever website it lands.
 */
const STORE_WIDE = 'all';

/**
 * The project's own signed Commerce access, the one the ERP work opens, or why there is none.
 * Shared by the engine and by the preview and save of store changes (step 05).
 *
 * It reads and writes store-wide, never through the project's own store view: a pack lands on
 * the website and store view the install names, which need not be the project's. Through the
 * project's, a reinstall's price change landed on JustRite's store view while the test website
 * kept the old price (live, 2026-10-29).
 */
export function projectCommerce(
    access: Pick<DatapackEngineAccess, 'project' | 'authManager' | 'secrets'>,
): DemoBuilderEngineDeps['commerce'] {
    const { authManager } = access;
    return async () =>
        authManager
            ? commerceClientForProject(access.project, authManager, access.secrets, undefined, STORE_WIDE)
            : { refusal: 'Adobe sign-in is required to write to this project\'s store.' };
}

/**
 * Whether Demo Builder installed a pack in a project: its engine leaves an install record beside
 * the project. Without one, the Data Installer service installed it, before its engine was
 * deleted, and only Clear Demo Data can take out what it added (`SERVICE_REMOVAL_UNAVAILABLE`):
 * Demo Builder never removes by name what it has no record of making.
 *
 * @throws InstallRecordError when a record is there but cannot be read: guessing would remove
 *   nothing and call it done
 */
export async function installedByDemoBuilder(projectPath: string, pack: DatapackId, files: RecordFiles = nodeRecordFiles): Promise<boolean> {
    return (await readInstallRecord(files, projectPath, pack)) !== undefined;
}
