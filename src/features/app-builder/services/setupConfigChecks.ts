/**
 * The demo setup checks that read Commerce's own settings rather than its data (AB-26x): the
 * two custom order statuses, Catalog Price Scope, and Payment on Account on the project's
 * website. Until 2026-10-01 these four were "Mark as done" only, because no read for them had
 * been tried. Both routes come from Adobe's Commerce as a Cloud Service REST reference and
 * were read live on the Justrite sandbox that day:
 *
 * - `GET /V1/order-statuses` answers every status with its state assignments, one row per
 *   (status, state): `{ status, label, state, default, visible_on_front }`.
 * - `GET /V1/system/config` with a `path` filter answers a setting's stored value at the
 *   asked scope (`scope=websites&scopeCode=<website>`); an unset path answers no item.
 *
 * Split from `setupChecks.ts`, which registers these beside its data checks. Pure over the
 * read it is handed, like those.
 *
 * @module features/app-builder/services/setupConfigChecks
 */

/** A signed Commerce REST GET, answering the body as text or an "Error: " line. */
type Read = (path: string) => Promise<string>;

/** How a check came out. `done` undefined = the check could not tell. */
interface Result {
    done?: boolean;
    note: string;
}

interface StatusRow {
    status?: string;
    label?: string;
    state?: string;
    default?: boolean;
}

interface ConfigRow {
    path?: string;
    value?: string | null;
}

/** Commerce's state codes, by the name the Admin shows. */
const STATE_NAMES: Record<string, string> = { new: 'Pending', processing: 'Processing' };
const PRICE_SCOPE_WEBSITE = '1';
const ENABLED = '1';

const couldNot = (answer: string): Result => ({
    note: `Could not check: ${answer.replace(/^Error: /u, '')}`,
});

/**
 * The JSON body after any note the REST client puts in front of it, or the error line. The
 * note can itself open with "[" ("[pageSize 20 applied; …]"), so the body is the first line
 * from which the rest parses, not the first bracket.
 */
async function readJson<T>(read: Read, path: string, what: string): Promise<T | string> {
    const text = await read(path);
    if (text.startsWith('Error:')) return text;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*[[{]/u.test(lines[i])) continue;
        try {
            return JSON.parse(lines.slice(i).join('\n')) as T;
        } catch {
            // A note line, or not JSON at all: try the next line.
        }
    }
    return `Error: Commerce answered something that is not ${what}.`;
}

interface WebsiteRow {
    code?: string;
    name?: string;
}

/**
 * The name Commerce shows for a website code ("Justrite Website" for `justrite`), for a
 * check's note: an SC knows the website by the name the Admin shows, not its code
 * (owner, 2026-10-01). `GET store/websites`, read live on the sandbox that day. A read that
 * fails falls back to the code, which is still true, rather than failing the check.
 */
export async function websiteNamer(read: Read): Promise<(code: string) => string> {
    const answer = await readJson<WebsiteRow[]>(read, 'store/websites', 'a website list');
    const rows = Array.isArray(answer) ? answer : [];
    const names = new Map<string, string>();
    for (const row of rows) {
        if (row.code && row.name) names.set(row.code, row.name);
    }
    return (code) => names.get(code) ?? code;
}

/** The path a config read filters on, at a scope or at the default. */
function configPath(setting: string, websiteCode?: string): string {
    const filter = 'searchCriteria[filterGroups][0][filters][0]';
    const scope = websiteCode ? `scope=websites&scopeCode=${encodeURIComponent(websiteCode)}&` : '';
    return `system/config?${scope}${filter}[field]=path&${filter}[value]=${setting}`;
}

/** A setting's stored value at the scope, `undefined` when nothing is stored there. */
async function readConfig(read: Read, setting: string, websiteCode?: string): Promise<string | undefined | Error> {
    const answer = await readJson<{ items?: ConfigRow[] }>(read, configPath(setting, websiteCode), 'a settings list');
    if (typeof answer === 'string') return new Error(answer);
    const row = (answer.items ?? []).find((item) => item.path === setting);
    return row?.value ?? undefined;
}

/**
 * A custom status is set up when Commerce has it, on every state the integration writes it
 * in, and as no state's default: a comment sets only a status of the order's current state,
 * and a default status would replace Commerce's own.
 */
async function statusOnStates(read: Read, code: string, states: string[]): Promise<Result> {
    const rows = await readJson<StatusRow[]>(read, 'order-statuses', 'an order status list');
    if (typeof rows === 'string') return couldNot(rows);
    const mine = (Array.isArray(rows) ? rows : []).filter((row) => row.status === code);
    if (mine.length === 0) return { done: false, note: `Commerce has no ${code} order status.` };
    const label = mine[0].label ?? code;
    const missing = states.filter((state) => !mine.some((row) => row.state === state));
    if (missing.length > 0) {
        const names = missing.map((state) => STATE_NAMES[state] ?? state).join(' and ');
        return { done: false, note: `${label} (${code}) is not assigned to ${names}.` };
    }
    const asDefault = mine.filter((row) => row.default && states.includes(row.state ?? ''));
    if (asDefault.length > 0) {
        const names = asDefault.map((row) => STATE_NAMES[row.state ?? ''] ?? row.state).join(' and ');
        return { done: false, note: `${label} (${code}) is the default status of ${names}; it must not be.` };
    }
    const names = states.map((state) => STATE_NAMES[state] ?? state).join(' and ');
    return { done: true, note: `${label} (${code}) is a ${names} status.` };
}

/** "Confirmed in ERP": a Pending status, so a confirmation comment can set it. */
export function erpConfirmedStatus(read: Read): Promise<Result> {
    return statusOnStates(read, 'erp_confirmed', ['new']);
}

/** "Partially Held": Pending and Processing, the states an order is in when one ERP holds. */
export function partiallyHeldStatus(read: Read): Promise<Result> {
    return statusOnStates(read, 'partially_held', ['new', 'processing']);
}

/** Catalog Price Scope is Website, so each website's prices are its own (AB-46). */
export async function priceScopeWebsite(read: Read): Promise<Result> {
    const value = await readConfig(read, 'catalog/price/scope');
    if (value instanceof Error) return couldNot(value.message);
    if (value === PRICE_SCOPE_WEBSITE) return { done: true, note: 'Catalog Price Scope is Website.' };
    return { done: false, note: 'Catalog Price Scope is Global; it must be Website.' };
}

/**
 * Payment on Account is on for the project's website. Read at that website, then at the
 * default when the website stores no value of its own (it inherits).
 */
export async function paymentOnAccountEnabled(read: Read, scope: { websiteCode?: string }): Promise<Result> {
    const website = scope.websiteCode;
    if (!website) return { note: 'Could not check: the project names no Commerce website.' };
    const own = await readConfig(read, 'payment/companycredit/active', website);
    if (own instanceof Error) return couldNot(own.message);
    const value = own ?? (await readConfig(read, 'payment/companycredit/active'));
    if (value instanceof Error) return couldNot(value.message);
    const name = (await websiteNamer(read))(website);
    if (value === ENABLED) return { done: true, note: `Payment on Account is on for ${name}.` };
    return { done: false, note: `Payment on Account is off for ${name}.` };
}
