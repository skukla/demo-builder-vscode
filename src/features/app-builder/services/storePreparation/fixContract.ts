/**
 * The contract every setup-step fix implements (AB-77), so the demo setup's Apply drives a fix
 * that is settings (`configFix`) and a fix that is code (`erpAttributesFix`,
 * `warehouseFix`, `sharedCatalogsFix`) the same way: PREVIEW reads Commerce and says what
 * would change, APPLY writes and answers what it changed and what Commerce refused, with the
 * record the undo needs, and UNDO puts that record back.
 *
 * Pure over the Commerce client it is handed; nothing here fetches.
 *
 * @module features/app-builder/services/storePreparation/fixContract
 */

import type { CommerceSend } from '../commerceBulk';
import type { CommerceGet } from '../erpFillReaders';
import type { StorePreparationStepRecord } from '@/types/storePreparation';

/** What a fix is handed: the signed Commerce client and the project's store. */
export interface FixDeps {
    commerce: { get: CommerceGet; send: CommerceSend };
    /** The project's Commerce website code; a website-scoped fix needs it. */
    websiteCode?: string;
    /** The names of the ERPs the integration serves, for a fix that makes one thing per ERP. */
    erpNames: readonly string[];
}

/** What a fix would change: one line per change, in an SC's words. */
export interface FixPreview {
    changes: string[];
    /** One plain sentence naming what `changes` lists, when the step's title is too general. */
    summary?: string;
    /** What stays by hand, whatever the fix writes. */
    manual?: string;
}

/** What a fix changed, what Commerce refused, and what the undo needs. */
export interface FixApplied {
    changes: string[];
    rejected: string[];
    /** Absent when nothing was written, so nothing is recorded. */
    record?: StorePreparationStepRecord;
    manual?: string;
}

/** What an undo put back, and what Commerce refused. */
export interface FixUndone {
    changes: string[];
    rejected: string[];
}

export interface StepFix {
    preview: (deps: FixDeps) => Promise<FixPreview>;
    apply: (deps: FixDeps) => Promise<FixApplied>;
    undo: (deps: FixDeps, record: StorePreparationStepRecord) => Promise<FixUndone>;
}

/** An error's words. */
export function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
