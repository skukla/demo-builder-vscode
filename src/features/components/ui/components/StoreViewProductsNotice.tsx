/**
 * StoreViewProductsNotice
 *
 * One line under the store pickers when the ACCS store view the SC chose will
 * show guests no products (EDS-46). The release walk built on a website with no
 * products assigned, and nothing said so until the storefront came up empty.
 *
 * A notice, never a block: a demo may be meant to start empty, so Continue and
 * Save are untouched. Silent while checking, silent when the check cannot
 * answer, and silent on PaaS — the check runs on ACCS only.
 *
 * The house `InlineNotice`, title only: the one sentence is the whole message.
 *
 * @module features/components/ui/components/StoreViewProductsNotice
 */

import React from 'react';
import { STORE_GROUP_IDS } from '../../config/storeFieldHelpers';
import type { ServiceGroup, UniqueField } from '../hooks/useComponentConfig';
import { useStoreViewProductCheck } from '../hooks/useStoreViewProductCheck';
import { ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE, ACCS_WEBSITE_CODE } from '@/core/config/envVarKeys';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { NO_GUEST_PRODUCTS_WARNING } from '@/types/commerceStore';

export interface StoreViewProductsNoticeProps {
    /** The store group the pickers render; only the ACCS one is checked. */
    group: ServiceGroup;
    /** The same accessor the pickers read their selections through. */
    getFieldValue: (field: UniqueField) => string | boolean | number | undefined;
    /** The ACCS GraphQL endpoint; absent until the Connection step has one. */
    accsEndpoint?: string;
}

/**
 * Render the warning, or nothing.
 *
 * @param props - see {@link StoreViewProductsNoticeProps}
 * @returns the one-line notice, or null
 */
export function StoreViewProductsNotice({
    group,
    getFieldValue,
    accsEndpoint,
}: StoreViewProductsNoticeProps): React.ReactElement | null {
    const isAccs = group.id === STORE_GROUP_IDS.ACCS;
    const codeOf = (key: string): string => {
        const field = isAccs ? group.fields.find((f) => f.key === key) : undefined;
        return field ? String(getFieldValue(field) || '') : '';
    };

    const warn = useStoreViewProductCheck(
        isAccs ? accsEndpoint : undefined,
        codeOf(ACCS_WEBSITE_CODE),
        codeOf(ACCS_STORE_CODE),
        codeOf(ACCS_STORE_VIEW_CODE),
    );

    return warn ? <InlineNotice title={NO_GUEST_PRODUCTS_WARNING} testId="store-view-no-products" /> : null;
}
