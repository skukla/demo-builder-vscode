/**
 * Inspector Tagging Helpers
 *
 * Vendors the demo-inspector-sdk into the user's storefront repo and
 * generates a thin init script that imports SDK functions and applies
 * tagging rules.
 *
 * The SDK (skukla/demo-inspector-sdk) owns:
 *   - Implementation: tagMeshSources(), mergeRules()
 *   - Default rules: DEFAULT_RULES for standard Commerce dropin patterns
 *
 * The builder owns:
 *   - Package-specific overrides (inspector-rules.json → packageOverrides)
 *   - Vendoring the SDK into storefront repos
 *   - Generating a thin init script that wires it all together
 *   - Orchestrating when this happens during project setup
 *
 * Tree entries are designed to be merged into the block collection commit
 * (single atomic commit) via `installBlockCollections`. When no block
 * libraries are selected, `installInspectorTagging` creates a standalone
 * commit instead.
 *
 * @module features/eds/services/inspectorHelpers
 */

import type { GitHubFileOperations } from './githubFileOperations';
import type { GitHubTreeInput } from './types';
import type { Logger } from '@/types/logger';
import inspectorOverrides from '@/features/project-creation/config/inspector-rules.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallInspectorResult {
    success: boolean;
    error?: string;
}

// ---------------------------------------------------------------------------
// SDK source configuration
// ---------------------------------------------------------------------------

const SDK_SOURCE = {
    owner: 'skukla',
    repo: 'demo-inspector-sdk',
    branch: 'main',
    srcDir: 'src',
    destDir: 'scripts/demo-inspector-sdk',
};

// ---------------------------------------------------------------------------
// Package overrides lookup
// ---------------------------------------------------------------------------

/**
 * Get package-specific overrides from inspector-rules.json.
 * Returns undefined if the package has no overrides (standard dropin patterns).
 */
function getPackageOverrides(packageId?: string): { level1?: Record<string, string>; level2?: Record<string, { selector: string; source: string }[]> } | undefined {
    if (!packageId) return undefined;
    const overrides = inspectorOverrides.packageOverrides as Record<string, { level1?: Record<string, string>; level2?: Record<string, { selector: string; source: string }[]> }>;
    return overrides[packageId];
}

// ---------------------------------------------------------------------------
// SDK vendoring
// ---------------------------------------------------------------------------

/**
 * Fetch SDK source files from GitHub and return tree entries that place
 * them under `scripts/demo-inspector-sdk/` in the destination repo.
 *
 * Follows the same listRepoFiles + getBlobContent pattern as
 * blockCollectionHelpers.ts.
 */
async function vendorSdkTreeEntries(
    githubFileOps: GitHubFileOperations,
    logger: Logger,
): Promise<GitHubTreeInput[]> {
    const { owner, repo, branch, srcDir, destDir } = SDK_SOURCE;

    const allFiles = await githubFileOps.listRepoFiles(owner, repo, branch);

    const sdkFiles = allFiles.filter(
        entry => entry.path.startsWith(`${srcDir}/`) && entry.path.endsWith('.js'),
    );

    if (sdkFiles.length === 0) {
        logger.warn('[Inspector Tagging] No SDK source files found');
        return [];
    }

    const entries: GitHubTreeInput[] = [];

    for (const file of sdkFiles) {
        const content = await githubFileOps.getBlobContent(owner, repo, file.sha);
        const destPath = file.path.replace(`${srcDir}/`, `${destDir}/`);
        entries.push({
            path: destPath,
            mode: '100644',
            type: 'blob',
            content,
        });
    }

    logger.info(`[Inspector Tagging] Vendored ${entries.length} SDK files into ${destDir}/`);
    return entries;
}

// ---------------------------------------------------------------------------
// Init script generation
// ---------------------------------------------------------------------------

/**
 * Generate a thin init script that imports DEFAULT_RULES and tagMeshSources
 * from the vendored SDK, optionally merges package overrides, and applies
 * the rules to the DOM. No inline setAttribute calls — all tagging goes
 * through SDK functions.
 */
function generateInitScript(packageId?: string): string {
    const overrides = getPackageOverrides(packageId);
    const hasOverrides = !!overrides;

    const imports = hasOverrides
        ? `import { tagMeshSources } from './demo-inspector-sdk/mesh.js';
import { DEFAULT_RULES, mergeRules } from './demo-inspector-sdk/rules.js';`
        : `import { tagMeshSources } from './demo-inspector-sdk/mesh.js';
import { DEFAULT_RULES } from './demo-inspector-sdk/rules.js';`;

    const rulesSetup = hasOverrides
        ? `const OVERRIDES = ${JSON.stringify(overrides, null, 2)};

const RULES = mergeRules(DEFAULT_RULES, OVERRIDES);`
        : `const RULES = DEFAULT_RULES;`;

    return `/**
 * Demo Inspector — Mesh Mode Tagging (auto-generated by Demo Builder)
 *
 * Applies data-inspector-source attributes using the Demo Inspector SDK.
 * Default rules come from the SDK; package overrides are embedded at
 * project creation time.
 */

${imports}

${rulesSetup}

function applyRules() {
  document.querySelectorAll('[data-block-name]').forEach((block) => {
    const name = block.getAttribute('data-block-name');
    if (!name) return;

    // Level 2: tag sub-elements by CSS selector within this block
    const l2 = RULES.level2[name];
    if (l2) {
      for (const rule of l2) {
        tagMeshSources(block.querySelectorAll(rule.selector), rule.source);
      }
    }

    // Level 1: tag the block container, but skip if Level 2 already tagged it
    if (block.hasAttribute('data-inspector-source')) return;
    const source = RULES.level1[name]
      || (name.startsWith('commerce-') ? 'commerce' : null);
    if (source) {
      tagMeshSources([block], source);
    }
  });
}

export function initInspector() {
  applyRules();
}
`;
}

// ---------------------------------------------------------------------------
// Delayed.js snippet
// ---------------------------------------------------------------------------

const DELAYED_SNIPPET = `
// Demo Inspector (auto-generated by Demo Builder)
try {
  const { initInspector } = await import('./demo-inspector-init.js');
  initInspector();
} catch { /* Inspector not available */ }
`;

const DELAYED_DETECTION_MARKER = 'demo-inspector-init';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate Git tree entries for inspector tagging files.
 *
 * Returns entries for:
 * - `scripts/demo-inspector-sdk/` (vendored SDK source files)
 * - `scripts/demo-inspector-init.js` (thin glue script)
 * - `scripts/delayed.js` (loader snippet appended, if needed)
 *
 * These entries are designed to be merged into a larger atomic commit
 * (e.g. the block collection commit). Use `installInspectorTagging`
 * instead when no other commit is being made.
 */
export async function generateInspectorTreeEntries(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    packageId: string | undefined,
    logger: Logger,
): Promise<GitHubTreeInput[]> {
    const initScriptContent = generateInitScript(packageId);
    const overrides = getPackageOverrides(packageId);

    logger.info(`[Inspector Tagging] Generating init script for package: ${packageId ?? 'default'}${overrides ? ' (with overrides)' : ''}`);

    const treeEntries: GitHubTreeInput[] = [];

    // Vendor the SDK source files
    const sdkEntries = await vendorSdkTreeEntries(githubFileOps, logger);
    treeEntries.push(...sdkEntries);

    // Write the generated init script
    treeEntries.push({
        path: 'scripts/demo-inspector-init.js',
        mode: '100644',
        type: 'blob',
        content: initScriptContent,
    });

    // Append loader snippet to delayed.js if not already present
    const existingDelayed = await githubFileOps.getFileContent(
        destOwner, destRepo, 'scripts/delayed.js',
    );

    if (existingDelayed?.content) {
        const alreadyHasSnippet = existingDelayed.content.includes(DELAYED_DETECTION_MARKER);
        if (!alreadyHasSnippet) {
            treeEntries.push({
                path: 'scripts/delayed.js',
                mode: '100644',
                type: 'blob',
                content: existingDelayed.content + DELAYED_SNIPPET,
            });
            logger.info('[Inspector Tagging] Appending loader snippet to delayed.js');
        } else {
            logger.info('[Inspector Tagging] delayed.js already has inspector import — skipping append');
        }
    } else {
        logger.warn('[Inspector Tagging] scripts/delayed.js not found — skipping loader snippet');
    }

    logger.info(`[Inspector Tagging] Generated ${treeEntries.length} tree entries (${sdkEntries.length} SDK files)`);
    return treeEntries;
}

/**
 * Install inspector tagging as a standalone commit.
 *
 * Use this only when no block library commit is being made (i.e. no
 * block libraries are selected). When block libraries ARE selected,
 * use `generateInspectorTreeEntries` and pass the entries into
 * `installBlockCollections` via its `additionalTreeEntries` parameter.
 */
export async function installInspectorTagging(
    githubFileOps: GitHubFileOperations,
    destOwner: string,
    destRepo: string,
    packageId: string | undefined,
    logger: Logger,
): Promise<InstallInspectorResult> {
    try {
        const treeEntries = await generateInspectorTreeEntries(
            githubFileOps, destOwner, destRepo, packageId, logger,
        );

        if (treeEntries.length === 0) {
            return { success: true };
        }

        const { treeSha, commitSha } = await githubFileOps.getBranchInfo(destOwner, destRepo, 'main');
        const newTreeSha = await githubFileOps.createTree(destOwner, destRepo, treeEntries, treeSha);
        const newCommitSha = await githubFileOps.createCommit(
            destOwner, destRepo,
            'chore: add Demo Inspector tagging',
            newTreeSha, commitSha,
        );
        await githubFileOps.updateBranchRef(destOwner, destRepo, 'main', newCommitSha);

        return { success: true };
    } catch (error) {
        const message = (error as Error).message;
        logger.warn(`[Inspector Tagging] Failed: ${message}`);
        return { success: false, error: message };
    }
}
