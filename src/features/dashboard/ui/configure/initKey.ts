/**
 * A React key per Configure `init` payload (PL-76).
 *
 * Re-opening Configure sends a fresh `init` to the SAME React tree
 * (`BaseWebviewCommand.createOrRevealPanel`). Keying the screen on the payload
 * remounts it, so every field, the project name, the authoring choice and the
 * block-library ticks start from the project as it is now. Without it only the field
 * values re-seeded, and Save then put back a rename or an authoring change made
 * elsewhere. A re-render with the SAME payload keeps its key, so nothing remounts
 * while the SC is working.
 *
 * @module features/dashboard/ui/configure/initKey
 */

const keys = new WeakMap<object, number>();
let count = 0;

/**
 * The key for one `init` payload: the same object always gets the same key.
 *
 * @param init - the payload the webview received
 * @returns a number unique to that payload
 */
export function keyForInit(init: object): number {
    let key = keys.get(init);
    if (key === undefined) {
        count += 1;
        key = count;
        keys.set(init, key);
    }
    return key;
}
