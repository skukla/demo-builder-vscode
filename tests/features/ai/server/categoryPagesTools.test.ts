/**
 * generate_category_pages / remove_category_pages — the gate, the refusal's words,
 * and what each handler is handed. The handlers are passed in (ADR-016), so the
 * argument they receive is asserted rather than the outcome of a mock.
 */

import {
    registerCategoryPagesTools,
    type CategoryPagesToolDeps,
} from '@/features/ai/server/categoryPagesTools';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { expectWithinCeiling } from './responseCeilings';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const PROJECT = createMockProject({
    selectedStack: 'eds-accs',
    componentInstances: {
        'eds-storefront': { ...edsStorefrontInstance(), metadata: { githubRepo: 'acme-org/acme-store' } },
    },
    categoryPages: {
        pages: { '/signs': { categoryId: '10', hash: 'h1' }, '/signs/exit': { categoryId: '11', hash: 'h2' } },
        updatedAt: '2026-10-01T00:00:00.000Z',
    },
});

function harness(overrides: Partial<CategoryPagesToolDeps> = {}) {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    const schemas = new Map<string, McpToolSchema>();
    const server = {
        registerTool(name: string, def: McpToolSchema, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
            schemas.set(name, def);
        },
    };
    const ctx = createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(PROJECT) }),
    });
    const deps: CategoryPagesToolDeps = {
        generate: jest.fn().mockResolvedValue({ success: true, data: { written: ['/signs'] } }),
        remove: jest.fn().mockResolvedValue({ success: true, data: { removed: ['/signs'] } }),
        signIns: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    registerCategoryPagesTools(server, () => ctx, deps);
    return {
        deps,
        ctx,
        schema: (name: string) => schemas.get(name)!,
        call: async (name: string, args: unknown): Promise<any> => JSON.parse((await tools.get(name)!(args)).content[0].text),
    };
}

describe('generate_category_pages', () => {
    it('refuses without confirm, naming the storefront, and touches nothing', async () => {
        const h = harness();
        const res = await h.call('generate_category_pages', {});
        expect(res.error).toMatch(/acme-org\/acme-store/);
        expect(res.error).toMatch(/confirm:true/);
        expect(h.deps.generate).not.toHaveBeenCalled();
        expect(h.deps.signIns).not.toHaveBeenCalled();
    });

    it('hands the sign-in handoff back before dispatching', async () => {
        const handoff = { needsAuth: 'dalive', message: 'DA.live sign-in required' };
        const h = harness({ signIns: jest.fn().mockResolvedValue(handoff) });
        expect(await h.call('generate_category_pages', { confirm: true })).toEqual(handoff);
        expect(h.deps.generate).not.toHaveBeenCalled();
    });

    it('dispatches with the root it was given, and answers the data', async () => {
        const h = harness();
        const res = await h.call('generate_category_pages', { confirm: true, rootCategoryId: '10' });
        expect(h.deps.generate).toHaveBeenCalledWith(h.ctx, { rootCategoryId: '10' });
        expect(res).toEqual({ written: ['/signs'] });
    });

    it('dispatches with no root when none was given', async () => {
        const h = harness();
        await h.call('generate_category_pages', { confirm: true });
        expect(h.deps.generate).toHaveBeenCalledWith(h.ctx, {});
    });

    it('answers a handler refusal whole', async () => {
        const h = harness({
            generate: jest.fn().mockResolvedValue({ success: false, error: 'Could not read the category tree: x', code: 'NETWORK' }),
        });
        expect(await h.call('generate_category_pages', { confirm: true })).toEqual({
            error: 'Could not read the category tree: x',
            code: 'NETWORK',
        });
    });

    it('only takes a numeric root id', () => {
        const shape = harness().schema('generate_category_pages').inputSchema as Record<string, { safeParse(v: unknown): { success: boolean } }>;
        expect(shape.rootCategoryId.safeParse('12').success).toBe(true);
        expect(shape.rootCategoryId.safeParse('12") { x }').success).toBe(false);
    });
});

describe('remove_category_pages', () => {
    it('refuses without confirm, saying how many pages would go', async () => {
        const h = harness();
        const res = await h.call('remove_category_pages', {});
        expect(res.pages).toBe(2);
        expect(res.error).toMatch(/2 category page/);
        expect(h.deps.remove).not.toHaveBeenCalled();
    });

    it('dispatches the removal when confirmed', async () => {
        const h = harness();
        expect(await h.call('remove_category_pages', { confirm: true })).toEqual({ removed: ['/signs'] });
        expect(h.deps.remove).toHaveBeenCalledWith(h.ctx, undefined);
    });
});

describe('response size', () => {
    it('keeps both refusals within their recorded ceilings', async () => {
        const h = harness();
        expectWithinCeiling('generate_category_pages', JSON.stringify(await h.call('generate_category_pages', {})));
        expectWithinCeiling('remove_category_pages', JSON.stringify(await h.call('remove_category_pages', {})));
    });
});
