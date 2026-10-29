/**
 * One fingerprint per object: its row in pack form, hashed (step 05).
 *
 * A row is written out with its keys sorted at every depth, and its custom attributes sorted by
 * code, the one list Commerce answers in no fixed order. Every other list keeps its order, since
 * there the order means something (a configurable's options, a tier's steps). Then it is hashed
 * with the shared sha-256 (`core/utils/sha256`), the one hash every "still as we left it?" record
 * in the extension is made with, and compared by `decideOwnedChange` (`core/utils/ownedChange`).
 *
 * @module features/data-installer/services/demoBuilderEngine/fingerprint
 */

import { sha256 } from '@/core/utils/sha256';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function codeOf(value: unknown): string {
    return String((value as { attribute_code?: unknown } | null)?.attribute_code ?? '');
}

/** Plain code-point order: the same on every machine, unlike a locale's. */
function byCodePoint(a: string, b: string): number {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function canonical(value: unknown, field?: string): Json {
    if (Array.isArray(value)) {
        const items = field === 'custom_attributes' ? [...value].sort((a, b) => byCodePoint(codeOf(a), codeOf(b))) : value;
        return items.map((item) => canonical(item));
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => byCodePoint(a, b));
        return Object.fromEntries(entries.map(([key, v]) => [key, canonical(v, key)]));
    }
    return value as Json;
}

/** The row as one string, the same whatever order its keys and custom attributes came in. */
export function canonicalJson(row: unknown): string {
    return JSON.stringify(canonical(row));
}

/** The row's fingerprint: the shared sha-256 of its canonical form. */
export function fingerprintRow(row: unknown): string {
    return sha256(canonicalJson(row));
}
