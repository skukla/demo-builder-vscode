/**
 * The setup that is settings (AB-77): the `path` = `value` rows a catalog step declares under
 * `setup: { kind: 'config' }`, written through `PUT /V1/system/config` (Adobe Commerce as a
 * Cloud Service, since 2026-09-08).
 *
 * Reads first: a row whose value already stands is not written. Writes only the rest, in one
 * PUT, and reads the answer's `errors` list — a refused path comes back there under HTTP 200,
 * so a write that does not read it cannot tell. Records, per row written, what the scope
 * stored before, what was in force, and the value written, so the undo can put it back.
 *
 * The undo puts a setting back only while it still holds the value written (datapack-engine
 * step 06, AB-83): the store's value now, the value written and the value before go to the one
 * rule (`decideOwnedChange`, `core/utils/ownedChange`). A setting changed since is kept, and
 * the undo says so in one line (`kept`). A record written before 2026-10-29 has no `wrote`;
 * the step's own value is what it wrote. With neither (an older `set_commerce_config` record),
 * nothing says it is still ours, so it is kept too.
 *
 * @module features/app-builder/services/storePreparation/configSetup
 */

import { errorText, type SetupApplied, type SetupDeps, type SetupPreview, type SetupUndone, type StepSetup } from './setupContract';
import { andList } from '@/core/utils/andList';
import { decideOwnedChange } from '@/core/utils/ownedChange';
import type { ConfigSetupSpec, ConfigSetupItem } from '@/types/appBuilderComponents';
import type { CommerceSystemConfigList, CommerceSystemConfigPutAnswer, CommerceSystemConfigWrite, CommerceGet } from '@/types/commerceWire';
import type { CommerceConfigPrevious, ConfigStepRecord, StorePreparationStepRecord } from '@/types/storePreparation';

/** A setting's path as the API takes it: section/group/field, lower case. */
export const SETTING_PATH = /^[a-z0-9_]+(\/[a-z0-9_]+)+$/u;

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
        if (paths.includes(row.path)) stored.set(row.path, Array.isArray(row.value) ? row.value.join(',') : row.value ?? null);
    }
    return stored;
}

/** Every item's previous state: what its scope stores, and what is in force there. */
export async function readPrevious(
    get: CommerceGet,
    items: ReadonlyArray<Pick<ConfigSetupItem, 'path' | 'scope'>>,
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

/** How a step names a setting and its values; a bare path (the agent's `set_commerce_config`) names none. */
type Named = Pick<ConfigSetupItem, 'path' | 'scope' | 'field' | 'values'> & Partial<Pick<ConfigSetupItem, 'value'>>;

/**
 * "Payment on Account for the website: No → Yes", in the Admin's words when the step gives
 * them, else "payment/companycredit/active for the website: 0 → 1". Paths and 0/1 read as
 * code (owner, release test row 4.19, 2026-10-26).
 */
function changeLine(item: Named, from: string, to: string): string {
    const say = (value: string): string => item.values?.[value] ?? value;
    return `${settingName(item)}: ${say(from)} → ${say(to)}`;
}

/** "Payment on Account for the website", or the path when the step gives no Admin name. */
function settingName(item: Named): string {
    return `${item.field ?? item.path}${item.scope === 'website' ? ' for the website' : ''}`;
}

/** The one line an undo says about the settings it kept, or nothing when it kept none. */
function keptLine(edited: string[], untold: string[]): string | undefined {
    const parts: string[] = [];
    if (edited.length === 1) parts.push(`Kept ${edited[0]} as it is: it was changed after Demo Builder set it.`);
    if (edited.length > 1) parts.push(`Kept ${andList(edited)} as they are: they were changed after Demo Builder set them.`);
    if (untold.length === 1) parts.push(`Kept ${untold[0]} as it is: Demo Builder cannot tell it still holds the value it wrote.`);
    if (untold.length > 1) parts.push(`Kept ${andList(untold)} as they are: Demo Builder cannot tell they still hold the values it wrote.`);
    return parts.length > 0 ? parts.join(' ') : undefined;
}

/** The rows Commerce refused, keyed by path and scope, in its words. */
function refusals(answer: CommerceSystemConfigPutAnswer | null): Map<string, string> {
    const refused = new Map<string, string>();
    for (const error of answer?.errors ?? []) refused.set(`${error.path}@${error.scope ?? 'default'}`, error.message);
    return refused;
}

/** Write some rows in one PUT and split them into saved and refused. */
async function writeRows(
    deps: SetupDeps,
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

/** A settings setup, which can also say what its undo would do. */
export interface ConfigStepSetup extends StepSetup {
    previewUndo: (deps: SetupDeps, record: ConfigStepRecord) => Promise<Pick<SetupUndone, 'changes' | 'kept'>>;
}

/** The setup for a step whose `setup` is settings. */
export function configSetup(spec: ConfigSetupSpec): ConfigStepSetup {
    const scoped = (deps: SetupDeps): void => {
        if (spec.items.some((item) => item.scope === 'website') && !deps.websiteCode) {
            throw new Error('The project names no Commerce website, and this step writes a website setting.');
        }
    };
    // A record holds the path and scope; the step's own item gives the Admin's words for it.
    const namedAs = (item: CommerceConfigPrevious): Named =>
        spec.items.find((own) => own.path === item.path && own.scope === item.scope) ?? item;
    return {
        async preview(deps): Promise<SetupPreview> {
            scoped(deps);
            const previous = await readPrevious(deps.commerce.get, spec.items, deps.websiteCode);
            const changes = spec.items.flatMap((item, i) =>
                previous[i].effective === item.value ? [] : [changeLine(item, previous[i].effective, item.value)],
            );
            return { changes, ...(spec.manual ? { manual: spec.manual } : {}) };
        },
        async apply(deps): Promise<SetupApplied> {
            scoped(deps);
            const previous = await readPrevious(deps.commerce.get, spec.items, deps.websiteCode);
            const rows = spec.items.flatMap((item, i) =>
                previous[i].effective === item.value
                    ? []
                    : [{ write: writeRow(previous[i], item.value), line: changeLine(item, previous[i].effective, item.value), previous: { ...previous[i], wrote: item.value } }],
            );
            const written = await writeRows(deps, rows);
            const record: StorePreparationStepRecord | undefined =
                written.saved.length > 0 ? { kind: 'config', previous: written.saved } : undefined;
            return { changes: written.changes, rejected: written.rejected, ...(record ? { record } : {}), ...(spec.manual ? { manual: spec.manual } : {}) };
        },
        async undo(deps, record): Promise<SetupUndone> {
            if (record.kind !== 'config') return { changes: [], rejected: [`The record is not a settings record (${record.kind}).`] };
            const plan = await planUndo(deps, record.previous, namedAs);
            const written = await writeRows(deps, plan.rows);
            return { changes: written.changes, rejected: written.rejected, ...(plan.kept ? { kept: plan.kept } : {}) };
        },
        /** What the undo would put back and keep, writing nothing (`set_commerce_config`'s undo preview). */
        async previewUndo(deps: SetupDeps, record: ConfigStepRecord): Promise<Pick<SetupUndone, 'changes' | 'kept'>> {
            const plan = await planUndo(deps, record.previous, namedAs);
            return { changes: plan.rows.map((row) => row.line), ...(plan.kept ? { kept: plan.kept } : {}) };
        },
    };
}

/**
 * Which recorded settings the undo writes back, and which it keeps, by the shared rule: the
 * value now against the value written (`wrote`, else the step's own value) and the value before.
 */
async function planUndo(deps: SetupDeps, previous: CommerceConfigPrevious[], namedAs: (item: CommerceConfigPrevious) => Named) {
    const now = await readPrevious(deps.commerce.get, previous, deps.websiteCode);
    const rows: Array<{ write: CommerceSystemConfigWrite; line: string; previous: CommerceConfigPrevious }> = [];
    const edited: string[] = [];
    const untold: string[] = [];
    previous.forEach((item, i) => {
        const current = now[i].effective;
        // Already back at the value it had before: nothing to write, nothing to say.
        if (current === item.effective) return;
        const named = namedAs(item);
        const wrote = item.wrote ?? named.value;
        const outcome = decideOwnedChange({ recorded: wrote, current, wanted: item.effective });
        if (outcome === 'update') rows.push({ write: writeRow(item, item.effective), line: changeLine(named, current, item.effective), previous: item });
        else if (outcome === 'leave-edited') edited.push(settingName(named));
        else untold.push(settingName(named));
    });
    return { rows, kept: keptLine(edited, untold) };
}
