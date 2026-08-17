/**
 * What Configure is allowed to send for a secret it cannot see.
 *
 * A migrated secret lives in the OS keychain, so its field renders EMPTY here —
 * the webview never receives the value. Separately, `migrateDeclaredSecrets`
 * treats an empty declared secret as "the user cleared this" and DELETES the
 * stored credential, which is how a rotated one is meant to be removed.
 *
 * Those two facts together mean an unfiltered save destroys the credential every
 * time someone edits an unrelated field. This module is the filter, and it lives
 * apart from `ConfigureScreen` because it is pure data logic worth testing without
 * mounting a screen.
 *
 * @module features/dashboard/ui/configure/storedSecretPayload
 */

/** A component config map as the Configure form holds it. */
type Configs = Record<string, Record<string, string | boolean | number | undefined>>;

/**
 * Drop the empty placeholder for a secret the project already holds.
 *
 * `touchedFields` is the whole distinction: a blank the user typed is a CLEAR and
 * must survive; a blank they never touched is the absence of a value we
 * deliberately never sent, and must not reach the migration.
 *
 * @param configs - the form's current values
 * @param secretFlags - which declared secrets the project holds, booleans only
 * @param touchedFields - field keys the user interacted with this session
 * @returns a copy safe to save; the input is never mutated
 */
export function withStoredSecretsPreserved(
    configs: Configs,
    secretFlags: Record<string, Record<string, boolean>>,
    touchedFields: Set<string>,
): Configs {
    const result: Configs = {};

    for (const [componentId, componentConfig] of Object.entries(configs)) {
        const next = { ...componentConfig };
        for (const [varName, value] of Object.entries(next)) {
            const isStored = secretFlags[componentId]?.[varName] === true;
            if (isStored && !value && !touchedFields.has(varName)) {
                delete next[varName];
            }
        }
        result[componentId] = next;
    }
    return result;
}
