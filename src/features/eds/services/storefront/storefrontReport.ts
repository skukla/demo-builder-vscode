/**
 * The storefront report (EDS-13f, plan `.rptc/plans/shareable-demo-patches/`,
 * steps 04 and 07): where a project's storefront comes from, and what Demo
 * Builder wrote into it. It no longer lists Demo Builder's fixes or offers them:
 * creation and reset apply every one that fits (EDS-64, `knownPatches.ts`).
 *
 * ONE computation (`readStorefrontReport`) and ONE rendering
 * (`storefrontReportLines`); the command, Diagnostics and the agent tool all
 * read these, so no door can say something another does not (decision 8).
 *
 * Read-only by construction: every leg is a GitHub read or the patches repo's
 * public last-known-good file. A read that failed says "could not read", never
 * "not there" (the verifying rules).
 *
 * Not in it yet: the pre-render state (overlay registered, source page
 * published), which Diagnostics already probes beside it, and the content site.
 *
 * @module features/eds/services/storefront/storefrontReport
 */

import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import type { LkgSource } from '../patches/lkgReader';
import { SMART_404_MARKER_START } from '../pdp/pdp404Snippet';
import { readBrokenLinks } from './brokenLinksRecord';
import { NEEDS_RESET_LABEL, NEEDS_RESET_LINE, storefrontNeedsReset } from './storefrontChanges';
import { readRepoBoilerplate, type ReadOutcome } from './storefrontOrigin';
import {
    asLineage,
    boilerplateFloorWarning,
    boilerplateLabel,
    ourLineage,
    type LineageMatch,
} from './storefrontProvenance';
import { COMPONENT_IDS } from '@/core/constants';
import { bundledDemoPackages, resolveStorefrontForProject } from '@/features/components/services/storefrontResolver';
import {
    resolveBoilerplateBase,
    type BoilerplateBase,
    type BoilerplateGitHub,
} from '@/features/updates/services/boilerplateBase';
import type { Project } from '@/types/base';
import type { CodePatchSource, DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import {
    SHARED_DEMO_FILE_NAME,
    type RepositoryRef,
    type StorefrontBoilerplate,
    type StorefrontLineage,
} from '@/types/projectFile';
import { getEdsDaLiveTarget, getEdsRepoParts } from '@/types/typeGuards';
import type { StorefrontBrokenLink, StorefrontReportView } from '@/types/webviewPayloads';

/** Whether a file Demo Builder writes is in the repository. */
export type Presence = 'present' | 'absent' | 'unreadable';

export type StorefrontOriginKind =
    | { kind: 'shipped'; package: string; template?: RepositoryRef; pin?: string }
    | { kind: 'added'; lineage: ReadOutcome<StorefrontLineage>; match?: LineageMatch };

export interface StorefrontReport {
    repository: RepositoryRef;
    boilerplate: ReadOutcome<StorefrontBoilerplate>;
    /** Demo Builder's current boilerplate: the template's, at its ledger's last-known-good. */
    current?: ReadOutcome<StorefrontBoilerplate>;
    origin: StorefrontOriginKind;
    written: { smart404: Presence; fstab: Presence; config: Presence; description: Presence };
    /**
     * Links in the content to pages its content source does not have either,
     * from the last create or reset (`brokenLinksRecord`). Absent when none.
     */
    brokenLinks?: StorefrontBrokenLink[];
    /** The DA.live site the content is edited in, for the "open" links. */
    contentSite?: { org: string; site: string };
    /**
     * An added demo's Adobe half (EDS-56): the Adobe commit it started from and our tested
     * version, or why it does not follow our tested boilerplate. Read, never recorded here.
     */
    adobe?: { base: BoilerplateBase; tested?: string } | { reason: string };
    /**
     * The storefront is behind how Demo Builder builds storefronts now (`storefrontChanges.ts`),
     * from the project's record, no read. Present only when true.
     */
    needsReset?: true;
}

export interface StorefrontReportDeps {
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>;
    repoOps: Pick<GitHubRepoOperations, 'getRepository'>;
    /** The patches repo's last-known-good commit (`readLkgSha`); undefined when it cannot be read. */
    readLkg: (source: LkgSource) => Promise<string | undefined>;
    /** The GitHub reads that find an added demo's Adobe base (EDS-56). */
    boilerplateGitHub: BoilerplateGitHub;
    logger: Logger;
    packages?: readonly DemoPackage[];
}

/** What "Demo Builder's current boilerplate" is read from: a template, at its ledger's last-known-good. */
interface BoilerplateReference {
    source: CodePatchSource;
    template: RepositoryRef;
}

/**
 * Compute the report for an EDS project. Undefined when the project has no
 * storefront repository to read.
 */
export async function readStorefrontReport(
    project: Project,
    deps: StorefrontReportDeps,
): Promise<StorefrontReport | undefined> {
    const repository = getEdsRepoParts(project);
    if (!repository) return undefined;

    const origin = await originOf(project, deps);
    const reference = referenceOf(project, origin, deps.packages);
    const [boilerplate, current, written, adobe] = await Promise.all([
        readRepoBoilerplate(deps.fileOps, repository, deps.logger),
        reference ? currentBoilerplate(reference, deps) : Promise.resolve(undefined),
        writtenPieces(repository, deps),
        origin.kind === 'added' ? adobeHalf(project, deps) : Promise.resolve(undefined),
    ]);
    const brokenLinks = readBrokenLinks(project);
    const contentSite = getEdsDaLiveTarget(project);
    return {
        repository,
        boilerplate,
        ...(current ? { current } : {}),
        origin,
        written,
        ...(brokenLinks.length ? { brokenLinks } : {}),
        ...(contentSite ? { contentSite } : {}),
        ...(adobe ? { adobe } : {}),
        ...(storefrontNeedsReset(project) ? { needsReset: true as const } : {}),
    };
}

/** An added demo's Adobe base and our tested version, or why there is none (EDS-56). */
async function adobeHalf(project: Project, deps: StorefrontReportDeps): Promise<StorefrontReport['adobe']> {
    const lookup = await resolveBoilerplateBase(project, {
        github: deps.boilerplateGitHub,
        logger: deps.logger,
        ...(deps.packages ? { packages: deps.packages } : {}),
    });
    if ('reason' in lookup) return { reason: lookup.reason };
    const tested = await deps.readLkg(lookup.base.lkgSource);
    return { base: lookup.base, ...(tested ? { tested } : {}) };
}

async function originOf(project: Project, deps: StorefrontReportDeps): Promise<StorefrontOriginKind> {
    if (!project.demo) {
        const resolved = resolveStorefrontForProject(project, deps.packages);
        const { templateOwner, templateRepo } = resolved?.storefront ?? {};
        const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata ?? {};
        const pin = metadata.lkgSource && typeof metadata.lastSyncedCommit === 'string' ? metadata.lastSyncedCommit : undefined;
        return {
            kind: 'shipped',
            package: resolved?.package.id ?? project.selectedPackage ?? '',
            ...(templateOwner && templateRepo ? { template: { owner: templateOwner, repo: templateRepo } } : {}),
            ...(pin ? { pin } : {}),
        };
    }
    const { owner, repo } = project.demo.source;
    let lineage: ReadOutcome<StorefrontLineage>;
    try {
        const value = asLineage(await deps.repoOps.getRepository(owner, repo));
        lineage = value ? { status: 'read', value } : { status: 'absent' };
    } catch (error) {
        lineage = { status: 'unreadable', reason: (error as Error).message };
    }
    const match = ourLineage(
        {
            ...(lineage.status === 'read' ? { lineage: lineage.value } : {}),
            builtWithTemplate: project.demo.builtWith?.template,
            boilerplate: project.demo.boilerplate,
        },
        deps.packages,
    );
    return { kind: 'added', lineage, ...(match ? { match } : {}) };
}

/**
 * The template a storefront is compared against, and its ledger: a shipped brand's own; a
 * saved package's; otherwise the shipped storefront made from the template GitHub says this
 * one came from. Undefined when none of ours is known.
 */
function referenceOf(
    project: Project,
    origin: StorefrontOriginKind,
    packages: readonly DemoPackage[] = bundledDemoPackages,
): BoilerplateReference | undefined {
    if (origin.kind === 'shipped') {
        const source = resolveStorefrontForProject(project, packages)?.storefront?.codePatchSource;
        return source && origin.template ? { source, template: origin.template } : undefined;
    }
    const builtWith = project.demo?.builtWith;
    if (origin.match?.by === 'built-with' && builtWith?.codePatchSource && builtWith.template) {
        return { source: builtWith.codePatchSource, template: builtWith.template };
    }
    const template = origin.match?.template;
    if (!template) return undefined;
    for (const pkg of packages) {
        for (const storefront of Object.values(pkg.storefronts)) {
            const same = storefront.templateOwner === template.owner && storefront.templateRepo === template.repo;
            if (same && storefront.codePatchSource) return { source: storefront.codePatchSource, template };
        }
    }
    return undefined;
}

async function currentBoilerplate(
    reference: BoilerplateReference,
    deps: StorefrontReportDeps,
): Promise<ReadOutcome<StorefrontBoilerplate> | undefined> {
    const { owner, repo, lkgFile } = reference.source;
    const lkg = await deps.readLkg({ owner, repo, ...(lkgFile ? { lkgFile } : {}) });
    if (!lkg) return { status: 'unreadable', reason: 'The last-known-good commit could not be read' };
    return readRepoBoilerplate(deps.fileOps, reference.template, deps.logger, lkg);
}

/** The integration pieces Demo Builder writes into a storefront (decision 5). */
async function writtenPieces(repository: RepositoryRef, deps: StorefrontReportDeps): Promise<StorefrontReport['written']> {
    const presence = async (path: string, marker?: string): Promise<Presence> => {
        try {
            const file = await deps.fileOps.getFileContent(repository.owner, repository.repo, path);
            if (!file) return 'absent';
            return !marker || file.content.includes(marker) ? 'present' : 'absent';
        } catch {
            return 'unreadable';
        }
    };
    const [smart404, fstab, config, description] = await Promise.all([
        presence('scripts/delayed.js', SMART_404_MARKER_START),
        presence('fstab.yaml'),
        presence('config.json'),
        presence(SHARED_DEMO_FILE_NAME),
    ]);
    return { smart404, fstab, config, description };
}

// ==========================================================
// Rendering
// ==========================================================

const PRESENCE_WORDS: Record<Presence, string> = { present: 'there', absent: 'not there', unreadable: 'could not read' };

/** The report in SC words, as markdown lines under its headings. */
export function storefrontReportLines(report: StorefrontReport): string[] {
    return [
        ...(report.needsReset ? [`${NEEDS_RESET_LABEL}: ${NEEDS_RESET_LINE}`] : []),
        '## Where this storefront comes from',
        boilerplateLine(report),
        ...originLines(report.origin),
        ...adobeLines(report.adobe),
        '## What Demo Builder wrote',
        `Product-page fallback (smart 404): ${PRESENCE_WORDS[report.written.smart404]}.`,
        `Content mount (fstab.yaml): ${PRESENCE_WORDS[report.written.fstab]}.`,
        `Store settings (config.json): ${PRESENCE_WORDS[report.written.config]}.`,
        `Demo package description: ${PRESENCE_WORDS[report.written.description]}.`,
        ...brokenLinkLines(report),
    ];
}

/**
 * The report as the dashboard's report window shows it (EDS-64): the attention items, then
 * where the storefront comes from, then the detail folded away. The same sentences as
 * {@link storefrontReportLines}, so the window, the markdown and the agent never disagree.
 *
 * @param report - the computed report
 * @returns what the window renders
 */
export function storefrontReportView(report: StorefrontReport): StorefrontReportView {
    const site = report.contentSite;
    return {
        ...(report.needsReset ? { needsReset: NEEDS_RESET_LINE } : {}),
        brokenLinks: (report.brokenLinks ?? []).map(({ link, pages }) => ({
            link,
            pages: pages.map((path) => (site ? { path, editUrl: daLiveEditUrl(site, path) } : { path })),
        })),
        about: [
            { label: 'Comes from', text: originLines(report.origin).join(' ') },
            { label: 'Built on', text: boilerplateLine(report) },
        ],
        details: [
            ...adobeLines(report.adobe),
            `Product-page fallback (smart 404): ${PRESENCE_WORDS[report.written.smart404]}.`,
            `Content mount (fstab.yaml): ${PRESENCE_WORDS[report.written.fstab]}.`,
            `Store settings (config.json): ${PRESENCE_WORDS[report.written.config]}.`,
            `Demo package description: ${PRESENCE_WORDS[report.written.description]}.`,
        ],
    };
}

/**
 * The content's links to pages that do not exist, each with the page it sits
 * on, linked to that page in the DA.live editor so it can be fixed there.
 * Nothing when there are none: the section only appears when it has news.
 */
function brokenLinkLines(report: StorefrontReport): string[] {
    const links = report.brokenLinks ?? [];
    if (links.length === 0) return [];
    const site = report.contentSite;
    const pageLink = (page: string): string =>
        site ? `[${page}](${daLiveEditUrl(site, page)})` : page;
    return [
        "## Links to pages that don't exist",
        'The content was copied with these links, and the site it came from has no such pages either. ' +
            'Nothing was left out of the copy. To fix one, edit the page it is on in DA.live.',
        ...links.map(({ link, pages }) =>
            pages.length ? `- ${link}, on ${pages.map(pageLink).join(', ')}` : `- ${link}`,
        ),
    ];
}

/** A page in the DA.live editor. The path is extensionless (`/footer`), as the editor needs. */
function daLiveEditUrl(site: { org: string; site: string }, page: string): string {
    return `https://da.live/edit#/${site.org}/${site.site}${page.startsWith('/') ? page : `/${page}`}`;
}

function boilerplateLine(report: StorefrontReport): string {
    if (report.boilerplate.status === 'unreadable') return 'Could not read what this storefront is built on.';
    if (report.boilerplate.status === 'absent') return 'This storefront does not say what it is built on.';
    const built = `Built on ${boilerplateLabel(report.boilerplate.value)}.`;
    const current = report.current?.status === 'read' ? ` Demo Builder's current one is ${report.current.value.version}.` : '';
    const warning = boilerplateFloorWarning(report.boilerplate.value);
    return `${built}${current}${warning ? ` ${warning}` : ''}`;
}

function adobeLines(adobe: StorefrontReport['adobe']): string[] {
    if (!adobe) return [];
    if ('reason' in adobe) return [`Adobe boilerplate updates: not offered, because ${adobe.reason}.`];
    const { template, commit, found } = adobe.base;
    const how = found === 'first-commit' ? 'matched by its first commit' : 'recorded in its demo package';
    const started = `Adobe boilerplate: started at ${template.owner}/${template.repo} ${commit.slice(0, 7)} (${how}).`;
    if (!adobe.tested) return [`${started} Demo Builder's tested version could not be read.`];
    if (adobe.tested === commit) return [`${started} That is Demo Builder's tested version.`];
    return [`${started} Demo Builder's tested version is ${adobe.tested.slice(0, 7)}; Check for Updates offers it.`];
}

function originLines(origin: StorefrontOriginKind): string[] {
    if (origin.kind === 'shipped') {
        const from = origin.template ? `, made from ${origin.template.owner}/${origin.template.repo}` : '';
        const at = origin.pin ? ` at ${origin.pin.substring(0, 7)}` : '';
        return [`Demo Builder's ${packageName(origin.package)} storefront${from}${at}.`];
    }
    if (origin.lineage.status === 'unreadable') return ['Could not read where GitHub says this storefront comes from.'];
    const match = origin.match;
    if (match?.by === 'template' && match.template) {
        return [`GitHub records it as made from ${match.template.owner}/${match.template.repo}, one of Demo Builder's templates.`];
    }
    if (match?.by === 'fork' && match.template) {
        return [`GitHub records it as a fork of ${match.template.owner}/${match.template.repo}, one of Demo Builder's templates.`];
    }
    if (match?.by === 'built-with') return ['Saved as a demo package from a Demo Builder storefront.'];
    if (match?.by === 'package-name') {
        return ["It names Adobe's boilerplate, but GitHub does not record it as made from one of Demo Builder's templates."];
    }
    return ["GitHub records no template or fork for it, and it is not tied to Demo Builder's templates."];
}

/** The catalog name would be friendlier; the id is what the report has without another read. */
function packageName(id: string): string {
    return id ? id.charAt(0).toUpperCase() + id.slice(1) : 'shipped';
}
