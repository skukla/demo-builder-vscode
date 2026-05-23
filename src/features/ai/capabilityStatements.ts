/**
 * Capability Statements (Batch E2)
 *
 * Pure helper that converts a list of skill inventory entries into a list of
 * user-facing capability statements. The output drives the AI Overview screen's
 * left-column bullet list — users see "Add a component to a project" rather
 * than the raw skill slug `add-component`.
 *
 * The transformation pipeline for each skill description:
 *   1. Take the first sentence (split on '.').
 *   2. Trim case-insensitive leading prefixes: "Use this skill to ",
 *      "Use when ", "Used for ", "Used to ", "This skill ".
 *   3. Truncate at the first occurrence of any known boilerplate clause —
 *      " in a Demo Builder project", " for Adobe Commerce storefronts",
 *      " for AEM Edge Delivery blocks" — and drop everything from that point
 *      onward (including the clause itself).
 *   4. Capitalize the first letter (since trimming "use this skill to " leaves
 *      a lowercase word).
 *   5. Strip a trailing period.
 *
 * Output: deduplicated array of strings preserving first-occurrence order,
 * with demo-builder-sourced skills listed before adobe-sourced ones.
 */

import type { SkillInventoryEntry } from '@/types/ai';

/** Leading prefixes trimmed (case-insensitive) when present. */
const LEADING_PREFIXES: readonly string[] = [
    'use this skill to ',
    'use when ',
    'used for ',
    'used to ',
    'this skill ',
];

/** Boilerplate truncation points — anywhere they appear, drop them and the rest. */
const TRUNCATION_CLAUSES: readonly string[] = [
    ' in a Demo Builder project',
    ' for Adobe Commerce storefronts',
    ' for AEM Edge Delivery blocks',
];

/** Source-order priority: demo-builder first, then adobe, then unknown. */
const SOURCE_PRIORITY: Record<SkillInventoryEntry['source'], number> = {
    'demo-builder': 0,
    'adobe': 1,
    'unknown': 2,
};

/**
 * Derive the list of user-facing capability statements from a skill inventory.
 *
 * Skills with `null` or empty descriptions are omitted. Duplicate statements
 * (after the transformation pipeline) are removed, preserving the first
 * occurrence. The output is ordered demo-builder-first, adobe-second.
 */
export function deriveCapabilityStatements(skills: SkillInventoryEntry[]): string[] {
    const ordered = [...skills].sort(
        (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source],
    );

    const seen = new Set<string>();
    const result: string[] = [];
    for (const skill of ordered) {
        const statement = toStatement(skill.description);
        if (statement === null) continue;
        if (seen.has(statement)) continue;
        seen.add(statement);
        result.push(statement);
    }
    return result;
}

/**
 * Apply the transformation pipeline to a single description string. Returns
 * `null` when the description is empty or yields no usable text.
 */
function toStatement(description: string | null): string | null {
    if (description === null) return null;
    const trimmed = description.trim();
    if (trimmed.length === 0) return null;

    // 1) First sentence
    let text = trimmed.split('.')[0];

    // 2) Trim leading prefixes (case-insensitive, longest match first)
    text = stripLeadingPrefix(text);

    // 3) Truncate at any known boilerplate clause
    text = truncateAtBoilerplate(text);

    // 4) Strip a trailing period (rare after split on '.', but safe-guard)
    if (text.endsWith('.')) {
        text = text.slice(0, -1);
    }

    text = text.trim();
    if (text.length === 0) return null;

    // 5) Capitalize the first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);

    return text;
}

/** Case-insensitive prefix strip; returns the remainder unchanged when no prefix matches. */
function stripLeadingPrefix(input: string): string {
    const lower = input.toLowerCase();
    for (const prefix of LEADING_PREFIXES) {
        if (lower.startsWith(prefix)) {
            return input.slice(prefix.length);
        }
    }
    return input;
}

/** Truncate at the first occurrence of any boilerplate clause (case-insensitive). */
function truncateAtBoilerplate(input: string): string {
    const lower = input.toLowerCase();
    let earliest = -1;
    for (const clause of TRUNCATION_CLAUSES) {
        const idx = lower.indexOf(clause.toLowerCase());
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
            earliest = idx;
        }
    }
    return earliest === -1 ? input : input.slice(0, earliest);
}
