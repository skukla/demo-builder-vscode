/**
 * addDemoFlow — the PURE part of the "Add a demo package" dialog: its two stages, the
 * copy the SC reads, the rows under "Package details", and the row the dialog
 * commits from a probe result.
 *
 * The Add Integration flow's stage machine was considered and not lifted: its
 * order, gates and draft are integration-specific (kinds, destinations, API
 * picks), and this journey has two fixed stages with one asynchronous step
 * between them. The SHAPE is copied (a pure module beside a hook beside a
 * modal shell). The stage core (above) is rejected on purpose.
 *
 * @module features/project-creation/ui/components/add-demo/addDemoFlow
 */

import type { SummaryRow } from '../BuildYourProjectSummary';
import { deriveBlockLibraryName } from '@/features/project-creation/services/customBlockLibraryUtils';
import { SHARED_DEMO_FILE_VERSION, type AddedDemo, type StorefrontKind } from '@/types/projectFile';
import type { SharedDemoProbeResult, SharedDemoRead } from '@/types/webviewRequests';

export type AddDemoStage = 'link' | 'found';

/** The two ways in on the first stage (add mode only; change mode takes a link). */
export type AddDemoWay = 'link' | 'zip';

/**
 * Add: remember a demo for the Welcome grid. Change: point the open project
 * at another copy of its demo (the dashboard's "Change source"; same
 * storefront kind only, decided 2026-09-11).
 */
export type AddDemoMode = 'add' | 'change';

/** What the dialog holds until "Add demo". */
export interface AddDemoDraft {
    source?: { owner: string; repo: string };
    /** The typed name; '' means the default. */
    name: string;
    /** The typed description; '' means the description file's, or none. */
    description: string;
    /** The B2B switch, asked only when the probe could not tell. */
    b2bOn: boolean;
    /** Keep my own copy: on by default (decided 2026-09-11). */
    keepCopy: boolean;
    /** Change mode only: also move the remembered demo to the new source. Off by default. */
    updateRemembered: boolean;
}

export const COPY = {
    title: 'Add a demo package',
    /** The two ways in, as choice cards: the same shape as Export's "How will you hand it over?". */
    wayQuestion: 'Where is the demo?',
    wayLink: 'From a link',
    wayLinkWhy: "A GitHub link or the demo's site address. Keeps its history and later changes.",
    wayZip: 'From a zip file',
    wayZipWhy: 'Becomes a repository in your GitHub account. No history or later changes.',
    linkLabel: 'Link to the demo',
    linkPlaceholder: 'https://github.com/name/demo',
    invalidLink: "Enter a GitHub link, like https://github.com/name/demo, or the demo's site address",
    duplicateLink: "You've already added this demo.",
    looking: 'Reading the storefront',
    lookingFor: 'Checking what kind of storefront it is, its store codes, and whether its pages are published.',
    notADemo: "This doesn't look like a demo we can build on",
    signInFirst: 'Sign in to GitHub first',
    signInHow: 'Reading a demo needs your GitHub sign-in. Sign in to GitHub in VS Code (Accounts, bottom left), then Continue again.',
    found: 'Package details',
    descriptionLabel: 'Description',
    nameLabel: 'Demo name',
    b2bSwitch: 'Uses company (B2B) features',
    b2bWhy: "We couldn't tell whether this demo uses company accounts, quotes and purchase orders.",
    b2bIfWrong: 'If it does and this stays off, company users will see an empty account menu.',
    keepCopy: 'Keep my own copy of the code',
    /** The second way in (step 10): a storefront that arrived as a zip file. */
    zipPublic: 'Make the repository public',
    zipButton: 'Choose a zip file',
    importing: 'Creating your repository from the zip',
    importingFor: 'Unpacking the files and pushing them to your GitHub account. A large storefront can take a minute.',
    zipFailed: "We couldn't add this zip",
    useExisting: 'Add it from that repository',
    bundleSetup: 'This bundle also carries setup',
    bundleSetupWhy: 'Commerce, Adobe, GitHub and DA.live settings from whoever sent it. Start a project from them, on this card.',
    bundleStart: 'Start a project with it',
    add: 'Add demo package',
    adding: 'Adding the demo package',
    addingCopy: 'Making your own copy of the code in your GitHub account.',
    /** The dashboard's "Change source" door: the same dialog, a different commit. */
    change: {
        title: 'Change the demo source',
        lead: "Point this project at another copy of its demo: a colleague's link, your own copy, or the demo's site address. Only where reset and updates read from changes; the project's code and pages stay as they are.",
        commit: 'Change source',
        changing: 'Changing the source',
        updateRemembered: 'Also update the remembered demo',
        shipped: "A project can't be pointed at a demo we ship. Use the demo's own repository.",
        wrongKindTitle: 'This demo is a different kind of storefront',
    },
} as const;

export const INITIAL_DRAFT: AddDemoDraft = { name: '', description: '', b2bOn: false, keepCopy: true, updateRemembered: false };

/** The one rule of change mode: an Edge Delivery project takes an Edge Delivery demo, a headless one a headless demo. */
export function wrongKindMessage(currentKind: StorefrontKind): string {
    const built = currentKind === 'eds' ? 'an Edge Delivery' : 'a headless';
    return `This project is built on ${built} demo; pick a demo of the same kind.`;
}

/** Whether the read demo can be this project's source (change mode). */
export function kindMatches(read: SharedDemoRead, currentKind: StorefrontKind | undefined): boolean {
    if (!currentKind) return true;
    return (read.kind === 'headless' ? 'headless' : 'eds') === currentKind;
}

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

/** The rows under "Package details", in the summary's own vocabulary. */
export function foundRows(read: SharedDemoRead): SummaryRow[] {
    const codes = read.storeCodes;
    const pages = read.contentPublished.indexFound
        ? `${read.contentPublished.pageCount ?? 0} published`
        : undefined;
    return [
        // Where the code lives, first: a site address was read back to it.
        { label: 'Code', value: `github.com/${read.fullName}`, done: true },
        { label: 'Type', value: KIND_LABEL[read.kind], done: true },
        {
            label: 'Pages',
            value: read.kind === 'eds' ? pages : 'Not needed for a headless demo',
            done: Boolean(pages) || read.kind === 'headless',
        },
        // One row per level, labelled like every other row (owner, 2026-09-14).
        { label: 'Website', value: codes?.websiteCode, done: Boolean(codes?.websiteCode) },
        { label: 'Store', value: codes?.storeCode, done: Boolean(codes?.storeCode) },
        { label: 'Store view', value: codes?.storeViewCode, done: Boolean(codes?.storeViewCode) },
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
    const descriptionText = draft.description.trim() || description?.description;
    const configDefaults = description?.configDefaults ?? configDefaultsFromCodes(read.storeCodes);
    return {
        kind: 'demo',
        version: SHARED_DEMO_FILE_VERSION,
        name: draft.name.trim() || defaultDemoName(read),
        // What the SC typed wins; a blank field keeps the file's (owner, 2026-09-14:
        // an added card with no description reads as unfinished).
        ...(descriptionText ? { description: descriptionText } : {}),
        ...(configDefaults ? { configDefaults } : {}),
        ...(b2b ? { configFlags: { 'commerce-b2b-enabled': true, 'commerce-companies-enabled': true } } : {}),
        ...(description?.requiresMesh !== undefined ? { requiresMesh: description.requiresMesh } : {}),
        ...(description?.datapack ? { datapack: description.datapack } : {}),
        ...(description?.integrations ? { integrations: description.integrations } : {}),
        ...(description?.blockLibraries ? { blockLibraries: description.blockLibraries } : {}),
        ...(read.contentSource ? { contentSource: read.contentSource } : {}),
        source: { owner, repo, branch: read.defaultBranch },
        storefrontKind: read.kind === 'headless' ? 'headless' : 'eds',
    };
}

/** The footer's main button, by stage, by the way in, and by what the probe said. */
export function continueLabel(
    stage: AddDemoStage,
    result: SharedDemoProbeResult | undefined,
    shippedName: string | undefined,
    mode: AddDemoMode = 'add',
    way: AddDemoWay = 'link',
): string {
    if (stage === 'link') return mode === 'add' && way === 'zip' ? COPY.zipButton : 'Continue';
    if (mode === 'change') return COPY.change.commit;
    if (result?.outcome === 'shipped') return `Use ${shippedName ?? 'the demo'}`;
    return COPY.add;
}
