/**
 * Apply ownership across every ERP an integration serves (AB-70): the one pass that runs
 * after anything changes who owns what — an ERP added, one removed, a rule changed in
 * Settings, a Load demo data — so the SC never resets by hand to make the ERPs match the
 * rules.
 *
 * Per ERP, in order: its rule is checked against the store as it stands (a per-website rule
 * naming a website Commerce no longer has is said by name); it is filled with every product
 * it now owns (the fill adds and updates, never removes); the products it holds but no longer
 * owns are marked discontinued there (a real ERP discontinues, it does not delete). When a
 * removal leaves one ERP, its rule goes back to everything first, so a single-ERP project
 * looks as it did before the second ERP was added. What the SC still has to do is said in
 * words: an ERP that owns nothing, how many products belong to no ERP, and how many two
 * rules both claim (the integration refuses their orders until one rule changes).
 *
 * Who owns what is decided across every ERP's rule, by the integration's precedence
 * (`ownersAcross`, AB-72): a product rule first, then the ERP on everything for what nobody
 * claimed, then website rules. An ERP's rule alone says what it matches, not what it owns.
 *
 * Why: on 2026-10-09 adding a second ERP by attribute gave it zero products, and the first
 * ERP was told its products would "change at its next load", which a load cannot do.
 *
 * @module features/project-creation/services/erpOwnershipReconcile
 */

import { fillEveryErp, type ErpFillForProjectDeps, type ErpFillOutcomes } from './erpFillForProject';
import { readErpOwnershipOptionsForProject, saveErpOwnership } from './erpOwnershipSync';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import { describeOwns, overlapsIn, ownersAcross } from '@/features/app-builder/services/erpOwnership';
import { DISCONTINUED, SELLABLE, listErpProducts, setErpProductStatus } from '@/features/app-builder/services/erpProducts';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { Project } from '@/types/base';
import type { ErpOwnershipOptions, ErpOwnsEntry, ErpOwnsRule } from '@/types/erpOwnership';

/** What changed before the pass runs; a removal is the one moment a rule is widened. */
export type OwnershipMoment = 'add' | 'remove' | 'settings' | 'load';

/** One ERP as the pass saw it: its rule, what it owns now, what was marked, what to say. */
export interface OwnershipErpReport {
    /** The ERP's component id (`demo-erp-2`). */
    erp: string;
    /** Its id in the integration's list, the value `erp_owner` takes. */
    listId: string;
    name: string;
    owns: ErpOwnsRule;
    /** How many Commerce products its rule owns now. */
    ownsNow: number;
    /** Products it held but no longer owns, marked discontinued there. */
    discontinued: number;
    /** Products it owns again that the pass had discontinued, sellable again. */
    restored: number;
    /** What did not go right for this ERP, in words; the pass stands. */
    note?: string;
}

export type ApplyOwnershipOutcome =
    | {
          status: 'applied';
          erps: OwnershipErpReport[];
          fills: ErpFillOutcomes;
          /** Commerce products no ERP's rule owns. */
          unowned: number;
          /** What the SC still has to do, and what the pass changed on its own. */
          notes: string[];
      }
    | { status: 'failed'; detail: string };

/** An ERP the integration serves, with its component id beside its list id. */
interface ErpRow {
    erp: string;
    listId: string;
    name: string;
    owns: ErpOwnsRule;
}

const EVERYTHING: ErpOwnsRule = { mode: 'all' };

/** The ERPs with their rules, the component id found for each list id. */
function rowsOf(project: Project, integrationId: string, options: ErpOwnershipOptions): ErpRow[] {
    const catalog = getAppBuilderComponentCatalog();
    const byListId = new Map(
        systemsUsedBy(project, integrationId, catalog).flatMap((componentId) => {
            const listId = erpListIdOf(project, componentId, catalog);
            return listId ? [[listId, componentId] as const] : [];
        }),
    );
    return options.erps.flatMap((entry) => {
        const erp = byListId.get(entry.erp);
        return erp ? [{ erp, listId: entry.erp, name: entry.name, owns: entry.owns }] : [];
    });
}

/** A per-website rule's websites Commerce no longer has, said by name; nothing for the rest. */
function deadWebsitesNote(row: ErpRow, websites: ReadonlyArray<{ code: string }>): string | undefined {
    if (row.owns.mode !== 'websites') return undefined;
    const known = new Set(websites.map((site) => site.code));
    const dead = (row.owns.websites ?? []).filter((code) => !known.has(code));
    if (dead.length === 0) return undefined;
    const all = dead.length === (row.owns.websites ?? []).length;
    return (
        `${row.name}'s rule names website${dead.length > 1 ? 's' : ''} ${dead.join(', ')}, which ` +
        `Commerce no longer has${all ? ', so it owns nothing' : ''}.`
    );
}

/** What the SC does for an ERP whose rule owns no product. */
function ownsNothingNote(row: ErpRow): string {
    if (row.owns.mode === 'attribute') {
        const [code, value] = (row.owns.attribute ?? 'erp_owner=').split('=');
        return (
            `${row.name} owns no products yet: tag products with ${code}=${value} in Commerce, ` +
            'then Load demo data.'
        );
    }
    return `${row.name} owns no products: no Commerce product is ${describeOwns(row.owns).replace(/^products /u, '')}.`;
}

/** What the status pass did for one ERP, and what did not go right. */
interface StatusPassResult {
    discontinued: number;
    restored: number;
    note?: string;
}

/** One status change the pass makes: the SKU and the status it gets. */
interface StatusChange {
    sku: string;
    to: typeof DISCONTINUED | typeof SELLABLE;
}

/**
 * The status changes an ERP's held products need: what it no longer owns becomes
 * discontinued; what it owns again, and the pass had discontinued, becomes sellable
 * (measured 2026-10-09: a removal gave Justrite ERP everything back and 278 products it
 * owned again stayed discontinued, because an import never resets a status). A parent
 * carries no sales status and is left; `blocked` is the ERP user's own decision and is
 * never touched either way.
 */
function statusChangesFor(
    held: readonly { sku: string; type?: string; salesStatus?: string }[],
    owned: ReadonlySet<string>,
): StatusChange[] {
    return held.flatMap((product): StatusChange[] => {
        if (product.type === 'configurable') return [];
        const isOwned = owned.has(product.sku);
        if (!isOwned && product.salesStatus !== DISCONTINUED) return [{ sku: product.sku, to: DISCONTINUED }];
        if (isOwned && product.salesStatus === DISCONTINUED) return [{ sku: product.sku, to: SELLABLE }];
        return [];
    });
}

/** The pass's note when a status change is refused: what is left and why. */
function statusRefusedNote(row: ErpRow, left: StatusChange[], error: unknown): string {
    const toMark = left.filter((change) => change.to === DISCONTINUED).length;
    const toRestore = left.length - toMark;
    const parts = [
        ...(toMark ? [`${toMark} product${toMark === 1 ? '' : 's'} it no longer owns could not be marked discontinued`] : []),
        ...(toRestore ? [`${toRestore} product${toRestore === 1 ? '' : 's'} it owns again could not be made sellable`] : []),
    ];
    return `${row.name}: ${parts.join(', and ')}: ${(error as Error).message}`;
}

/**
 * Apply the status changes an ERP's held products need, one at a time (the ERP's PATCH takes
 * one SKU). The first refusal stops the pass for that ERP and is the note.
 */
async function reconcileStatuses(
    row: ErpRow,
    owned: ReadonlySet<string>,
    deps: ErpFillForProjectDeps,
    project: Project,
): Promise<StatusPassResult> {
    const auth = await deps.getAuth();
    const urls = project.appBuilderComponents?.[row.erp]?.deployedUrls;
    const none = { discontinued: 0, restored: 0 };
    if (!auth) return { ...none, note: `${row.name}: Adobe sign-in required to change product statuses.` };
    let held;
    try {
        held = await listErpProducts(urls, auth, deps.fetchImpl);
    } catch (error) {
        return { ...none, note: `${row.name}'s products could not be read: ${(error as Error).message}` };
    }
    const changes = statusChangesFor(held, owned);
    const done = { ...none };
    for (const [index, change] of changes.entries()) {
        const verb = change.to === DISCONTINUED ? 'discontinued' : 'sellable again';
        deps.onProgress?.(`Marking ${index + 1} of ${changes.length} products ${verb}`);
        try {
            await setErpProductStatus(urls, auth, change.sku, change.to, deps.fetchImpl);
            if (change.to === DISCONTINUED) done.discontinued += 1;
            else done.restored += 1;
        } catch (error) {
            return { ...done, note: statusRefusedNote(row, changes.slice(index), error) };
        }
    }
    return done;
}

/**
 * Every listed ERP's rule as the pass applies it: the integration's list (an ERP listed there
 * claims products whether or not this project has its component), with the rule the pass
 * widened where it did.
 */
function rulesOf(options: ErpOwnershipOptions, rows: readonly ErpRow[]): ErpOwnsEntry[] {
    return options.erps.map((entry) => ({
        erp: entry.erp,
        owns: rows.find((row) => row.listId === entry.erp)?.owns ?? entry.owns,
    }));
}

/** The SKUs one ERP owns, read off what `ownersAcross` answered. */
function ownedBy(owners: ReadonlyMap<string, readonly string[]>, listId: string): Set<string> {
    const owned = new Set<string>();
    for (const [sku, claimed] of owners) if (claimed.includes(listId)) owned.add(sku);
    return owned;
}

/** The ERPs in words: "both X and Y", or "X, Y and Z". */
function namesOf(listIds: readonly string[], options: ErpOwnershipOptions): string {
    const names = listIds.map((listId) => options.erps.find((entry) => entry.erp === listId)?.name ?? listId);
    if (names.length === 2) return `both ${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The products two rules both claim, said by count and by the ERPs' names: the integration
 * refuses an order line claimed by two ERPs, so the SC has to change one rule.
 */
function overlapNotes(owners: ReadonlyMap<string, readonly string[]>, options: ErpOwnershipOptions): string[] {
    return overlapsIn(owners).map(({ erps, count }) => {
        const one = count === 1;
        return (
            `${count} product${one ? ' is' : 's are'} claimed by ${namesOf(erps, options)}; ` +
            `orders for ${one ? 'it' : 'them'} are refused until one rule changes.`
        );
    });
}

/**
 * The widening a removal does: one ERP left and not on everything → everything, saved on its
 * list entry. Any other moment leaves the rules as the SC set them.
 */
async function widenLastErp(
    project: Project,
    integrationId: string,
    rows: ErpRow[],
    moment: OwnershipMoment,
    deps: ErpFillForProjectDeps,
): Promise<string | undefined> {
    if (moment !== 'remove' || rows.length !== 1 || rows[0].owns.mode === 'all') return undefined;
    const auth = await deps.getAuth();
    if (!auth) return undefined;
    const integration = project.appBuilderComponents?.[integrationId];
    const client = new ErpIntegrationClient(integration?.deployedUrls, auth, deps.fetchImpl);
    await saveErpOwnership(client, [{ erp: rows[0].listId, owns: EVERYTHING }]);
    rows[0].owns = EVERYTHING;
    return `${rows[0].name} owns every product again.`;
}

/**
 * Apply ownership across every ERP the integration serves. Never throws: a store or an
 * integration that could not be read is a `failed` outcome with the reason; anything that
 * did not go right for one ERP is its note, and the pass stands.
 *
 * @param project - the project the integration is in
 * @param integrationId - the ERP integration
 * @param deps - the auth service, the sign-in, progress
 * @param moment - what changed: a removal widens the last ERP's rule, nothing else does
 */
export async function applyErpOwnership(
    project: Project,
    integrationId: string,
    deps: ErpFillForProjectDeps,
    moment: OwnershipMoment,
): Promise<ApplyOwnershipOutcome> {
    const auth = await deps.getAuth();
    if (!auth) return { status: 'failed', detail: 'Adobe sign-in required.' };
    deps.onProgress?.('Reading which products each ERP owns');
    let options: ErpOwnershipOptions;
    try {
        const read = await readErpOwnershipOptionsForProject(project, integrationId, auth, deps.authManager, deps.fetchImpl);
        if ('refusal' in read) return { status: 'failed', detail: read.refusal };
        options = read;
    } catch (error) {
        return { status: 'failed', detail: (error as Error).message };
    }
    const rows = rowsOf(project, integrationId, options);
    if (rows.length === 0) return { status: 'failed', detail: 'The integration has no ERP in this project.' };
    const notes: string[] = [];
    try {
        const widened = await widenLastErp(project, integrationId, rows, moment, deps);
        if (widened) notes.push(widened);
    } catch (error) {
        notes.push(`${rows[0].name}'s rule was not set back to everything: ${(error as Error).message}`);
    }
    for (const row of rows) {
        const dead = deadWebsitesNote(row, options.websites);
        if (dead) notes.push(dead);
    }
    const fills = await fillEveryErp(project, integrationId, deps);
    const owners = ownersAcross(options.products, rulesOf(options, rows));
    const erps: OwnershipErpReport[] = [];
    for (const row of rows) {
        const owned = ownedBy(owners, row.listId);
        const onProgress = (step: string) => deps.onProgress?.(rows.length > 1 ? `${row.name}: ${step}` : step);
        const marked = await reconcileStatuses(row, owned, { ...deps, onProgress }, project);
        // The catch-all owning nothing (an empty store, or every product claimed) is not an action item; a rule that matches nothing is.
        if (owned.size === 0 && row.owns.mode !== 'all') notes.push(ownsNothingNote(row));
        if (marked.note) notes.push(marked.note);
        if (marked.restored > 0) {
            notes.push(`${row.name}: ${marked.restored} product${marked.restored === 1 ? ' is' : 's are'} sellable again.`);
        }
        erps.push({
            ...row,
            ownsNow: owned.size,
            discontinued: marked.discontinued,
            restored: marked.restored,
            ...(marked.note ? { note: marked.note } : {}),
        });
    }
    const unowned = [...owners.values()].filter((claimed) => claimed.length === 0).length;
    if (unowned > 0) {
        notes.push(`${unowned} product${unowned === 1 ? '' : 's'} belong${unowned === 1 ? 's' : ''} to no ERP.`);
    }
    notes.push(...overlapNotes(owners, options));
    return { status: 'applied', erps, fills, unowned, notes };
}
