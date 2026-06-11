/**
 * useAemContentSource (Slice 2, Step 07)
 *
 * Wizard-state plumbing for the joiner's content-source declaration on the
 * Connect step. Mirrors `useDaLiveAuth`'s state/updateState discipline minus
 * the credential bits — there are NONE for AEM (read is AEM-owned; the config
 * write reuses the existing Adobe IMS login), so this manages exactly two
 * fields (author URL + content path) plus the source-type choice, seeding
 * them into `edsConfig` so they ride the existing setup payload.
 *
 * @module features/eds/ui/hooks/useAemContentSource
 */

import {
    isAemContentSourceValid,
    validateAemAuthorUrlUI,
    validateAemContentPathUI,
} from '../helpers/aemContentSourceValidation';
import type { FieldValidation } from '@/core/validation/fieldValidation';
import type { BaseStepProps } from '@/types/wizard';

export type ContentSourceType = 'da-live' | 'aem-sites';

export interface UseAemContentSourceResult {
    /** The declared source ('da-live' when absent — legacy default). */
    contentSourceType: ContentSourceType;
    authorUrl: string;
    contentPath: string;
    authorUrlValidation: FieldValidation;
    contentPathValidation: FieldValidation;
    /** Continue-gate contribution: true for DA.live; for AEM, both fields must validate. */
    isSourceValid: boolean;
    setContentSourceType: (type: ContentSourceType) => void;
    setAuthorUrl: (value: string) => void;
    setContentPath: (value: string) => void;
}

export function useAemContentSource({
    state,
    updateState,
}: Pick<BaseStepProps, 'state' | 'updateState'>): UseAemContentSourceResult {
    const contentSourceType: ContentSourceType = state.edsConfig?.contentSourceType ?? 'da-live';
    const aemContentSource = state.edsConfig?.aemContentSource;
    const authorUrl = aemContentSource?.authorUrl ?? '';
    const contentPath = aemContentSource?.contentPath ?? '';

    const setContentSourceType = (type: ContentSourceType): void => {
        updateState({
            edsConfig: {
                ...state.edsConfig,
                contentSourceType: type,
                // Switching back to DA.live drops the AEM coords so the
                // manifest never carries a stale author URL.
                ...(type === 'da-live' && { aemContentSource: undefined }),
            },
        });
    };

    const seedAemContentSource = (next: { authorUrl: string; contentPath: string }): void => {
        updateState({
            edsConfig: { ...state.edsConfig, aemContentSource: next },
        });
    };

    return {
        contentSourceType,
        authorUrl,
        contentPath,
        authorUrlValidation: validateAemAuthorUrlUI(authorUrl),
        contentPathValidation: validateAemContentPathUI(contentPath),
        isSourceValid: contentSourceType !== 'aem-sites' || isAemContentSourceValid(aemContentSource),
        setContentSourceType,
        setAuthorUrl: (value) => seedAemContentSource({ authorUrl: value, contentPath }),
        setContentPath: (value) => seedAemContentSource({ authorUrl, contentPath: value }),
    };
}
