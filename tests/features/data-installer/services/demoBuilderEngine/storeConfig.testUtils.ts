/**
 * A fake of `GET`/`PUT /V1/system/config` for the store settings kind (datapack-engine step 09),
 * in the shapes Adobe's "System configuration API" page gives (`CommerceSystemConfigList`,
 * `CommerceSystemConfigPutAnswer`). No response of these routes is captured in this repo.
 *
 * Website settings are held per website code, as Commerce holds them: `website` is the test
 * website's (`WEBSITE`), `websites` any other's. Every read's address is kept in `reads`, so a
 * suite can assert which website a read named.
 */

import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import type { CommerceSystemConfigList, CommerceSystemConfigPutAnswer, CommerceSystemConfigWrite } from '@/types/commerceWire';
import { type SentCall, fakeContext } from './demoBuilderEngine.testUtils';

export const GRID = 'catalog/frontend/grid_per_page';
export const LIST = 'catalog/frontend/list_per_page';
export const WEBSITE = 'justrite_test_website';
/** The project's own website on scratch-1028, which is not where its settings pack went (live, 2026-10-30). */
export const PROJECT_WEBSITE = 'justrite';
const FILTER_VALUE = 'searchCriteria[filterGroups][0][filters][0][value]';

type Scoped = Record<string, string | null>;

/** A store's settings at the default scope and per website, read and written the way the API does. */
export function configStore(initial: { default?: Scoped; website?: Scoped; websites?: Record<string, Scoped> }, refuse: string[] = []) {
    const sites: Record<string, Scoped> = { ...(initial.websites ?? {}), [WEBSITE]: { ...(initial.website ?? {}) } };
    const state = { default: { ...(initial.default ?? {}) }, website: sites[WEBSITE], websites: sites };
    const reads: string[] = [];
    const at = (scope: string, code: string | null | undefined): Scoped => {
        if (scope !== 'website') return state.default;
        sites[code ?? ''] ??= {};
        return sites[code ?? ''];
    };
    const get = async (path: string): Promise<CommerceSystemConfigList> => {
        reads.push(path);
        const query = new URLSearchParams(path.slice(path.indexOf('?') + 1));
        const scope = query.get('scope') === 'website' ? 'website' : 'default';
        const values = at(scope, query.get('scopeCode'));
        const paths = (query.get(FILTER_VALUE) ?? '').split(',');
        return { items: paths.map((p) => ({ path: p, value: values[p] ?? null, scope })) };
    };
    const put = (body: { items: CommerceSystemConfigWrite[] }): CommerceSystemConfigPutAnswer => {
        const saved = body.items.filter((item) => !refuse.includes(item.path));
        for (const item of saved) at(item.scope === 'website' ? 'website' : 'default', item.scope_code)[item.path] = item.value;
        const errors = body.items.filter((item) => refuse.includes(item.path)).map((item) => ({ path: item.path, scope: item.scope, message: 'not allowed' }));
        return { items: saved.map((item) => ({ ...item })), errors };
    };
    return { state, reads, get, put };
}

export async function storeContext(store: ReturnType<typeof configStore>, websiteCode = WEBSITE): Promise<KindContext & { sent: SentCall[] }> {
    const ctx = await fakeContext();
    ctx.session.websiteCode = websiteCode;
    const send = async (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown) => {
        ctx.sent.push({ method, path, body });
        return store.put(body as { items: CommerceSystemConfigWrite[] });
    };
    return Object.assign(ctx, { get: store.get, send });
}

export const row = (path: string, value: string, scope = 'default', scope_code?: string) => ({ path, value, scope, ...(scope_code ? { scope_code } : {}) });
