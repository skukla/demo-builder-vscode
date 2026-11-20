/**
 * Commerce reads let through a few at a time, however many callers ask at once: the rest wait in
 * the order they asked, and each takes the place of one that has finished. A removal's keep
 * decision asks every container at once through this (`decideRemovals`, `removers.ts`), so the
 * store is never sent more than `atOnce` reads together.
 *
 * @module features/data-installer/services/demoBuilderEngine/fewReadsAtOnce
 */

import type { CommerceGet } from '@/types/commerceWire';

/**
 * The same reads as `get`, at most `atOnce` of them on their way at any moment.
 *
 * @param atOnce - how many reads may be on their way together; at least 1
 */
export function fewReadsAtOnce(get: CommerceGet, atOnce: number): CommerceGet {
    let running = 0;
    const waiting: Array<() => void> = [];
    return async (path) => {
        if (running < atOnce) running += 1;
        else await new Promise<void>((resolve) => waiting.push(resolve));
        try {
            return await get(path);
        } finally {
            // A read waiting takes this one's place; else the place is free.
            const next = waiting.shift();
            if (next) next();
            else running -= 1;
        }
    };
}
