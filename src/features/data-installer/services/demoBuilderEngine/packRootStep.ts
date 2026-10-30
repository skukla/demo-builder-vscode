/**
 * The one Admin step a pack can leave (datapack-engine step 12, owner 2026-10-30): when the
 * store's root is shared with another store, the pack keeps its own root (`packRoot.ts`), and only
 * the SC can point the store at it, in the Admin. No API can (`POST/PUT /V1/store/storeGroups`
 * answer 404 on ACCS, measured 2026-10-30).
 *
 * So the install asks, mid-way, through `askDuringOperation` (PL-59: the progress modal when one
 * hosts the install, a notification when none does, a VS Code modal under an agent): Open the
 * Admin, I've done it, Skip for now. "I've done it" runs the read-only check (`checkPackRoot`):
 * set, the install carries on; not set, the question comes back saying what the store shows now.
 * "Skip for now" (or a dismissed question) finishes the install with the step left open on the
 * install record, in the setup guide's step format (`packRootGuideStep`), where its Check runs the
 * same read; a repeat install reaches the same check and asks again.
 *
 * @module features/data-installer/services/demoBuilderEngine/packRootStep
 */

import type { PackRootStep } from './installRecord';
import { type KindContext, readOrNull, segment } from './kindContext';
import { type RootPlacement, type StoreRoot, packRootOf } from './packRoot';
import type { Question } from '@/core/vscode/operationPrompt';
import type { SetupStep } from '@/types/appBuilderComponents';
import type { CommerceGet } from '@/types/commerceWire';

export type { PackRootStep };

/** How the install asks the SC, and opens the Admin for them: handed in, so tests need no VS Code. */
export interface RootStepAsker {
    ask: (question: Question, ...actions: string[]) => Promise<string | undefined>;
    openAdmin: () => Promise<void>;
}

/** The three answers, the first being the one that continues the work. */
export const OPEN_ADMIN = 'Open the Admin';
export const DONE_IT = "I've done it";
export const SKIP = 'Skip for now';

/** What the read-only check found. `done` undefined: it could not tell. */
export interface RootCheck {
    done?: boolean;
    note: string;
}

/** The step, in the setup guide's own format (`SetupStep`, the shape `app-builder-components.json` declares). */
export function packRootGuideStep(step: PackRootStep): Omit<SetupStep, 'check'> {
    return {
        id: 'pack-root-category',
        label: 'Root category',
        title: `Show ${step.rootName}'s categories on the storefront`,
        why: `The store ${step.storeName} shares its root category with another store, so ${step.rootName}'s categories are a root of their own, and a store shows only its root's categories. No API can change a store's root.`,
        where: `Stores > All Stores > ${step.storeName}`,
        path: ['Stores', 'All Stores', step.storeName],
        enter: [`Root Category: ${step.rootName}`],
        then: 'Save Store.',
    };
}

/** "In Stores > All Stores > JustRite Test Store, set Root Category to Frescopa, then Save Store." */
function instruction(step: PackRootStep): string {
    return `In ${packRootGuideStep(step).where}, set Root Category to ${step.rootName}, then Save Store.`;
}

/** The store's root by name, when the category can be read (no ids: the SC reads this). */
async function rootLabel(get: CommerceGet, id: number): Promise<string> {
    const category = await readOrNull<{ name?: string }>(get, `categories/${segment(id)}`).catch(() => null);
    return category?.name ?? 'another category';
}

/**
 * Whether the store shows the pack's root now. Reads only: `GET store/storeGroups`, the store by
 * `code`, its `root_category_id` against the pack root's id.
 */
export async function checkPackRoot(get: CommerceGet, step: PackRootStep): Promise<RootCheck> {
    let groups: Array<{ code?: string; root_category_id?: number | string }>;
    try {
        groups = ((await get('store/storeGroups')) ?? []) as typeof groups;
    } catch (error) {
        return { note: `Could not read the stores: ${error instanceof Error ? error.message : String(error)}` };
    }
    const group = groups.find((g) => g.code === step.storeCode);
    if (!group) return { note: `The store ${step.storeName} is not in Commerce any more.` };
    if (Number(group.root_category_id) === step.rootId) return { done: true, note: `The store ${step.storeName} shows ${step.rootName}'s categories.` };
    const now = await rootLabel(get, Number(group.root_category_id));
    return { done: false, note: `The store ${step.storeName} still uses the root category ${now}, not ${step.rootName}.` };
}

/**
 * Why the pack's root must stay, when a store shows it as its root: removing it would leave that
 * store with none, and only the SC can point the store back, in the Admin. Reads
 * `GET store/storeGroups` (`root_category_id`, `name`); a read that fails keeps the root too.
 *
 * @returns the reason, for the removal's "Kept the category …" line, or undefined when no store shows it
 */
export async function storeShowingRoot(get: CommerceGet, rootId: string): Promise<string | undefined> {
    let groups: Array<{ id?: number | string; name?: string; root_category_id?: number | string }>;
    try {
        groups = ((await get('store/storeGroups')) ?? []) as typeof groups;
    } catch {
        return 'Demo Builder could not read which store shows it as its root category';
    }
    const store = groups.find((g) => Number(g.id) !== 0 && String(g.root_category_id) === rootId);
    if (!store) return undefined;
    return `the store ${store.name ?? store.id} shows it as its root category. In the Admin, Stores > All Stores > ${store.name ?? store.id}, set Root Category back to the one it had and Save Store, then remove the pack again`;
}

/**
 * The question: the one thing to do, first (owner, 2026-10-30: the first wording led with why,
 * named store codes and buried the step). Why the store needs it stays in the setup step's `why`.
 * After a check found it not done, what the store uses now comes first.
 */
function question(step: PackRootStep, found?: string): Question {
    const ask = `${instruction(step)} Demo Builder can't make this change for you.`;
    return {
        title: `One step in the Admin to show ${step.rootName}'s categories`,
        message: found ? `${found} ${ask}` : ask,
        tone: 'info',
        dismiss: SKIP,
    };
}

/** Ask until the check passes or the SC skips; the step as it stands at the end. */
async function askUntilSet(get: CommerceGet, step: PackRootStep, asker: RootStepAsker): Promise<PackRootStep> {
    let found: string | undefined;
    for (;;) {
        const answer = await asker.ask(question(step, found), OPEN_ADMIN, DONE_IT, SKIP);
        if (answer === OPEN_ADMIN) {
            await asker.openAdmin();
            continue;
        }
        if (answer !== DONE_IT) return { ...step, state: 'open' };
        const check = await checkPackRoot(get, step);
        if (check.done) return { ...step, state: 'done', note: check.note };
        found = check.note;
    }
}

/**
 * After the categories kind, when the pack kept its own root: check, ask if it is not set, and
 * record where the step stands. Nothing when the pack made no root here (or the SC deleted it).
 *
 * @param storeRoot - the install target's store, read before the install
 * @param asker - how to ask; absent, the step is left open without a question
 */
export async function settlePackRoot(ctx: KindContext, storeRoot: StoreRoot, asker: RootStepAsker | undefined): Promise<PackRootStep | undefined> {
    const root = ctx.session.packRoot;
    if (!root) return undefined;
    const before = ctx.recorder.rootStep;
    const step: PackRootStep = {
        state: 'open',
        storeCode: storeRoot.storeCode,
        storeName: storeRoot.storeName,
        rootId: root.id,
        rootName: root.name,
        // What the store showed before, for putting it back before a removal (kept from the first install).
        storeRootId: before?.storeRootId ?? storeRoot.rootId,
        sharedWith: storeRoot.sharedWith.join(' and ') || 'another store',
    };
    const check = await checkPackRoot(ctx.get, step);
    const settled = check.done ? { ...step, state: 'done' as const, note: check.note } : asker ? await askUntilSet(ctx.get, step, asker) : step;
    await ctx.recorder.setRootStep(settled);
    return settled;
}

/** The one line an install ends with about the step: what is left, or that it is done. */
export function rootStepLine(step: PackRootStep | undefined): string | undefined {
    if (!step) return undefined;
    if (step.state === 'done') return `The store ${step.storeName} shows ${step.rootName}'s categories.`;
    return `One step is left in the Admin: ${packRootGuideStep(step).where}, Root Category: ${step.rootName}, then Save Store. Until then the storefront does not show ${step.rootName}'s categories.`;
}

/**
 * What installing would do with the pack's own root, for the preview (`preview_datapack_changes`):
 * the step the record holds, else where a first install would put the root.
 */
export function rootPreview(placement: RootPlacement | undefined, categories: unknown, storeRoot: StoreRoot | undefined, recorded: PackRootStep | undefined): string | undefined {
    if (recorded) return rootStepLine(recorded);
    const name = packRootOf(categories)?.name;
    if (!placement || !storeRoot || typeof name !== 'string') return undefined;
    if (placement === 'store') return `${name}'s categories would go under the root category of the store ${storeRoot.storeName}, so its storefront shows them.`;
    if (storeRoot.sharedWith.length === 0) return undefined;
    return `The store ${storeRoot.storeName} shares its root category with ${storeRoot.sharedWith.join(' and ')}, so ${name}'s categories would go in as a root of their own, and installing asks for one step in the Admin: Stores > All Stores > ${storeRoot.storeName}, Root Category: ${name}.`;
}
