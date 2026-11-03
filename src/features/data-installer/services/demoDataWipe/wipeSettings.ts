/**
 * Website settings a wipe puts back (owner, 2026-11-02), on wholly chosen websites only: never the
 * Default scope, never another website's.
 *
 * **Commerce has no way to put a website's setting back to inherited.** `PUT /V1/system/config` needs a
 * string `value` and has no delete; only "Use Default Value" in the Admin clears a website's own row
 * (Adobe's "System configuration API" page; step 09's decision 5). **And it cannot list which settings
 * a website set itself:** with no path filter, `GET /V1/system/config` answers every path with the
 * value in force there (live on `justrite_test_website`, 2026-11-02: 943 rows, among them
 * `login_as_customer/general/shopping_assistance_checkbox_title`, a value no website sets).
 *
 * So what can be proved is: **a value that differs from the Default scope's was set on the website**,
 * and writing the Default scope's value makes it read the same. It stays the website's own row, so a
 * later change at the Default scope does not reach it, and the SC is told. A value already the same as
 * the Default scope's cannot be told from an inherited one, and needs nothing.
 *
 * | Website value, where it differs from the Default scope's | Done |
 * |---|---|
 * | any other | set to the Default scope's value |
 * | base URLs, cookies, the Admin's, a credential (`isOffLimitsSetting`, what a pack may not set), or a value masked or encrypted | stays, counted: a website needs its own, and a masked value must never be copied |
 * | written by a datapack or the setup guide, whose records say (`settingsKept`) | stays, counted: its removal or undo puts it back |
 * | no value at the Default scope | stays, counted: there is nothing to put back, and writing "" or "0" would be a guess |
 * | a list, on either side | stays, counted: a write sends text, and the read then answers one joined string, which the API cannot turn back into the list (live 2026-11-02, `sales/cancellation/reasons`). Only "Use Default Value" in the Admin restores it |
 * | a website that cannot be read | stays, counted, by website |
 *
 * | Read or write | Endpoint and field | Confirmed from a real answer? |
 * |---|---|---|
 * | a website's values | `GET system/config?scope=website&scopeCode=<code>`, `searchCriteria[pageSize]`, `[currentPage]`: `items[path,value,scope,scope_code]`, `total_count` | yes, 2026-11-02 (`SYSTEM_CONFIG_PAGE_TEST_WEBSITE`), pages too |
 * | the Default scope's | the same with `scope=default` | Adobe's page; not read from here |
 * | the write | `configFix`: `PUT system/config`, `{ items: [{ path, value, scope: "website", scope_code }] }`, read `errors` | yes for a default-scope value (2026-10-10); a website one from here **no** |
 *
 * @module features/data-installer/services/demoDataWipe/wipeSettings
 */

import type { RemovalAccess } from '../demoBuilderEngine/removers';
import { isOffLimitsSetting } from '../demoBuilderEngine/storeConfigKind';
import { leftRow } from './wipeLeft';
import type { WipeScope } from './wipeScope';
import { absentAsEmpty, readAllPages } from '@/features/app-builder/services/erpFillReaders';
import { configFix } from '@/features/app-builder/services/storePreparation/configFix';
import type { CommerceGet, CommerceSystemConfigRow } from '@/types/commerceWire';
import type { WipeLeft } from '@/types/demoDataWipe';

/** A value that is not the setting's: masked, or Commerce's encrypted form. Never copied anywhere. */
const HIDDEN_VALUE = /^(\*+|\d+:\d+:.*)$/u;

/** How many settings one read-and-write asks about: short enough for any address. */
const SETTINGS_PER_WRITE = 50;

/** One website setting to set to the Default scope's value. */
export interface WipeSetting {
    websiteCode: string;
    path: string;
    value: string;
}

export interface SettingsDecision {
    reset: WipeSetting[];
    /** Paths that stay, by why. */
    offLimits: string[];
    installed: string[];
    noDefault: string[];
    lists: string[];
    /** Websites that could not be read. */
    unread: string[];
}

type SettingValue = CommerceSystemConfigRow['value'];

const readScope = (get: CommerceGet, criteria: string): Promise<CommerceSystemConfigRow[]> => absentAsEmpty(() => readAllPages<CommerceSystemConfigRow>(get, 'system/config', criteria));

/** A setting's value as text: a list reads the same as the string a write turned it into. */
const asText = (value: SettingValue): string | null => (Array.isArray(value) ? value.join(',') : value);

function sortRow(row: CommerceSystemConfigRow, websiteCode: string, defaults: ReadonlyMap<string, SettingValue>, kept: ReadonlySet<string>, decided: SettingsDecision): void {
    const fallback = defaults.get(row.path) ?? null;
    const value = asText(row.value);
    const fallbackText = asText(fallback);
    if (value === null || value === fallbackText) return;
    if (isOffLimitsSetting(row.path) || HIDDEN_VALUE.test(value) || (fallbackText !== null && HIDDEN_VALUE.test(fallbackText))) decided.offLimits.push(row.path);
    else if (kept.has(`${websiteCode}/${row.path}`)) decided.installed.push(row.path);
    else if (fallback === null) decided.noDefault.push(row.path);
    else if (Array.isArray(fallback) || Array.isArray(row.value)) decided.lists.push(row.path);
    else decided.reset.push({ websiteCode, path: row.path, value: fallback });
}

/** The wholly chosen websites' codes. */
const wholeWebsiteCodes = (scope: WipeScope): string[] => [...new Set(scope.stores.filter((s) => scope.websites.whole.includes(s.website.id)).map((s) => s.website.code))];

/**
 * What the wholly chosen websites hold that differs from the Default scope. Reads only.
 *
 * @param kept - settings a record says a datapack or the setup guide wrote, as `<website code>/<path>`
 */
export async function decideSettings(get: CommerceGet, scope: WipeScope, kept: ReadonlySet<string>): Promise<SettingsDecision> {
    const decided: SettingsDecision = { reset: [], offLimits: [], installed: [], noDefault: [], lists: [], unread: [] };
    const websites = wholeWebsiteCodes(scope);
    if (websites.length === 0) return decided;
    let defaults: Map<string, SettingValue>;
    try {
        defaults = new Map((await readScope(get, '&scope=default')).map((row) => [row.path, row.value]));
    } catch {
        decided.unread.push(...websites);
        return decided;
    }
    for (const websiteCode of websites) {
        try {
            const rows = await readScope(get, `&scope=website&scopeCode=${encodeURIComponent(websiteCode)}`);
            for (const row of rows) sortRow(row, websiteCode, defaults, kept, decided);
        } catch {
            decided.unread.push(websiteCode);
        }
    }
    return decided;
}

/** What the SC is told about the settings that stay. */
export function settingsLeft(decided: SettingsDecision): WipeLeft[] {
    return [
        leftRow('settings', decided.offLimits, 'base URLs, cookies, Admin settings and credentials are never changed'),
        leftRow('settings', decided.installed, 'a datapack or the setup guide set them, and its removal or undo puts them back'),
        leftRow('settings', decided.noDefault, 'they have no default value to go back to'),
        leftRow('settings', decided.lists, 'Commerce cannot write a list back, so set them to Use Default Value in the Admin'),
        leftRow('settings', decided.unread.map((code) => `website ${code}`), "Commerce would not list the website's settings"),
    ];
}

/** What a settings write did: how many went through, and each refused, without its values. */
export interface SettingsOutcome {
    count: number;
    refused: string[];
}

/** "path for the website: 1 → 0: why", as `configFix` says it, without the values: a value can be a long list. */
function refusalOf(text: string): string {
    const why = text.slice(text.lastIndexOf(' → ') + 1);
    return `${text.split(' ')[0]}: ${why.slice(why.indexOf(': ') + 2)}`;
}

/** Set each setting to its value, through the setup guide's writer, which reads Commerce's `errors`. */
export async function putBackSettings(commerce: RemovalAccess, settings: readonly WipeSetting[]): Promise<SettingsOutcome> {
    const outcome: SettingsOutcome = { count: 0, refused: [] };
    for (const websiteCode of new Set(settings.map((s) => s.websiteCode))) {
        const mine = settings.filter((s) => s.websiteCode === websiteCode);
        for (let start = 0; start < mine.length; start += SETTINGS_PER_WRITE) {
            const items = mine.slice(start, start + SETTINGS_PER_WRITE).map((s) => ({ path: s.path, value: s.value, scope: 'website' as const }));
            try {
                const applied = await configFix({ kind: 'config', items }).apply({ commerce, websiteCode, erpNames: [] });
                outcome.count += applied.changes.length;
                outcome.refused.push(...applied.rejected.map(refusalOf));
            } catch (error) {
                outcome.refused.push(`${websiteCode}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return outcome;
}
