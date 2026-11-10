/**
 * What the changes check read from Commerce, kept for the save and the uninstall that follow it
 * (owner, 2026-11-10, walk F128). Importing over the demo's pack read Commerce three times: the
 * check (45 s for Luma), the save of the SC's changes (40 of its 48 s) and the uninstall's decision
 * of what to keep (34 s). The save writes only to the library, so Commerce did not change between
 * the three.
 *
 * A client opened to `remember` is the check: it always reads Commerce itself and keeps each
 * answer, starting a new window. A client opened to `reuse` answers a GET the check already made
 * from that window, and reads Commerce for anything else. The window is the project's, and:
 *
 * - any write to Commerce through a client of the same project throws it away;
 * - it lasts `CACHE_TTL.MEDIUM` from the check, then the next reader reads Commerce again;
 * - a read that failed is not kept.
 *
 * The check itself never reuses, so an edit the SC makes in the Admin is always seen by the next
 * check. What is not seen is an Admin edit in the minutes between the check and the save that
 * follows it: the save keeps what the check showed the SC, which is what they answered.
 *
 * Kept in memory only: a window reload forgets it, and the next reader reads Commerce.
 *
 * @module features/data-installer/services/commerceReadWindow
 */

import { type CacheEntry, createCacheEntry, isExpired } from '@/core/cache/cacheUtils';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import type { CommerceGet, CommerceSend } from '@/types/commerceWire';

/** `remember`: the check, which reads Commerce and keeps it. `reuse`: what follows it. */
export type ReadWindowUse = 'remember' | 'reuse';

interface Client {
    get: CommerceGet;
    send: CommerceSend;
}

/** One check's answers, by path. */
interface Window {
    at: number;
    reads: Map<string, Promise<unknown>>;
}

const windows = new Map<string, CacheEntry<Window>>();

/** The project's window while it lasts. */
function liveWindow(key: string): Window | undefined {
    const entry = windows.get(key);
    if (!entry) return undefined;
    if (!isExpired(entry)) return entry.value;
    windows.delete(key);
    return undefined;
}

/** A read that keeps its answer in `window`; a read that fails is dropped from it. */
function keep(window: Window, path: string, read: Promise<unknown>): Promise<unknown> {
    window.reads.set(path, read);
    read.catch(() => {
        if (window.reads.get(path) === read) window.reads.delete(path);
    });
    return read;
}

/**
 * The client, reading through the project's window.
 *
 * @param key - the project the window is for (its path)
 * @param use - `remember` for the check, `reuse` for what follows it
 * @param client - the project's own signed Commerce client
 * @param log - told once, the first time a read is answered from the window
 */
export function throughReadWindow(
    key: string,
    use: ReadWindowUse,
    client: Client,
    log?: (line: string) => void,
): Client {
    let started: Window | undefined;
    let said = false;
    const get: CommerceGet = (path) => {
        if (use === 'remember') {
            // A check starts its own window: the first read drops what an earlier check kept.
            if (!started || liveWindow(key) !== started) {
                started = { at: Date.now(), reads: new Map() };
                windows.set(key, createCacheEntry(started, CACHE_TTL.MEDIUM));
            }
            return keep(started, path, client.get(path));
        }
        const window = liveWindow(key);
        const kept = window?.reads.get(path);
        if (!window || !kept) return client.get(path);
        if (!said) {
            said = true;
            log?.(
                `reusing what the changes check read from Commerce ${Math.round((Date.now() - window.at) / 1000)} s ago`,
            );
        }
        return kept;
    };
    const send: CommerceSend = (...args) => {
        // Commerce is about to change: nothing read before this describes it any more.
        windows.delete(key);
        return client.send(...args);
    };
    return { get, send };
}

/** Forget every window (tests). */
export function forgetReadWindows(): void {
    windows.clear();
}
