/**
 * "Prepare this store" (AB-77): what Demo Builder recorded when it applied a catalog entry's
 * setup steps to Commerce, so "Undo preparation" can put each one back, step by step.
 *
 * Shared between the extension and the webviews, so it imports nothing.
 *
 * @module types/storePreparation
 */

/** One setting as it was before a config fix wrote it. */
export interface CommerceConfigPrevious {
    path: string;
    scope: 'default' | 'website';
    /** The website code, for a website-scoped row. */
    scopeCode?: string;
    /**
     * The value the scope stored before the write; `null` when it stored none (a website row
     * inherited the default). The undo writes `effective` back, so a row that was inherited
     * before is set explicitly after the undo, to the value it inherited.
     */
    stored: string | null;
    /** The value in force at that scope before the write (own, else inherited, else Commerce's "0"). */
    effective: string;
}

/** What a config fix recorded. */
export interface ConfigStepRecord {
    kind: 'config';
    previous: CommerceConfigPrevious[];
}

/** What `create-erp-attributes` recorded: only what THIS run created or added. */
export interface ErpAttributesStepRecord {
    kind: 'erp-attributes';
    /** The attribute codes this run created; a pre-existing attribute is never deleted. */
    createdAttributes: string[];
    /** The attribute sets this run added `erp_owner` to. */
    sets: Array<{ id: number; name: string }>;
}

/** What `erp-warehouse-in-website-stock` recorded. */
export interface WarehouseStepRecord {
    kind: 'warehouse';
    /** The sources this run created, by code. The undo DISABLES them: Commerce cannot delete a source. */
    createdSources: string[];
    /** The stock this run created for the website, when it did (absent = an existing stock was reused). */
    createdStock?: { id: number; name: string };
    /** The stock-source links this run added. */
    links: Array<{ stockId: number; sourceCode: string }>;
}

/** What `company-shared-catalogs` recorded. */
export interface SharedCatalogsStepRecord {
    kind: 'shared-catalogs';
    /** The catalogs this run created, each with the company it assigned. */
    catalogs: Array<{ id: number; name: string; companyId: number; companyName: string }>;
}

export type StorePreparationStepRecord =
    | ConfigStepRecord
    | ErpAttributesStepRecord
    | WarehouseStepRecord
    | SharedCatalogsStepRecord;

/**
 * The record "Prepare this store" leaves on the component: one entry per step applied, by
 * step id. A step's entry is removed by its undo; the whole record goes with the last one, or
 * with the component.
 */
export interface StorePreparationRecord {
    /** ISO date string of the last apply. */
    at: string;
    steps: Record<string, StorePreparationStepRecord>;
}

/**
 * What `set_commerce_config` recorded on the project (AB-77): the values the settings held
 * before its last write. Replaced by the next write; removed by `undo: true`.
 */
export interface CommerceConfigChangeRecord {
    at: string;
    previous: CommerceConfigPrevious[];
}

/** Where one step stands for "Prepare this store". */
export type PreparationStepState =
    /** Its check passed, or the SC marked it done: nothing to apply. */
    | 'done'
    /** It declares a fix and is not done: the apply will write it. */
    | 'applicable'
    /** It declares no fix: the guide keeps its text. */
    | 'manual'
    /** Demo Builder applied it and recorded what it changed. */
    | 'applied'
    /** Its check found it done before the apply wrote anything (a datapack did it): nothing written. */
    | 'skipped'
    /** Its undo put the recorded changes back. */
    | 'undone'
    /** Commerce refused some or all of it; `rejected` names which. */
    | 'rejected';

/** One step as the preview and the result list it. */
export interface PreparationStepReport {
    id: string;
    label: string;
    title: string;
    state: PreparationStepState;
    /** What would change (preview) or what changed (result), one line each. */
    changes: string[];
    /** What Commerce refused, by item, in its words. */
    rejected: string[];
    /** What stays by hand after the step, if anything. */
    manual?: string;
}
