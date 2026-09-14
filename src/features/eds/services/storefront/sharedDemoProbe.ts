/**
 * Read a colleague's repository before "Add a demo package" offers it (shareable-demo
 * step 03): is it a storefront we can build on, of which kind; where its
 * content is and whether it is published; its store codes; its B2B posture;
 * its template flag and default branch; and the description file's content
 * when present, marked as overriding.
 *
 * Read-only by construction: every leg is a GitHub read or a GET of a public
 * index. Nothing is written anywhere.
 *
 * The two markers this file relies on were read from the real repositories
 * on 2026-09-12, not written from memory:
 *   - headless: `dependencies.next` in `skukla/citisignal-nextjs`'s package.json;
 *   - B2B: the drop-ins below, in `adobe-commerce/boilerplate-b2b-template`'s
 *     package.json (a B2C boilerplate ships none of them).
 *
 * Precedence when sources disagree (plan review, 2026-09-11): description file
 * > `config.json` > dependency list. The result names which source answered
 * and which read values the description file replaced.
 *
 * @module features/eds/services/storefront/sharedDemoProbe
 */

import { resolveContentIndex, type ResolvedContentIndex, type UnresolvedContentSource } from '../contentIndex';
import { parseFstabContentSource } from '../fstabGenerator';
import type { GitHubFileOperations } from '../github/githubFileOperations';
import type { GitHubRepoOperations } from '../github/githubRepoOperations';
import { CANONICAL_STOREFRONT_FILES, classifyRepoForStorefront } from './repoStorefrontReadiness';
import { parseStorefrontConfigJson } from './servedStorefrontConfig';
import { readSharedDemoDescription } from '@/core/state/projectFileReader';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { bundledDemoPackages } from '@/features/components/services/storefrontResolver';
import type { DemoPackage } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import { SHARED_DEMO_FILE_NAME, type SharedDemoDescription } from '@/types/projectFile';
import type { SharedDemoProbeResult, SharedDemoRead } from '@/types/webviewRequests';

/** The drop-ins only a B2B storefront carries (read from the B2B boilerplate, 2026-09-12). */
export const B2B_DROPINS = [
    '@dropins/storefront-company-management',
    '@dropins/storefront-company-switcher',
    '@dropins/storefront-purchase-order',
    '@dropins/storefront-quote-management',
    '@dropins/storefront-requisition-list',
] as const;

/** The dependency that makes a repository a Next.js storefront (read from citisignal-nextjs, 2026-09-12). */
const HEADLESS_DEPENDENCY = 'next';

/** The `config.json` flag ADR-009 injects for B2B storefronts. */
const B2B_FLAG = 'commerce-b2b-enabled';

const CANNOT_READ = "We couldn't find this repository, or you don't have access to it.";

/**
 * The refusal when the repository cannot be read. An SC who pasted a site address
 * can see the site in a browser and will not know which half is the problem, so
 * when the site answers the sentence names both halves (found live 2026-09-13:
 * `main--razer--sayurihanki.aem.live` is up; its repository is private).
 */
async function cannotReadReason(owner: string, repo: string, fetchImpl: typeof fetch, logger: Logger): Promise<string> {
    const site = `main--${repo}--${owner}.aem.live`;
    try {
        const response = await fetchImpl(`https://${site}/`, { method: 'HEAD', signal: AbortSignal.timeout(TIMEOUTS.QUICK) });
        if (response.ok) {
            return `The site ${site} is up, but its repository ${owner}/${repo} couldn't be found, or you don't have access to it. Ask its owner to make it public or give you access.`;
        }
    } catch (error) {
        logger.debug(`[SharedDemo] ${site} did not answer: ${(error as Error).message}`);
    }
    return CANNOT_READ;
}

export interface SharedDemoProbeDeps {
    fileOps: Pick<GitHubFileOperations, 'getFileContent'>;
    repoOps: Pick<GitHubRepoOperations, 'getRepository'>;
    /** Injected fetch for the published-index probe; defaults to the global. */
    fetchImpl?: typeof fetch;
    /** The shipped catalog, for recognising one of our own templates; defaults to the bundled one. */
    packages?: readonly DemoPackage[];
}

/**
 * Probe a repository. Never throws for a probe failure: an unreadable
 * repository is an outcome the dialog shows, not an error that stops it.
 *
 * @param deps - GitHub readers, and optionally fetch and the catalog
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param logger - Receives what was found
 */
export async function probeSharedDemo(
    deps: SharedDemoProbeDeps,
    owner: string,
    repo: string,
    logger: Logger,
): Promise<SharedDemoProbeResult> {
    const shipped = recogniseShippedTemplate(owner, repo, deps.packages);
    if (shipped) {
        logger.info(`[SharedDemo] ${owner}/${repo} is the template behind the shipped package ${shipped}`);
        return { outcome: 'shipped', shippedPackageId: shipped, fullName: `${owner}/${repo}` };
    }

    let repository;
    try {
        repository = await deps.repoOps.getRepository(owner, repo);
    } catch (error) {
        logger.warn(`[SharedDemo] Could not read ${owner}/${repo}: ${(error as Error).message}`);
        return { outcome: 'unreadable', reason: await cannotReadReason(owner, repo, deps.fetchImpl ?? fetch, logger) };
    }

    const readiness = await classifyRepoForStorefront(deps.fileOps, owner, repo, logger);
    if (readiness.kind === 'undetermined') {
        return { outcome: 'unreadable', reason: CANNOT_READ };
    }

    const read = new RepoReader(deps.fileOps, owner, repo, logger);
    const description = await read.description();
    const base: ProbeDraft = {
        outcome: 'read',
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        isTemplate: repository.isTemplate ?? false,
        ...(repository.forkParent ? { forkParent: repository.forkParent } : {}),
        kind: 'not-a-storefront',
        contentPublished: { indexFound: false },
        b2b: 'unknown',
        overrides: [],
        warnings: [...description.warnings],
        ...(description.value ? { description: description.value } : {}),
    };

    if (readiness.kind === 'empty') {
        base.missing = [...CANONICAL_STOREFRONT_FILES];
        base.warnings.push('This repository is empty.');
        return withoutSite(applyDescription(base, description.value));
    }

    const dependencies = await read.dependencies();
    if (readiness.kind === 'not-a-storefront') {
        if (dependencies?.has(HEADLESS_DEPENDENCY)) {
            base.kind = 'headless';
            logger.info(`[SharedDemo] ${owner}/${repo} is a Next.js storefront`);
        } else {
            base.missing = readiness.missing;
        }
        return withoutSite(applyDescription(base, description.value));
    }

    base.kind = 'eds';
    const [contentSource, config] = await Promise.all([read.contentSource(), read.config()]);
    if (contentSource) {
        base.contentSource = contentSource;
    } else {
        base.warnings.push("This demo's pages aren't on DA.live, so they can't be copied. The site will start empty.");
    }
    if (config?.scope && Object.values(config.scope).some(Boolean)) {
        base.storeCodes = config.scope;
    }
    if (config?.flags[B2B_FLAG] !== undefined) {
        base.b2b = config.flags[B2B_FLAG] ? 'on' : 'off';
        base.b2bSource = 'config-json';
    } else if (dependencies) {
        base.b2b = B2B_DROPINS.some((name) => dependencies.has(name)) ? 'on' : 'off';
        base.b2bSource = 'dependencies';
    }
    const withDescription = applyDescription(base, description.value);
    return withPublishedIndex(withDescription, deps.fetchImpl ?? fetch, logger);
}

/** D30: an exact owner/repo match against a shipped storefront's template; a fork is not a match. */
function recogniseShippedTemplate(
    owner: string,
    repo: string,
    packages?: readonly DemoPackage[],
): string | undefined {
    const wanted = `${owner}/${repo}`.toLowerCase();
    for (const pkg of packages ?? bundledDemoPackages) {
        for (const storefront of Object.values(pkg.storefronts)) {
            if (`${storefront.templateOwner}/${storefront.templateRepo}`.toLowerCase() === wanted) {
                return pkg.id;
            }
        }
    }
    return undefined;
}

/**
 * The description file's values win over what was read (D10), and the result
 * says which fields it replaced. Only fields both sides have are compared.
 */
/** The read while it is still being assembled: the site is known, its index path not yet. */
type ProbeDraft = Omit<SharedDemoRead, 'contentSource'> & { contentSource?: UnresolvedContentSource };

/** A read that never reached the site (not a storefront): it carries no content source. */
function withoutSite(draft: ProbeDraft): SharedDemoRead {
    const { contentSource: _unread, ...rest } = draft;
    return rest;
}

function applyDescription(read: ProbeDraft, description: SharedDemoDescription | undefined): ProbeDraft {
    if (!description) return read;
    const next: ProbeDraft = { ...read };
    if (description.contentSource) {
        if (next.contentSource) next.overrides.push('contentSource');
        next.contentSource = description.contentSource;
    }
    const codes = storeCodesFromDefaults(description.configDefaults);
    if (codes) {
        if (next.storeCodes) next.overrides.push('storeCodes');
        next.storeCodes = codes;
    }
    const b2b = description.configFlags?.[B2B_FLAG];
    if (b2b !== undefined) {
        if (next.b2bSource) next.overrides.push('b2b');
        next.b2b = b2b ? 'on' : 'off';
        next.b2bSource = 'description-file';
    }
    return next;
}

/** The three codes out of a package's `configDefaults`, under either key family (PaaS or ACCS). */
function storeCodesFromDefaults(
    defaults: Record<string, string> | undefined,
): SharedDemoRead['storeCodes'] | undefined {
    if (!defaults) return undefined;
    const pick = (suffix: string): string | undefined =>
        defaults[`ADOBE_COMMERCE_${suffix}`] ?? defaults[`ACCS_${suffix}`];
    const codes = {
        websiteCode: pick('WEBSITE_CODE'),
        storeCode: pick('STORE_CODE'),
        storeViewCode: pick('STORE_VIEW_CODE'),
    };
    return Object.values(codes).some(Boolean) ? codes : undefined;
}

/**
 * Read the content site's index (the URL the copy step reads from). A repository
 * names its site but not its index path, so the paths the shipped brands use are
 * tried in order and the answer is recorded on the row: from here on every
 * reader has a stated path and none guesses. A path a description file states is
 * read as stated. Absent or failing → not found, never a throw.
 */
async function withPublishedIndex(read: ProbeDraft, fetchImpl: typeof fetch, logger: Logger): Promise<SharedDemoRead> {
    if (!read.contentSource) return { ...read, contentSource: undefined, contentPublished: { indexFound: false } };
    const index = await resolveContentIndex(read.contentSource, fetchImpl, logger);
    return {
        ...read,
        contentSource: { org: read.contentSource.org, site: read.contentSource.site, indexPath: index.indexPath },
        contentPublished: publishedFrom(index),
    };
}

/** The row's "pages" answer from a resolved index. */
function publishedFrom(index: ResolvedContentIndex): SharedDemoRead['contentPublished'] {
    if (!index.found) return { indexFound: false };
    return { indexFound: true, pageCount: index.pageCount ?? 0 };
}

/** The four files an EDS probe reads, each absent-tolerant. */
class RepoReader {
    constructor(
        private readonly fileOps: Pick<GitHubFileOperations, 'getFileContent'>,
        private readonly owner: string,
        private readonly repo: string,
        private readonly logger: Logger,
    ) {}

    private async text(path: string): Promise<string | undefined> {
        try {
            return (await this.fileOps.getFileContent(this.owner, this.repo, path))?.content;
        } catch (error) {
            this.logger.debug(`[SharedDemo] Could not read ${path}: ${(error as Error).message}`);
            return undefined;
        }
    }

    async contentSource(): Promise<{ org: string; site: string } | undefined> {
        const text = await this.text('fstab.yaml');
        return text ? parseFstabContentSource(text) : undefined;
    }

    async config(): Promise<ReturnType<typeof parseStorefrontConfigJson>> {
        const text = await this.text('config.json');
        if (!text) return undefined;
        try {
            return parseStorefrontConfigJson(JSON.parse(text));
        } catch {
            return undefined;
        }
    }

    /** Dependency names from package.json; `undefined` when there is no readable package.json. */
    async dependencies(): Promise<Set<string> | undefined> {
        const text = await this.text('package.json');
        if (!text) return undefined;
        try {
            const parsed = JSON.parse(text) as { dependencies?: Record<string, unknown> };
            return new Set(Object.keys(parsed.dependencies ?? {}));
        } catch {
            return undefined;
        }
    }

    /** The description file: its value when it validates, a warning when it is present and does not. */
    async description(): Promise<{ value?: SharedDemoDescription; warnings: string[] }> {
        const text = await this.text(SHARED_DEMO_FILE_NAME);
        if (!text) return { warnings: [] };
        const result = readSharedDemoDescription(text);
        if (!result.ok) {
            return {
                warnings: [
                    "This demo's description file couldn't be read, so what the repository itself says was used.",
                ],
            };
        }
        return { value: result.description, warnings: result.warnings };
    }
}
