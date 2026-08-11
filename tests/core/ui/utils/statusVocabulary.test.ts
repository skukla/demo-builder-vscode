/**
 * statusVocabulary — the one status table and its three severity adapters.
 *
 * This module replaced three tables and their coincidental agreement (2026-08-04).
 * The tests that matter here are the ones that would catch a fourth table growing
 * back: every status must yield BOTH halves from one lookup, the aliases must
 * collapse in exactly one place, and each adapter must be total.
 */

import {
    getStatusDisplay,
    getStorefrontStatusDisplay,
    isUpdatePending,
    normalizeDisplayStatus,
    severityToColor,
    severityToDot,
    severityToVariant,
    type DisplayStatus,
    type StatusSeverity,
} from '@/core/ui/utils/statusVocabulary';
import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';

const ALL_STATUSES: DisplayStatus[] = [
    'not-deployed',
    'deploying',
    'deployed',
    'stale',
    'config-incomplete',
    'error',
    'needs-auth',
    'checking',
];

const ALL_SEVERITIES: StatusSeverity[] = ['neutral', 'info', 'success', 'warning', 'error'];

describe('one lookup yields both halves', () => {
    it.each(ALL_STATUSES)('%s has a label and a severity', (status) => {
        const entry = getStatusDisplay(status);

        // The defect this module fixed was a status resolving a dot from one
        // table and a label from another. A status that can produce one without
        // the other is that defect returning.
        expect(entry).not.toBeNull();
        expect(entry?.label).toBeTruthy();
        expect(ALL_SEVERITIES).toContain(entry?.severity);
    });

    it('returns null for values with nothing to show', () => {
        // 'unknown' is a real persisted value (projects-dashboard writes it), and
        // callers hide the line rather than invent a word for it.
        expect(getStatusDisplay('unknown')).toBeNull();
        expect(getStatusDisplay(undefined)).toBeNull();
        expect(getStatusDisplay('')).toBeNull();
    });
});

describe('aliases collapse in exactly one place', () => {
    it.each(['config-changed', 'update-declined'])('%s resolves as stale', (alias) => {
        expect(normalizeDisplayStatus(alias)).toBe('stale');
        expect(getStatusDisplay(alias)).toEqual(getStatusDisplay('stale'));
    });

    it('leaves config-incomplete alone', () => {
        // It was folded into stale until 2026-08-04. Missing required config is
        // not "an update is available", and folding it relabelled the card.
        expect(normalizeDisplayStatus('config-incomplete')).toBe('config-incomplete');
        expect(getStatusDisplay('config-incomplete')?.label).toBe('Incomplete');
        expect(getStatusDisplay('config-incomplete')).not.toEqual(getStatusDisplay('stale'));
    });
});

describe('severity adapters are total', () => {
    it.each(ALL_SEVERITIES)('%s maps to all three prop shapes', (severity) => {
        expect(severityToColor(severity)).toBeTruthy();
        expect(severityToVariant(severity)).toBeTruthy();
        expect(severityToDot(severity)).toBeTruthy();
    });

    it('info degrades to neutral for the variant shape, which has no info tone', () => {
        expect(severityToVariant('info')).toBe('neutral');
        expect(severityToDot('info')).toBe('info');
    });
});

describe('the persisted mesh view of the shared table', () => {
    // Pins the full rendered triple per status. Two of these CHANGED when the
    // tables collapsed: `update-declined` and `config-incomplete` were orange
    // and are now yellow, because severity is stored once and orange was not a
    // severity — it was a second table's opinion. Both read "warning" and, in
    // update-declined's case, already showed the same words as stale.
    it.each([
        ['deployed', 'Deployed', 'green', 'success'],
        ['stale', 'Update needed', 'yellow', 'warning'],
        ['update-declined', 'Update needed', 'yellow', 'warning'],
        ['config-incomplete', 'Incomplete', 'yellow', 'warning'],
        ['error', 'Deploy failed', 'red', 'error'],
        ['not-deployed', 'Not deployed', 'gray', 'neutral'],
    ])('%s → %s', (status, text, color, variant) => {
        expect(getMeshStatusDisplay(status)).toEqual({ text, color, variant });
    });

    it('hides itself for an unknown status', () => {
        expect(getMeshStatusDisplay('unknown')).toBeNull();
    });
});

describe('isUpdatePending — one predicate for both spellings', () => {
    it.each(['stale', 'update-declined', 'config-changed'])('%s is pending', (status) => {
        expect(isUpdatePending(status)).toBe(true);
    });

    it.each(['deployed', 'not-deployed', 'error', 'config-incomplete', 'unknown', undefined])(
        '%s is not pending',
        (status) => {
            expect(isUpdatePending(status)).toBe(false);
        },
    );

    it('answers false for a subject with states outside this vocabulary', () => {
        // The storefront summary carries 'published'/'not-published'. It keeps its
        // own predicate today (one line, a different field, and Rule of Three is
        // not met at two) — but if it is ever routed here, these must not be
        // mistaken for a pending update.
        expect(isUpdatePending('published')).toBe(false);
        expect(isUpdatePending('not-published')).toBe(false);
    });
});

/**
 * The STOREFRONT vocabulary — the second table this module owns.
 *
 * It is separate from the deployable-component table on purpose. A storefront
 * publishes; it does not deploy. Folding it in would have relabelled a drifted
 * storefront "Update needed", which is the deployable wording, and lost the verb
 * the user actually needs ("Republish").
 *
 * What it replaces is two switch statements over the same four states, in
 * `projectStatusUtils.getStorefrontStatusText` and the EDS branch of
 * `useDashboardStatus.demoStatusDisplay`. They had already drifted: one spelled
 * the empty state "Not published", the other "Not Published".
 */
describe('getStorefrontStatusDisplay', () => {
    it('names the drifted state with the VERB that fixes it', () => {
        // Not "Update needed" — that is the deployable vocabulary. A storefront
        // is republished, and the word is the whole hint about where to go.
        expect(getStorefrontStatusDisplay('stale')).toEqual({
            label: 'Republish needed',
            severity: 'warning',
        });
    });

    it('treats a declined update as still needing the republish', () => {
        // "Later" postpones the prompt, not the drift. Same words as `stale`,
        // matching how the deployable table already collapses this alias.
        expect(getStorefrontStatusDisplay('update-declined')).toEqual({
            label: 'Republish needed',
            severity: 'warning',
        });
    });

    it('spells the empty state ONE way', () => {
        // The casing the two old switches disagreed about.
        expect(getStorefrontStatusDisplay('not-published')).toEqual({
            label: 'Not published',
            severity: 'neutral',
        });
    });

    it('reports a healthy storefront as Published', () => {
        expect(getStorefrontStatusDisplay('published')).toEqual({
            label: 'Published',
            severity: 'success',
        });
    });

    it('falls back to Published for an absent or unrecognised status', () => {
        // Both old switches defaulted this way: a project with no recorded
        // storefront status has almost always published, and claiming otherwise
        // put a false warning on a healthy project.
        expect(getStorefrontStatusDisplay(undefined).label).toBe('Published');
        expect(getStorefrontStatusDisplay('something-new').label).toBe('Published');
    });

    it('does NOT leak into the deployable vocabulary', () => {
        // Control: 'stale' means different words to the two tables, and asking
        // the wrong one is a real mistake this pins.
        expect(getStatusDisplay('stale')?.label).toBe('Update needed');
        expect(getStorefrontStatusDisplay('stale').label).toBe('Republish needed');
    });

    it('carries a severity the existing adapters already understand', () => {
        // No new colour space — reuses severityToColor/severityToVariant, which
        // is the point of putting this table in this module.
        expect(severityToColor(getStorefrontStatusDisplay('stale').severity)).toBe('yellow');
        expect(severityToVariant(getStorefrontStatusDisplay('published').severity)).toBe('success');
    });
});
