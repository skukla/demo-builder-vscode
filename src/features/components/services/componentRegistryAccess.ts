/**
 * Read the component registry off a handler context.
 *
 * WHY AN ACCESSOR AND NOT A BARE FIELD READ. `componentRegistry` is optional on
 * `HandlerContext`, because every other manager there is and making it required
 * would rewrite 99 test files to prove a point. Optional invites the fallback
 * that recreates the problem — `context.componentRegistry ?? new
 * ComponentRegistryManager(path)` — which is exactly the construction ADR-015
 * forbids, wearing a nicer face.
 *
 * So: one accessor, and it throws. A context without a registry is a wiring bug
 * at the composition point, not a runtime condition to paper over, and a loud
 * failure names it in one line instead of producing a second registry that
 * silently reads the same JSON off disk again.
 */

import type { ComponentRegistryManager } from './ComponentRegistryManager';
import type { HandlerContext } from '@/types/handlers';

export function componentRegistryFrom(context: HandlerContext): ComponentRegistryManager {
    if (!context.componentRegistry) {
        throw new Error(
            'HandlerContext carries no componentRegistry. It is built by ' +
                'createPanelHandlerContext (webview side) and createHeadlessHandlerContext ' +
                '(MCP side) — a context from anywhere else needs one handed in.',
        );
    }
    return context.componentRegistry;
}
