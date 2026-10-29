/**
 * What "Add another ERP" offers for "Which products belong to this ERP?" (AB-64), read once as
 * the dialog opens: the store's websites and sources, its products (for the counts), and each
 * existing ERP's rule.
 *
 * One request the extension ANSWERS (Pattern B): a refusal is `{ success: false, error }`, not
 * a rejection, so the envelope is typed and branched on. The dialog opens before the answer
 * (counts read "…" meanwhile) and still works without it: the default is then the attribute.
 *
 * @module features/dashboard/ui/hooks/useErpOwnershipOptions
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ErpOwnershipOptions, ErpOwnershipOptionsResult } from '@/types/erpOwnership';

export interface ErpOwnershipOptionsState {
    /** Null until read, and when the read failed. */
    options: ErpOwnershipOptions | null;
    /** Why the read did not go through, in the extension's words. */
    error: string | null;
    loading: boolean;
}

async function ask(id: string): Promise<ErpOwnershipOptionsResult> {
    try {
        return await webviewClient.request<ErpOwnershipOptionsResult>('getErpOwnershipOptions', { id });
    } catch {
        return { success: false, error: 'No answer came back from Commerce. Counts are unavailable.' };
    }
}

/**
 * Read the options for an integration as the dialog opens.
 *
 * @param integrationId - the ERP integration the ERP is added to
 * @returns the options, the refusal, and whether the read is in flight
 */
export function useErpOwnershipOptions(integrationId: string): ErpOwnershipOptionsState {
    const [state, setState] = useState<ErpOwnershipOptionsState>({ options: null, error: null, loading: true });

    useEffect(() => {
        let live = true;
        void ask(integrationId).then((result) => {
            if (!live) return;
            if (result.success) setState({ options: result.data ?? null, error: null, loading: false });
            else setState({ options: null, error: result.error ?? 'Could not read Commerce.', loading: false });
        });
        return () => {
            live = false;
        };
    }, [integrationId]);

    return state;
}
