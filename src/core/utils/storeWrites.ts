/**
 * A count of the writes this extension has sent to Commerce or to an App Builder action, so a
 * read kept for later can tell whether anything may have changed since it was made.
 *
 * Two places send them, and both count here: the signed Commerce REST call (`requestRest`,
 * every method but GET) and the signed call to a web action (`callWithIms`, the same). A POST
 * that only reads (Commerce's tier prices) is counted too: the cost is one read made again.
 *
 * Writes made anywhere else (the Commerce Admin, an ERP's own events) are not seen; a kept
 * read covers that with its own age limit.
 *
 * @module core/utils/storeWrites
 */

let writes = 0;

/** Count one write. */
export function noteStoreWrite(): void {
    writes += 1;
}

/** How many writes have been sent since the extension started. */
export function storeWriteCount(): number {
    return writes;
}
