/**
 * Sort the inputs a colleague's App Builder repo reads by who supplies each (AB-22
 * step 3), into the catalog's own `envSchema` shape so Settings, the add door and
 * redeploy can treat an import like a catalog entry:
 *
 *   - **platform**: the workspace credentials and Demo Builder's own deploy values.
 *     Supplied at deploy, never shown, so left out of the schema;
 *   - **connected**: a value another component in the demo provides
 *     (`providedBy`), shown read-only;
 *   - **a person's**: everything else, a Setting. Secret when a `_`-separated part
 *     of its name is SECRET(S), PASSWORD, KEY or TOKEN — a name rule, so a person
 *     must be able to correct it. An env sample's value becomes a TEXT default
 *     only: a sample secret is a placeholder, never a value to deploy.
 *
 * The research's fourth kind, "the demo's own Commerce values" filled in from the
 * project, is not sorted out here: nothing would fill it at deploy yet
 * (`deployInputs.ts` reads no `derivedFrom`), and marking it so would deploy it
 * blank without a word — the defect this item exists to end. Until that is wired,
 * such a value is a person's Setting.
 *
 * @module features/app-builder/services/integrationInputClassifier
 */

import type { DiscoveredInput } from './integrationRepoReader';
import type { AppBuilderComponentEnvVar } from '@/types/appBuilderComponents';

/** Name prefixes the deploy supplies (research table, "Platform"; `DEMO_BUILDER_` is ours). */
const PLATFORM_PREFIXES = ['AIO_RUNTIME_', 'AIO_COMMERCE_AUTH_IMS_', 'IMS_OAUTH_S2S_', 'DEMO_BUILDER_'];

/** A name part that makes a value secret. */
const SECRET_PARTS = new Set(['SECRET', 'SECRETS', 'PASSWORD', 'KEY', 'TOKEN']);

export interface ClassifiedInputs {
    /** What the integration's entry declares: connected values and a person's Settings. */
    envSchema: AppBuilderComponentEnvVar[];
    /** Inputs the deploy supplies, in the order read. */
    supplied: string[];
}

function isSecretName(name: string): boolean {
    return name.split('_').some((part) => SECRET_PARTS.has(part));
}

/**
 * @param inputs - what the repo reads (`readIntegrationRepo`)
 * @param providers - env-var name → the component kind that provides it in this demo
 * @returns the schema to record, and what the platform supplies
 */
export function classifyDiscoveredInputs(
    inputs: DiscoveredInput[],
    providers: ReadonlyMap<string, string>,
): ClassifiedInputs {
    const envSchema: AppBuilderComponentEnvVar[] = [];
    const supplied: string[] = [];
    for (const input of inputs) {
        if (PLATFORM_PREFIXES.some((prefix) => input.name.startsWith(prefix))) {
            supplied.push(input.name);
            continue;
        }
        const label = input.label ?? input.name;
        const provider = providers.get(input.name);
        if (provider) {
            envSchema.push({ name: input.name, type: 'text', label, providedBy: provider });
        } else if (isSecretName(input.name)) {
            envSchema.push({ name: input.name, type: 'secret', label });
        } else {
            envSchema.push({
                name: input.name,
                type: 'text',
                label,
                ...(input.sample ? { default: input.sample } : {}),
            });
        }
    }
    return { envSchema, supplied };
}
