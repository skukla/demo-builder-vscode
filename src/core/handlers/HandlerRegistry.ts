/**
 * HandlerRegistry
 *
 * Generic handler registry for message/action dispatching.
 * Provides type-safe registration and invocation of handlers.
 */

/**
 * Handler function type
 */
export type Handler<T> = (data: unknown) => Promise<T>;

/**
 * Generic handler registry.
 * Manages registration and dispatching of handlers by action type.
 *
 * @template T - Return type of handlers
 */
export class HandlerRegistry<T> {
    private handlers: Map<string, Handler<T>> = new Map();

    /**
     * Register a handler for an action type.
     *
     * @param actionType - Unique action identifier
     * @param handler - Handler function
     * @throws Error if handler already registered for action type
     */
    register(actionType: string, handler: Handler<T>): void {
        if (this.handlers.has(actionType)) {
            throw new Error(`Handler already registered for: ${actionType}`);
        }
        this.handlers.set(actionType, handler);
    }

    /**
     * Check if a handler is registered for an action type.
     */
    has(actionType: string): boolean {
        return this.handlers.has(actionType);
    }

    /**
     * Handle an action by dispatching to registered handler.
     *
     * @param actionType - Action type to handle
     * @param data - Data to pass to handler
     * @returns Handler result
     * @throws Error if no handler registered for action type
     */
    async handle(actionType: string, data: unknown): Promise<T> {
        const handler = this.handlers.get(actionType);

        if (!handler) {
            throw new Error(`No handler registered for: ${actionType}`);
        }

        return await handler(data);
    }

    /**
     * Get all registered action types.
     */
    getRegisteredTypes(): string[] {
        return Array.from(this.handlers.keys());
    }
}
