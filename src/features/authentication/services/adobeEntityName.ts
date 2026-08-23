/**
 * adobeEntityName — derive a valid Adobe I/O machine `name` from a free-form title.
 *
 * Adobe's project/workspace API splits a free-form **title** (spaces + punctuation OK,
 * shown in the UI) from a machine **name** that the server validates as ALPHANUMERIC ONLY
 * ("Project name allows only alphanumeric values", 400). Adobe's own Console auto-generates
 * that name ("147CyanSkunk"), so the user only ever types the title. We do the same: the
 * user types one friendly field; this derives the machine name behind the scenes.
 *
 * A short random suffix is always appended so two entities with the same title (→ same
 * base) don't collide (409). The user never sees this name — the UI shows the title.
 *
 * Shared by both project and workspace creation (adobeEntityFetcher).
 *
 * @module features/authentication/services/adobeEntityName
 */

const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Cap the derived base so a long title can't blow past Adobe's name length limit. */
const MAX_BASE_LENGTH = 40;
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
 * @param title - the free-form title the user typed (e.g. "Demo Test")
 * @param suffix - uniqueness suffix (defaults to a random alphanumeric run; injectable for tests)
 * @returns an alphanumeric name (e.g. "DemoTest7g2k")
 */
export function deriveAdobeEntityName(title: string, suffix: string = randomNameSuffix()): string {
    const base = (title || '').replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_BASE_LENGTH);
    return `${base || 'App'}${suffix}`;
}
