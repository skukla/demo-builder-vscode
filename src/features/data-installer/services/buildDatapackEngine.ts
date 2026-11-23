/**
 * The one place the datapack engine is built (DI-5).
 *
 * Every write builds its engine here: the Data Installer screen's import, dry run and removal,
 * the wizard's creation install, and project reset's removal. Demo Builder does the work, over
 * the project's own signed Commerce access (the client the ERP work opens,
 * `commerceClientForProject`), reading the pack's rows from the store that holds it (Demo
 * Builder's datapack store first, else the Data Installer's catalog, `readPackItems`) through the
 * reader the datapack file and library tools use (`readPackFromStore`). A pack of ACO kinds goes
 * to the project's ACO instance through the one ACO client (`projectAco`, PL-60).
 *
 * The Data Installer service's own engine, and the setting that chose between the two, were
 * deleted on 2026-11-06 (DI-12): the service had ignored the Commerce credentials a caller sends
 * since 2026-10-27, so it installed nothing for us.
 *
 * @module features/data-installer/services/buildDatapackEngine
 */

import { createAcoAdminClient } from './aco/acoAdminClient';
import type { BuyerBooks } from './aco/acoBuyerBooks';
import { createAcoClient } from './aco/acoClient';
import { type AcoConnectorState, readAcoConnector } from './aco/acoConnector';
import type { AcoAccessSource } from './aco/acoJobs';
import { AcoStoreReads } from './acoExport/acoStoreReads';
import { type ReadWindowUse, throughReadWindow } from './commerceReadWindow';
import type { DataInstallerClient } from './dataInstallerClient';
import type { DatapackEngine } from './datapackEngine';
import { readPackFromStore } from './datapackTransfer';
import { demoBuilderEngine } from './demoBuilderEngine/engine';
import type { DemoBuilderEngineDeps } from './demoBuilderEngine/engineDeps';
import { type RecordFiles, nodeRecordFiles, readInstallRecord } from './demoBuilderEngine/installRecord';
import type { PackItems } from './demoBuilderEngine/runPack';
import { nodeActivityFiles, recordJobEnd } from './engineActivityLog';
import { deriveImportInstance } from './importInstance';
import { type NameMemory, rememberedPackName } from './packNames';
import { cachedPackRead } from './packReadCache';
import { type LayerReads, findSettingsLayer } from './settingsLayer';
import { openCommerceAdmin } from '@/core/utils/commerceAdmin';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { startModalRun } from '@/core/vscode/operationProgress';
import { askDuringOperation, withModalAsking } from '@/core/vscode/operationPrompt';
import type { CredentialStore } from '@/features/ai/server/savedRestCredential';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { readAcoCredential } from '@/features/components/services/acoCredentialStore';
import { acoSettingsProblem, readAcoSettings } from '@/features/components/services/acoSettings';
import { resolveInstallTarget } from '@/features/data-installer/installTarget';
import { buildConfigGeneratorParams } from '@/features/eds/services/storefrontConfigParams';
import { commerceClientForProject } from '@/features/project-creation/services/erpFillForProject';
import type { AcoCredential, AcoStorefrontSettings } from '@/types/aco';
import type { Project } from '@/types/base';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type { HandlerContext } from '@/types/handlers';

/** What the engine needs: the project it writes into, and where a pack's rows are read from. */
export interface DatapackEngineAccess {
    project: Project;
    /** The service catalog's reads, where Demo Builder's engine reads a pack's rows from. */
    catalog: Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'>;
    /** The datapack library's reads, opened only when a pack or its settings layer is read from it. */
    libraryCatalog?: () => Promise<Pick<DataInstallerClient, 'getDatapackDetail' | 'getDataItem'> & LayerReads>;
    authManager: AuthenticationService | undefined;
    secrets: CredentialStore | undefined;
    /** Where the SC's pack names are remembered, so the engine's sentences name a pack as they know it. */
    memory?: NameMemory;
}

/**
 * A pack's rows by kind. Demo Builder's datapack store comes first whatever the pack names, so a
 * project made from the Data Installer's Frescopa still installs from the same name and version
 * here, whether or not the Data Installer answers, and every SC gets the same data. Only a pack the
 * store does not hold is read from the Data Installer. Shared by the engine and by the preview and
 * save of store changes (step 05), which read a pack the same way.
 */
export function readPackItems(
    access: Pick<DatapackEngineAccess, 'catalog' | 'libraryCatalog'>,
    id: DatapackId,
    source: DatapackStoreName,
): Promise<PackItems> {
    // Kept a few minutes and shared by every caller (`packReadCache`, walk F82): about 9 s for Luma.
    return cachedPackRead(id, source, () => readPackItemsNow(access, id, source));
}

/** The read itself, from the store first, then the Data Installer. */
async function readPackItemsNow(
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

type SendToScreen = HandlerContext['sendMessage'];

/**
 * Run a job as the operation the datapack window shows (`DATAPACK_OPERATION_ID`), so a question
 * it asks, the one Admin step a pack can leave, appears in that window with its title and
 * buttons (PL-59). Without this the window's run had no host, and the question fell back to an
 * untitled notification in the corner mid-install (walk F150, release test 1.4).
 */
function hostedIn(screen: SendToScreen): (work: () => Promise<void>) => Promise<void> {
    return (work) => {
        startModalRun(DATAPACK_OPERATION_ID, screen);
        return withModalAsking(DATAPACK_OPERATION_ID, work);
    };
}

/**
 * The engine, built for one project.
 *
 * @param access - the project and the stores a pack is read from
 * @param log - one line per call, for Debug Logs
 * @param screen - the window that started the job, which shows its questions (walk F150)
 */
export function buildDatapackEngine(
    access: DatapackEngineAccess,
    log: (line: string) => void,
    screen?: SendToScreen,
): DatapackEngine {
    // Each finished job goes in the project's activity log (step 14): the service logs its own runs.
    const instance = deriveImportInstance(access.project.componentConfigs);
    const writeActivity = recordJobEnd({
        files: nodeActivityFiles,
        projectPath: access.project.path,
        commerceInstance: instance,
        log,
    });
    return demoBuilderEngine({
        // The run reuses what a changes check just read: the save first and the uninstall's decision (F128).
        commerce: projectCommerce(access, { use: 'reuse', log }),
        aco: projectAco(access),
        readPack: (pack, source) => readPackItems(access, pack, source),
        projectPath: access.project.path,
        // Written on a new install record: a removal from another instance stops (step-07 D6).
        ...(instance ? { instance } : {}),
        log,
        nameOf: (pack) => (access.memory ? rememberedPackName(access.memory, pack.name) : undefined) ?? pack.name,
        onJobEnd: (end) => void writeActivity(end),
        ...(screen ? { hostRun: hostedIn(screen) } : {}),
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
 * Shared by the engine, by the preview and save of store changes (step 05), and by Clear.
 *
 * It WRITES store-wide, never through a store view: a pack lands on the website and store view the
 * install names, which need not be the project's. Through the project's, a reinstall's price change
 * landed on Tailspin's store view while the test website kept the old price (live, 2026-10-29).
 *
 * It READS through the store view the pack is installed to (`readScope`): a pack goes into one
 * website, so what is in the store is what that website shows. Read store-wide, a price the SC set
 * with the Admin's scope on the website was missed, the default still standing, and Save kept the
 * old one (owner, 2026-11-15). Where no value is set for the website, the two reads agree.
 *
 * @param access.records - where install records are read (tests); the project's folder otherwise
 */
export function projectCommerce(
    access: Pick<DatapackEngineAccess, 'project' | 'authManager' | 'secrets'> & { records?: RecordFiles },
    reads?: { use: ReadWindowUse; log?: (line: string) => void },
): DemoBuilderEngineDeps['commerce'] {
    const { authManager } = access;
    return async () => {
        if (!authManager) return { refusal: 'Adobe sign-in is required to write to this project\'s store.' };
        const open = (scope: string) => commerceClientForProject(access.project, authManager, access.secrets, undefined, scope);
        const writer = await open(STORE_WIDE);
        if ('refusal' in writer) return writer;
        const scope = await readScope(access.project, access.records ?? nodeRecordFiles);
        const reader = scope === STORE_WIDE ? writer : await open(scope);
        if ('refusal' in reader) return reader;
        const client = { get: reader.get, send: writer.send };
        // The changes check and what follows it share one read of Commerce (`commerceReadWindow`).
        return reads ? throughReadWindow(access.project.path, reads.use, client, reads.log) : client;
    };
}

/** Said when ACO is on but Demo Builder holds no ingestion credential for the project. */
export const NO_ACO_CREDENTIAL =
    'Demo Builder holds no Adobe Commerce Optimizer credential for this project. Turn ACO on for the project again so ' +
    'Demo Builder can set one up in its Adobe workspace.';

/** Whether Adobe's connector feeds this project's ACO from its store. */
async function connectorOf(project: Project, settings: AcoStorefrontSettings, credential: AcoCredential): Promise<AcoConnectorState> {
    const { environmentType, commerceEndpoint, storeViewCode } = buildConfigGeneratorParams(project);
    const admin = createAcoAdminClient({ instance: settings, credential });
    const { connector } = await readAcoConnector({ backend: environmentType ?? 'paas', url: commerceEndpoint, store: storeViewCode, admin });
    return connector;
}

/** The project's website and its store's customer groups, or undefined when they cannot be read. */
async function readBuyerBooks(access: Pick<DatapackEngineAccess, 'project' | 'authManager' | 'secrets'>): Promise<BuyerBooks | undefined> {
    const websiteCode = buildConfigGeneratorParams(access.project).websiteCode;
    if (!websiteCode) return undefined;
    try {
        const read = async () => {
            const commerce = await projectCommerce(access)();
            return 'refusal' in commerce ? commerce : commerce.get;
        };
        const groups = await new AcoStoreReads(read, () => undefined).customerGroups();
        return { websiteCode, groupIds: groups.map((group) => group.id) };
    } catch {
        return undefined;
    }
}

/**
 * The project's ACO access (PL-60, owner 2026-10-31 P4), or why there is none: the instance, catalog
 * view and locale it names (`readAcoSettings`), and a client over the ingestion credential Demo
 * Builder keeps for it in SecretStorage (`readAcoCredential`). The client is built for the instance
 * asked for, so a removal reaches the instance its record names.
 */
export function projectAco(access: Pick<DatapackEngineAccess, 'project' | 'secrets'> & Partial<Pick<DatapackEngineAccess, 'authManager'>>): AcoAccessSource {
    return async () => {
        const read = readAcoSettings(access.project);
        if (!read || 'missing' in read) return { refusal: acoSettingsProblem(read) ?? NO_ACO_CREDENTIAL };
        const credential = await readAcoCredential(access.secrets, access.project.path);
        if (!credential) return { refusal: NO_ACO_CREDENTIAL };
        return {
            settings: read.settings,
            clientFor: (instance) => createAcoClient({ instance, credential }),
            ...(access.authManager ? { buyerBooks: () => readBuyerBooks({ ...access, authManager: access.authManager }) } : {}),
            connector: () => connectorOf(access.project, read.settings, credential),
        };
    };
}

/**
 * The store view a pack's values are read through: the one its install record names, else the
 * project's, else store-wide. A record that cannot be read leaves the read to the project's: the
 * job that needs the record says so itself.
 */
async function readScope(project: Project, records: RecordFiles): Promise<string> {
    const recorded = project.datapack
        ? await readInstallRecord(records, project.path, project.datapack).then((r) => r?.target?.storeCode, () => undefined)
        : undefined;
    return recorded ?? resolveInstallTarget(project)?.storeCode ?? STORE_WIDE;
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
