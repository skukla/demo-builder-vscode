/**
 * Brand-asset vendoring — copies additive brand files into a storefront repo.
 *
 * Data-driven from a package storefront's `brandAssets` config
 * (demo-packages.json): each `files[]` entry is fetched raw from the source
 * repo at branch HEAD and written into the generated repo; `headSnippet`
 * (when set) is vendored into `head.html` as a marker-bounded block.
 *
 * Same operational contract as `pdp404HandlerPublisher`:
 *  - idempotent: identical content / identical marker block skips the commit,
 *    so no-op re-runs (reset) stay churn-free
 *  - stale-SHA retry once: re-read and re-derive, then give up (a second
 *    rejection is a real failure, not a race)
 *  - non-fatal: `publishBrandAssets` never throws for fetch or write
 *    failures — it logs and reports per-file results; the storefront works
 *    without brand assets, it just isn't branded
 *
 * @module features/eds/services/brandAssetPublisher
 */

import { isStaleShaFailure, type GitHubFileOperations } from './github/githubFileOperations';
import { replaceMarkedBlock } from './pdp/pdp404Snippet';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { BrandAssetsConfig } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

/** Marker comments bookending the vendored head.html block. */
export const BRAND_ASSETS_MARKER_START = '<!-- demo-builder:brand-assets start -->';
export const BRAND_ASSETS_MARKER_END = '<!-- demo-builder:brand-assets end -->';

/** Outcome for a single target (a copied file or the head.html snippet). */
export interface BrandAssetResult {
    /** Target path in the generated repo. */
    path: string;
    installed: boolean;
    /** Set when installed=false to explain the skip or failure. */
    reason?: string;
}

/** Aggregate outcome for one `publishBrandAssets` run. */
export interface BrandAssetsPublishResult {
    /** True when every target is present and current (installed now or already current). */
    success: boolean;
    files: BrandAssetResult[];
    /** Present only when the config declares a headSnippet. */
    headSnippet?: BrandAssetResult;
}

/** Target-repo coordinates + services shared by every write in one run. */
interface PublishContext {
    githubFileOps: GitHubFileOperations;
    repoOwner: string;
    repoName: string;
    logger: Logger;
}

/**
 * Where a brand-asset file may be written, mirroring `patchTargetPolicy` at
 * this mechanism's point of consumption: config from demo-packages.json names
 * arbitrary `files[].to` targets, and until this check nothing stopped an
 * entry from landing in `.github/workflows/` (write access to secrets) or
 * `package.json` (arbitrary code at install time). The allowlist matches
 * actual usage: theme CSS under `styles/`, brand modules under `scripts/`,
 * and block data files under `data/`.
 *
 * `data/` is JSON-only on purpose. Schema-driven blocks fetch their data from
 * the code bus (EDS serves repo files verbatim; the content bus rejects
 * non-sheet JSON with "error from content-bus"), so the file has to be
 * vendored into the generated repo — but the directory must not become a
 * general escape hatch for shipping executable content.
 */
const ALLOWED_TARGETS = [
    { prefix: 'styles/', extension: '.css' },
    { prefix: 'scripts/', extension: '.js' },
    { prefix: 'data/', extension: '.json' },
] as const;

/**
 * True when a `files[].to` target is a safe repo-relative path inside the
 * allowlist. Absolute paths, drive letters, traversal segments, and
 * backslashes are refused outright — none is worth normalizing.
 */
function isAllowedTarget(target: string): boolean {
    if (!target || target.startsWith('/') || /^[a-zA-Z]:/.test(target)) return false;
    if (target.includes('..') || target.includes('\\')) return false;
    return ALLOWED_TARGETS.some(
        (rule) => target.startsWith(rule.prefix) && target.endsWith(rule.extension),
    );
}

/**
 * The only line shapes a head snippet may contain, pinned exactly (attribute
 * order included, no other attributes permitted):
 *
 *   <link rel="stylesheet" href="/…">
 *   <script type="module" src="/…"></script>
 *
 * each referencing a root-relative path (`/`, but not protocol-relative
 * `//`). The path is restricted to a whitelisted alphabet rather than a
 * character blacklist: WHATWG URL normalization treats `\` as `/` and strips
 * tab/CR/LF, so `/\evil.example/x.js` or a tab-split authority would resolve
 * off-origin while sneaking past any single-character exclusion. Anything
 * looser reopened real bypasses (event-handler attributes; decoy
 * `data-href`/`data-src` matching `\bhref=`/`\bsrc=` while the real URL
 * pointed off-origin) — the snippet lands verbatim in every generated
 * storefront's head.html and runs in demo audiences' browsers.
 */
const ALLOWED_SNIPPET_LINES = [
    /^<link rel="stylesheet" href="\/(?!\/)[A-Za-z0-9._/-]*">$/i,
    /^<script type="module" src="\/(?!\/)[A-Za-z0-9._/-]*"><\/script>$/i,
] as const;

/**
 * True when every non-empty line of the configured head snippet is an
 * allowed link/script tag and no line smuggles in the marker strings
 * (which would corrupt the marker-bounded block on a later re-vendor).
 */
function isAllowedHeadSnippet(snippet: string): boolean {
    if (
        snippet.includes(BRAND_ASSETS_MARKER_START)
        || snippet.includes(BRAND_ASSETS_MARKER_END)
    ) {
        return false;
    }
    return snippet
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .every((line) => ALLOWED_SNIPPET_LINES.some((rule) => rule.test(line)));
}

/** An idempotent skip is a healthy outcome, not a failure. */
function isCurrent(result: BrandAssetResult): boolean {
    return result.installed || result.reason === 'already current';
}

/** Every target in a result: the copied files plus the headSnippet when declared. */
function allTargets(
    result: Pick<BrandAssetsPublishResult, 'files' | 'headSnippet'>,
): BrandAssetResult[] {
    return result.headSnippet ? [...result.files, result.headSnippet] : result.files;
}

/**
 * The real failures in a publish result — targets neither installed now nor
 * already current. Owned here so consumers (the pipeline's warning summary)
 * don't re-assemble the target list or re-derive the result semantics from
 * the reason string.
 */
export function failedTargets(result: BrandAssetsPublishResult): BrandAssetResult[] {
    return allTargets(result).filter((target) => !isCurrent(target));
}

/** Fetch one source file raw at branch HEAD. Throws on HTTP or network failure. */
async function fetchSourceFile(
    source: BrandAssetsConfig['source'],
    fromPath: string,
): Promise<string> {
    const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${fromPath}`;
    const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUTS.PREREQUISITE_CHECK),
    });
    if (!response.ok) {
        throw new Error(`fetch failed: HTTP ${response.status} ${response.statusText}`);
    }
    return response.text();
}

/** What a target file's read state maps to: new content to write, or null to skip. */
type DesiredContent = (
    existing: { content: string; sha?: string } | null,
) => string | null;

/**
 * Read → derive → write one target file, re-reading once on a stale SHA.
 *
 * `desired` derives the content to commit from the freshly read file (null =
 * nothing to do). The stale-SHA retry re-derives from the re-read state, so a
 * concurrent writer that already landed the same content turns the retry into
 * a no-op instead of a duplicate commit. Non-stale failures propagate — the
 * per-target callers translate them into non-fatal results.
 */
async function syncFile(
    context: PublishContext,
    target: { path: string; message: string; requireExistingReason?: string },
    desired: DesiredContent,
): Promise<BrandAssetResult> {
    const { githubFileOps, repoOwner, repoName, logger } = context;
    const { path, message, requireExistingReason } = target;

    const existing = await githubFileOps.getFileContent(repoOwner, repoName, path);
    if (!existing?.content && requireExistingReason) {
        logger.warn(`[BrandAssets] ${path} not found — ${requireExistingReason}`);
        return { path, installed: false, reason: requireExistingReason };
    }

    const content = desired(existing);
    if (content === null) {
        logger.info(`[BrandAssets] ${path} already current — skipping`);
        return { path, installed: false, reason: 'already current' };
    }

    try {
        await githubFileOps.createOrUpdateFile(
            repoOwner, repoName, path, content, message, existing?.sha,
        );
    } catch (error) {
        if (!isStaleShaFailure(error)) throw error;
        logger.info(`[BrandAssets] ${path} changed under us (stale SHA) — re-reading and retrying once`);
        const fresh = await githubFileOps.getFileContent(repoOwner, repoName, path);
        const retryContent = desired(fresh);
        if (retryContent !== null) {
            await githubFileOps.createOrUpdateFile(
                repoOwner, repoName, path, retryContent, message, fresh?.sha,
            );
        }
    }
    logger.info(`[BrandAssets] Vendored ${path} (${repoOwner}/${repoName})`);
    return { path, installed: true };
}

/** Copy one configured brand file from the source repo into the target repo. */
async function publishOneFile(
    config: BrandAssetsConfig,
    file: { from: string; to: string },
    context: PublishContext,
): Promise<BrandAssetResult> {
    if (!isAllowedTarget(file.to)) {
        const reason = `refused target: ${file.to}`;
        context.logger.warn(`[BrandAssets] ${reason}`);
        return { path: file.to, installed: false, reason };
    }
    try {
        const sourceContent = await fetchSourceFile(config.source, file.from);
        return await syncFile(
            context,
            {
                path: file.to,
                message: `chore(demo-builder): vendor brand asset ${file.to}`,
            },
            (existing) => (existing?.content === sourceContent ? null : sourceContent),
        );
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        context.logger.warn(`[BrandAssets] ${file.to} not vendored: ${reason}`);
        return { path: file.to, installed: false, reason };
    }
}

/**
 * Vendor the marker-bounded head snippet into `head.html`.
 *
 * When a prior block is present, re-vendor it in place (replace between the
 * markers) so snippet changes reach existing storefronts on their next reset;
 * the commit is skipped when the rebuilt block is byte-identical. When no
 * block is present, append — head.html is an EDS fragment, not a full
 * document, so there is no `</head>` to anchor on.
 */
async function vendorHeadSnippet(
    snippet: string,
    context: PublishContext,
): Promise<BrandAssetResult> {
    if (!isAllowedHeadSnippet(snippet)) {
        const reason = 'refused headSnippet';
        context.logger.warn(`[BrandAssets] head.html snippet not vendored: ${reason}`);
        return { path: 'head.html', installed: false, reason };
    }
    const block = `\n${BRAND_ASSETS_MARKER_START}\n${snippet}\n${BRAND_ASSETS_MARKER_END}\n`;
    const desired: DesiredContent = (existing) => {
        const content = existing?.content ?? '';
        if (content.includes(BRAND_ASSETS_MARKER_START)) {
            const replaced = replaceMarkedBlock(
                content, BRAND_ASSETS_MARKER_START, BRAND_ASSETS_MARKER_END, block,
            );
            // Start marker without a complete block: appending would duplicate
            // the marker and replacing has nothing to anchor on. Fail this
            // target (thrown out of `desired`, caught below) rather than
            // pretend the snippet is current.
            if (replaced === null) {
                throw new Error('malformed brand-assets marker block');
            }
            if (replaced === content) return null;
            return replaced;
        }
        return content + block;
    };
    try {
        return await syncFile(
            context,
            {
                path: 'head.html',
                message: 'chore(demo-builder): vendor brand-assets snippet into head.html',
                requireExistingReason: 'head.html missing',
            },
            desired,
        );
    } catch (error) {
        const reason = (error as Error).message ?? 'unknown';
        context.logger.warn(`[BrandAssets] head.html snippet not vendored: ${reason}`);
        return { path: 'head.html', installed: false, reason };
    }
}

/**
 * Publish a package's brand assets into one storefront repo.
 *
 * Runs as a phase of the shared EDS pipeline (create and reset both pass
 * through it), after block-library install. Never throws: every failure is
 * logged and reported in the returned result so the surrounding pipeline
 * proceeds — a storefront without brand assets still works.
 */
export async function publishBrandAssets(
    config: BrandAssetsConfig,
    githubFileOps: GitHubFileOperations,
    repoOwner: string,
    repoName: string,
    logger: Logger,
): Promise<BrandAssetsPublishResult> {
    const context: PublishContext = { githubFileOps, repoOwner, repoName, logger };

    const files: BrandAssetResult[] = [];
    for (const file of config.files) {
        files.push(await publishOneFile(config, file, context));
    }

    const headSnippet = config.headSnippet
        ? await vendorHeadSnippet(config.headSnippet, context)
        : undefined;

    return { success: allTargets({ files, headSnippet }).every(isCurrent), files, headSnippet };
}
