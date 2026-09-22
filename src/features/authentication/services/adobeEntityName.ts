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
 * `deriveFreeAdobeEntityName`: the title's letters and digits, and a number only when the
 * name is taken.
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
 * A WORKSPACE name as the SC should read it on Console's boxes: the title with
 * everything but letters and digits dropped — "Northwind ERP" → `NorthwindERP`.
 *
 * Not dashes, though Adobe accepts a dashed workspace: the name becomes the last
 * part of the workspace's Runtime namespace (`<org>-<project>-<workspace>`), and
 * the deploy service refuses a namespace with a dash there ("Non-standard
 * namespace formats are not supported after aio-cli v10", 400, measured
 * 2026-09-22 on `Northwind-ERP`). Creating the namespace worked; deploying into it
 * did not, which is why the 2026-09-21 check that stopped at creation missed it.
 *
 * A taken name (compared ignoring case) is numbered with the lowest free number —
 * `NorthwindERP1`, `NorthwindERP2`, ... (owner, 2026-09-21). When `taken` is
 * undefined the names in use could not be read, so nothing proves a name free and
 * a random ending is used instead of a number.
 *
 * @param title - the free-form title
 * @param taken - the names already in use, or undefined when unknown
 * @param suffix - uniqueness suffix used only on a clash (injectable for tests)
 * @returns a name of letters and digits, at most 19 characters
 */
export function deriveFreeAdobeEntityName(
    title: string,
    taken: string[] | undefined,
    suffix: string = randomNameSuffix(),
): string {
    const plain = (title || '').replace(/[^A-Za-z0-9]/g, '');
    const withEnding = (ending: string) =>
        `${plain.slice(0, MAX_NAME_LENGTH - ending.length) || 'App'}${ending}`;
    if (!taken) return withEnding(suffix);

    const inUse = new Set(taken.map((name) => name.toLowerCase()));
    const bare = plain.slice(0, MAX_NAME_LENGTH) || 'App';
    if (!inUse.has(bare.toLowerCase())) return bare;
    for (let n = 1; ; n++) {
        const numbered = withEnding(String(n));
        if (!inUse.has(numbered.toLowerCase())) return numbered;
    }
}
