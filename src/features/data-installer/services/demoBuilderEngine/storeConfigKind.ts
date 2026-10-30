/**
 * Store settings in a pack (datapack-engine step 09): the `store_config` kind, one row per
 * setting, `{ path, value, scope, scope_code }`, stored and moved like every other kind.
 *
 * Nothing here writes a setting itself. Every read and write goes through the setup guide's
 * settings fix (`configFix`, AB-77): `GET /V1/system/config` at the row's scope (`scope=default`,
 * or `scope=website&scopeCode=<code>`), field `items[].value`, and one `PUT /V1/system/config`
 * whose body names each row's own `scope` and `scope_code`, so the store code in the address
 * decides nothing. Commerce answers 200 with refused rows in `errors`, which that fix reads. "Is it
 * still as we left it?" is step 04's rule (`decideOwnedChange`), the same one the fix's undo uses.
 *
 * | The pack row | What happens |
 * |---|---|
 * | `scope` `default` | written store-wide |
 * | `scope` `website`/`websites` | written for the install target's website, whatever code the row names (as the service maps website codes for its own kinds) |
 * | `scope` `store`/`stores` | refused before anything is written: the settings fix reads and writes the default and website scopes only |
 * | a path a pack may not change (base URLs, cookies, the Admin, a credential) | refused before anything is written |
 * | a path with no value anywhere now | refused before anything is written: the fix would put back Commerce's "0" for it, not what it held |
 *
 * Each setting written is recorded with what its scope held before (`previous`, the fix's own
 * record row, with `wrote`), keyed `<path>@<scope>`. Removal puts each back while it still holds
 * the value written, and keeps it, saying so, when the SC has changed it since; either way it
 * leaves the record (a kept setting is the SC's now, as in the setup guide).
 *
 * Read live: the `GET`/`PUT` round trip ran against Justrite on 2026-10-10 (memory
 * `reference_accs_system_config_api`), but no response is recorded in this repo; the shapes are
 * Adobe's "System configuration API" page (`CommerceSystemConfigList`, `CommerceSystemConfigPutAnswer`).
 *
 * @module features/data-installer/services/demoBuilderEngine/storeConfigKind
 */

import { z } from 'zod';
import type { CreatedObject } from './installRecord';
import { type KindContext, type SettingsDone, parseRows } from './kindContext';
import { certainlyNotMade } from './pendingCreates';
import type { PendingObject } from './pendingRecord';
import { skipRow } from './refusedRows';
import { andList } from '@/core/utils/andList';
import { decideOwnedChange } from '@/core/utils/ownedChange';
import { SETTING_PATH, configFix, readPrevious } from '@/features/app-builder/services/storePreparation/configFix';
import type { FixDeps } from '@/features/app-builder/services/storePreparation/fixContract';
import type { SetupConfigFixItem } from '@/types/appBuilderComponents';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';
import type { CommerceConfigPrevious } from '@/types/storePreparation';

export const STORE_CONFIG_KIND = 'store_config';

const rowsSchema = z.array(
    z.object({
        path: z.string().regex(SETTING_PATH, 'a setting path is section/group/field'),
        value: z.string(),
        scope: z.enum(['default', 'website', 'websites', 'store', 'stores']),
        scope_code: z.string().nullable().optional(),
    }),
);

/**
 * Paths a pack may not set, whoever made it: Adobe's "System configuration API" page warns that
 * copying base URLs or credentials between environments "can break the production store", and the
 * Admin's own settings decide who can sign in to fix it.
 */
const REFUSED_PREFIXES = ['web/unsecure/', 'web/secure/', 'web/cookie/', 'admin/'];
const CREDENTIAL = /(password|secret|token|(^|_)key)$/u;

/** One pack setting, as the settings fix takes it, and the record's name for it. */
interface PackSetting {
    key: string;
    item: SetupConfigFixItem;
}

const keyOf = (item: Pick<SetupConfigFixItem, 'path' | 'scope'>): string => `${item.path}@${item.scope}`;

function refusal(path: string, scope: string): string | undefined {
    if (scope === 'store' || scope === 'stores') return `${path} is set for one store view, and Demo Builder sets store settings store-wide or for the install's website only`;
    if (REFUSED_PREFIXES.some((prefix) => path.startsWith(prefix)) || CREDENTIAL.test(path.split('/').pop() ?? '')) {
        return `${path} is a setting a pack may not change`;
    }
    return undefined;
}

/**
 * The pack's settings, checked before anything is written.
 *
 * @param websiteCode - the install target's website, which every website row is written for
 * @throws Error naming each row refused, so nothing of this kind is written
 */
export function packSettings(records: unknown, websiteCode: string | undefined): PackSetting[] {
    const rows = parseRows(rowsSchema, records, 'store settings');
    const refused = rows.flatMap((row) => refusal(row.path, row.scope) ?? []);
    if (refused.length > 0) throw new Error(`The pack's store settings cannot be installed: ${andList(refused)}. Nothing of this kind was written.`);
    const settings = new Map<string, PackSetting>();
    for (const row of rows) {
        const scope = row.scope === 'default' ? 'default' : 'website';
        if (scope === 'website' && !websiteCode) throw new Error('The install target names no website, and the pack sets a website setting.');
        const item: SetupConfigFixItem = { path: row.path, value: row.value, scope };
        settings.set(keyOf(item), { key: keyOf(item), item });
    }
    return [...settings.values()];
}

/** What installing does to one setting. */
export type SettingOutcome = 'set' | 'update' | 'already' | 'unchanged' | 'kept' | 'remove' | 'unknown-before';

interface PlannedSetting {
    key: string;
    outcome: SettingOutcome;
    item?: SetupConfigFixItem;
    object?: CreatedObject;
}

const previousSchema = z.object({
    path: z.string(),
    scope: z.enum(['default', 'website']),
    scopeCode: z.string().optional(),
    stored: z.string().nullable(),
    effective: z.string(),
    wrote: z.string().optional(),
});

/** What the record says a setting held before, or undefined when it does not say it plainly. */
function recordedPrevious(object: CreatedObject | undefined): CommerceConfigPrevious | undefined {
    const parsed = previousSchema.safeParse(object?.previous);
    return parsed.success ? parsed.data : undefined;
}

/** One recorded setting against the pack's row, by the shared rule. */
function againstRecord(object: CreatedObject, current: string, wanted: string): SettingOutcome {
    const outcome = decideOwnedChange({ recorded: recordedPrevious(object)?.wrote, current, wanted });
    if (outcome === 'unchanged') return 'unchanged';
    return outcome === 'update' ? 'update' : 'kept';
}

/**
 * Each item's previous state, a recorded one read at the website its record names (`scopeCode`)
 * and the rest at `websiteCode`: a pack installed to another website than the caller's is read
 * where it went (live, scratch-1028, 2026-10-30). One `readPrevious` per website, answers in order.
 */
async function readWhereRecorded(
    get: CommerceGet,
    items: ReadonlyArray<Pick<SetupConfigFixItem, 'path' | 'scope'> & { scopeCode?: string }>,
    websiteCode: string | undefined,
): Promise<CommerceConfigPrevious[]> {
    const codeOf = (item: (typeof items)[number]) => (item.scope === 'website' ? (item.scopeCode ?? websiteCode) : undefined);
    const answers = new Array<CommerceConfigPrevious>(items.length);
    for (const code of new Set(items.map(codeOf))) {
        const at = items.flatMap((item, i) => (codeOf(item) === code ? [i] : []));
        const read = await readPrevious(get, at.map((i) => ({ path: items[i].path, scope: items[i].scope })), code);
        at.forEach((index, n) => (answers[index] = read[n]));
    }
    return answers;
}

/**
 * What installing the pack's settings would do, read-only: the install and the preview both ask.
 * A setting the record lists is read at the website the record names, not `websiteCode`.
 *
 * @param recorded - what the install record lists; a recorded setting the pack no longer has is `remove`
 */
export async function planSettings(get: CommerceGet, settings: readonly PackSetting[], recorded: readonly CreatedObject[], websiteCode?: string): Promise<PlannedSetting[]> {
    const objects = recorded.filter((o) => o.kind === STORE_CONFIG_KIND);
    const byKey = new Map(objects.map((o) => [o.key ?? o.id, o]));
    const items = settings.map(({ key, item }) => ({ ...item, scopeCode: recordedPrevious(byKey.get(key))?.scopeCode }));
    const now = items.length > 0 ? await readWhereRecorded(get, items, websiteCode) : [];
    const atDefault = items.length > 0 ? await readPrevious(get, items.map(({ path }) => ({ path, scope: 'default' as const }))) : [];
    const planned = settings.map(({ key, item }, i): PlannedSetting => {
        const object = byKey.get(key);
        if (object) return { key, item, object, outcome: againstRecord(object, now[i].effective, item.value) };
        if (now[i].effective === item.value) return { key, item, outcome: 'already' };
        // Nothing stored at this scope or store-wide: the undo could not put back what it held.
        const unknown = atDefault[i].stored === null && (item.scope === 'default' || now[i].stored === null);
        return { key, item, outcome: unknown ? 'unknown-before' : 'set' };
    });
    const wanted = new Set(settings.map((s) => s.key));
    const dropped = objects.filter((o) => !wanted.has(o.key ?? o.id)).map((object): PlannedSetting => ({ key: object.key ?? object.id, object, outcome: 'remove' }));
    return [...planned, ...dropped];
}

/**
 * The website a record's settings were written for, the first website setting's: how a record
 * made before the install target was kept says where it went.
 */
export function settingsWebsite(created: readonly CreatedObject[]): string | undefined {
    return created.flatMap((o) => (o.kind === STORE_CONFIG_KIND ? [recordedPrevious(o)?.scopeCode] : [])).find((code) => code !== undefined);
}

const NONE = (): SettingsDone => ({ changes: [], notes: [], kept: [] });

const fixDeps = (commerce: { get: CommerceGet; send: CommerceSend }, websiteCode: string | undefined): FixDeps => ({ commerce, websiteCode, erpNames: [] });

/**
 * Each new setting as pending (step 14 item 1), with what its scope holds now and the value about to
 * be written: a PUT whose answer is lost is then found by that value and put back on removal.
 */
async function pendingSettings(ctx: KindContext, writing: readonly PlannedSetting[]): Promise<PendingObject[]> {
    const fresh = writing.flatMap((p) => (p.item && !p.object ? [{ key: p.key, item: p.item }] : []));
    if (fresh.length === 0) return [];
    const now = await readPrevious(ctx.get, fresh.map(({ item }) => ({ path: item.path, scope: item.scope })), ctx.session.websiteCode);
    return fresh.map(({ key, item }, i) => ({ kind: STORE_CONFIG_KIND, key, previous: { ...now[i], wrote: item.value } }));
}

/** Write the planned sets and updates in one PUT; record each one Commerce saved. */
async function writeSettings(ctx: KindContext, writing: readonly PlannedSetting[], done: SettingsDone): Promise<string[]> {
    if (writing.length === 0) return [];
    const items = writing.flatMap((p) => (p.item ? [p.item] : []));
    const pending = await pendingSettings(ctx, writing);
    await ctx.recorder.markPending(pending);
    // The settings fix counts a PUT that threw as refused; one with no answer may have landed, so
    // its pending entries stay and the install stops, as for any write that loses its answer.
    let lost: unknown;
    const send: CommerceSend = async (method, path, body) => {
        try {
            return await ctx.send(method, path, body);
        } catch (error) {
            if (!certainlyNotMade(error)) lost = error;
            throw error;
        }
    };
    const applied = await configFix({ kind: 'config', items }).apply(fixDeps({ get: ctx.get, send }, ctx.session.websiteCode));
    if (lost !== undefined) throw lost;
    const saved = applied.record?.kind === 'config' ? applied.record.previous : [];
    done.changes.push(...applied.changes);
    for (const planned of writing) {
        const before = saved.find((s) => planned.item && s.path === planned.item.path && s.scope === planned.item.scope);
        if (!before || !planned.item) continue;
        if (planned.object) {
            // Brought up to the pack: still what it held before the first install, now with the new value.
            const original = recordedPrevious(planned.object) ?? before;
            await ctx.recorder.update({ kind: STORE_CONFIG_KIND, id: planned.object.id, previous: { ...original, wrote: planned.item.value } });
        } else {
            const mine = pending.filter((p) => p.key === planned.key);
            await ctx.recorder.confirm(mine, [{ kind: STORE_CONFIG_KIND, id: planned.key, key: planned.key, previous: before }]);
        }
        ctx.log(`set ${planned.key}`);
    }
    // Commerce answered, and did not save these: they never landed.
    await ctx.recorder.forgetPending(pending);
    return applied.rejected;
}

/**
 * Each setting Commerce refused, skipped and named (step 14 item 3): the settings fix words a refusal
 * `<path>: <old> → <new>: <why>`, and the rest of the pack carries on.
 */
function skipRefused(ctx: KindContext, writing: readonly PlannedSetting[], rejected: readonly string[]): void {
    for (const text of rejected) {
        const planned = writing.find((p) => p.item && text.startsWith(`${p.item.path}: `));
        const path = planned?.item?.path ?? text.split(': ')[0];
        skipRow(ctx, { kind: STORE_CONFIG_KIND, key: planned?.key ?? path, reason: text.slice(path.length + 2) });
    }
}

/**
 * Install the pack's settings (see the module comment). A repeat install brings a setting this
 * engine set up to the pack, keeps one the SC changed since, and puts back one the pack dropped.
 *
 * @throws Error before any write when a row is refused. A setting Commerce refuses is skipped and
 *   named in the install's note (step 14 item 3); the ones it saved stay recorded.
 */
export async function installStoreConfig(ctx: KindContext, records: unknown): Promise<void> {
    const settings = packSettings(records, ctx.session.websiteCode);
    const plan = await planSettings(ctx.get, settings, ctx.recorder.created, ctx.session.websiteCode);
    const unknown = plan.filter((p) => p.outcome === 'unknown-before').map((p) => p.key);
    if (unknown.length > 0) throw new Error(`Demo Builder cannot read what ${andList(unknown)} holds now, so it could not put it back. Nothing of this kind was written.`);
    const done = (ctx.session.settings ??= NONE());
    done.kept.push(...plan.filter((p) => p.outcome === 'kept').map((p) => p.key));
    const rejected = await writeSettings(ctx, plan.filter((p) => p.outcome === 'set' || p.outcome === 'update'), done);
    const dropped = plan.flatMap((p) => (p.outcome === 'remove' && p.object ? [p.object] : []));
    const back = await putBackSettings(ctx, dropped, (o) => ctx.recorder.drop(o));
    const putBack = settingsLine(back, 'Put back');
    if (putBack) done.notes.push(putBack);
    skipRefused(ctx, plan.filter((p) => p.outcome === 'set' || p.outcome === 'update'), rejected);
}

/**
 * Put recorded settings back, one at a time, through the settings fix's undo: each while it still
 * holds the value written, else kept and said. Each leaves the record once done; one Commerce
 * refuses, or whose record does not say what it held, stays on it.
 *
 * @throws Error naming each setting that could not be put back, after the rest are done
 */
export async function putBackSettings(
    commerce: { get: CommerceGet; send: CommerceSend },
    objects: readonly CreatedObject[],
    drop: (object: CreatedObject) => Promise<void>,
): Promise<SettingsDone> {
    const done = NONE();
    const refused: string[] = [];
    const fix = configFix({ kind: 'config', items: [] });
    for (const object of objects.filter((o) => o.kind === STORE_CONFIG_KIND)) {
        const previous = recordedPrevious(object);
        if (!previous) {
            refused.push(`${object.key ?? object.id}: the install record does not say what it held before`);
            continue;
        }
        const undone = await fix.undo(fixDeps(commerce, previous.scopeCode), { kind: 'config', previous: [previous] });
        if (undone.rejected.length > 0) {
            refused.push(...undone.rejected);
            continue;
        }
        done.changes.push(...undone.changes);
        if (undone.kept) done.notes.push(undone.kept);
        await drop(object);
    }
    if (refused.length > 0) throw new Error(`Could not put back ${andList(refused)}.`);
    return done;
}

/** "Set catalog/frontend/grid_per_page: 12 → 24." and any kept line, or nothing. */
export function settingsLine(done: SettingsDone | undefined, verb: 'Set' | 'Put back'): string | undefined {
    if (!done) return undefined;
    const parts = [...(done.changes.length > 0 ? [`${verb} ${andList(done.changes)}.`] : []), ...done.notes];
    return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * The settings capture reads into a new version (step 05's save): every setting the record lists
 * or the installed version names, at its value in the store now, at its own scope; a recorded
 * website setting at the website its record names.
 */
export async function captureSettings(
    get: CommerceGet,
    created: readonly CreatedObject[],
    installed: Record<string, unknown>,
    websiteCode: string | undefined,
): Promise<Record<string, unknown>> {
    const named = new Map<string, Pick<SetupConfigFixItem, 'path' | 'scope'> & { scopeCode?: string }>();
    for (const object of created) {
        const previous = object.kind === STORE_CONFIG_KIND ? recordedPrevious(object) : undefined;
        if (previous) named.set(keyOf(previous), { path: previous.path, scope: previous.scope, ...(previous.scopeCode ? { scopeCode: previous.scopeCode } : {}) });
    }
    if (installed[STORE_CONFIG_KIND] !== undefined) {
        for (const { key, item } of packSettings(installed[STORE_CONFIG_KIND], websiteCode)) if (!named.has(key)) named.set(key, { path: item.path, scope: item.scope });
    }
    const wanted = [...named.values()];
    if (wanted.length === 0) return {};
    const now = await readWhereRecorded(get, wanted, websiteCode);
    const rows = wanted.map((item, i) => ({
        path: item.path,
        value: now[i].effective,
        scope: item.scope,
        ...(item.scope === 'website' ? { scope_code: now[i].scopeCode } : {}),
    }));
    return { [STORE_CONFIG_KIND]: rows };
}
