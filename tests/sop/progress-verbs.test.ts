/**
 * SOP: one verb per progress step, the host system's own word (owner, 2026-11-10, datapack
 * simplification Phase 1b). A step that takes something away says which kind of away:
 *
 * - Deleting: the record is gone (Commerce, Adobe Console, GitHub, DA.live, local files)
 * - Removing … from …: it still exists, only its link to that place goes, so it always says from what
 * - Uninstalling: out of Commerce
 * - Undeploying: off App Builder Runtime
 * - Unpublishing: off the live site
 * - Restoring default configuration: Commerce configuration set back to its Default value
 * - Closing: orders and returns
 * - Restoring: Commerce put back to how the datapack's latest save left it
 * - Replacing: one datapack uninstalled, another installed
 * - Refreshing: fetched again, nothing lost (a cache)
 *
 * "Clear" names an action (Clear Demo Data) and never a step: each "Clearing …" step was one of
 * the verbs above. "Taking … off" and "Unlisting" said the same things in vaguer words. Commerce's
 * own nouns are used: cart price rules, configuration, websites.
 *
 * Over every progress label the extension shows: `OPERATION_STAGES` (which spreads every stage
 * table), `STOREFRONT_JOBS` and `WAIT_STAGES`. Wait labels also never say "the store" (owner,
 * 2026-11-03: it read as an AI talking).
 */

import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { STOREFRONT_JOBS } from '@/core/utils/storefrontJobs';
import { WAIT_STAGES } from '@/core/utils/waitStages';

/** The first words a step that takes something away may start with. */
const DESTRUCTIVE_VERBS = [
    'Deleting',
    'Removing',
    'Uninstalling',
    'Undeploying',
    'Unpublishing',
    'Closing',
    'Restoring',
    'Replacing',
    'Refreshing',
] as const;

/** First words that said one of the verbs above in other words. */
const BANNED_FIRST_WORDS = ['Taking', 'Clearing', 'Unlisting'] as const;

/** Words Commerce does not use on its own screens, with the word it does. */
const BANNED_NOUNS: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bcart rules?\b/i, 'cart price rules'],
    [/\bsite settings\b/i, 'configuration'],
    [/\bconfig\b(?!\.json)/i, 'configuration'],
];

interface Label {
    readonly where: string;
    readonly text: string;
    readonly wait: boolean;
}

function allLabels(): Label[] {
    const stages = Object.entries(OPERATION_STAGES as Record<string, { label: string; detail?: string }>);
    const waits = Object.entries(WAIT_STAGES as Record<string, { label: string; detail?: string }>);
    return [
        ...stages.flatMap(([key, stage]) => [
            { where: `OPERATION_STAGES.${key}`, text: stage.label, wait: false },
            ...(stage.detail ? [{ where: `OPERATION_STAGES.${key}.detail`, text: stage.detail, wait: false }] : []),
        ]),
        ...Object.entries(STOREFRONT_JOBS).map(([key, text]) => ({ where: `STOREFRONT_JOBS.${key}`, text, wait: false })),
        ...waits.flatMap(([key, stage]) => [
            { where: `WAIT_STAGES.${key}`, text: stage.label, wait: true },
            ...(stage.detail ? [{ where: `WAIT_STAGES.${key}.detail`, text: stage.detail, wait: true }] : []),
        ]),
    ];
}

/** What is wrong with one label, or undefined. Details are checked for nouns only. */
function defectOf(label: Label): string | undefined {
    const isDetail = label.where.endsWith('.detail');
    const first = label.text.split(' ')[0];
    if (!isDetail && (BANNED_FIRST_WORDS as readonly string[]).includes(first)) {
        return `starts with "${first}": use one of ${DESTRUCTIVE_VERBS.join(', ')}`;
    }
    if (!isDetail && first === 'Removing' && !label.text.includes(' from ')) {
        return 'says "Removing" without "from": say from what, or use Deleting if the record is gone';
    }
    for (const [pattern, word] of BANNED_NOUNS) {
        if (pattern.test(label.text)) {
            return `says "${pattern.exec(label.text)?.[0]}": Commerce says "${word}"`;
        }
    }
    if (label.wait && /\bthe store\b/i.test(label.text)) {
        return 'a wait says "the store": say "from Commerce"';
    }
    return undefined;
}

function defects(labels: readonly Label[]): string[] {
    return labels.flatMap((label) => {
        const defect = defectOf(label);
        return defect ? [`${label.where} "${label.text}": ${defect}`] : [];
    });
}

/** A positive control: well below this, the scan has stopped reading the tables. */
const MINIMUM_LABELS = 150;

describe('SOP: one verb per progress step', () => {
    it('reads every progress table', () => {
        expect(allLabels().length).toBeGreaterThanOrEqual(MINIMUM_LABELS);
    });

    it('every destructive step starts with its verb, says from what, and uses Commerce nouns', () => {
        expect(defects(allLabels())).toStrictEqual([]);
    });

    it('CONTROL: catches each planted defect, and passes each verb used right', () => {
        const planted = (text: string, wait = false): Label => ({ where: 'PLANTED', text, wait });
        const caught = [
            planted('Taking the app down'),
            planted('Clearing the records'),
            planted('Unlisting the app'),
            planted('Removing the workspace'),
            planted('Deleting cart rules'),
            planted('Clearing site settings'),
            planted('Updating the site config'),
            planted('Reading the store', true),
        ];
        expect(caught.map((label) => defectOf(label) !== undefined)).toEqual(caught.map(() => true));

        const passed = [
            planted('Deleting the workspace'),
            planted('Removing products from websites'),
            planted('Removing cart price rules from websites'),
            planted('Uninstalling from Commerce'),
            planted('Undeploying the app'),
            planted('Unpublishing pages'),
            planted('Restoring default configuration'),
            planted('Closing orders'),
            planted('Restoring My Luma'),
            planted('Reading from Commerce', true),
        ];
        expect(defects(passed)).toStrictEqual([]);
    });
});
