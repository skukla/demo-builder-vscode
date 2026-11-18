/**
 * The name and description a demo package is saved under, prefilled from the storefront read's
 * draft. Share Demo's link step and Save as Package both edit it (EDS-72); typing never talks to
 * the host (`docs/patterns/selection-pattern.md`).
 *
 * @module features/dashboard/ui/components/share/useShareDraft
 */

import { useCallback, useState } from 'react';

export interface ShareDraft {
    name: string;
    description: string;
}

export interface UseShareDraft {
    draft: ShareDraft;
    setName: (name: string) => void;
    setDescription: (description: string) => void;
}

/**
 * The draft and its two setters, each stable.
 *
 * @param initial - the preview's draft
 * @returns the draft and the callbacks the fields bind
 */
export function useShareDraft(initial: ShareDraft): UseShareDraft {
    const [draft, setDraft] = useState<ShareDraft>(initial);
    return {
        draft,
        setName: useCallback((name: string) => setDraft((current) => ({ ...current, name })), []),
        setDescription: useCallback(
            (description: string) => setDraft((current) => ({ ...current, description })),
            [],
        ),
    };
}
