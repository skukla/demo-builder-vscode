/**
 * What Demo Builder's datapack engine is handed and what it hands back when a job ends: its
 * dependencies (`DemoBuilderEngineDeps`) and the job-end record the activity log keeps (`JobEnd`).
 * Split out of `engine.ts`, which holds the engine's work; callers import both from here.
 *
 * @module features/data-installer/services/demoBuilderEngine/engineDeps
 */

import type { PlainText } from '@/core/utils/plainText';
import type { DataTypeStatus } from '../../types';
import type { AcoAccessSource } from '../aco/acoJobs';
import type { ImportRequest } from '../importRequest';
import type { RecordFiles } from './installRecord';
import type { FindLayer } from './layerStep';
import type { RootStepAsker } from './packRootStep';
import type { PackItems } from './runPack';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What this engine needs from the project it installs into. */
export interface DemoBuilderEngineDeps {
    /** The project's signed Commerce access, or why there is none. */
    commerce: () => Promise<{ get: CommerceGet; send: CommerceSend } | { refusal: string }>;
    /** Every row the pack holds, from the store that holds it. What a request installs is decided here. */
    readPack: (id: DatapackId, source: DatapackStoreName) => Promise<PackItems>;
    projectPath: string;
    log: (line: string) => void;
    files?: RecordFiles;
    now?: () => Date;
    /**
     * How an install asks the SC for the one Admin step a pack can leave, and opens the Admin
     * (step 12): `askDuringOperation` and the dashboard's Admin opening, from `buildDatapackEngine`.
     * Absent, the step is left open on the record without a question.
     */
    asker?: RootStepAsker;
    /** Told once when a job ends, however it ends: the activity log's writer (step 14). */
    onJobEnd?: (end: JobEnd) => void;
    /**
     * The project's Adobe Commerce Optimizer access (PL-60), for a pack whose kinds are all ACO's:
     * those go to ACO through its own client, not to Commerce. Absent, such a pack is refused.
     */
    aco?: AcoAccessSource;
    /**
     * Runs each job where its questions are shown: the window that started it, when one did
     * (walk F150). Absent, a job runs as it is and asks as `asker` does on its own.
     */
    hostRun?: (work: () => Promise<void>) => Promise<void>;
    /** The pack's settings layer from the library (step 09). Absent, a pack has none. */
    findLayer?: FindLayer;
    /**
     * The Commerce instance `commerce` reaches (`deriveImportInstance` of the project), written on a
     * new install record so a removal from another instance stops (step-07 D6). Not the request's
     * `commerceInstance`: this engine writes through the project's access, whatever a caller names.
     */
    instance?: string;
    /** The pack's name as the SC knows it, for the engine's sentences; absent, its id's name. */
    nameOf?: (id: DatapackId) => string;
}

/** How one job ended, for the activity log (`engineActivityLog.ts`). */
export interface JobEnd {
    activationId: string;
    operation: 'import' | 'delete';
    request: ImportRequest;
    perType: Record<string, DataTypeStatus>;
    reason?: string;
    note?: string;
    /** Where it stopped and the lines the SC read, for the Activity tab's plain words (walk F221). */
    stoppedAt?: string;
    scLines?: PlainText[];
    startedAt: number;
    finishedAt: number;
}
