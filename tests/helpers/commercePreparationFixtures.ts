/**
 * Commerce answers for "Prepare this store" (AB-77), typed to the shapes in
 * `src/types/commerceWire.ts`, so a fixture that drifts from them fails `typecheck:tests`.
 *
 * Where they come from (said per fixture too):
 * - system/config: the fields on Adobe's `saas-integrations/system-config` reference page
 *   (`path`, `value`, `scope`, `scope_code`; the PUT answer's `items` and `errors`). The round
 *   trip was run LIVE on Justrite on 2026-10-10 (`sales/totals_sort/tax` 40 -> 41 -> 40, and a
 *   refused path answered in `errors` under HTTP 200), which is what the `errors` handling
 *   here rests on. The literal JSON of those answers is not recorded in the repo.
 * - product attributes, sources, stocks, links, companies, shared catalogs: Magento's service
 *   contracts for those routes and the data installer's schemas and processors (read
 *   2026-10-10). Not recorded live. The company and catalog rows follow `setupChecks.ts`'s
 *   reads of the same lists.
 *
 * `commerceFake` is the one double every suite drives: a `get` answering by path, a `send`
 * that records every call, so a test asserts the ARGUMENT a write was handed.
 */

import type { CommerceSend } from '@/features/app-builder/services/commerceBulk';
import type { CommerceGet } from '@/features/app-builder/services/erpFillReaders';
import type {
    CommerceCompanyList,
    CommerceInventorySourceList,
    CommerceInventoryStockList,
    CommerceProductAttribute,
    CommerceSharedCatalogList,
    CommerceStockSourceLinkList,
    CommerceSystemConfigList,
    CommerceSystemConfigPutAnswer,
    CommerceSystemConfigRow,
} from '@/types/commerceWire';

/** The rows `GET system/config` answers for some paths at one scope. */
export function configList(rows: Array<[path: string, value: string | null]>, scope: 'default' | 'website' = 'default', scopeCode?: string): CommerceSystemConfigList {
    return { items: rows.map(([path, value]): CommerceSystemConfigRow => ({ path, value, scope, scope_code: scopeCode ?? null })) };
}

/** What `PUT system/config` answers: every item saved, none refused. */
export function configSaved(items: CommerceSystemConfigRow[]): CommerceSystemConfigPutAnswer {
    return { items, errors: [] };
}

/** A PUT answer refusing one path, under HTTP 200, as Justrite did on 2026-10-10. */
export function configRefused(saved: CommerceSystemConfigRow[], path: string, scope: string, message: string): CommerceSystemConfigPutAnswer {
    return { items: saved, errors: [{ path, scope, message }] };
}

/** `GET products/attributes/<code>` for a Text Field. */
export function textAttribute(code: string): CommerceProductAttribute {
    return { attribute_id: 300, attribute_code: code, frontend_input: 'text', default_frontend_label: code, is_user_defined: true };
}

export const SOURCES_DEFAULT_ONLY: CommerceInventorySourceList = {
    items: [{ source_code: 'default', name: 'Default Source', enabled: true }],
    total_count: 1,
};

export const STOCKS_DEFAULT_ONLY: CommerceInventoryStockList = {
    items: [{ stock_id: 1, name: 'Default Stock', extension_attributes: { sales_channels: [{ type: 'website', code: 'base' }] } }],
    total_count: 1,
};

export const LINKS_DEFAULT_ONLY: CommerceStockSourceLinkList = {
    items: [{ stock_id: 1, source_code: 'default', priority: 1 }],
    total_count: 1,
};

/** Three companies: one on the public catalog, two sharing a custom one. */
export const COMPANIES: CommerceCompanyList = {
    items: [
        { id: 1, company_name: 'Altura', customer_group_id: 4 },
        { id: 2, company_name: 'Northgate', customer_group_id: 5 },
        { id: 3, company_name: 'Harbor', customer_group_id: 5 },
    ],
    total_count: 3,
};

export const CATALOGS: CommerceSharedCatalogList = {
    items: [
        { id: 1, name: 'Default (General)', customer_group_id: 4, type: 1 },
        { id: 2, name: 'Wholesale', customer_group_id: 5, type: 0 },
    ],
    total_count: 2,
};

export interface CommerceFake {
    get: jest.Mock<ReturnType<CommerceGet>, Parameters<CommerceGet>>;
    send: jest.Mock<ReturnType<CommerceSend>, Parameters<CommerceSend>>;
    /** Every write, in order: method, path, body. */
    writes: () => Array<[string, string, unknown]>;
}

/**
 * A Commerce client answering `get` by the first matching path prefix (or a function of the
 * path), and recording every `send`. A path nothing answers throws, so a read the test did
 * not expect is loud.
 */
export function commerceFake(
    answers: Record<string, unknown | ((path: string) => unknown)>,
    sendImpl: (method: string, path: string, body: unknown) => unknown = () => null,
): CommerceFake {
    const get = jest.fn(async (path: string) => {
        const key = Object.keys(answers).find((prefix) => path.startsWith(prefix));
        if (key === undefined) throw new Error(`unexpected GET ${path}`);
        const answer = answers[key];
        return typeof answer === 'function' ? (answer as (p: string) => unknown)(path) : answer;
    });
    const send = jest.fn(async (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown) => sendImpl(method, path, body));
    return { get, send, writes: () => send.mock.calls.map(([method, path, body]) => [method, path, body]) };
}
