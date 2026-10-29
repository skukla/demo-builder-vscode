/**
 * The cards-or-rows choice a LIST offers, and which lists offer it.
 *
 * One definition for both runtimes (ADR-015 / ADR-017): the extension keeps the
 * choice (`core/state/viewModePreference`), the webview drives it
 * (`core/ui/hooks/useViewModePreference`), and the header that draws the toggle
 * (`SearchHeader`) reads the same type. Extracted 2026-09-24 when the second list
 * (integrations) copied the first's (projects) plumbing line for line.
 */

/** Cards (a grid) or rows (a list). */
export type ViewMode = 'cards' | 'rows';

/** Every list that offers the toggle. A new list adds its id here and its setting key beside it. */
export type ViewModeList = 'projects' | 'integrations';
