"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useVSCodeMessage = useVSCodeMessage;
const react_1 = require("react");
const vscode_api_1 = require("@/core/ui/vscode-api");
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
function useVSCodeMessage(type, callback, deps = []) {
    // Store callback in ref to avoid re-subscribing on every callback change
    const callbackRef = (0, react_1.useRef)(callback);
    // Update callback ref when deps change
    (0, react_1.useEffect)(() => {
        callbackRef.current = callback;
    }, deps);
    (0, react_1.useEffect)(() => {
        // Wrapper that uses the ref to call the latest callback
        const handler = (data) => {
            callbackRef.current(data);
        };
        // Subscribe to messages
        const unsubscribe = vscode_api_1.vscode.onMessage(type, handler);
        // Cleanup on unmount
        return unsubscribe;
    }, [type]); // Only re-subscribe if message type changes
}
//# sourceMappingURL=useVSCodeMessage.js.map