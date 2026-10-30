/**
 * A fake of `GET`/`PUT /V1/system/config` for the store settings kind (datapack-engine step 09),
 * in the shapes Adobe's "System configuration API" page gives (`CommerceSystemConfigList`,
 * `CommerceSystemConfigPutAnswer`). No response of these routes is captured in this repo.
 */

import type { KindContext } from '@/features/data-installer/services/demoBuilderEngine/kindContext';
import type { CommerceSystemConfigList, CommerceSystemConfigPutAnswer, CommerceSystemConfigWrite } from '@/types/commerceWire';
import { type SentCall, fakeContext } from './demoBuilderEngine.testUtils';

export const GRID = 'catalog/frontend/grid_per_page';
export const LIST = 'catalog/frontend/list_per_page';
export const WEBSITE = 'justrite_test_website';
const FILTER_VALUE = 'searchCriteria[filterGroups][0][filters][0][value]';

type Scoped = Record<string, string | null>;

/** A store's settings at two scopes, read and written the way the API does. */
export function configStore(initial: { default?: Scoped; website?: Scoped }, refuse: string[] = []) {
    const state = { default: { ...(initial.default ?? {}) }, website: { ...(initial.website ?? {}) } };
    const get = async (path: string): Promise<CommerceSystemConfigList> => {
        const query = new URLSearchParams(path.slice(path.indexOf('?') + 1));
        const scope = query.get('scope') === 'website' ? 'website' : 'default';
        const paths = (query.get(FILTER_VALUE) ?? '').split(',');
        return { items: paths.map((p) => ({ path: p, value: state[scope][p] ?? null, scope })) };
    };
    const put = (body: { items: CommerceSystemConfigWrite[] }): CommerceSystemConfigPutAnswer => {
        const saved = body.items.filter((item) => !refuse.includes(item.path));
        for (const item of saved) state[item.scope === 'website' ? 'website' : 'default'][item.path] = item.value;
        const errors = body.items.filter((item) => refuse.includes(item.path)).map((item) => ({ path: item.path, scope: item.scope, message: 'not allowed' }));
        return { items: saved.map((item) => ({ ...item })), errors };
    };
    return { state, get, put };
}

export async function storeContext(store: ReturnType<typeof configStore>): Promise<KindContext & { sent: SentCall[] }> {
    const ctx = await fakeContext();
    ctx.session.websiteCode = WEBSITE;
    const send = async (method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown) => {
        ctx.sent.push({ method, path, body });
        return store.put(body as { items: CommerceSystemConfigWrite[] });
    };
    return Object.assign(ctx, { get: store.get, send });
}

export const row = (path: string, value: string, scope = 'default', scope_code?: string) => ({ path, value, scope, ...(scope_code ? { scope_code } : {}) });

