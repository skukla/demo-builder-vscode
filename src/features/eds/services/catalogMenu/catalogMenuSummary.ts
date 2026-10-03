/**
 * What a catalog menu run did, in plain words (EDS-24).
 *
 * One text for both surfaces: the dashboard dialog shows it, and the agent's tools return
 * it beside the lists. Written for the SC — no tool names, no field names.
 *
 * Pure, and free of Node imports, so it could run on either side.
 *
 * @module features/eds/services/catalogMenu/catalogMenuSummary
 */

import type { ApplyReport, PageFailure, PageSkip, RemoveReport } from './catalogMenuService';

type BuildFacts = Omit<ApplyReport, 'record'>;
type RemovalFacts = Omit<RemoveReport, 'record'>;

/** How many paths a sentence names before it says "and N more". */
const NAMED = 5;

function count(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}

function named(items: string[]): string {
    const shown = items.slice(0, NAMED).join(', ');
    return items.length > NAMED ? `${shown} and ${items.length - NAMED} more` : shown;
}

function skippedSentences(skipped: PageSkip[]): string[] {
    const edited = skipped.filter((s) => s.reason === 'edited').map((s) => s.path);
    const notOurs = skipped.filter((s) => s.reason === 'not-ours').map((s) => s.path);
    const it = (n: number): string => (n === 1 ? 'it' : 'them');
    return [
        ...(edited.length
            ? [`Left ${count(edited.length, 'page')} alone because you edited ${it(edited.length)} (${named(edited)}).`]
            : []),
        ...(notOurs.length
            ? [
                  `Left ${count(notOurs.length, 'page')} alone because Demo Builder didn't write ` +
                      `${it(notOurs.length)} (${named(notOurs)}).`,
              ]
            : []),
    ];
}

function failedSentence(failed: PageFailure[], verb: string): string[] {
    if (!failed.length) return [];
    const detail = named(failed.map((f) => `${f.path}: ${f.error}`));
    return [`${count(failed.length, 'page')} couldn't be ${verb}; run this again to retry (${detail}).`];
}

function navFailure(navError: string | undefined): string {
    return `Couldn't update your nav (${navError ?? 'unknown error'}); run this again to retry.`;
}

const BUILD_NAV: Record<Exclude<BuildFacts['nav'], 'failed'>, string> = {
    added: 'Added the catalog menu to your nav.',
    'already-present': 'The catalog menu was already in your nav.',
    'no-menu-list': 'Your nav has no list for the menu line, so the menu was not added.',
    'not-a-page': "Your nav isn't a page Demo Builder can edit, so the menu was not added.",
    missing: 'Your storefront has no nav page, so the menu was not added.',
};

const REMOVAL_NAV: Record<Exclude<RemovalFacts['nav'], 'failed'>, string> = {
    removed: 'Took the catalog menu out of your nav.',
    'not-present': 'The catalog menu was no longer in your nav.',
    'not-recorded': '',
    missing: 'Your storefront has no nav page.',
};

/**
 * @param report - what `applyCatalogMenu` reported
 * @returns the summary
 */
export function describeBuild(report: BuildFacts): string {
    const unsafe = report.unsafe.map((u) => u.name);
    return [
        ...(report.written.length
            ? [`Wrote and published ${count(report.written.length, 'category page')}.`]
            : []),
        ...skippedSentences(report.skipped),
        ...failedSentence(report.failed, 'written'),
        ...(unsafe.length
            ? [
                  `Skipped ${count(unsafe.length, 'category', 'categories')} whose web address the ` +
                      `storefront can't serve (${named(unsafe)}).`,
              ]
            : []),
        report.nav === 'failed' ? navFailure(report.navError) : BUILD_NAV[report.nav],
    ].join(' ');
}

function isNothing(report: RemovalFacts): boolean {
    const touched = report.removed.length + report.alreadyGone.length + report.skipped.length;
    return touched + report.failed.length === 0 && report.nav === 'not-recorded';
}

/**
 * @param report - what `removeCatalogMenu` reported
 * @returns the summary
 */
export function describeRemoval(report: RemovalFacts): string {
    if (isNothing(report)) {
        return 'There is no catalog menu from Demo Builder on this storefront, so nothing was removed.';
    }
    const gone = report.alreadyGone.length;
    return [
        ...(report.removed.length ? [`Removed ${count(report.removed.length, 'category page')}.`] : []),
        ...(gone ? [`${count(gone, 'page')} ${gone === 1 ? 'was' : 'were'} already gone.`] : []),
        ...skippedSentences(report.skipped),
        ...failedSentence(report.failed, 'removed'),
        report.nav === 'failed' ? navFailure(report.navError) : REMOVAL_NAV[report.nav],
    ]
        .filter(Boolean)
        .join(' ');
}
