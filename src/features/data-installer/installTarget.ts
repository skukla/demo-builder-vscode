/**
 * The install target: the website and store view a datapack is written into.
 *
 * One rule with two readers. The build's install (`services/sampleDataInstall.ts`) skips a
 * datapack with no target, and the wizard (`project-creation/ui/steps/datapackGate.ts`) will not
 * let Continue past a chosen datapack with no target, so a creation install can never be skipped
 * for want of codes (step-07 W1). Pure, with no extension-host imports, so a webview may import it.
 *
 * @module features/data-installer/installTarget
 */

import {
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import type { ComponentConfigs } from '@/types/components';

/** The scope an import writes into, as the wizard recorded it. */
export interface InstallTarget {
    websiteCode: string;
    storeCode: string;
}

/** The per-backend spelling of the same two facts. */
const SCOPE_KEYS: Record<string, { website: string; store: string }> = {
    'adobe-commerce-accs': { website: ACCS_WEBSITE_CODE, store: ACCS_STORE_VIEW_CODE },
    'adobe-commerce-paas': { website: PAAS_WEBSITE_CODE, store: PAAS_STORE_VIEW_CODE },
};

/** What the rule reads: a project, or the wizard's state put in the project's shape. */
export interface InstallTargetSource {
    componentSelections?: { backend?: string };
    componentConfigs?: ComponentConfigs;
}

/**
 * The website/store pair the Business Structure sub-step recorded, from the backend's own config.
 *
 * Both codes or nothing. The service validates them as a PAIR and falls back to
 * `base` when they are absent, so half a target is worse than none — it would
 * write into a scope nobody chose.
 *
 * @param project - the project, or the wizard state in its shape
 * @returns both codes, or null when either is missing or the backend has no scope keys
 */
export function resolveInstallTarget(project: InstallTargetSource): InstallTarget | null {
    const backend = project.componentSelections?.backend;
    const keys = backend ? SCOPE_KEYS[backend] : undefined;
    if (!backend || !keys) {
        return null;
    }
    const config = project.componentConfigs?.[backend] ?? {};
    const websiteCode = String(config[keys.website] ?? '');
    const storeCode = String(config[keys.store] ?? '');

    return websiteCode && storeCode ? { websiteCode, storeCode } : null;
}
