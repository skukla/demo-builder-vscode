/**
 * The engine's read access to the project's store, as "What installing again would change",
 * "Save store changes" and the save's pick list all open it (step 05, step 14): the project's own
 * signed Commerce client, pointed where a pack was installed (its record's target), else at the
 * project's website and store view.
 *
 * @module features/data-installer/services/demoBuilderEngine/storeAccess
 */

import { type InstallRecord, type InstallRecorder, type RecordFiles, nodeRecordFiles, openInstallRecord } from './installRecord';
import { type TargetCodes, resolveEngineTarget, sessionFor } from './installTarget';
import type { KindContext } from './kindContext';
import { packRootOf, readStoreRoot } from './packRoot';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What every action on the store needs: the project's store, where its packs are read, and its path. */
export interface StoreChangesDeps {
    /** The project's signed Commerce access, or why there is none. */
    commerce: () => Promise<{ get: CommerceGet; send: CommerceSend } | { refusal: string }>;
    /** The pack's rows by kind, from the store that holds it. */
    readPack: (id: DatapackId, source: DatapackStoreName) => Promise<Record<string, unknown>>;
    /** What the pack is called and says, for the new version's catalog entry. */
    describe: (id: DatapackId) => Promise<{ displayName: string; description?: string }>;
    projectPath: string;
    /** The website and store view the project installs into. */
    target: TargetCodes | undefined;
    log: (line: string) => void;
    files?: RecordFiles;
    now?: () => Date;
}

/** A save or preview that cannot go ahead, in words an SC can act on. */
export class StoreChangesError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StoreChangesError';
    }
}


/** A pack as the SC's sentences name it: `bodea@main`. */
export const labelPack = (pack: DatapackId): string => `${pack.name}@${pack.version}`;

const readsOnly = async (): Promise<never> => {
    throw new Error('Reading the store records nothing.');
};

/** The recorder of a read with no pack: it lists nothing and refuses to record. */
const NOTHING_RECORDED: InstallRecorder = { created: [], has: () => false, byKey: () => undefined, record: readsOnly, update: readsOnly, drop: readsOnly, setRootStep: readsOnly };

/**
 * The engine's read access to the project's store, pointed where the pack was installed: the
 * record's target, else (a record made before it was kept, or none) the project's (rule 3).
 *
 * @param pack - the pack whose record it reads by; none for a store Demo Builder did not fill
 */
export async function openStore(deps: StoreChangesDeps, pack: DatapackId | undefined, record: InstallRecord | undefined, categories?: unknown): Promise<KindContext> {
    const codes = record?.target ?? deps.target;
    if (!codes) throw new StoreChangesError('Choose the website and store view to install into first.');
    const commerce = await deps.commerce();
    if ('refusal' in commerce) throw new StoreChangesError(commerce.refusal);
    const target = await resolveEngineTarget(commerce.get, codes);
    // Opened to read what it lists; no action records anything through it.
    const recorder = pack ? await openInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack, () => (deps.now ?? (() => new Date()))().toISOString()) : NOTHING_RECORDED;
    const session = sessionFor(target);
    // Step 12: where a pack's own root goes is decided as the install decides it.
    if (packRootOf(categories)) session.storeRoot = await readStoreRoot(commerce.get, codes);
    return { ...commerce, recorder, session, log: deps.log };
}
