/**
 * What one install or removal is asked to do, as every surface builds it: the Data Installer
 * screen, the wizard's creation step, project reset and the agent tools. Demo Builder's engine
 * (`demoBuilderEngine/engine.ts`) takes it.
 *
 * These shapes lived beside the Data Installer service's write client until the service's
 * engine was deleted on 2026-11-06 (DI-12); the client went with it and the shapes stayed.
 *
 * @module features/data-installer/services/importRequest
 */

import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** Everything one import needs. */
export interface ImportRequest {
    id: DatapackId;
    /** Opaque, user-supplied. Never derived, never reformatted. */
    commerceInstance: string;
    /** Explicit types: an install writes these and what they need, and nothing else. */
    dataTypes: string[];
    /**
     * Where the pack lands: the website and the store view. Absent, the engine refuses the
     * install (it never guesses a scope); callers fill it from the project when the user named none.
     */
    target?: ImportTarget;
    /**
     * Which store holds the pack: the Data Installer's catalog (absent) or Demo Builder's
     * datapack store. Either way Demo Builder's own copy is read first (`readPackItems`).
     */
    source?: DatapackStoreName;
    /**
     * The pack the demo uses, when this import replaces it (walk F97): Demo Builder's engine removes
     * it by its install record first, and installs nothing when that removal fails.
     */
    replaces?: DatapackId;
    /**
     * A removal only, Demo Builder's engine only: products, by SKU, a clearing deletes right after it
     * (Clear Demo Data, step-06 C3 re-review). What they hold counts as going (`decideRemovals`).
     */
    alsoLeaving?: string[];
}

/**
 * The website and store view an import runs against. They must already exist in Commerce:
 * `websites` is not an importable data type, so nothing here creates them.
 */
export interface ImportTarget {
    websiteCode: string;
    storeCode: string;
}

/** Whether the project's credentials actually reach its instance. */
export interface CredentialCheck {
    usable: boolean;
    /** Why not, in words, when they do not. */
    reason?: string;
}
