/**
 * The import's target scope — which website and store view a pack lands on.
 *
 * Extracted from `ImportDatapackModal` when adding it pushed that component past
 * the complexity ceiling. It owns one coherent thing: the discovered scopes and
 * the user's choice within them.
 *
 * Targeting is the INTENDED path — the service rewrites every pack `website_ids`
 * with the session website, and the session comes from this pair. But it is also
 * entirely optional: discovery failing, or a project that cannot be discovered
 * against, leaves an empty list and an import that runs on the service's own
 * default (`base`), which is what happened before targeting existed.
 *
 * @module features/data-installer/ui/hooks/useImportScopes
 */

import { useCallback, useEffect, useState } from 'react';
import { useDataInstallerRequest } from './useDataInstallerRequest';

/** One website and the store views that belong to it. */
export interface TargetWebsite {
    code: string;
    name: string;
    storeViews: Array<{ code: string; name: string }>;
}

export interface ImportScopes {
    websites: TargetWebsite[];
    websiteCode: string;
    storeCode: string;
    chooseWebsite: (code: string) => void;
    chooseStore: (code: string) => void;
    /** The request fields, or nothing at all when no target was chosen. */
    targetFields: () => Partial<{ websiteCode: string; storeCode: string }>;
}

export function useImportScopes(): ImportScopes {
    const [websiteCode, setWebsiteCode] = useState('');
    const [storeCode, setStoreCode] = useState('');
    const scopes = useDataInstallerRequest<{ websites: TargetWebsite[] }>(
        'list-datapack-import-scopes',
    );

    const loadScopes = scopes.load;
    useEffect(() => {
        loadScopes({});
    }, [loadScopes]);

    /**
     * Picking a website clears the store view: a view belongs to exactly one
     * website, so keeping the previous one would send a pair the service rejects.
     */
    const chooseWebsite = useCallback((code: string): void => {
        setWebsiteCode(code);
        setStoreCode('');
    }, []);

    /**
     * Both keys or neither. The service defaults to `base` when the pair is
     * absent and would try to validate an empty string, so a half-chosen target
     * contributes nothing.
     */
    const targetFields = useCallback(
        () => (websiteCode && storeCode ? { websiteCode, storeCode } : {}),
        [websiteCode, storeCode],
    );

    return {
        websites: scopes.value?.websites ?? [],
        websiteCode,
        storeCode,
        chooseWebsite,
        chooseStore: setStoreCode,
        targetFields,
    };
}
