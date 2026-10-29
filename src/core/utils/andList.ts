/**
 * A list in words: "A", "A and B", "A, B and C".
 *
 * One home for a sentence that was written by hand in ten files, and missing from the two that
 * joined every name with " and " (the Reset ERPs confirm read "Justrite ERP and Accuform ERP
 * and Test ERP", release walk 2026-10-28).
 *
 * @module core/utils/andList
 */

/**
 * Join items the way a sentence lists them.
 *
 * @param items - the words, in reading order
 * @returns "" for none, the one item alone, else commas with "and" before the last
 */
export function andList(items: readonly string[]): string {
    if (items.length < 2) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
