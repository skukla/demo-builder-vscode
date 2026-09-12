/**
 * addDemoFlow — the PURE part of the "Add a demo" dialog: its two stages, the
 * copy the SC reads, the rows of "What we found", and the row the dialog
 * commits from a probe result.
 *
 * The Add Integration flow's stage machine was considered and not lifted: its
 * order, gates and draft are integration-specific (kinds, destinations, API
 * picks), and this journey has two fixed stages with one asynchronous step
 * between them. The SHAPE is copied (a pure module beside a hook beside a
 * modal shell). Two reuse-map rows are rejected on purpose: the stage core
 * (above) and `SelectionStepContent` (a host-fetched list with loading and
 * refresh states, where the remembered demos are a static handful of cards).
 *
 * @module features/project-creation/ui/components/add-demo/addDemoFlow
 */

import type { SummaryRow } from '../BuildYourProjectSummary';
import { deriveBlockLibraryName } from '@/features/project-creation/services/customBlockLibraryUtils';
import { SHARED_DEMO_FILE_VERSION, type AddedDemo } from '@/types/projectFile';
import type { SharedDemoProbeResult, SharedDemoRead } from '@/types/webviewRequests';

export type AddDemoStage = 'link' | 'found';

/** What the dialog holds until "Add demo". */
export interface AddDemoDraft {
    source?: { owner: string; repo: string };
    /** The typed name; '' means the default. */
    name: string;
    /** The B2B switch, asked only when the probe could not tell. */
    b2bOn: boolean;
    /** Keep my own copy: on by default (decided 2026-09-11). */
    keepCopy: boolean;
}

export const COPY = {
    title: 'Add a demo',
    lead: "Use a demo a colleague built, or one of your own. You'll need its link.",
    linkLabel: 'Link to the demo',
    linkPlaceholder: 'https://github.com/name/demo',
    invalidLink: 'Enter a GitHub link, like https://github.com/name/demo',
    duplicateLink: "You've already added this demo.",
    looking: 'Reading the demo…',
    lookingFor: 'Checking what kind of storefront it is, its store codes, and whether its pages are published.',
    notADemo: "This doesn't look like a demo we can build on",
    found: 'What we found in this demo',
    nameLabel: 'Name',
    b2bSwitch: 'Uses company (B2B) features',
    b2bWhy: "We couldn't tell whether this demo uses company accounts, quotes and purchase orders.",
    b2bIfWrong: 'If it does and this stays off, company users will see an empty account menu.',
    keepCopy: "Keep my own copy of this demo's code, so it still works if the original changes",
    remembered: 'Demos you have added',
    add: 'Add demo',
} as const;

export const INITIAL_DRAFT: AddDemoDraft = { name: '', b2bOn: false, keepCopy: true };

/** The name the dialog prefills: the description file's, else the repository's, spelled for people. */
export function defaultDemoName(read: SharedDemoRead): string {
    return read.description?.name ?? deriveBlockLibraryName(read.fullName.split('/')[1] ?? read.fullName);
}

/** Whether the probe answered something the SC can build on. */
export function isBuildable(result: SharedDemoProbeResult | undefined): result is SharedDemoRead {
    return result?.outcome === 'read' && result.kind !== 'not-a-storefront';
}

const KIND_LABEL: Record<SharedDemoRead['kind'], string> = {
    eds: 'Edge Delivery',
    headless: 'Headless (Next.js)',
    'not-a-storefront': 'Not a storefront',
};

/** The "What we found" rows, in the summary's own vocabulary. */
export function foundRows(read: SharedDemoRead): SummaryRow[] {
    const codes = read.storeCodes;
    const codeValue = codes
        ? [codes.websiteCode, codes.storeCode, codes.storeViewCode].filter(Boolean).join(' · ')
        : undefined;
    const pages = read.contentPublished.indexFound
        ? `${read.contentPublished.pageCount ?? 0} published pages`
        : undefined;
    return [
        { label: 'Storefront', value: KIND_LABEL[read.kind], done: true },
        {
            label: 'Pages',
            value: read.kind === 'eds' ? pages : 'Not needed for a headless demo',
            done: Boolean(pages) || read.kind === 'headless',
        },
        { label: 'Store codes', value: codeValue, done: Boolean(codeValue) },
        ...(read.b2b === 'unknown'
            ? []
            : [{ label: 'Company (B2B) features', value: read.b2b === 'on' ? 'On' : 'Off', done: true }]),
    ];
}

/** The two key families every shipped brand carries, so the backend choice does not lose the codes. */
function configDefaultsFromCodes(codes: SharedDemoRead['storeCodes']): Record<string, string> | undefined {
    if (!codes) return undefined;
    const out: Record<string, string> = {};
    const put = (suffix: string, value: string | undefined): void => {
        if (!value) return;
        out[`ADOBE_COMMERCE_${suffix}`] = value;
        out[`ACCS_${suffix}`] = value;
    };
    put('WEBSITE_CODE', codes.websiteCode);
    put('STORE_CODE', codes.storeCode);
    put('STORE_VIEW_CODE', codes.storeViewCode);
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The row "Add demo" commits: what was read, with the SC's answers on top.
 * The description file's own fields ride along (datapack, integrations,
 * block libraries, mesh): they are the colleague's statement, not ours.
 */
export function buildAddedDemo(read: SharedDemoRead, draft: AddDemoDraft): AddedDemo {
    const [owner, repo] = read.fullName.split('/');
    const b2b = read.b2b === 'unknown' ? draft.b2bOn : read.b2b === 'on';
    const description = read.description;
    const configDefaults = description?.configDefaults ?? configDefaultsFromCodes(read.storeCodes);
    return {
        kind: 'demo',
        version: SHARED_DEMO_FILE_VERSION,
        name: draft.name.trim() || defaultDemoName(read),
        ...(description?.description ? { description: description.description } : {}),
        ...(configDefaults ? { configDefaults } : {}),
        ...(b2b ? { configFlags: { 'commerce-b2b-enabled': true, 'commerce-companies-enabled': true } } : {}),
        ...(description?.requiresMesh !== undefined ? { requiresMesh: description.requiresMesh } : {}),
        ...(description?.datapack ? { datapack: description.datapack } : {}),
        ...(description?.integrations ? { integrations: description.integrations } : {}),
        ...(description?.blockLibraries ? { blockLibraries: description.blockLibraries } : {}),
        ...(read.contentSource ? { contentSource: read.contentSource } : {}),
        source: { owner, repo },
        storefrontKind: read.kind === 'headless' ? 'headless' : 'eds',
    };
}

/** The footer's main button, by stage and by what the probe said. */
export function continueLabel(
    stage: AddDemoStage,
    result: SharedDemoProbeResult | undefined,
    shippedName: string | undefined,
): string {
    if (stage === 'link') return 'Continue';
    if (result?.outcome === 'shipped') return `Use ${shippedName ?? 'the demo'}`;
    return COPY.add;
}
