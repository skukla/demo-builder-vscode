/**
 * The ONE status vocabulary.
 *
 * Every surface that shows "what state is this deployable component in" — the
 * integrations grid, the projects-list card, the dashboard header badge — reads
 * this table. One state, one word, one severity.
 *
 * It used to be three tables and four status spellings (2026-08-04 audit). The
 * mesh had its own display map predating the integrations grid; when the mesh
 * became a peer card in that grid it took its LABEL from the mesh map and its DOT
 * from a third table keyed differently again, so the two agreed only by
 * coincidence — and the grid's two card kinds described one state in two
 * vocabularies ("Deployed" vs "Mesh Deployed", "Deploy failed" vs "Mesh Error").
 *
 * Severity is stored ONCE and adapted per surface. The three components below
 * want three different prop shapes for the same idea, which is what previously
 * justified three tables; three one-line adapters are the cheaper answer.
 *
 * @module core/ui/utils/statusVocabulary
 */

/** One severity, adapted per surface by the functions below. */
export type StatusSeverity = 'neutral' | 'info' | 'success' | 'warning' | 'error';

/**
 * Every state a deployable component can be SHOWN in.
 *
 * Wider than what is persisted: `deploying`/`checking`/`needs-auth` are live-only
 * and never reach a manifest. Narrower than what callers may hand in: the
 * persisted aliases collapse through {@link normalizeDisplayStatus}.
 */
export type DisplayStatus =
    | 'not-deployed'
    | 'deploying'
    | 'deployed'
    | 'stale'
    | 'config-incomplete'
    | 'error'
    | 'needs-auth'
    | 'checking';

export interface StatusDisplayEntry {
    label: string;
    severity: StatusSeverity;
}

const STATUS_DISPLAY: Record<DisplayStatus, StatusDisplayEntry> = {
    'not-deployed': { label: 'Not deployed', severity: 'neutral' },
    deploying: { label: 'Deploying…', severity: 'info' },
    deployed: { label: 'Deployed', severity: 'success' },
    stale: { label: 'Update available', severity: 'warning' },
    // NOT folded into `stale`: an incomplete mesh is missing required config,
    // which is not "an update is available". Folding it would relabel the card.
    'config-incomplete': { label: 'Incomplete', severity: 'warning' },
    error: { label: 'Deploy failed', severity: 'error' },
    // Live-only. Surfaces that have richer in-flight text (the deploy step, the
    // verb a notification is showing) substitute it; these are the fallbacks, so
    // no state can ever render dotted-but-nameless.
    'needs-auth': { label: 'Session expired', severity: 'warning' },
    checking: { label: 'Checking status...', severity: 'neutral' },
};

/**
 * Collapse a raw status onto the display vocabulary.
 *
 * Two aliases exist for one state and both die here:
 *
 * - `config-changed` was the dashboard's runtime spelling of `stale`. It was
 *   never persisted — the handler normalized it away on write, and the hook
 *   invented it on read only to translate it back for the lookup, a round trip
 *   from 'stale' to 'stale'.
 * - `update-declined` means the user answered "Later" to an available update.
 *   It reads identically to `stale` ("Update available"), so it carried a
 *   distinction no one could act on.
 *
 * @param status - a persisted or live status, or undefined
 * @returns the display status, or null when there is nothing to show
 */
export function normalizeDisplayStatus(status: string | undefined): DisplayStatus | null {
    if (!status) return null;
    if (status === 'config-changed' || status === 'update-declined') return 'stale';
    return status in STATUS_DISPLAY ? (status as DisplayStatus) : null;
}

/**
 * Label + severity for a status. Returns null for unknown values (`'unknown'`
 * is a real persisted value) so callers can hide the line rather than invent one.
 */
export function getStatusDisplay(status: string | undefined): StatusDisplayEntry | null {
    const normalized = normalizeDisplayStatus(status);
    return normalized ? STATUS_DISPLAY[normalized] : null;
}

/**
 * Is an update available and not yet applied?
 *
 * Both spellings collapse to `stale`, so asking this beats testing the two
 * literals: a caller that hard-codes `=== 'stale' || === 'update-declined'`
 * silently stops covering a case the day a third spelling appears, and the
 * alias set already grew once.
 *
 * Values outside the vocabulary answer false, which is what a caller whose
 * subject has extra states of its own (e.g. a storefront's 'published') wants.
 */
export function isUpdatePending(status: string | undefined): boolean {
    return normalizeDisplayStatus(status) === 'stale';
}

// ==========================================================
// Severity adapters — one per consuming component
// ==========================================================

/** Badge colors (dashboard header). */
export type StatusColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray' | 'blue';

/** StatusDot on the projects-list card, which has no `info` tone of its own. */
export type StatusVariant = 'success' | 'warning' | 'error' | 'neutral';

/** StatusDot in the integrations grid, which does. */
export type StatusDotTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const SEVERITY_COLOR: Record<StatusSeverity, StatusColor> = {
    neutral: 'gray',
    info: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red',
};

export function severityToColor(severity: StatusSeverity): StatusColor {
    return SEVERITY_COLOR[severity];
}

/** `info` has no counterpart here, and reads as "nothing is wrong yet". */
export function severityToVariant(severity: StatusSeverity): StatusVariant {
    return severity === 'info' ? 'neutral' : severity;
}

/** Identity today; named so the grid states its intent rather than leaking the type. */
export function severityToDot(severity: StatusSeverity): StatusDotTone {
    return severity;
}
