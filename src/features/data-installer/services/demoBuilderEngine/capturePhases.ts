/**
 * What a save's progress line counts: the data types this save is about, rather than every type a
 * save could read. "0 of 12 data types: Products, Gift Cards" was the line for a pack of two customer
 * groups (owner, 2026-11-05). A read with nothing to do is skipped over; the reads themselves do not
 * change.
 *
 * @module features/data-installer/services/demoBuilderEngine/capturePhases
 */

import { phaseLine } from '../datapackTypesLine';
import { CAPTURE_PHASES } from './capture';

/** A kind a save is seeded with, read under another of the phases' names. */
const READ_UNDER: Readonly<Record<string, readonly string[]>> = {
    // A product brings its attributes, set, categories and stock with it.
    products: ['product_attributes', 'attribute_sets', 'categories', 'source_items'],
    attribute_assign_to_set: ['attribute_sets'],
    attribute_options: ['product_attributes'],
    sources: ['source_items'],
    stocks: ['source_items'],
    stock_source_links: ['source_items'],
    coupons: ['cart_rules'],
};

/**
 * The line for each read of a save.
 *
 * @param seeded - the kinds the save starts from: what the pack made, holds, and what was picked
 * @returns the line for a read, by its place in `CAPTURE_PHASES`
 */
export function captureLines(seeded: Iterable<string>): (at: number) => string {
    const active = new Set<string>();
    for (const kind of seeded) {
        active.add(kind);
        for (const also of READ_UNDER[kind] ?? []) active.add(also);
    }
    const shown = CAPTURE_PHASES.map((phase) => phase.filter((kind) => active.has(kind)));
    const phases = shown.filter((phase) => phase.length > 0);
    // Nothing recognised: say every read, rather than count to zero.
    if (phases.length === 0) return (at) => phaseLine(CAPTURE_PHASES, at);
    return (at) => phaseLine(phases, shown.slice(0, at).filter((phase) => phase.length > 0).length);
}
