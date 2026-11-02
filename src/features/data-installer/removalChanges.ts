/**
 * What a removal says about the changes it found (datapack-engine step 05): the SC's edits to what
 * a pack made, from the preview's own `keep`, as the one sentence the removal's confirm and
 * `reset_datapack` both read. Pure, so the webview and the extension share it.
 *
 * @module features/data-installer/removalChanges
 */

import { KIND_NOUNS } from './pickableKinds';
import type { ChangePreview } from './services/demoBuilderEngine/storeChanges';
import { dataTypeLabel } from './ui/dataTypeLabel';

/** How a removal answers for the changes it found: save them first, or lose them. */
export type ChangesAnswer = 'keep' | 'drop';

/** The SC's changes in one kind: how many, and at most a few of their names. */
export interface ChangedKind {
    kind: string;
    count: number;
    names: string[];
}

/** What a removal would lose, as the confirm is told it (`get-datapack-removal-changes`). */
export interface DatapackRemovalChanges {
    count: number;
    kinds: ChangedKind[];
    /** "You changed 3 things since it was installed: …"; none with nothing changed. */
    sentence?: string;
    /** The demo's own pack by the name the SC knows it by, whether or not it has been made yet. */
    ownPackName: string;
    /** `demoBuilder.dataInstaller.changesOnRemoval` is `save`, so nobody needs asking. */
    alwaysSave: boolean;
}

/** The nouns for the kinds an SC cannot pick but a pack can make. */
const OTHER_NOUNS: Readonly<Record<string, readonly [string, string]>> = {
    attribute_options: ['attribute option', 'attribute options'],
    attribute_assign_to_set: ['attribute placement', 'attribute placements'],
    sources: ['source', 'sources'],
    stocks: ['stock', 'stocks'],
    stock_source_links: ['stock link', 'stock links'],
    coupons: ['coupon', 'coupons'],
    store_config: ['setting', 'settings'],
};

/** The most kinds a sentence names in full, and how many it names past that (dialog design rules). */
const KINDS_IN_FULL = 7;
const KINDS_PAST_THAT = 3;

function nouns(kind: string): readonly [string, string] {
    const known = (KIND_NOUNS as Readonly<Record<string, readonly [string, string]>>)[kind] ?? OTHER_NOUNS[kind];
    if (known) return known;
    const label = dataTypeLabel(kind).toLowerCase();
    return [label, label];
}

/** A category's key is its place under its root; the SC knows it by its own name. */
function shownName(kind: string, name: string): string {
    return kind === 'categories' ? (name.split('/').pop() ?? name) : name;
}

/** "the category Critical Power", or "2 products". */
function phrase({ kind, count, names }: ChangedKind): string {
    const [one, many] = nouns(kind);
    return count === 1 && names[0] !== undefined ? `the ${one} ${shownName(kind, names[0])}` : `${count} ${count === 1 ? one : many}`;
}

/** "a, b, and c", as the owner writes it; "a, and b" for two. */
function listed(parts: string[]): string {
    if (parts.length < 2) return parts.join('');
    return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** The SC's changes, from what installing again would keep (`previewChanges`). */
export function changesFromPreview(preview: ChangePreview): { count: number; kinds: ChangedKind[] } {
    const kinds = preview.kinds.filter((k) => k.keep.count > 0).map((k) => ({ kind: k.kind, count: k.keep.count, names: k.keep.names }));
    return { count: kinds.reduce((sum, k) => sum + k.count, 0), kinds };
}

/**
 * The sentence the confirm and the agent read, by the dialog design rules: up to seven kinds in
 * full; past that, three and how many more.
 */
export function changesSentence(kinds: readonly ChangedKind[]): string {
    const total = kinds.reduce((sum, k) => sum + k.count, 0);
    const parts = kinds.map(phrase);
    const shown = parts.length > KINDS_IN_FULL ? [...parts.slice(0, KINDS_PAST_THAT), `${parts.length - KINDS_PAST_THAT} more data types`] : parts;
    return `You changed ${total} ${total === 1 ? 'thing' : 'things'} since it was installed: ${listed(shown)}.`;
}
