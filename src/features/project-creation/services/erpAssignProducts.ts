/**
 * "Assign products" to an ERP (AB-74), composed: Commerce's products and attribute sets, each
 * ERP's rule through the integration, the preview, the bulk write of `erp_owner` and its undo.
 *
 * Before 2026-10-09 the SC tagged products by hand in the Commerce Admin, or an agent tagged
 * them one `PUT` at a time; at 13–23 s a product on ACCS, Accuform's 96 and Justrite's 43
 * took about 35 minutes. One bulk call writes them all.
 *
 * What is written: on each product, the `erp_owner` value in the ERP's own rule, nothing
 * else (`PUT products/bySku` bodies carry the SKU and that one attribute; Commerce has no
 * PATCH for products). A product whose attribute set lacks `erp_owner` is not written: its
 * value would be dropped with a 200. A product already carrying the value is not written.
 *
 * What is recorded, and for how long: the value each written product had BEFORE (the empty
 * string for none) goes on the ERP's component record as `erpAssignment`, replacing the
 * previous assignment's record; the undo puts those values back on the products that still
 * carry the value written, and then removes the record; removing the ERP removes it too.
 *
 * @module features/project-creation/services/erpAssignProducts
 */

import { commerceClientForProject } from './erpFillForProject';
import { listedErpNames, readErpRules } from './erpRules';
import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import { followBulk, startBulk, type BulkFollowDeps, type CommerceSend } from '@/features/app-builder/services/commerceBulk';
import {
    choicesOf,
    listAssignableProducts,
    listCategoryNames,
    ownedRowOfAssign,
    ownerBody,
    previewAssignment,
    type AssignProductRow,
} from '@/features/app-builder/services/erpAssignSelection';
import { listWebsites, type CommerceGet } from '@/features/app-builder/services/erpFillReaders';
import { ErpIntegrationClient } from '@/features/app-builder/services/erpIntegrationClient';
import { erpListIdOf } from '@/features/app-builder/services/erpList';
import { OWNER_CODE, setsWithoutOwner } from '@/features/app-builder/services/erpOwnerAttributeSets';
import { describeOwnsAcross, ownersAcross } from '@/features/app-builder/services/erpOwnership';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { Project } from '@/types/base';
import type {
    AttributeSetWithoutOwner,
    CommerceBulkOutcome,
    ErpAssignmentRecord,
    ErpAssignOptions,
    ErpAssignPreview,
    ErpProductSelection,
} from '@/types/erpAssign';
import type { ErpOwnsEntry } from '@/types/erpOwnership';

/** Commerce, signed: a GET and a write. */
export interface CommerceClient {
    get: CommerceGet;
    send: CommerceSend;
}

/** Which ERP, in which project, through which integration. */
export interface ErpAssignTarget {
    project: Project;
    integrationId: string;
    /** The ERP's component id. */
    erpId: string;
}

/** Everything a read needs: the target, the sign-in, and Commerce (opened by `openCommerce`). */
export interface ErpAssignDeps {
    auth: AppManagementAuth;
    commerce: CommerceClient;
    fetchImpl?: typeof fetch;
}

/** Open the project's signed Commerce client, or say why there is none. */
export async function openCommerce(
    project: Project,
    authManager: AuthenticationService,
    fetchImpl?: typeof fetch,
): Promise<CommerceClient | { refusal: string }> {
    return commerceClientForProject(project, authManager, fetchImpl);
}

/** The store and the rules as an assignment reads them. */
interface AssignState {
    erp: ErpAssignPreview['erp'];
    /** The value a write sets, read off the ERP's own rule; absent with `refusal`. */
    value?: string;
    refusal?: string;
    rows: AssignProductRow[];
    owners: Map<string, string[]>;
    names: Map<string, string>;
    setsWithoutOwner: AttributeSetWithoutOwner[];
}

/** The value an ERP's rule tags its products with, or why it has none. */
function valueOfRule(name: string, rule: ErpOwnsEntry['owns'] | undefined): { value: string } | { refusal: string } {
    const [code, value] = (rule?.attribute ?? '').split('=');
    if (rule?.mode === 'attribute' && code === OWNER_CODE && value) return { value };
    const owns = rule ? describeOwnsAcross(rule) : 'nothing it can be read for';
    return {
        refusal:
            `${name} owns ${owns.replace(/^products /u, 'the products ')}, not the products tagged with ${OWNER_CODE}, ` +
            `so there is nothing to assign to it. Change its rule to ${OWNER_CODE} in its Settings first.`,
    };
}

/** Read the store and every ERP's rule; the preview, the options and the write all start here. */
async function readAssignState(target: ErpAssignTarget, deps: ErpAssignDeps): Promise<AssignState> {
    const { project, integrationId, erpId } = target;
    const listId = erpListIdOf(project, erpId, getAppBuilderComponentCatalog());
    if (!listId) throw new Error(`${erpId} has no id in the integration's list yet; add it again to finish.`);
    const name = project.appBuilderComponents?.[erpId]?.name ?? erpId;
    const integration = project.appBuilderComponents?.[integrationId];
    const client = new ErpIntegrationClient(integration?.deployedUrls, deps.auth, deps.fetchImpl);
    const [rows, websites, rules] = await Promise.all([
        listAssignableProducts(deps.commerce.get),
        listWebsites(deps.commerce.get),
        readErpRules(client, listedErpNames(project, integrationId)),
    ]);
    const codeById = new Map(websites.map((site) => [site.id, site.code]));
    const owners = ownersAcross(rows.map((row) => ownedRowOfAssign(row, codeById)), rules);
    const ruled = valueOfRule(name, rules.find((rule) => rule.erp === listId)?.owns);
    return {
        erp: { id: erpId, name, listId },
        ...ruled,
        rows,
        owners,
        names: new Map(rules.map((rule) => [rule.erp, rule.name])),
        setsWithoutOwner: await setsWithoutOwner(deps.commerce.get, rows),
    };
}

/** What the modal opens with: the ERP, its value (or why none), the pickers' choices, the sets to fix. */
export async function readErpAssignOptions(target: ErpAssignTarget, deps: ErpAssignDeps): Promise<ErpAssignOptions> {
    const state = await readAssignState(target, deps);
    const { categories, brands } = choicesOf(state.rows, await listCategoryNames(deps.commerce.get));
    const last = target.project.appBuilderComponents?.[target.erpId]?.erpAssignment;
    return {
        erp: state.erp,
        ...(state.value ? { ownerValue: state.value } : {}),
        ...(state.refusal ? { refusal: state.refusal } : {}),
        categories,
        brands,
        setsWithoutOwner: state.setsWithoutOwner,
        ...(last ? { lastAssignmentAt: last.at } : {}),
        products: state.rows.map(({ sku, attributeSetId, categoryIds, brand, owner }) => ({
            sku,
            attributeSetId,
            categoryIds,
            ...(brand ? { brand } : {}),
            owner,
        })),
        owners: Object.fromEntries(state.owners),
        names: Object.fromEntries(state.names),
    };
}

/** A preview, with the rows the write would take and the value; or why nothing can be written. */
export type AssignPlan =
    | { preview: ErpAssignPreview; toWrite: AssignProductRow[]; value: string }
    | { refusal: string };

/** Work out what assigning the selection would do. Reads; writes nothing. */
export async function planErpAssignment(
    target: ErpAssignTarget,
    deps: ErpAssignDeps,
    selection: ErpProductSelection,
): Promise<AssignPlan> {
    const state = await readAssignState(target, deps);
    if (!state.value) return { refusal: state.refusal ?? `${state.erp.name} has no ${OWNER_CODE} value.` };
    const { preview, toWrite } = previewAssignment({ ...state, selection, value: state.value });
    return { preview, toWrite, value: state.value };
}

/** Write `erp_owner` on each SKU in one bulk call, and follow it to its end. */
export async function writeOwnerValues(
    commerce: CommerceClient,
    entries: ReadonlyArray<{ sku: string; value: string }>,
    follow: BulkFollowDeps,
): Promise<CommerceBulkOutcome> {
    const uuid = await startBulk(
        commerce.send,
        'PUT',
        'products/bySku',
        entries.map((entry) => ownerBody(entry.sku, entry.value)),
    );
    return followBulk(commerce.get, uuid, entries.length, follow);
}

/**
 * The record an assignment keeps: each product it tried to write, with its value before. A
 * product Commerce refused still holds that value, so the undo (which restores only products
 * carrying the value written) passes over it; the record need not know which operation was
 * which, and an operation's id is not matched to a request here.
 */
export function assignmentRecord(toWrite: readonly AssignProductRow[], value: string, at: string): ErpAssignmentRecord {
    return { at, value, previous: toWrite.map((row) => ({ sku: row.sku, value: row.owner })) };
}

/** What an undo will put back, and what it leaves because the product has changed since. */
export interface UndoPlan {
    restore: Array<{ sku: string; value: string }>;
    /** Products no longer carrying the value written: changed since, left alone. */
    changedSince: string[];
}

/** Plan the undo against Commerce as it stands: only products that still carry the value written. */
export async function planUndo(commerce: CommerceClient, record: ErpAssignmentRecord): Promise<UndoPlan> {
    const now = new Map((await listAssignableProducts(commerce.get)).map((row) => [row.sku, row.owner]));
    const restore: UndoPlan['restore'] = [];
    const changedSince: string[] = [];
    for (const entry of record.previous) {
        const current = now.get(entry.sku);
        if (current === record.value) restore.push(entry);
        else changedSince.push(entry.sku);
    }
    return { restore, changedSince };
}
