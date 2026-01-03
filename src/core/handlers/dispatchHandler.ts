/**
 * Handler Dispatch Utility
 *
 * Provides simple functions for dispatching messages to handler maps.
 * Replaces BaseHandlerRegistry class with functional approach.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import type { HandlerContext, HandlerMap, HandlerResponse } from '@/types/handlers';

/**
 * Dispatch a message to the appropriate handler
 *
 * Replaces BaseHandlerRegistry.handle() with a simple function.
 * Preserves the same behavior: lookup, error on missing, async execution.
 *
 * @param handlers - Handler map containing message type to handler mappings
 * @param context - Handler context with dependencies
 * @param messageType - Message type to dispatch
 * @param data - Message payload
 * @returns Promise resolving to handler result
 * @throws Error if no handler registered for message type
 */
export async function dispatchHandler(
    handlers: HandlerMap,
    context: HandlerContext,
    messageType: string,
    data: unknown,
): Promise<HandlerResponse> {
    const handler = handlers[messageType];

    if (!handler) {
        throw new Error(`No handler registered for message type: ${messageType}`);
    }

    return handler(context, data);
}

/**
 * Check if a handler exists for a message type
 *
 * @param handlers - Handler map to check
 * @param messageType - Message type to look for
 * @returns true if handler exists, false otherwise
 */
export function hasHandler(handlers: HandlerMap, messageType: string): boolean {
    return messageType in handlers;
}

/**
 * Get all registered message types
 *
 * @param handlers - Handler map to inspect
 * @returns Array of message type strings
 */
export function getRegisteredTypes(handlers: HandlerMap): string[] {
    return Object.keys(handlers);
}
