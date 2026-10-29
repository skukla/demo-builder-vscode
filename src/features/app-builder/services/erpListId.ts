/**
 * The id a listed system has in its integration's list (AB-51).
 *
 * The ERP integration keys everything by this id: which ERP owns a product
 * (`erp_owner`), every key-map row, every event an ERP sends, the ledger, the Admin
 * page's ERP switcher. It used to be the literal `erp` for the integration's own ERP
 * and the Demo Builder component id (`demo-erp-2`) for one added later — two kinds of
 * id, neither naming the ERP. The owner, reading a product: "why is ERP owner set to
 * ERP rather than the id or name of the owning ERP?" (2026-09-30).
 *
 * So it is the ERP's NAME, slugged: `Northwind ERP` → `northwind`. Recorded on the
 * component the first time it deploys (`ensureListId`, the `commerceAppId` pattern)
 * and never rewritten, because it is already on the products and the rows; a rename
 * afterwards moves the label and leaves this alone.
 *
 * @module features/app-builder/services/erpListId
 */

import { pairedInstanceId } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** The integration's own rule for an id (`erps.js`): a letter, then letters, digits, hyphens. */
const MAX_LENGTH = 63;

type Components = Pick<Project, 'appBuilderComponents' | 'componentConfigs'>;

/**
 * Slug a name into an id: lower case, a trailing "ERP" word dropped (every ERP is one),
 * every run of anything but letters and digits one hyphen, a leading letter, capped.
 * Empty when nothing usable is left.
 */
function slug(name: string): string {
    const withoutErp = name.trim().replace(/[\s_-]*\berp$/iu, '');
    const base = (withoutErp.trim() ? withoutErp : name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '');
    const led = base && !/^[a-z]/u.test(base) ? `erp-${base}` : base;
    return led.slice(0, MAX_LENGTH).replace(/-+$/gu, '');
}

/**
 * The list id for an ERP of this name: its slug, numbered when another ERP here has it.
 *
 * @param name - the ERP's name
 * @param taken - the ids the project's other systems already carry
 * @returns an id the integration accepts, unique among `taken`
 */
export function erpListIdFor(name: string, taken: readonly string[]): string {
    const base = slug(name) || 'erp';
    if (!taken.includes(base)) return base;
    for (let number = 2; ; number++) {
        const candidate = `${base}-${number}`;
        if (!taken.includes(candidate)) return candidate;
    }
}

/**
 * The name to derive an id from, in the order the deploy resolves a system's display
 * name (`textInputValue`): the name recorded on the component (typed or renamed), then
 * the input it is named from — on its integration first, then on itself, then that
 * input's schema default — then the catalog's name.
 */
function nameFor(project: Components, entry: AppBuilderComponentCatalogEntry): string {
    const recorded = project.appBuilderComponents?.[entry.id]?.name?.trim();
    if (recorded) return recorded;
    const key = entry.nameFromEnvVar;
    const owners = entry.boundTo
        ? [pairedInstanceId(entry.id, entry.catalogId, entry.boundTo), entry.id]
        : [entry.id];
    for (const owner of owners) {
        const value = key ? project.componentConfigs?.[owner]?.[key] : undefined;
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const schemaDefault = entry.envSchema?.find((envVar) => envVar.name === key)?.default?.trim();
    return schemaDefault || entry.name;
}

/** The list ids the project's other components carry. */
function takenListIds(project: Components, exceptId: string): string[] {
    return Object.entries(project.appBuilderComponents ?? {})
        .filter(([id, state]) => id !== exceptId && typeof state.listId === 'string')
        .map(([, state]) => state.listId as string);
}

/**
 * The id a listed system has in its integration's list: the one recorded on it, else
 * the one its name derives — the same answer `ensureListId` will record, so a read
 * before the first deploy agrees with every read after it.
 *
 * @param project - the project
 * @param entry - a system entry with `listedAs`
 * @returns its id in the list
 */
export function listIdOf(project: Components, entry: AppBuilderComponentCatalogEntry): string {
    const recorded = project.appBuilderComponents?.[entry.id]?.listId;
    return recorded ?? erpListIdFor(nameFor(project, entry), takenListIds(project, entry.id));
}

/**
 * Record a listed system's id on its component, once. Runs before a deploy reads its
 * inputs, on the record the deploy has just written, so the id is derived from the name
 * the system deploys with.
 *
 * @param project - the project (mutated when an id is recorded)
 * @param entry - the entry being deployed
 * @returns whether the project changed
 */
export function ensureListId(project: Project, entry: AppBuilderComponentCatalogEntry): boolean {
    const state = project.appBuilderComponents?.[entry.id];
    if (!entry.listedAs || !state || state.listId) return false;
    state.listId = listIdOf(project, entry);
    return true;
}

/**
 * Whether a listed system is the one its integration BRINGS — the catalog's own entry,
 * or a numbered copy whose numbered integration is in the project (`erp-integration-2`
 * brings `demo-erp-2`, from before the integration was add-once). That system shares
 * its integration's workspace and answers its credential; one added from the card is in
 * a workspace of its own (AB-16a, AB-23).
 *
 * @param project - the project
 * @param entry - a system entry
 * @returns true for the integration's own system
 */
export function broughtByItsIntegration(
    project: Components,
    entry: AppBuilderComponentCatalogEntry,
): boolean {
    if (!entry.catalogId || entry.id === entry.catalogId) return true;
    const partner = entry.boundTo
        ? pairedInstanceId(entry.id, entry.catalogId, entry.boundTo)
        : undefined;
    return Boolean(partner && project.appBuilderComponents?.[partner]);
}
