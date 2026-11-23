/**
 * Where a new project writes in Commerce, by name, for the review (walk F211, owner 2026-11-17):
 * Scratch 1028 B was created on the live store's website, picked by mistake from two of the same
 * brand, and the review never said which website a project's datapack and storefront would use.
 *
 * @module features/project-creation/ui/steps/reviewStoreScope
 */

import {
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import { storeViewNameIn, websiteNameIn } from '@/core/utils/commerceNames';
import type { WizardState } from '@/types/webview';

/** The chosen website and store view, each by its name once discovery has read the store, else its code. */
export function reviewStoreScope(state: WizardState): { website?: string; storeView?: string } {
    const configs = state.componentConfigs?.[state.selectedBackend ?? ''];
    const code = (accs: string, paas: string): string | undefined => {
        const value = configs?.[accs] ?? configs?.[paas];
        return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const website = code(ACCS_WEBSITE_CODE, PAAS_WEBSITE_CODE);
    const storeView = code(ACCS_STORE_VIEW_CODE, PAAS_STORE_VIEW_CODE);
    return {
        ...(website ? { website: websiteNameIn(state.storeDiscoveryData, website) } : {}),
        ...(storeView ? { storeView: storeViewNameIn(state.storeDiscoveryData, storeView) } : {}),
    };
}
