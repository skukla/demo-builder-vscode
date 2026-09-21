/**
 * adobeEntityName — derive a valid Adobe I/O machine `name` from a free-form title.
 *
 * Adobe's project/workspace API splits a free-form **title** (spaces + punctuation OK,
 * shown in the UI) from a machine **name** that the server validates as ALPHANUMERIC ONLY
 * ("Project name allows only alphanumeric values", 400). Adobe's own Console auto-generates
 * that name ("147CyanSkunk"), so the user only ever types the title. We do the same: the
 * user types one friendly field; this derives the machine name behind the scenes.
 *
 * `deriveAdobeEntityName` always appends a short random suffix so two entities with the
 * same title (→ same base) don't collide (409). A WORKSPACE name is shown to the SC —
 * Console's workspace boxes print the name, not the title — so workspaces use
 * `deriveFreeAdobeEntityName`: dashes for spaces, and no ending unless the name is taken.
 *
 * Shared by both project and workspace creation (AdobeConsoleProjectOps).
 *
 * @module features/authentication/services/adobeEntityName
 */

const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/**
 * Cap the derived base so base + suffix stays under Adobe's name length limit —
 * which is 20 (server 400: "Project name length must be less than 20", measured
 * live 2026-08-27 when a 22-char derived name was rejected; titles of 16+
 * alphanumeric characters had failed project creation ever since this shipped
 * at 40). 15 + the 4-char suffix = 19, the longest accepted name.
 */
const MAX_BASE_LENGTH = 15;
/** The longest name Adobe accepts (see above: it 400s at 20). */
const MAX_NAME_LENGTH = 19;
const SUFFIX_LENGTH = 4;

/** A short random alphanumeric suffix for uniqueness (kept out of the pure derivation). */
export function randomNameSuffix(length: number = SUFFIX_LENGTH): string {
    let out = '';
    for (let i = 0; i < length; i++) {
        out += NAME_ALPHABET[Math.floor(Math.random() * NAME_ALPHABET.length)];
    }
    return out;
}

/**
 * Derive an alphanumeric Adobe I/O machine name from a free-form title.
 *
 * @param title - the free-form title the user typed (e.g. "Kukla Test")
 * @param suffix - uniqueness suffix (defaults to a random alphanumeric run; injectable for tests)
 * @returns an alphanumeric name (e.g. "KuklaTest7g2k")
 */
export function deriveAdobeEntityName(title: string, suffix: string = randomNameSuffix()): string {
    const base = (title || '').replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_BASE_LENGTH);
    return `${base || 'App'}${suffix}`;
}

/**
 * A WORKSPACE name as the SC should read it on Console's boxes: the title with each
 * run of spaces or punctuation turned into one dash — "Northwind ERP" →
 * `Northwind-ERP`. A space 400s but a dash is accepted, and a dashed workspace's
 * Runtime namespace answered normally (both measured live 2026-09-21; projects were
 * not tested, so project names keep `deriveAdobeEntityName`).
 *
 * The random ending (`-ab12`) is added when a name in `taken` matches, ignoring case,
 * or when `taken` is undefined — names that could not be read are not proof the name
 * is free.
 *
 * @param title - the free-form title
 * @param taken - the names already in use, or undefined when unknown
 * @param suffix - uniqueness suffix used only on a clash (injectable for tests)
 * @returns a name of letters, digits and single dashes, at most 19 characters
 */
export function deriveFreeAdobeEntityName(
    title: string,
    taken: string[] | undefined,
    suffix: string = randomNameSuffix(),
): string {
    const dashed = (title || '').replace(/[^A-Za-z0-9]+/g, '-');
    const cut = (length: number) => dashed.slice(0, length).replace(/^-+|-+$/g, '');
    const bare = cut(MAX_NAME_LENGTH) || 'App';
    const inUse = taken?.some((name) => name.toLowerCase() === bare.toLowerCase()) ?? true;
    return inUse ? `${cut(MAX_NAME_LENGTH - SUFFIX_LENGTH - 1) || 'App'}-${suffix}` : bare;
}
