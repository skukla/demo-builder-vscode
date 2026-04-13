/**
 * Store field classification helpers
 *
 * Shared predicates and constant sets used by ComponentConfigStep and
 * ConnectStoreStepContent to determine how commerce store fields are
 * rendered with progressive disclosure.
 *
 * @module features/components/config/storeFieldHelpers
 */

import {
    PAAS_URL,
    PAAS_ADMIN_USERNAME,
    PAAS_ADMIN_PASSWORD,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_GRAPHQL_ENDPOINT as ACCS_ENDPOINT_KEY,
} from './envVarKeys';

/** Service group IDs for PaaS and ACCS commerce backends */
export const STORE_GROUP_IDS = {
    ACCS: 'accs',
    PAAS: 'adobe-commerce',
} as const;

/** Whether a field is a website code field (where store selection row appears) */
export const isWebsiteCodeField = (key: string): boolean =>
    key === PAAS_WEBSITE_CODE || key === ACCS_WEBSITE_CODE;

/** Whether a field is any store code field (website, store, or store view) */
export const isStoreCodeField = (key: string): boolean =>
    key === PAAS_WEBSITE_CODE || key === PAAS_STORE_CODE || key === PAAS_STORE_VIEW_CODE ||
    key === ACCS_WEBSITE_CODE || key === ACCS_STORE_CODE || key === ACCS_STORE_VIEW_CODE;

/** Connection fields — always shown. Everything else is hidden until prerequisites are met. */
export const CONNECTION_FIELDS = new Set<string>([
    ACCS_ENDPOINT_KEY, PAAS_URL, PAAS_ADMIN_USERNAME, PAAS_ADMIN_PASSWORD,
]);
