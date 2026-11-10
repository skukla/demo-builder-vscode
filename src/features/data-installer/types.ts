/**
 * Data Installer domain types.
 *
 * These are what the rest of the extension sees. No `snake_case`, no `_id`, no
 * `success` flag, and no trace of the upstream service's inconsistencies — those
 * are absorbed in `services/dataInstallerParsers.ts`, which is the only module
 * allowed to read a wire shape.
 *
 * Timestamps stay ISO strings rather than `Date`. Every one of these crosses the
 * extension↔webview boundary, where `postMessage` serializes a `Date` to a string
 * anyway — typing it as `Date` would be a lie on the receiving side.
 *
 * @module features/data-installer/types
 */

import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';


/** Cover and thumbnail art, either of which may be absent. */
export interface DatapackArt {
    cover?: string;
    thumbnail?: string;
}

/** A datapack as it appears in the catalog listing. */
export interface DatapackSummary {
    id: DatapackId;
    displayName: string;
    description?: string;
    owner?: string;
    shared: boolean;
    dataTypes: string[];
    art: DatapackArt;
    createdAt?: string;
    updatedAt?: string;
    /**
     * Which catalog the row came from. Absent means the Data Installer, which is
     * every row from before the datapack library existed.
     */
    store?: DatapackStoreName;
    /** True when the signed-in SC owns it. Only the library says; absent otherwise. */
    mine?: boolean;
    /** An official team pack, listed by default. Only Demo Builder's datapack store says. */
    team?: boolean;
}

/** A pack's settings layer, as its flyout and `get_datapack` name it (datapack-engine step 09). */
export interface PackDetailLayer {
    id: DatapackId;
    /** True when the signed-in SC owns it, and so can remove it. */
    mine: boolean;
    /** What installing the pack sets: the path, and the value the layer holds for it. */
    settings: Array<{ path: string; value: string }>;
}

/** A single datapack's full metadata. Same shape plus timing. */
export interface DatapackDetail extends DatapackSummary {
    durationMs?: number;
}

/** One stored data item, with its payload parsed out of the wire string. */
export interface DataItem {
    dataType: string;
    /** Parsed from the wire's JSON *string*. `undefined` when it would not parse. */
    records?: unknown;
    /** The unparsed string, kept only when parsing failed. */
    rawData?: string;
    count?: number;
    includeContent?: boolean;
}

/** Which of the requested data types a datapack actually holds. */
export interface DataItemInventory {
    present: string[];
    missing: string[];
    presentCount: number;
    missingCount: number;
    requestedCount: number;
}

/** Whether we could describe a data type from the export catalog. */
export type DataTypeMetadataState = 'available' | 'unavailable';

/** One data type the service can process. */
export interface DataTypeInfo {
    dataType: string;
    description?: string;
    apiType?: string;
    dependsOn: string[];
    order?: number;
    metadata: DataTypeMetadataState;
}

/** What `process-datapack` can be asked to do. */
export type OperationMode = 'import' | 'export' | 'delete' | 'validate';

/** A datapack recorded as installed on a Commerce instance. */
export interface InstalledDatapack {
    commerceInstance: string;
    id: DatapackId;
    displayName?: string;
    dataTypes: string[];
    art: DatapackArt;
    installedAt?: string;
    processingTimeMs?: number;
    /** Which engine says so: the service's tracking, or Demo Builder's install record (step 14). */
    source?: DatapackEngineId;
    /** Demo Builder's only: how many Commerce objects its record lists, which removal takes away. */
    objectCount?: number;
}

/** One row of a request log: the service's own, or Demo Builder's engine's (`source`). */
export interface ActivityEntry {
    id: DatapackId;
    /** The name the SC knows the pack by, when Demo Builder has read it (`packNames.ts`). */
    displayName?: string;
    dataTypes: string[];
    commerceInstance?: string;
    mode?: string;
    /** Which engine ran it (step 14). */
    source?: DatapackEngineId;
    /** Demo Builder's only: whether every requested kind succeeded. The service's log does not say. */
    outcome?: 'success' | 'failed';
    /** Demo Builder's only: why it failed, or what it said about a run that worked. */
    detail?: string;
    siteType?: string;
    /**
     * Opaque on purpose. The documented enum (`SINGLE_DB`, `ENTIRE_DB`, …) does
     * not match live data (`DATAPACK_ALL_ITEMS`, `DATAPACK_SPECIFIC_ITEMS`), so
     * this is never narrowed to a union and is rendered as-is.
     */
    scenario?: string;
    at?: string;
    activationId?: string;
}

/** A page of results from a paginated endpoint. */
/**
 * The catalog the panel shows: the Data Installer's packs, plus the library's when
 * asked. `libraryError` says why the library's are missing, when they are.
 */
/**
 * Who installed a pack, or ran a job: Demo Builder (its install record and activity log) or the
 * Data Installer service (its own tracking, from before its engine was deleted on 2026-11-06).
 */
export type DatapackEngineId = 'service' | 'demo-builder';

/** `demoBuilder.dataInstaller.changesOnRemoval`: ask each time, or always save them first. */
export type ChangesOnRemoval = 'ask' | 'save';

/**
 * The catalog with the library's rows. `installerOn` says the Data Installer's address is set and
 * switched on, so a library pack's flyout offers Copy to the Data Installer beside Import.
 */
export type CatalogPage = Page<DatapackSummary> & {
    /** Demo Builder's datapack store did not answer, so only the Data Installer's rows are here. */
    storeMissing?: boolean;
    /**
     * The Data Installer's rows are not here, though they were asked for. `no-address`: none is
     * set, so it was not asked. `turned-off`: the SC turned it off (`dataInstaller.enabled`), so it
     * was not asked either. `no-access`: it turned the SC's Adobe sign-in away (not in its
     * product profile). `no-answer`: it failed or did not reply. Told apart since 2026-11-03,
     * so the screen can say which; one "no answer" left a refused SC reading "try again".
     */
    installerMissing?: 'no-address' | 'turned-off' | 'no-access' | 'no-answer';
    /** The SC switched the Data Installer's datapacks off, so it was not asked. */
    installerOff?: boolean;
    /**
     * The SC dismissed the "no access" banner on this machine (`dismiss-datapack-no-access`).
     * Cleared once the Data Installer answers them, so it comes back if access is lost again.
     */
    noAccessDismissed?: boolean;
    /** The Data Installer's address is set and switched on: Copy to the Data Installer is offered. */
    installerOn?: boolean;
};

/**
 * What is installed, or what happened, from both engines (step 14): Demo Builder's rows first,
 * then the service's, each tagged with its `source`. Each error says why one source's rows are
 * missing, when they are.
 */
export type HistoryPage<T> = Page<T> & { serviceError?: string; engineError?: string };

export interface Page<T> {
    items: T[];
    count: number;
    /**
     * Total rows the service holds, when it reports one.
     *
     * OPTIONAL because not every endpoint returns it, and inventing one is
     * worse than omitting it: the catalog endpoint sends no total, so a
     * `?? items.length` fallback made `find_datapacks` answer `total: 20` for a
     * 23-row catalog whenever a page size applied — a number that reads as
     * authoritative and silently hides rows. When this is absent, treat
     * `count === limit` as "there may be more".
     */
    total?: number;
    limit?: number;
    skip?: number;
}

/** Per-data-type progress state reported by the durable status endpoint. */
export type DataTypeStatus = 'pending' | 'processing' | 'success' | 'error';

/**
 * The extension→webview push carrying one poll of a running job.
 *
 * Declared here rather than beside the handler because both sides need it and
 * the webview cannot import from the extension host. The handler sends it; the
 * modal's hook subscribes to it.
 */
export const IMPORT_PROGRESS_MESSAGE = 'datapack-import-progress';

/**
 * The datapack list may have changed: a setting it depends on, or the packs themselves (a rename, a
 * save, an import, an agent's change; `datapackChanges.ts`). A screen showing the list reads it again.
 */
export const DATAPACK_LIST_CHANGED_MESSAGE = 'datapack-list-changed';

/** One poll, as it reaches the webview. */
export interface ImportProgressMessage {
    /** Which job this belongs to — the modal ignores every other one. */
    activationId: string;
    operation?: 'import' | 'reset';
    perType: Record<string, DataTypeStatus>;
    /** How far the type in progress has got (`JobStatusSnapshot.detail`). */
    detail?: string;
    /** What the job is doing while no one data type is (`JobStanding.phase`). */
    phase?: string;
    /** How removing the pack it replaces stands (`JobStanding.replacing`). */
    replacing?: DataTypeStatus;
}

/**
 * `JobStanding.stoppedAt` when the job stopped after every data type's rows were in: recording what
 * was installed, applying the store settings, or the check. Each data type says Done, and the window's
 * Finishing Import row says why it stopped. No data type is named this.
 */
export const FINISHING_STOP = 'finishing';

/**
 * `JobStanding.stoppedAt` when an import replacing the demo's pack stopped while removing it (walk
 * F97): nothing was installed, and the window's Removing row says why. No data type is named this.
 */
export const REPLACE_STOP = 'replacing';

/**
 * `JobStanding.stoppedAt` on the record the import window draws when saving the SC's changes before
 * a replace failed: no job ran, and the Save Your Changes step says why. No data type is named this.
 */
export const SAVE_STOP = 'saving-changes';

/**
 * What Demo Builder's engine is doing while no one data type is (`JobStanding.phase`), as it says it
 * to agents. The import window matches on these to put each on its step (`importSteps`), so the
 * engine and the window read one definition (review, 2026-11-10: they matched by copied text).
 */
export const ENGINE_PHASES = {
    reading: 'Reading the datapack',
    comparing: 'Comparing Commerce with the datapack',
    recording: 'Recording what was installed',
    settings: 'Applying the store settings',
    checking: 'Checking products',
} as const;

/**
 * The tail on the products count while configurable products go in (owner, 2026-11-09, walk F122):
 * one call at a time, each linking its options, so the count moves slowly and the window says why:
 * the Products row's second line reads "Linking product options 2,044 of 2,046" (`doingLine` in
 * `importSteps`, walk F133).
 */
export const LINKING_OPTIONS = ', linking product options';

/**
 * Where Demo Builder's engine says a job stands beyond each data type's state: what the import
 * window draws, a row per data type (owner, 2026-11-07).
 */
export interface JobStanding {
    /** What the job is doing while no one data type is: "Comparing Commerce with the datapack". */
    phase?: string;
    /**
     * The data type that failed: the one in progress when the job stopped, or the store settings, which
     * fail without stopping it. {@link FINISHING_STOP} when it stopped after every data type was in.
     */
    stoppedAt?: string;
    /** Running it again could get past what stopped it: Commerce failing, slowing down or not answering. */
    retryable?: boolean;
    /** The note's lines the SC needs to read in the window; `note` holds every line. */
    scLines?: string[];
    /** When the job wrote products: how long until storefront search shows them. */
    searchDelay?: string;
    /** A line for each data type with a problem that did not stop the job: what is wrong, what to do. */
    rowNotes?: Record<string, string>;
    /**
     * An import replacing the pack the demo uses (walk F97): how removing that pack first stands.
     * Absent when the import replaces nothing.
     */
    replacing?: DataTypeStatus;
}

/**
 * A removal kept the pack's root category because a store shows it as its root: the one Admin
 * step that frees it, as the result shows it in the setup step's Where / Set / Then rows (owner,
 * 2026-10-31). Demo Builder's engine only.
 */
export interface KeptRootStep {
    /** The store (store group), as the Admin names it. */
    store: string;
    /** The pack's root category that was kept. */
    category: string;
    /** The root category the store showed before the pack, to put back; absent when unreadable. */
    restore?: string;
}

/** A row a job skipped: its kind, the pack's name for it, and Commerce's reason, whole. */
export interface SkippedRowRecord {
    kind: string;
    key: string;
    reason: string;
}

/** A snapshot of one async job's progress. */
/** One finding of an install check: how many, and the first few. */
export interface CheckFinding<T> {
    count: number;
    examples: T[];
}

/**
 * Whether the store holds what a pack says, for the products the pack made (`verifyInstall.ts`):
 * Demo Builder's engine runs it at the end of every install, and `verify_datapack_install` on ask.
 */
export interface InstallCheck {
    verdict: 'matches' | 'differs';
    checked: number;
    /**
     * How many products differ in any way, each counted once: the import window's Verify line,
     * "Checked 2,048 products against the datapack: 3 differ". Absent on a check recorded before
     * 2026-11-10, which the window words as "some differ".
     */
    productsDiffer?: number;
    /** Products the pack made that a reinstall kept as changed in the Admin, and the check left out. */
    leftOut?: number;
    /**
     * How many of each the check actually compared, so a `matches` that compared nothing (a pack whose
     * values name no attribute the store has, say) reads as that rather than as a clean install.
     */
    compared: { values: number; prices: number; configurables: number };
    missing: CheckFinding<string>;
    configurablesWithoutOptions: CheckFinding<string>;
    configurablesDiffer: CheckFinding<{ sku: string; differs: string }>;
    valuesDiffer: CheckFinding<{ sku: string; attribute: string; pack: string; store: string }>;
    pricesDiffer: CheckFinding<{ sku: string; pack: number; store: number }>;
}

export interface JobStatusSnapshot extends JobStanding {
    activationId: string;
    perType: Record<string, DataTypeStatus>;
    processingTimeMs?: number;
    /**
     * False when the status map is empty — the shape a job that never started
     * returns. It is NOT an error, and cannot be told apart from "still
     * starting" without the grace window, so the runner needs it explicitly.
     */
    hasRecord: boolean;
    /** What the job kept and why, in one line: Demo Builder's engine on a repeat install (step 05). */
    note?: string;
    /** How far the type in progress has got, when the engine can say: "450 of 2,046 products". */
    detail?: string;
    /**
     * A removal that finished but left part of the pack in the store on purpose: Demo Builder's
     * engine kept containers holding the SC's things, and its install record still lists them.
     * The project then still names the pack (`importJobWatch.ts`).
     */
    leftInStore?: boolean;
    /** The kept root category's Admin step, when that is what the removal kept. */
    keptRoot?: KeptRootStep;
    /**
     * Seconds each data type took, in the order they ran, for an agent measuring where the time
     * went (2026-11-06: read off Debug Logs by hand). Demo Builder's engine only.
     */
    timings?: Record<string, number>;
    /** Every row the job skipped, with Commerce's whole reason (`note` names ten). */
    skipped?: SkippedRowRecord[];
    /** The store checked against the pack once an install's products are in (Demo Builder's engine). */
    check?: InstallCheck;
}

/**
 * The verdict from a synchronous `operation_mode: 'validate'` call.
 *
 * A rejection is an ANSWER, not an error — the sync twin 400s requests the async
 * entry point accepts with a 202, and its message names the cause.
 */
export interface ValidationResult {
    valid: boolean;
    /** The service's own wording when it refused. */
    reason?: string;
}

/** What an accepted async start hands back: the id to poll. */
export interface ImportStart {
    activationId: string;
}

/**
 * One import, as recorded on the extension host.
 *
 * Survives the panel closing — the watch is detached, so this is where its
 * result lands. `outcome: 'watching'` is the in-flight state; the rest come from
 * the runner.
 */
export interface ImportJobRecord extends JobStanding {
    activationId: string;
    datapackName: string;
    version: string;
    /**
     * Which operation this record is. Optional because records persisted before
     * the field existed have none — those were all imports. Without it the modal
     * announced a completed reset as "Import finished", live.
     */
    operation?: 'import' | 'reset';
    /** Whatever the user typed. Opaque. */
    commerceInstance: string;
    dataTypes: string[];
    startedAt: string;
    outcome:
        | 'watching'
        | 'success'
        | 'partial'
        | 'error'
        | 'never-registered'
        | 'stopped'
        | 'still-running'
        // The WATCH failed, not the import. Distinct from 'stopped', which is the
        // user choosing to stop looking — this is us being unable to look, which
        // they never asked for. Without it a dead watch left the record saying
        // 'watching' forever and the panel claiming an import was still running.
        | 'unwatchable';
    perType: Record<string, DataTypeStatus>;
    /** Why it did not all succeed: `never-registered`, `unwatchable`, and an `error` or `partial` run the engine explained. */
    reason?: string;
    /** What it kept and why, in one line ("Kept 2 things you had changed in the Admin."). */
    note?: string;
    /** While it runs: how far the type in progress has got ("450 of 2,046 products"). */
    detail?: string;
    /** The kept root category's Admin step (`JobStatusSnapshot.keptRoot`). */
    keptRoot?: KeptRootStep;
    /** Seconds each data type took (`JobStatusSnapshot.timings`). */
    timings?: Record<string, number>;
    /** Every row the job skipped (`JobStatusSnapshot.skipped`). */
    skipped?: SkippedRowRecord[];
    /** The install check (`JobStatusSnapshot.check`). */
    check?: InstallCheck;
    processingTimeMs?: number;
    /**
     * The pack an import replaces, as the SC knows it: "My Luma, Nov 9, 11:01 AM" or "Luma,
     * eds-compatible" (walk F97). Absent when it replaces nothing.
     */
    replaces?: string;
    /** Where the SC's changes were saved before the import began: "Nov 9, 1:56 PM" (walk F105). */
    savedAs?: string;
    /** The pack replaced is another version of the same pack: that version, "Nov 9, 9:15 AM". */
    replacesVersion?: string;
}

/** Why an async job produced nothing, as reported by the activation echo. */
export interface JobFailureReason {
    /** The service's own message; surfaced verbatim because it names the cause. */
    error: string;
}

/** Service reachability, from the unauthenticated health endpoint. */
export interface ServiceHealth {
    reachable: boolean;
    message?: string;
    envChecks?: Record<string, string>;
}

/**
 * The Admin step an installed pack left (datapack-engine step 12), as `get-datapack-setup-step`
 * and `check-datapack-setup-step` answer it: in the setup guide's own step format, so it reads as
 * every other manual step does. `step` is null when the pack left none.
 */
export interface DatapackSetupStep {
    datapackName: string;
    version: string;
    step: SetupChecklistItem | null;
}
