/**
 * Configure Screen Env Value Loader
 *
 * Pure helper extracted from `ConfigureProjectWebviewCommand.loadExistingEnvValues`.
 * The command class still owns disk I/O; this module owns the merge rules.
 *
 * Merge priority for non-installed components (e.g. the `adobe-commerce-accs` backend,
 * which has no componentInstance and therefore no component-level .env file):
 *   1. Disk-loaded values in `envValues[componentId]` — already present, leave alone
 *   2. Root `.env` value — freshest on-disk value, takes precedence over manifest
 *   3. Manifest `componentConfigs[componentId][key]` — fallback when root .env lacks
 *      the key (ACCS projects store these values exclusively in .demo-builder.json)
 */

type ManifestConfigs = Record<string, Record<string, string | boolean | number | undefined>>;
type EnvValueMap = Record<string, Record<string, string>>;

/**
 * Merge root .env values and manifest componentConfigs into the loaded env value map.
 *
 * Regression: ACCS (and other non-installed backend) env values live exclusively in
 * `.demo-builder.json`. Prior to this fix, the Configure screen displayed empty fields
 * for ACCS projects because the lookup ran only against root .env.
 */
export function mergeEnvValuesFromSources(
    envValues: EnvValueMap,
    rootEnvValues: Record<string, string>,
    componentConfigs: ManifestConfigs,
): EnvValueMap {
    const merged: EnvValueMap = { ...envValues };

    for (const [componentId, config] of Object.entries(componentConfigs)) {
        // Skip components already populated from disk (frontend components with real .env files)
        if (merged[componentId] && Object.keys(merged[componentId]).length > 0) continue;

        const componentEnv: Record<string, string> = {};
        for (const [key, manifestValue] of Object.entries(config)) {
            if (rootEnvValues[key] !== undefined) {
                componentEnv[key] = rootEnvValues[key];
            } else if (manifestValue !== undefined && manifestValue !== '') {
                componentEnv[key] = String(manifestValue);
            }
        }

        if (Object.keys(componentEnv).length > 0) {
            merged[componentId] = componentEnv;
        }
    }

    return merged;
}
