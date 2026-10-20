/**
 * The Adobe commit a colleague's storefront was built from (EDS-56), so it can follow our
 * tested boilerplate as well as the colleague's own changes.
 *
 * A storefront Demo Builder generates follows the patches repo's last-known-good pointer
 * through `lkgSource`. One added from a colleague's repository follows that repository
 * instead, and our daily gate never reached it. Adobe's half of its code can be updated the
 * same way the template update works (`templateMergeBase.ts`): apply Adobe's change from the
 * commit the code started at to the tested one. That needs the starting commit, found here:
 *
 * 1. Already recorded (`boilerplateBase` in the storefront's metadata): used as it is.
 * 2. A saved demo package says it (`demo.builtWith.lkg`, description file version 2).
 * 3. Otherwise, GitHub says the colleague's repository was generated from one of our
 *    patched templates, and its first commit has the same files as one of that template's
 *    commits. GitHub's "use this template" copies the template's files into one first commit;
 *    the B2B template's own `cleanup-on-create` workflow then deletes Adobe's CI workflows,
 *    so `.github` is left out of the comparison. Measured 2026-10-20 on kmanns/justrite:
 *    every other file matched adobe-commerce/boilerplate-b2b-template 71a67e027 exactly,
 *    the 39th commit back from the day the repository was made.
 *
 * The base is recorded on the project the first time it is found, by the check, which is
 * the one path: a project created after this ships and one created before it get it the
 * same way (CLAUDE.md property 3). Kept in its own field, never in `lastSyncedCommit`
 * (the colleague's track) or `lkgSource` (which would make the project thin-layer).
 *
 * Every dependency is handed in (ADR-015); there is no `vscode` here.
 *
 * @module features/updates/services/boilerplateBase
 */

import { COMPONENT_IDS } from '@/core/constants';
import { bundledDemoPackages } from '@/features/components/services/storefrontResolver';
import type { LkgSource } from '@/features/eds/services/patches/lkgReader';
import type { Project } from '@/types/base';
import type { DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import type { RepositoryRef } from '@/types/projectFile';

/** Where the storefront's Adobe code started, and the pointer that says what is tested. */
export interface BoilerplateBase {
    /** One of our patched templates (its Adobe source). */
    template: RepositoryRef;
    /** The template commit the storefront's Adobe code is at. */
    commit: string;
    /** The pointer the daily gate moves for that template. */
    lkgSource: LkgSource;
    /** How the commit was found: a saved package said it, or the first commit matched. */
    found: 'built-with' | 'first-commit';
}

export type BaseLookup = { base: BoilerplateBase; recorded: boolean } | { reason: string };

/** What the lookup reads from GitHub. Each read answers undefined when it could not. */
export interface BoilerplateGitHub {
    repository(repo: RepositoryRef): Promise<{ createdAt: string; templateRepository?: RepositoryRef } | undefined>;
    /** The tree of the repository's first commit. */
    firstCommitTree(repo: RepositoryRef): Promise<string | undefined>;
    /** The template's commits made before `until`, newest first, with their trees. */
    commitsBefore(repo: RepositoryRef, until: string): Promise<Array<{ sha: string; tree: string }> | undefined>;
    /** A tree's top-level entries: name to object sha. */
    topLevel(repo: RepositoryRef, tree: string): Promise<Record<string, string> | undefined>;
}

export interface BoilerplateBaseDeps {
    github: BoilerplateGitHub;
    logger: Pick<Logger, 'debug'>;
    /** The catalog; defaults to the bundled one. */
    packages?: readonly DemoPackage[];
}

const FIELD = 'boilerplateBase';
const COMMIT_SHA = /^[0-9a-f]{40}$/;
/** The template's own CI, deleted from a generated repository by its cleanup workflow. */
const NOT_COMPARED = '.github';

/**
 * The recorded base, or the one found now, or why there is none.
 *
 * @param project - the project, read fresh
 * @param deps - GitHub reads, the logger and the catalog
 * @returns the base (and whether it was already recorded), or the reason, in a sentence
 */
export async function resolveBoilerplateBase(project: Project, deps: BoilerplateBaseDeps): Promise<BaseLookup> {
    const metadata = storefrontMetadata(project);
    if (!metadata) return { reason: 'it has no Edge Delivery storefront' };
    const recorded = readBoilerplateBase(project);
    if (recorded) return { base: recorded, recorded: true };
    if (metadata.lkgSource) return { reason: 'it already follows the tested template' };
    const source = project.demo?.source;
    if (!source) return { reason: 'it was not built from a colleague\'s demo' };

    const builtWith = project.demo?.builtWith;
    if (builtWith?.template && typeof builtWith.lkg === 'string' && COMMIT_SHA.test(builtWith.lkg)) {
        const tracked = trackedTemplate(builtWith.template, deps.packages);
        if (!tracked) return { reason: `${refName(builtWith.template)} is not a template Demo Builder tests` };
        return { base: { ...tracked, commit: builtWith.lkg, found: 'built-with' }, recorded: false };
    }
    return matchFirstCommit({ owner: source.owner, repo: source.repo }, deps);
}

/** Find the base by the colleague's first commit (step 3 in the module doc). */
async function matchFirstCommit(colleague: RepositoryRef, deps: BoilerplateBaseDeps): Promise<BaseLookup> {
    const { github } = deps;
    const repository = await github.repository(colleague);
    if (!repository) return { reason: `GitHub could not be read for ${refName(colleague)}` };
    const from = repository.templateRepository;
    const tracked = from ? trackedTemplate(from, deps.packages) : undefined;
    if (!from || !tracked) {
        return { reason: `${refName(colleague)} was not made from a template Demo Builder tests` };
    }
    const firstTree = await github.firstCommitTree(colleague);
    const want = firstTree ? await github.topLevel(colleague, firstTree) : undefined;
    const candidates = await github.commitsBefore(tracked.template, repository.createdAt);
    if (!want || !candidates) return { reason: `GitHub could not be read for ${refName(colleague)}` };
    for (const candidate of candidates) {
        const have = await github.topLevel(tracked.template, candidate.tree);
        if (have && sameFiles(want, have)) {
            deps.logger.debug(`[Updates] ${refName(colleague)} started at ${refName(from)} ${candidate.sha.slice(0, 7)}`);
            return { base: { ...tracked, commit: candidate.sha, found: 'first-commit' }, recorded: false };
        }
    }
    return { reason: `${refName(colleague)}'s first commit matches no commit of ${refName(from)}` };
}

function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
    const names = (t: Record<string, string>) => Object.keys(t).filter((n) => n !== NOT_COMPARED).sort();
    const left = names(a);
    const right = names(b);
    return left.length === right.length && left.every((name, i) => name === right[i] && a[name] === b[name]);
}

/** One of our patched templates and its pointer, or undefined. */
function trackedTemplate(
    ref: RepositoryRef,
    packages: readonly DemoPackage[] = bundledDemoPackages,
): Omit<BoilerplateBase, 'commit' | 'found'> | undefined {
    for (const pkg of packages) {
        for (const storefront of Object.values(pkg.storefronts)) {
            const { templateOwner, templateRepo, codePatchSource } = storefront;
            if (!templateOwner || !templateRepo || !codePatchSource?.lkgFile) continue;
            const template = { owner: templateOwner, repo: templateRepo };
            if (refName(template).toLowerCase() !== refName(ref).toLowerCase()) continue;
            const { owner, repo, lkgFile } = codePatchSource;
            return { template, lkgSource: { owner, repo, lkgFile } };
        }
    }
    return undefined;
}

function refName(ref: RepositoryRef): string {
    return `${ref.owner}/${ref.repo}`;
}

function storefrontMetadata(project: Project): Record<string, unknown> | undefined {
    return project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata as Record<string, unknown> | undefined;
}

/** The recorded base, when the field holds one; anything malformed reads as none. */
export function readBoilerplateBase(project: Project): BoilerplateBase | undefined {
    const value = storefrontMetadata(project)?.[FIELD];
    if (typeof value !== 'object' || value === null) return undefined;
    const base = value as Partial<BoilerplateBase>;
    const ok =
        typeof base.commit === 'string' &&
        COMMIT_SHA.test(base.commit) &&
        typeof base.template?.owner === 'string' &&
        typeof base.template?.repo === 'string' &&
        typeof base.lkgSource?.owner === 'string' &&
        typeof base.lkgSource?.repo === 'string' &&
        (base.found === 'built-with' || base.found === 'first-commit');
    return ok ? (base as BoilerplateBase) : undefined;
}

/**
 * Record the base (the caller saves the project). `undefined` removes it, so the next
 * check finds it again: after a reset or a change of source the code is the source's
 * again, and the base is whatever the source says.
 */
export function writeBoilerplateBase(project: Project, base: BoilerplateBase | undefined): void {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!instance) return;
    const metadata = { ...(instance.metadata ?? {}) };
    if (base) metadata[FIELD] = base;
    else delete metadata[FIELD];
    instance.metadata = metadata;
}
