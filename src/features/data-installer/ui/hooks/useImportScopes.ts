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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataInstallerRequest } from './useDataInstallerRequest';

/** One website and the store views that belong to it. */
export interface TargetWebsite {
    code: string;
    name: string;
    storeViews: Array<{ code: string; name: string }>;
}

export interface ImportScopes {
    websites: TargetWebsite[];
    /** Discovery in flight — the pickers hold their space, disabled. */
    loading: boolean;
    websiteCode: string;
    storeCode: string;
    chooseWebsite: (code: string) => void;
    chooseStore: (code: string) => void;
    /** The request fields, or nothing at all when no target was chosen. */
    targetFields: () => Partial<{ websiteCode: string; storeCode: string }>;
}

/** Stable empty list, so an undiscovered instance does not remake deps. */
const EMPTY_WEBSITES: TargetWebsite[] = [];

/** The service's own default website code when the pair is omitted. */
const DEFAULT_WEBSITE_CODE = 'base';
/** …and its default store view code. */
const DEFAULT_STORE_VIEW_CODE = 'default';

/** A website's default store view: the one named `default`, else its first. */
function defaultStoreViewCode(websites: TargetWebsite[], websiteCode: string): string {
    const views = websites.find((site) => site.code === websiteCode)?.storeViews ?? [];
    const preferred = views.find((view) => view.code === DEFAULT_STORE_VIEW_CODE);
    return (preferred ?? views[0])?.code ?? '';
}

/** The website/store view pair the project recorded, if it recorded one. */
export interface RecordedScope {
    websiteCode: string;
    storeCode: string;
}

/**
 * @param recorded - the project's own pair, from `get-datapack-import-target`.
 *   Preferred over the service default when discovery offers it. Omit it and the
 *   hook behaves as it always did.
 */
export function useImportScopes(recorded?: RecordedScope): ImportScopes {
    const [websiteCode, setWebsiteCode] = useState('');
    const [storeCode, setStoreCode] = useState('');
    const scopes = useDataInstallerRequest<{ websites: TargetWebsite[] }>(
        'list-datapack-import-scopes',
    );

    const loadScopes = scopes.load;
    useEffect(() => {
        loadScopes({});
    }, [loadScopes]);

    // Memoised, not `?? []` inline: a fresh array every render would change the
    // deps of the callback and effect below on every render — the inline-empty-
    // array trap the project's CLAUDE.md records as an infinite-loop risk.
    const websites = useMemo(() => scopes.value?.websites ?? EMPTY_WEBSITES, [scopes.value]);

    /**
     * Picking a website also picks its default store view.
     *
     * A view belongs to exactly one website, so the previous one cannot be kept
     * — and leaving it blank would present one scope as answered and the other
     * as not, which are the same decision.
     */
    const chooseWebsite = useCallback(
        (code: string): void => {
            setWebsiteCode(code);
            setStoreCode(defaultStoreViewCode(websites, code));
        },
        [websites],
    );

    /**
     * Seed both scopes once discovery lands.
     *
     * The service defaults to `base`/`default` when the pair is absent, and the
     * pickers used to SAY so while selecting nothing. Selecting them for real
     * means what the dialog shows is what the request carries — at the cost of
     * always sending the pair explicitly, which is equivalent since the codes
     * come from the instance's own structure.
     *
     * **`recorded` wins over `base`.** The project's Business Structure already
     * names a website and store view, and preferring `base` over it meant the
     * dialog defaulted to a scope nobody chose — and a reset driven from here
     * targeted a different scope than the project reset, on the same project.
     * The recorded pair is only honoured when discovery actually offers it; a
     * stale code that no longer exists on the instance falls through to the
     * default rather than selecting nothing.
     */
    useEffect(() => {
        if (websites.length === 0 || websiteCode) {
            return;
        }
        const site =
            websites.find((w) => w.code === recorded?.websiteCode) ??
            websites.find((w) => w.code === DEFAULT_WEBSITE_CODE) ??
            websites[0];
        setWebsiteCode(site.code);

        const views = site.storeViews ?? [];
        const recordedView =
            site.code === recorded?.websiteCode
                ? views.find((view) => view.code === recorded.storeCode)
                : undefined;
        setStoreCode(recordedView?.code ?? defaultStoreViewCode(websites, site.code));
    }, [websites, websiteCode, recorded]);

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
        websites,
        loading: scopes.loading,
        websiteCode,
        storeCode,
        chooseWebsite,
        chooseStore: setStoreCode,
        targetFields,
    };
}
