import { useEffect, useRef, DependencyList } from 'react';
import { vscode } from '../../wizard/app/vscodeApi';

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
export function useVSCodeMessage<T = any>(
  type: string,
  callback: (data: T) => void,
  deps: DependencyList = []
): void {
  // Store callback in ref to avoid re-subscribing on every callback change
  const callbackRef = useRef(callback);

  // Update callback ref when deps change
  useEffect(() => {
    callbackRef.current = callback;
  }, deps);

  useEffect(() => {
    // Wrapper that uses the ref to call the latest callback
    const handler = (data: unknown) => {
      callbackRef.current(data as T);
    };

    // Subscribe to messages
    const unsubscribe = vscode.onMessage(type, handler);

    // Cleanup on unmount
    return unsubscribe;
  }, [type]); // Only re-subscribe if message type changes
}
