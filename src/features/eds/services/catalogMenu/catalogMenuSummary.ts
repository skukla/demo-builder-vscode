/**
 * What a catalog menu run did, in plain words (EDS-24, EDS-61).
 *
 * One text for every path that publishes or removes the category pages — storefront
 * setup, reset and republish report it in their progress and logs, and on their results
 * (`categoryPages` on `reset_project` and `republish`). Written for the SC — no tool
 * names, no field names.
 *
 * Pure, and free of Node imports, so it could run on either side.
 *
 * @module features/eds/services/catalogMenu/catalogMenuSummary
 */

import type { ApplyReport, PageFailure, PageSkip, RemoveReport } from './catalogMenuService';
import { CATEGORY_TEMPLATE_PATH } from './categoryPagePlan';

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
    if (!edited.length) return [];
    const it = edited.length === 1 ? 'it' : 'them';
    return [`Left ${count(edited.length, 'page')} alone because you edited ${it} (${named(edited)}).`];
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

function legacySentence(removed: string[]): string[] {
    if (!removed.length) return [];
    return [
        `Removed ${count(removed.length, 'category page')} Demo Builder wrote in DA.live; ` +
            'the product page overlay serves those addresses now.',
    ];
}

function templateSentence(template: BuildFacts['template']): string[] {
    if (template.status === 'written') {
        return [
            `Wrote the category page template at ${CATEGORY_TEMPLATE_PATH}; edit it to change every ` +
                'category page, then republish.',
        ];
    }
    if (template.status === 'failed') {
        return [
            `Couldn't write the category page template (${template.error}); category pages use a plain ` +
                'layout until it exists.',
        ];
    }
    return [];
}

function prunedSentence(pruned: BuildFacts['pruned']): string[] {
    if (!pruned || pruned.status === 'nothing') return [];
    if (pruned.status === 'removed') {
        return [`Took down ${count(pruned.liveRemoved, 'category page')} for categories the store no longer has.`];
    }
    return [pruned.summary];
}

function sheetSentences(report: BuildFacts): string[] {
    if (report.sheet !== 'published') {
        return [
            `Couldn't publish the list of pages you wrote at category addresses (${report.sheet.error}), so no ` +
                `category page was published; ${RETRY_BUILD.toLowerCase()}.`,
        ];
    }
    const n = report.authored.length;
    if (n === 0) return [];
    const what = n === 1 ? "1 page you wrote at a category's address" : `${n} pages you wrote at category addresses`;
    return [`Kept ${what} (${named(report.authored)}): the product page overlay leaves ${n === 1 ? 'it' : 'them'} alone.`];
}

function publishedSentence(report: BuildFacts): string[] {
    if (report.sheet !== 'published') return [];
    if (report.deferred) return ['Category pages are published the first time someone opens one.'];
    return report.published.length ? [`Published ${count(report.published.length, 'category page')}.`] : [];
}

/** What the SC does to try again: a build re-runs on Republish, a removal on the next reset. */
const RETRY_BUILD = 'Republish the storefront to try again';
const RETRY_REMOVAL = 'Reset the storefront again to retry';

function failedSentence(failed: PageFailure[], verb: string, retry: string, noun = 'page'): string[] {
    if (!failed.length) return [];
    const detail = named(failed.map((f) => `${f.path}: ${f.error}`));
    return [`${count(failed.length, noun)} couldn't be ${verb}; ${retry.toLowerCase()} (${detail}).`];
}

function navFailure(navError: string | undefined, retry: string): string {
    return `Couldn't update your nav (${navError ?? 'unknown error'}); ${retry.toLowerCase()}.`;
}

const BUILD_NAV: Record<Exclude<BuildFacts['nav'], 'failed'>, string> = {
    added: 'Added the catalog menu to your nav.',
    'line-updated': "Rewrote the catalog menu lines in your nav in the wording your storefront's menu block reads.",
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
        ...publishedSentence(report),
        ...sheetSentences(report),
        ...failedSentence(report.failed, 'published', RETRY_BUILD, 'category page'),
        ...prunedSentence(report.pruned),
        ...templateSentence(report.template),
        ...ownPageSentences(report.skipped),
        ...legacySentence(report.legacyRemoved),
        ...failedSentence(report.legacyFailed, 'removed', RETRY_BUILD),
        ...skippedSentences(report.skipped),
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
    const overlayPages = report.categoryPages !== undefined && report.categoryPages.status !== 'nothing';
    const template = report.template !== 'not-recorded';
    const sheetFailed = typeof report.sheet === 'object';
    return (
        touched + report.failed.length === 0 &&
        report.nav === 'not-recorded' &&
        !overlayPages &&
        !template &&
        !sheetFailed
    );
}

const REMOVAL_TEMPLATE: Partial<Record<string, string>> = {
    removed: 'Removed the category page template.',
    edited: 'Left the category page template alone because you edited it.',
};

function removalTemplateSentence(template: RemovalFacts['template']): string[] {
    const sentence = typeof template === 'string' ? REMOVAL_TEMPLATE[template] : undefined;
    return sentence ? [sentence] : [];
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
        ...removalTemplateSentence(report.template),
        ...(typeof report.sheet === 'object'
            ? [
                  `Couldn't take down the list of pages you wrote at category addresses (${report.sheet.error}); ` +
                      `${RETRY_REMOVAL.toLowerCase()}.`,
              ]
            : []),
        ...(report.categoryPages && report.categoryPages.status !== 'nothing' ? [report.categoryPages.summary] : []),
        ...skippedSentences(report.skipped),
        ...failedSentence(report.failed, 'removed', RETRY_REMOVAL),
        report.nav === 'failed' ? navFailure(report.navError, RETRY_REMOVAL) : REMOVAL_NAV[report.nav],
    ]
        .filter(Boolean)
        .join(' ');
}
