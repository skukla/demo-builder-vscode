/**
 * Shared by the response-size suites: the harness that registers descriptor rows and calls
 * them exactly as the MCP server does, over a stub handler map, and every descriptor row.
 * Why a stub, and why `confirm: true` is safe here: `responseSize.test.ts`'s module comment.
 */

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { registerDescriptorTools, type ToolDescriptor } from '@/features/ai/server/toolDescriptors';
import type { HandlerMap, HandlerResponse } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/** Registers the rows and invokes them exactly as the MCP server does. */
export function harness(descriptors: ToolDescriptor[], response: HandlerResponse) {
    const tools = new Map<
        string,
        (args: unknown) => Promise<{ content: Array<{ text: string }> }>
    >();
    const server = {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
        },
    };
    // Any type resolves to a handler returning `response`, so no real handler —
    // and therefore no service, no network, no filesystem — is reachable.
    const stub: HandlerMap = new Proxy({} as HandlerMap, {
        get: () => async () => response,
        has: () => true,
        ownKeys: () => [],
    });

    registerDescriptorTools(
        server,
        descriptors.map((d) => ({ ...d, map: stub })),
        () => createMockHandlerContext()
    );
    return {
        names: () => [...tools.keys()],
        async sizeOf(name: string, args: Record<string, unknown> = {}): Promise<number> {
            // confirm:true is safe — see the module docstring. Without it a gated
            // row returns its refusal and the success path stays unmeasured.
            const out = await tools.get(name)!({ confirm: true, ...args });
            return Buffer.byteLength(out.content[0].text, 'utf8');
        },
    };
}

export const ALL = [
    ...READ_DESCRIPTORS,
    ...STATUS_DESCRIPTORS,
    ...ACTION_DESCRIPTORS,
    // Group 8. Added the moment the array existed, because the alternative is
    // the failure this file already documents twice: a guard whose scope quietly
    // stops matching what it guards. Eight rows registered by `extension.ts` and
    // classified by nothing would have looked exactly like a clean run.
    ...DATA_INSTALLER_DESCRIPTORS,
];
