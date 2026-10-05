/**
 * What a catalog menu run did, in plain words (EDS-24).
 *
 * One text for every path that writes or removes the pages — storefront setup, reset and
 * republish report it in their progress and logs, and on their results. Written for the
 * SC — no tool names, no field names.
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

/** "Apparel (/apparel)" when the category is known, else the path. */
function label(skip: PageSkip): string {
    return skip.name ? `${skip.name} (${skip.path})` : skip.path;
}

function skippedSentences(skipped: PageSkip[]): string[] {
    const edited = skipped.filter((s) => s.reason === 'edited').map(label);
    const notOurs = skipped.filter((s) => s.reason === 'not-ours').map(label);
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

/** "Signs uses your page at /safety-signage." — one sentence per category, then a count. */
function ownPageSentences(skipped: PageSkip[]): string[] {
    const own = skipped.filter((s) => s.reason === 'has-own-page');
    const rest = own.length - NAMED;
    return [
        ...own.slice(0, NAMED).map((s) => `${s.name ?? s.path} uses your page at ${s.ownPage ?? s.path}.`),
        ...(rest > 0 ? [`${count(rest, 'more category uses', 'more categories use')} your own pages.`] : []),
    ];
}

function replacedSentence(replaced: string[]): string[] {
    if (!replaced.length) return [];
    return [
        `Removed ${count(replaced.length, 'category page')} Demo Builder wrote earlier, ` +
            `now that you have your own (${named(replaced)}).`,
    ];
}

/** What the SC does to try again: a build re-runs on Republish, a removal on the next reset. */
const RETRY_BUILD = 'Republish the storefront to try again';
const RETRY_REMOVAL = 'Reset the storefront again to retry';

function failedSentence(failed: PageFailure[], verb: string, retry: string): string[] {
    if (!failed.length) return [];
    const detail = named(failed.map((f) => `${f.path}: ${f.error}`));
    return [`${count(failed.length, 'page')} couldn't be ${verb}; ${retry.toLowerCase()} (${detail}).`];
}

function navFailure(navError: string | undefined, retry: string): string {
    return `Couldn't update your nav (${navError ?? 'unknown error'}); ${retry.toLowerCase()}.`;
}

const BUILD_NAV: Record<Exclude<BuildFacts['nav'], 'failed'>, string> = {
    added: 'Added the catalog menu to your nav.',
    'links-updated': 'Updated the catalog menu links in your nav.',
    'already-present': 'The catalog menu was already in your nav.',
    'no-menu-list': 'Your nav has no list for the menu line, so the menu was not added.',
    'not-a-page': "Your nav isn't a page Demo Builder can edit, so the menu was not added.",
    missing: 'Your storefront has no nav page, so the menu was not added.',
};

const REMOVAL_NAV: Record<Exclude<RemovalFacts['nav'], 'failed'>, string> = {
    removed: 'Took the catalog menu out of your nav.',
    'removed-kept-links': 'Took the catalog menu out of your nav and kept the links you typed in its table.',
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
        ...ownPageSentences(report.skipped),
        ...replacedSentence(report.replaced),
        ...skippedSentences(report.skipped),
        ...failedSentence(report.failed, 'written', RETRY_BUILD),
        ...(unsafe.length
            ? [
                  `Skipped ${count(unsafe.length, 'category', 'categories')} whose web address the ` +
                      `storefront can't serve (${named(unsafe)}).`,
              ]
            : []),
        report.nav === 'failed' ? navFailure(report.navError, RETRY_BUILD) : BUILD_NAV[report.nav],
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
        ...failedSentence(report.failed, 'removed', RETRY_REMOVAL),
        report.nav === 'failed' ? navFailure(report.navError, RETRY_REMOVAL) : REMOVAL_NAV[report.nav],
    ]
        .filter(Boolean)
        .join(' ');
}
