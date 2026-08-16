/**
 * Which Commerce instance a project's imports write into.
 *
 * Extracted from `get-datapack-import-target` when the build's sample-data phase
 * became its second caller. One derivation, not two: a build that resolved the
 * instance differently from the modal would write the same pack into a different
 * place depending on which surface asked, and nothing would report the
 * difference.
 *
 * @module features/data-installer/services/importInstance
 */

import { ACCS_GRAPHQL_ENDPOINT, PAAS_URL } from '@/features/components/config/envVarKeys';
import {
    deriveAccsTenantId,
    lookupComponentConfigValue,
} from '@/features/components/services/envVarHelpers';
import type { ComponentConfigs } from '@/types/components';

/**
 * The `commerce_instance` value for a project, or undefined when it has none.
 *
 * ACCS gets the tenant id pulled from `ACCS_GRAPHQL_ENDPOINT` — the same 21–22
 * character base62 shape the service expects, and the derivation that has always
 * built the admin URL.
 *
 * PaaS gets the project's Commerce URL. The service DERIVES the site type
 * (nothing in the request body sends one) and a URL-shaped instance IS accepted:
 * across 1063 log records the vocabulary is `accs`, `aco` and `local`, and the
 * `local` rows carry a full URL. Still unproven for PaaS specifically — no
 * `paas` row exists in that sample. See docs/systems/data-installer.md.
 */
export function deriveImportInstance(configs: ComponentConfigs | undefined): string | undefined {
    const componentConfigs = configs ?? {};

    const accs = deriveAccsTenantId(
        lookupComponentConfigValue(componentConfigs, ACCS_GRAPHQL_ENDPOINT),
    );
    if (accs) {
        return accs;
    }

    return lookupComponentConfigValue(componentConfigs, PAAS_URL) || undefined;
}
