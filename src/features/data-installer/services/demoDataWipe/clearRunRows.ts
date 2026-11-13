/**
 * Clear Demo Data's one run window as rows (datapack-simplification step 06, C3; the walked
 * `mockups/flow/ClearRunWindow.tsx`): "Uninstall <Datapack>" first when the project's datapack goes
 * before the clearing (one per project for Clear Commerce Instance, C4), then one row per data type the list removes, in the order the clearing works
 * through them (`wipeRun.ts`), then the ERP when one is brought in line. Every row is there from the
 * first push, so the window never grows (rule 14); the stage each report names moves the rows on.
 *
 * How it ended goes on the rows, each orange on its own: part of a step Commerce refused, orders left
 * open with a note (payment review), list settings only the Admin resets, the ERP not brought in line,
 * and part of the datapack left in Commerce on purpose. The house rule decides from them whether the
 * window ends small (`endsSmall`, rule 17). Pure: no Commerce, no VS Code.
 *
 * @module features/data-installer/services/demoDataWipe/clearRunRows
 */

import { dataTypeLabel } from '../../ui/dataTypeLabel';
import { ATTRIBUTE_SET_KIND } from '../demoBuilderEngine/attributeSetsKind';
import { ATTRIBUTE_KIND } from '../demoBuilderEngine/attributesKind';
import {
    CATALOG_KIND,
    COMPANY_KIND,
    CUSTOMER_GROUP_KIND,
    CUSTOMER_KIND,
} from '../demoBuilderEngine/b2bKeys';
import { CART_RULE_KIND } from '../demoBuilderEngine/cartRulesKind';
import { PRODUCT_KIND } from '../demoBuilderEngine/productKinds';
import { ORDERS, WEBSITE_SETTINGS } from './clearCheck';
import type { WipePlan } from './wipePlan';
import type { WipeOutcome } from './wipeRun';
import { DATAPACK_STAGES as S } from '@/core/utils/datapackStages';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { OperationRow } from '@/types/webviewPayloads';

/** The Uninstall row's kind; no data type is named this. */
export const UNINSTALL_ROW = 'uninstall-datapack';

/** The kind of the Uninstall row at this place: the first is `UNINSTALL_ROW`, the next "uninstall-datapack-2". */
const uninstallKind = (at: number): string => (at === 0 ? UNINSTALL_ROW : `${UNINSTALL_ROW}-${at + 1}`);
const isUninstall = (kind: string): boolean => kind.startsWith(UNINSTALL_ROW);
const ERP_ROW = 'erp';

/** One row: its data type, the stages that work on it, and the clearing's steps whose refusals it carries. */
interface RowSpec {
    kind: string;
    stages: readonly string[];
    steps: readonly string[];
}

/** In the clearing's order (`wipeRun.ts`); returns close inside each order's work, so they have no row. */
const RUN_ORDER: readonly RowSpec[] = [
    { kind: ORDERS, stages: [S.closingOrders.label], steps: ['orders'] },
    { kind: COMPANY_KIND, stages: [S.removingCompanies.label], steps: ['companies'] },
    { kind: CUSTOMER_KIND, stages: [S.removingCustomers.label], steps: ['customers'] },
    {
        kind: PRODUCT_KIND,
        stages: [S.removingProducts.label, S.takingProductsOff.label],
        steps: ['products', 'takenOff'],
    },
    {
        kind: CART_RULE_KIND,
        stages: [S.removingCartRules.label, S.takingRulesOff.label],
        steps: ['cartRules', 'rulesTakenOff'],
    },
    { kind: CATALOG_KIND, stages: [S.removingCatalogs.label], steps: ['catalogs'] },
    {
        kind: CUSTOMER_GROUP_KIND,
        stages: [S.removingCustomerGroups.label],
        steps: ['customerGroups'],
    },
    { kind: 'categories', stages: [S.removingCategories.label], steps: ['categories'] },
    { kind: ATTRIBUTE_SET_KIND, stages: [S.removingAttributeSets.label], steps: ['attributeSets'] },
    { kind: ATTRIBUTE_KIND, stages: [S.removingAttributes.label], steps: ['attributes'] },
    { kind: WEBSITE_SETTINGS, stages: [S.resettingSettings.label], steps: ['settings'] },
    { kind: ERP_ROW, stages: [S.updatingErp.label, S.refreshingErp.label], steps: [] },
];

/** Whether the list the SC saw does anything of this kind: only those get a row. */
function shows(plan: WipePlan, kind: string): boolean {
    if (kind === ORDERS) return plan.orders.length > 0;
    if (kind === WEBSITE_SETTINGS) return plan.settings.length + plan.listSettings.length > 0;
    if (kind === ERP_ROW) return plan.erp !== undefined && plan.check.erp?.held === undefined;
    return (plan.check.records[kind]?.removed.length ?? 0) > 0;
}

function labelOf(plan: WipePlan, kind: string): string {
    if (kind === ERP_ROW) return 'ERP';
    return plan.check.rows.find((row) => row.type === kind)?.label ?? dataTypeLabel(kind);
}

const waiting = (kind: string, label: string): OperationRow => ({
    kind,
    label,
    status: 'pending',
    line: 'Waiting',
});
const done = (row: OperationRow): OperationRow =>
    row.problem ? row : { kind: row.kind, label: row.label, status: 'success', line: 'Done' };
const warned = (row: OperationRow, text: string): OperationRow => ({
    kind: row.kind,
    label: row.label,
    status: 'warning',
    problem: { text, failed: false },
});

/** "1 order needs closing in the Commerce Admin.", "2 list settings need resetting in the Commerce Admin." */
function adminLine(count: number, one: string, many: string, verb: string): string {
    return `${count} ${count === 1 ? `${one} needs` : `${many} need`} ${verb} in the Commerce Admin.`;
}

/** "Couldn't remove 2 of the products." */
const refusedLine = (failed: WipeOutcome['failed'][number]): string =>
    `Couldn't ${failed.what.replace('1', String(failed.count))}.`;

/** What the run tells its rows, and how they end. */
export interface ClearRun {
    /** Each report of the clearing, the rows moved on to its stage, passed on with them. */
    report: ReportStage;
    /** The removal at this place is running (`true`) or done: while it runs, what it reports goes on its Uninstall row. */
    uninstalling: (running: boolean, at?: number) => void;
    /** Whether a removal, or a wipe step, has begun: from then on the run has written, or may have. */
    writing: () => boolean;
    /** The rows as the removal at this place, not finishing, left them: those before it done, nothing after it run. */
    stopped: (reason: string, at?: number) => OperationRow[];
    /** The rows as the clearing ended; `leftInStore` says, per removal, whether it left part in Commerce on purpose. */
    ended: (outcome: WipeOutcome, leftInStore: readonly boolean[]) => OperationRow[];
}

/**
 * The run's rows for the list the SC saw.
 *
 * @param uninstalls - each datapack the clearing uninstalls first, as the SC knows it, in order; none when it uninstalls nothing
 * @param report - where the rows go with each stage (the progress window's reporter)
 */
export function clearRun(
    plan: WipePlan,
    uninstalls: readonly string[],
    report: ReportStage,
): ClearRun {
    const specs = RUN_ORDER.filter((spec) => shows(plan, spec.kind));
    let rows: OperationRow[] = [
        ...uninstalls.map((name, at) => waiting(uninstallKind(at), `Uninstall ${name}`)),
        ...specs.map((spec) => waiting(spec.kind, labelOf(plan, spec.kind))),
    ];
    let removing: number | undefined;
    let wrote = false;
    /** Every row before `kind` done, and `kind` working, its line under it. */
    const working = (kind: string, line: string | undefined): void => {
        const at = rows.findIndex((row) => row.kind === kind);
        if (at < 0) return;
        rows = rows.map((row, i) => {
            if (i < at) return done(row);
            return i === at
                ? {
                      kind: row.kind,
                      label: row.label,
                      status: 'checking',
                      ...(line ? { line } : {}),
                  }
                : row;
        });
    };
    const rowFor = (stage: string): string | undefined => {
        if (removing !== undefined) return uninstallKind(removing);
        if (stage === S.verifyingDemoData.label) return specs[0]?.kind;
        return specs.find((spec) => spec.stages.includes(stage))?.kind;
    };
    const ending = (outcome: WipeOutcome): Map<string, string> => problemsOf(specs, outcome);
    return {
        report: (stage, step, position) => {
            if (RUN_ORDER.some((spec) => spec.stages.includes(stage))) wrote = true;
            const kind = rowFor(stage);
            if (kind) working(kind, isUninstall(kind) ? (step ?? stage) : step);
            report(stage, step, position, rows);
        },
        uninstalling: (running, at = 0) => {
            removing = running ? at : undefined;
            if (running) wrote = true;
        },
        writing: () => wrote,
        stopped: (reason, at = 0) =>
            rows.map((row, i) => {
                if (i < at) return done(row);
                return i === at
                    ? { kind: row.kind, label: row.label, status: 'error', problem: { text: reason, failed: true } }
                    : { kind: row.kind, label: row.label, status: 'pending', line: 'Not run' };
            }),
        ended: (outcome, leftInStore) => {
            const problems = ending(outcome);
            leftInStore.forEach((left, at) => {
                if (left) problems.set(uninstallKind(at), 'Part of it was left in Commerce on purpose.');
            });
            return rows.map((row) => {
                const text = problems.get(row.kind);
                return text ? warned(row, text) : done({ ...row, problem: undefined });
            });
        },
    };
}

/** Each row's problem as the clearing ended, by kind. */
function problemsOf(specs: readonly RowSpec[], outcome: WipeOutcome): Map<string, string> {
    const problems = new Map<string, string>();
    const add = (kind: string, text: string): void => {
        problems.set(kind, problems.has(kind) ? `${problems.get(kind)} ${text}` : text);
    };
    for (const failed of outcome.failed) {
        const spec = specs.find((s) => s.steps.includes(failed.step));
        if (spec) add(spec.kind, refusedLine(failed));
    }
    if (outcome.leftOpen.length > 0)
        add(ORDERS, adminLine(outcome.leftOpen.length, 'order', 'orders', 'closing'));
    if (outcome.listSettings.length > 0)
        add(
            WEBSITE_SETTINGS,
            adminLine(outcome.listSettings.length, 'list setting', 'list settings', 'resetting'),
        );
    if (outcome.erp?.problem) add(ERP_ROW, outcome.erp.problem);
    return problems;
}

/** What only the Commerce Admin can finish: orders left open, list settings. */
export function needsAdmin(outcome: WipeOutcome): boolean {
    return outcome.leftOpen.length > 0 || outcome.listSettings.length > 0;
}
