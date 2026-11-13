/**
 * `check-demo-data` (datapack-engine step 10; datapack-simplification step 06): what clearing the
 * project's websites would do, as one row and one full record list per data type (`ClearCheck`).
 * Reads only. The plan is kept by its token, so the clearing can be held to it.
 *
 * **The list is made as if the project's datapack were already gone** (step 06, C3): the clearing
 * uninstalls it first, so its install record is dropped from what the plan respects
 * (`asIfRemoved`), and the summary, Review Records and "Clear N Items" count what it installed. What
 * another project's datapack also lists stays kept (S2). Only a pack Demo Builder installed has a
 * record to drop and a removal to run; for one the service installed, the list respects every record
 * and names no datapack.
 *
 * Another local project using one of these websites is a `warning` naming it, never a refusal
 * (P6-Q2). A data type a read failed for is marked by its kind (P6-Q3): a slow one is the `problem`
 * to retry; a refused or strange one is left alone and the rest is planned.
 *
 * @module features/data-installer/handlers/demoDataCheck
 */

import { type ShownUnread, rememberShownClear } from '../services/demoDataWipe/shownClears';
import type { WipeClaims } from '../services/demoDataWipe/wipeClaims';
import { type WipePlan, planWipe } from '../services/demoDataWipe/wipePlan';
import { rememberedPackName } from '../services/packNames';
import { dataTypeLabel } from '../ui/dataTypeLabel';
import {
    type DemoDataDeps,
    LOG_PREFIX,
    type Opened,
    type ShownPlan,
    type ShownPlans,
    claimsOf,
    failure,
    keep,
    openStore,
} from './demoDataStore';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import type { Project } from '@/types/base';
import type { ClearCheck } from '@/types/demoDataWipe';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** The plan the check shows, with what any install record it respects lists left. */
export async function checkPlan(
    opened: Opened,
    claims: WipeClaims,
    context: HandlerContext,
): Promise<WipePlan> {
    const plan = await planWipe(opened.commerce.get, claims.scope, {
        ...claims.respects,
        erp: opened.erp,
    });
    for (const [type, detail] of Object.entries(plan.unreadDetails))
        context.logger.warn(`${LOG_PREFIX} ${dataTypeLabel(type)} could not be read: ${detail}`);
    return plan;
}

/** The types the plan could not read, each with how and Commerce's words: Fix with AI's prompt reads them. */
function unreadOf(plan: WipePlan): Record<string, ShownUnread> | undefined {
    const kinds = Object.entries(plan.check.unread ?? {});
    if (kinds.length === 0) return undefined;
    return Object.fromEntries(
        kinds.map(([type, kind]) => [type, { kind, detail: plan.unreadDetails[type] ?? '' }]),
    );
}

/**
 * The check's answer: the plan's, with the warning and the datapack the clearing uninstalls first.
 * What it covers is noted by its token, so `clear_demo_data`'s consent can name it (`shownClears.ts`).
 */
export function answerOf(
    plan: WipePlan,
    claims: WipeClaims,
    project: Project,
    removing?: ShownPlan['removing'],
): ClearCheck {
    const datapack = removing
        ? { datapack: { name: removing.name, changes: 'unchecked' as const, pack: removing.pack } }
        : {};
    const warning = claims.warning ? { warning: claims.warning } : {};
    const unread = unreadOf(plan);
    rememberShownClear(plan.check.token, {
        websites: plan.websiteCodes,
        ...warning,
        ...(unread ? { unread } : {}),
        ...(removing ? { datapack: removing.name } : {}),
    });
    return { ...plan.check, project: getProjectDisplayName(project), ...warning, ...datapack };
}

/** The datapack the clearing uninstalls first, as the SC knows it, when the check dropped its record. */
function removingOf(
    context: HandlerContext,
    project: Project,
    claims: WipeClaims,
): ShownPlan['removing'] {
    const pack = project.datapack;
    if (!pack || !claims.removing) return undefined;
    const memory = context.context?.globalState;
    return {
        pack,
        name: (memory ? rememberedPackName(memory, pack.name) : undefined) ?? pack.name,
    };
}

export async function checkDemoData(
    deps: DemoDataDeps,
    plans: ShownPlans,
    context: HandlerContext,
): Promise<HandlerResponse> {
    try {
        const opened = await openStore(deps, context);
        if ('response' in opened) return opened.response;
        const pack = opened.project.datapack;
        const claims = await claimsOf(deps, opened, pack ? { asIfRemoved: pack } : {});
        const removing = removingOf(context, opened.project, claims);
        const plan = {
            ...(await checkPlan(opened, claims, context)),
            ...(claims.removing ? { setBack: claims.removing.setBack } : {}),
        };
        keep(plans, { plan, ...(removing ? { removing } : {}) });
        return { success: true, data: answerOf(plan, claims, opened.project, removing) };
    } catch (error) {
        return failure(context, error, "What this project's websites hold could not be read.");
    }
}
