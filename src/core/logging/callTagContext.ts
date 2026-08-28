/**
 * The ambient call tag — which agent tool call is this code serving? (AI-2d)
 *
 * The MCP server's per-call wrapper runs each tool handler inside
 * {@link runWithCallTag}; anything that executes during that call — however
 * deep, across awaits — can ask {@link currentCallTag} and get the same
 * number. The DebugLogger uses it to stamp `#N` into debug-channel lines, and
 * the trace recorder stores it on the call's entry, which is what links a
 * failed call in the activity record to exactly its lines in the Debug Log.
 *
 * Lives in core/logging because BOTH ends need it and core cannot import
 * features: the logger (core) reads the tag; the server wrapper (features/ai)
 * establishes it.
 *
 * Node's AsyncLocalStorage carries the value across async boundaries and
 * keeps CONCURRENT calls separate — two agents' interleaved calls each see
 * their own tag, which is the whole point (interleaving is why the debug log
 * needed tags at all).
 *
 * Tags are short, numeric, and monotonic per window — never a hash — because
 * the owner's design rule is that log prefixes stay human-scannable
 * (AI-2d, 2026-08-28).
 *
 * @module core/logging/callTagContext
 */

import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<number>();
let counter = 0;

/** The next tag. Monotonic per window; the wrapper calls this once per call. */
export function nextCallTag(): number {
    return ++counter;
}

/**
 * Run `fn` with `tag` as the ambient call tag for everything it does,
 * including across awaits.
 */
export function runWithCallTag<T>(tag: number, fn: () => T): T {
    return storage.run(tag, fn);
}

/** The current call's tag, or undefined outside any agent call. */
export function currentCallTag(): number | undefined {
    return storage.getStore();
}
