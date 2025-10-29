import { DependencyList } from 'react';
/**
 * Subscribe to messages from the VS Code extension
 *
 * Automatically handles subscription cleanup on unmount.
 * The callback is memoized to prevent unnecessary re-subscriptions.
 *
 * @param type - Message type to listen for
 * @param callback - Handler function called when message is received
 * @param deps - Optional dependency array for callback (like useCallback)
 *
 * @example
 * ```tsx
 * useVSCodeMessage('projects', (data) => {
 *   setProjects(data);
 * });
 * ```
 */
export declare function useVSCodeMessage<T = any>(type: string, callback: (data: T) => void, deps?: DependencyList): void;
//# sourceMappingURL=useVSCodeMessage.d.ts.map