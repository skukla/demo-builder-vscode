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
 * `deriveFreeAdobeEntityName`, which is bare unless the name is already in use.
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
 * Derive a name with NO random ending when it is free: "Northwind ERP" →
 * `NorthwindERP`. Adds the ending when a name in `taken` matches, ignoring case, or
 * when `taken` is undefined — names in use that could not be read are not proof
 * the name is free.
 *
 * @param title - the free-form title
 * @param taken - the names already in use, or undefined when unknown
 * @param suffix - uniqueness suffix used only on a clash (injectable for tests)
 * @returns an alphanumeric name of at most 19 characters
 */
export function deriveFreeAdobeEntityName(
    title: string,
    taken: string[] | undefined,
    suffix: string = randomNameSuffix(),
): string {
    const bare = (title || '').replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_NAME_LENGTH) || 'App';
    const inUse = taken?.some((name) => name.toLowerCase() === bare.toLowerCase()) ?? true;
    return inUse ? deriveAdobeEntityName(title, suffix) : bare;
}
