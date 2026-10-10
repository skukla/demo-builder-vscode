/**
 * The fix that is settings (AB-77): the `path` = `value` rows a catalog step declares under
 * `fix: { kind: 'config' }`, written through `PUT /V1/system/config` (Adobe Commerce as a
 * Cloud Service, since 2026-09-08).
 *
 * Reads first: a row whose value already stands is not written. Writes only the rest, in one
 * PUT, and reads the answer's `errors` list — a refused path comes back there under HTTP 200,
 * so a write that does not read it cannot tell. Records, per row written, what the scope
 * stored before and what was in force, so the undo can put it back.
 *
 * @module features/app-builder/services/storePreparation/configFix
 */

import type { CommerceGet } from '../erpFillReaders';
import { errorText, type FixApplied, type FixDeps, type FixPreview, type FixUndone, type StepFix } from './fixContract';
import type { SetupConfigFix, SetupConfigFixItem } from '@/types/appBuilderComponents';
import type { CommerceSystemConfigList, CommerceSystemConfigPutAnswer, CommerceSystemConfigWrite } from '@/types/commerceWire';
import type { CommerceConfigPrevious, StorePreparationStepRecord } from '@/types/storePreparation';

/** What Commerce holds for a Yes/No or a choice nothing has set. */
const COMMERCE_DEFAULT = '0';

/** The path of `GET system/config` for some settings at one scope. */
export function configListPath(paths: readonly string[], scope: 'default' | 'website', websiteCode?: string): string {
    const filter = 'searchCriteria[filterGroups][0][filters][0]';
    const where = scope === 'website' ? `scope=website&scopeCode=${encodeURIComponent(websiteCode ?? '')}&` : 'scope=default&';
    return `system/config?${where}${filter}[field]=path&${filter}[value]=${encodeURIComponent(paths.join(','))}&${filter}[conditionType]=in`;
}

/** The stored value per path at one scope; a path with no row is absent. */
async function storedAt(get: CommerceGet, paths: readonly string[], scope: 'default' | 'website', websiteCode?: string): Promise<Map<string, string | null>> {
    const answer = (await get(configListPath(paths, scope, websiteCode))) as CommerceSystemConfigList | null;
    const stored = new Map<string, string | null>();
    for (const row of answer?.items ?? []) {
        if (paths.includes(row.path)) stored.set(row.path, row.value ?? null);
    }
    return stored;
}

/** Every item's previous state: what its scope stores, and what is in force there. */
export async function readPrevious(
    get: CommerceGet,
    items: ReadonlyArray<Pick<SetupConfigFixItem, 'path' | 'scope'>>,
    websiteCode?: string,
): Promise<CommerceConfigPrevious[]> {
    const paths = [...new Set(items.map((item) => item.path))];
    const atDefault = await storedAt(get, paths, 'default');
    const needsWebsite = items.some((item) => item.scope === 'website');
    const atWebsite = needsWebsite ? await storedAt(get, paths, 'website', websiteCode) : new Map<string, string | null>();
    return items.map((item) => {
        const own = item.scope === 'website' ? atWebsite.get(item.path) : atDefault.get(item.path);
        const stored = own === undefined ? null : own;
        const inherited = atDefault.get(item.path);
        const effective = stored ?? (inherited === undefined || inherited === null ? COMMERCE_DEFAULT : inherited);
        return {
            path: item.path,
            scope: item.scope,
            ...(item.scope === 'website' ? { scopeCode: websiteCode } : {}),
            stored,
            effective,
        };
    });
}

/** One PUT row for an item at its resolved scope. */
function writeRow(item: { path: string; scope: 'default' | 'website'; scopeCode?: string }, value: string): CommerceSystemConfigWrite {
    return {
        path: item.path,
        value,
        scope: item.scope,
        ...(item.scope === 'website' ? { scope_code: item.scopeCode } : {}),
    };
}

/** "payment/companycredit/active at the website: 0 → 1". */
function changeLine(item: { path: string; scope: string }, from: string, to: string): string {
    return `${item.path} at the ${item.scope} scope: ${from} → ${to}`;
}

/** The rows Commerce refused, keyed by path and scope, in its words. */
function refusals(answer: CommerceSystemConfigPutAnswer | null): Map<string, string> {
    const refused = new Map<string, string>();
    for (const error of answer?.errors ?? []) refused.set(`${error.path}@${error.scope ?? 'default'}`, error.message);
    return refused;
}

/** Write some rows in one PUT and split them into saved and refused. */
async function writeRows(
    deps: FixDeps,
    rows: Array<{ write: CommerceSystemConfigWrite; line: string; previous: CommerceConfigPrevious }>,
): Promise<{ changes: string[]; rejected: string[]; saved: CommerceConfigPrevious[] }> {
    if (rows.length === 0) return { changes: [], rejected: [], saved: [] };
    let answer: CommerceSystemConfigPutAnswer | null;
    try {
        answer = (await deps.commerce.send('PUT', 'system/config', { items: rows.map((row) => row.write) })) as CommerceSystemConfigPutAnswer | null;
    } catch (error) {
        return { changes: [], rejected: rows.map((row) => `${row.line}: ${errorText(error)}`), saved: [] };
    }
    const refused = refusals(answer);
    const changes: string[] = [];
    const rejected: string[] = [];
    const saved: CommerceConfigPrevious[] = [];
    for (const row of rows) {
        const why = refused.get(`${row.write.path}@${row.write.scope}`);
        if (why) rejected.push(`${row.line}: ${why}`);
        else {
            changes.push(row.line);
            saved.push(row.previous);
        }
    }
    return { changes, rejected, saved };
}

/** The fix for a step whose `fix` is settings. */
export function configFix(fix: SetupConfigFix): StepFix {
    const scoped = (deps: FixDeps): void => {
        if (fix.items.some((item) => item.scope === 'website') && !deps.websiteCode) {
            throw new Error('The project names no Commerce website, and this step writes a website setting.');
        }
    };
    return {
        async preview(deps): Promise<FixPreview> {
            scoped(deps);
            const previous = await readPrevious(deps.commerce.get, fix.items, deps.websiteCode);
            const changes = fix.items.flatMap((item, i) =>
                previous[i].effective === item.value ? [] : [changeLine(item, previous[i].effective, item.value)],
            );
            return { changes, ...(fix.manual ? { manual: fix.manual } : {}) };
        },
        async apply(deps): Promise<FixApplied> {
            scoped(deps);
            const previous = await readPrevious(deps.commerce.get, fix.items, deps.websiteCode);
            const rows = fix.items.flatMap((item, i) =>
                previous[i].effective === item.value
                    ? []
                    : [{ write: writeRow(previous[i], item.value), line: changeLine(item, previous[i].effective, item.value), previous: previous[i] }],
            );
            const written = await writeRows(deps, rows);
            const record: StorePreparationStepRecord | undefined =
                written.saved.length > 0 ? { kind: 'config', previous: written.saved } : undefined;
            return { changes: written.changes, rejected: written.rejected, ...(record ? { record } : {}), ...(fix.manual ? { manual: fix.manual } : {}) };
        },
        async undo(deps, record): Promise<FixUndone> {
            if (record.kind !== 'config') return { changes: [], rejected: [`The record is not a settings record (${record.kind}).`] };
            const now = await readPrevious(deps.commerce.get, record.previous, deps.websiteCode);
            const rows = record.previous.flatMap((item, i) =>
                now[i].effective === item.effective
                    ? []
                    : [{ write: writeRow(item, item.effective), line: restoreLine(item, now[i].effective), previous: item }],
            );
            const written = await writeRows(deps, rows);
            return { changes: written.changes, rejected: written.rejected };
        },
    };
}

/** "catalog/price/scope at the default scope: 1 → 0 (restored)"; says when it was inherited before. */
function restoreLine(item: CommerceConfigPrevious, from: string): string {
    const back = `${changeLine(item, from, item.effective)} (restored`;
    return item.stored === null ? `${back}; it was inherited before and is set at the ${item.scope} scope now)` : `${back})`;
}
