/**
 * BaseHandlerRegistry - Base class for message handler registries
 *
 * Provides centralized registration and dispatching of message handlers.
 */

import { MessageHandler, HandlerContext } from '@/types/handlers';

/**
 * Abstract base class for handler registries
 */
export abstract class BaseHandlerRegistry {
    protected handlers: Map<string, MessageHandler> = new Map();

    constructor() {
        this.registerHandlers();
    }

    /**
     * Subclasses must implement to register their handlers
     */
    protected abstract registerHandlers(): void;

    /**
     * Get all registered message types
     */
    getRegisteredTypes(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * Check if a handler is registered for a message type
     * @param messageType Message type to check
     */
    hasHandler(messageType: string): boolean {
        return this.handlers.has(messageType);
    }

    /**
     * Handle a message by dispatching to the registered handler
     * @param context Handler context containing dependencies
     * @param messageType The type of message to handle
     * @param data The message payload
     */
    async handle(context: HandlerContext, messageType: string, data: unknown): Promise<unknown> {
        const handler = this.handlers.get(messageType);

        if (!handler) {
            throw new Error(`No handler registered for message type: ${messageType}`);
        }

        return await handler(context, data);
    }
}
