/**
 * What "Assign products" opens with (AB-74), read once as the modal opens: the ERP's value,
 * the categories and brands with their counts, the attribute sets missing `erp_owner`, and the
 * store's products with who owns each today, so the preview follows the SC's picks with no
 * round trip. The same shape as `useErpOwnershipOptions`: one request the extension ANSWERS
 * (Pattern B), so the envelope is typed and branched on.
 *
 * @module features/dashboard/ui/hooks/useErpAssignOptions
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ErpAssignOptions, ErpAssignOptionsResult } from '@/types/erpAssign';

export interface ErpAssignOptionsState {
    /** Null until read, and when the read failed. */
    options: ErpAssignOptions | null;
    /** Why the read did not go through, in the extension's words. */
    error: string | null;
    loading: boolean;
}

async function ask(id: string, erp: string): Promise<ErpAssignOptionsResult> {
    try {
        return await webviewClient.request<ErpAssignOptionsResult>('getErpAssignOptions', { id, erp });
    } catch {
        return { success: false, error: 'No answer came back from Commerce.' };
    }
}

/**
 * Read the options for one ERP as the modal opens.
 *
 * @param integrationId - the ERP integration
 * @param erp - the ERP's component id
 */
export function useErpAssignOptions(integrationId: string, erp: string): ErpAssignOptionsState {
    const [state, setState] = useState<ErpAssignOptionsState>({ options: null, error: null, loading: true });

    useEffect(() => {
        let live = true;
        void ask(integrationId, erp).then((result) => {
            if (!live) return;
            if (result.success) setState({ options: result.data, error: null, loading: false });
            else setState({ options: null, error: result.error ?? 'Could not read Commerce.', loading: false });
        });
        return () => {
            live = false;
        };
    }, [integrationId, erp]);

    return state;
}
