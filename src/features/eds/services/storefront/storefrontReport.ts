/**
 * The storefront report (EDS-13f, plan `.rptc/plans/shareable-demo-patches/`,
 * steps 04 and 07): where a project's storefront comes from, what Demo Builder
 * wrote into it, and the state of each of Demo Builder's fixes on its code.
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
import { fixGroupsLabel, resolveFixLedger, STOREFRONT_FIX_IDS } from '../patches/loadBearingPatches';
import { checkFixes, type FixOutcome, type FixState } from '../patches/storefrontFixes';
import { SMART_404_MARKER_START } from '../pdp/pdp404Snippet';
import { readRepoBoilerplate, type ReadOutcome } from './storefrontOrigin';
import {
    asLineage,
    boilerplateFloorWarning,
    boilerplateLabel,
    ourLineage,
    type LineageMatch,
} from './storefrontProvenance';
import { COMPONENT_IDS } from '@/core/constants';
import { resolveStorefrontForProject } from '@/features/components/services/storefrontResolver';
import type { Project } from '@/types/base';
import type { CodePatchSource, DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import {
    SHARED_DEMO_FILE_NAME,
    type RepositoryRef,
    type StorefrontBoilerplate,
    type StorefrontLineage,
} from '@/types/projectFile';
import { getEdsRepoParts } from '@/types/typeGuards';

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
    fixes: FixOutcome[];
    /** Fixes that fit an added demo tied to our templates: what the SC may accept. */
    offer?: string[];
}

export interface StorefrontReportDeps {
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>;
    repoOps: Pick<GitHubRepoOperations, 'getRepository'>;
    /** The patches repo's last-known-good commit (`readLkgSha`); undefined when it cannot be read. */
    readLkg: (source: LkgSource) => Promise<string | undefined>;
    logger: Logger;
    packages?: readonly DemoPackage[];
}

/** The fixes the report checks, the ledger they live in, and the template that ledger pins. */
interface FixSet {
    ids: string[];
    source: CodePatchSource;
    template?: RepositoryRef;
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
    const fixSet = fixSetOf(project, origin, deps.packages);
    const [boilerplate, current, written, fixes] = await Promise.all([
        readRepoBoilerplate(deps.fileOps, repository, deps.logger),
        fixSet ? currentBoilerplate(fixSet, deps) : Promise.resolve(undefined),
        writtenPieces(repository, deps),
        fixSet ? checkFixes(deps, { ...repository, branch: 'main' }, fixSet.ids, fixSet.source) : Promise.resolve([]),
    ]);
    const offer = origin.kind === 'added' && origin.match ? fixes.filter((f) => f.state === 'fits').map((f) => f.patchId) : [];
    return {
        repository,
        boilerplate,
        ...(current ? { current } : {}),
        origin,
        written,
        fixes,
        ...(offer.length ? { offer } : {}),
    };
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

/** A shipped brand's own ledger; a saved package's; otherwise the five and the two, from the shipped ledger. */
function fixSetOf(project: Project, origin: StorefrontOriginKind, packages?: readonly DemoPackage[]): FixSet | undefined {
    if (origin.kind === 'shipped') {
        const storefront = resolveStorefrontForProject(project, packages)?.storefront;
        if (!storefront?.codePatchSource || !storefront.codePatches?.length) return undefined;
        return { ids: storefront.codePatches, source: storefront.codePatchSource, template: origin.template };
    }
    const builtWith = project.demo?.builtWith;
    if (origin.match?.by === 'built-with' && builtWith?.codePatchSource && builtWith.codePatches?.length) {
        return { ids: builtWith.codePatches, source: builtWith.codePatchSource, template: builtWith.template };
    }
    const ledger = resolveFixLedger(packages);
    return ledger ? { ids: [...STOREFRONT_FIX_IDS], source: ledger.source, template: ledger.template } : undefined;
}

async function currentBoilerplate(fixSet: FixSet, deps: StorefrontReportDeps): Promise<ReadOutcome<StorefrontBoilerplate> | undefined> {
    if (!fixSet.template) return undefined;
    const { owner, repo, lkgFile } = fixSet.source;
    const lkg = await deps.readLkg({ owner, repo, ...(lkgFile ? { lkgFile } : {}) });
    if (!lkg) return { status: 'unreadable', reason: 'The last-known-good commit could not be read' };
    return readRepoBoilerplate(deps.fileOps, fixSet.template, deps.logger, lkg);
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

/** The fix states in the order the report names them, with their words. */
const STATE_LINES: ReadonlyArray<[FixState, string]> = [
    ['applied', 'Already on the code'],
    ['fits', 'Fit, not applied'],
    ['missing', "Don't fit this code"],
    ['target-missing', 'Not in this storefront'],
    ['unreadable', 'Could not check'],
];

/**
 * The report in SC words, as markdown lines under three headings. Never a
 * patch id: fixes are named by what they fix.
 */
export function storefrontReportLines(report: StorefrontReport): string[] {
    return [
        '## Where this storefront comes from',
        boilerplateLine(report),
        ...originLines(report.origin),
        '## What Demo Builder wrote',
        `Product-page fallback (smart 404): ${PRESENCE_WORDS[report.written.smart404]}.`,
        `Content mount (fstab.yaml): ${PRESENCE_WORDS[report.written.fstab]}.`,
        `Store settings (config.json): ${PRESENCE_WORDS[report.written.config]}.`,
        `Demo package description: ${PRESENCE_WORDS[report.written.description]}.`,
        "## Demo Builder's fixes",
        ...fixLines(report.fixes),
    ];
}

function boilerplateLine(report: StorefrontReport): string {
    if (report.boilerplate.status === 'unreadable') return 'Could not read what this storefront is built on.';
    if (report.boilerplate.status === 'absent') return 'This storefront does not say what it is built on.';
    const built = `Built on ${boilerplateLabel(report.boilerplate.value)}.`;
    const current = report.current?.status === 'read' ? ` Demo Builder's current one is ${report.current.value.version}.` : '';
    const warning = boilerplateFloorWarning(report.boilerplate.value);
    return `${built}${current}${warning ? ` ${warning}` : ''}`;
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

function fixLines(fixes: readonly FixOutcome[]): string[] {
    if (fixes.length === 0) return ["No Demo Builder fixes apply to this storefront's code."];
    const lines: string[] = [];
    for (const [state, words] of STATE_LINES) {
        const ids = fixes.filter((f) => f.state === state).map((f) => f.patchId);
        if (ids.length) lines.push(`${words}: ${fixGroupsLabel(ids)}.`);
    }
    return lines;
}
