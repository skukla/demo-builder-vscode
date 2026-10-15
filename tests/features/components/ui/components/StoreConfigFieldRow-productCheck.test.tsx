/**
 * StoreConfigFieldRow — the no-products warning under the store pickers (EDS-46).
 *
 * Once an ACCS website, store and store view are chosen, the row asks the host
 * whether a guest sees any products there, and on "none" or "no index" says one
 * line under the pickers. It says nothing while asking, nothing when the check
 * cannot answer, and nothing on PaaS. It never blocks: it is a notice, not a
 * validation error.
 *
 * The webview client is the canonical double; the notice and its InlineNotice
 * render for real, because the exact sentence is the contract.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import {
    StoreConfigFieldRow,
    makeField,
    type ServiceGroup,
    type UniqueField,
} from './StoreConfigFieldRow.testUtils';
import {
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    ACCS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
} from '@/core/config/envVarKeys';
import type { StoreViewProducts } from '@/types/commerceStore';
import type { CheckStoreViewProductsResponse } from '@/types/webviewRequests';

const SENTENCE = "Guests won't see any products in this store view.";
const ENDPOINT = 'https://na1-sandbox.api.commerce.adobe.com/tenant/graphql';

function storeGroup(id: string, keys: string[]): ServiceGroup {
    return { id, label: id, fields: keys.map((key) => makeField(key)) };
}

const ACCS_GROUP = storeGroup('accs', [ACCS_WEBSITE_CODE, ACCS_STORE_CODE, ACCS_STORE_VIEW_CODE]);
const PAAS_GROUP = storeGroup('adobe-commerce', [PAAS_WEBSITE_CODE, PAAS_STORE_CODE, PAAS_STORE_VIEW_CODE]);

/** Field values by key; every test picks codes no other test uses (the answers are cached). */
function valuesReader(values: Record<string, string>) {
    return (field: UniqueField) => values[field.key] ?? '';
}

function accsCodes(suffix: string): Record<string, string> {
    return {
        [ACCS_WEBSITE_CODE]: `base_${suffix}`,
        [ACCS_STORE_CODE]: `main_${suffix}`,
        [ACCS_STORE_VIEW_CODE]: `default_${suffix}`,
    };
}

function renderRow(group: ServiceGroup, values: Record<string, string>, accsEndpoint?: string) {
    return render(
        <Provider theme={defaultTheme}>
            <StoreConfigFieldRow
                field={group.fields[0]}
                group={group}
                autoDetectKey="accs:endpoint"
                isFetching={false}
                hasStoreData={true}
                fetchError={null}
                isStoreGroup={() => true}
                getFieldValue={valuesReader(values)}
                updateField={jest.fn()}
                validationErrors={{}}
                touchedFields={new Set<string>()}
                normalizeUrlField={jest.fn()}
                getWebsiteItems={() => []}
                getStoreGroupItems={() => []}
                getStoreViewItems={() => []}
                accsEndpoint={accsEndpoint}
            />
        </Provider>,
    );
}

function answers(verdict: StoreViewProducts): void {
    const response: CheckStoreViewProductsResponse = { success: true, data: { verdict } };
    mockRequest.mockResolvedValue(response);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
});

describe('StoreConfigFieldRow — no-products warning', () => {
    it.each<StoreViewProducts>(['none', 'no-index'])(
        "says the one sentence under the pickers when the check answers '%s'",
        async (verdict) => {
            answers(verdict);

            renderRow(ACCS_GROUP, accsCodes(verdict.replace('-', '_')), ENDPOINT);

            const notice = await screen.findByTestId('store-view-no-products');
            // The sentence and nothing else: no second line, no title/body split.
            expect(notice.querySelector('.inline-notice-body')?.textContent).toBe(SENTENCE);
            expect(mockRequest).toHaveBeenCalledWith('check-store-view-products', {
                backendType: 'accs',
                endpoint: ENDPOINT,
                websiteCode: `base_${verdict.replace('-', '_')}`,
                storeCode: `main_${verdict.replace('-', '_')}`,
                storeViewCode: `default_${verdict.replace('-', '_')}`,
            });
        },
    );

    it.each<StoreViewProducts>(['found', 'unknown'])("says nothing when the check answers '%s'", async (verdict) => {
        answers(verdict);

        renderRow(ACCS_GROUP, accsCodes(`quiet_${verdict}`), ENDPOINT);
        await act(async () => {});

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
    });

    it('says nothing while the check is still running', () => {
        mockRequest.mockReturnValue(new Promise(() => {}));

        renderRow(ACCS_GROUP, accsCodes('pending'), ENDPOINT);

        expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
    });

    it('asks nothing until a store view is chosen', async () => {
        renderRow(ACCS_GROUP, { ...accsCodes('partial'), [ACCS_STORE_VIEW_CODE]: '' }, ENDPOINT);
        await act(async () => {});

        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('asks nothing without an ACCS endpoint', async () => {
        renderRow(ACCS_GROUP, accsCodes('no_endpoint'));
        await act(async () => {});

        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('asks nothing on PaaS, even handed an endpoint', async () => {
        renderRow(
            PAAS_GROUP,
            {
                [PAAS_WEBSITE_CODE]: 'base_paas',
                [PAAS_STORE_CODE]: 'main_paas',
                [PAAS_STORE_VIEW_CODE]: 'default_paas',
            },
            ENDPOINT,
        );
        await act(async () => {});

        expect(mockRequest).not.toHaveBeenCalled();
    });
});
