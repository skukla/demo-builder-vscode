/**
 * The shapes a template sync takes and answers with. Split from
 * `templateSyncService.ts` by job (2026-10-16, EDS-51), so the checkout plumbing and the
 * service share them without importing each other.
 *
 * @module features/updates/services/templateSyncTypes
 */

import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

/** Options for template sync operation */
export interface TemplateSyncOptions {
    /** Sync strategy: 'merge' applies the template's change, 'reset' does full reset */
    strategy: 'merge' | 'reset';
    /** Files to preserve (never overwritten) - always includes fstab.yaml */
    preserveFiles?: string[];
}

/** The change a stopped template update was applying (EDS-57). */
export interface TemplateClash {
    /** The source repository the change comes from. */
    source: { owner: string; repo: string };
    /** The commit the change starts from. */
    base: string;
    /** The commit it brings the storefront to. */
    target: string;
    /** Files left out of the change, as the update left them out. */
    preserveFiles: string[];
}

/** Result of template sync operation */
export interface TemplateSyncResult {
    /** Whether sync completed successfully */
    success: boolean;
    /** Strategy that ran */
    strategy: 'merge' | 'reset';
    /** The template commit the storefront now matches ('' on failure) */
    syncedCommit: string;
    /**
     * Files where the template's changes collide with the SC's own edits. Set
     * only on a merge that STOPPED: the checkout is restored, nothing is pushed,
     * `success` is false and `error` names the files. The caller decides what
     * happens next — a reset is a separate, explicit request, never a fallback.
     */
    conflicts?: string[];
    /**
     * With `conflicts`: the change that clashed, as the two commits of the source it runs
     * between and the files left out of it, so the same change can be applied again where
     * the clash is kept for fixing (EDS-57).
     */
    clash?: TemplateClash;
    /** Error message if sync failed */
    error?: string;
    /**
     * Plain lines about a SUCCESSFUL update the SC should know: a Demo Builder fix or
     * piece that could not be put back (EDS-51). Absent when there is nothing to say.
     */
    notes?: string[];
}

/**
 * The GitHub access a sync needs: the token its git clone and push use, and the file
 * operations that put Demo Builder's pieces back. Handed in rather than fetched from
 * the extension's service cache, so the same code runs outside VS Code: the patch
 * canary brings its storefront up to date with it in CI (EDS-49).
 */
export interface GitHubAccess {
    tokenService: Pick<GitHubTokenService, 'getToken'>;
    fileOperations: GitHubFileOperations;
}

/** Which repositories one sync moves between. */
export interface TemplateSyncTarget {
    repoOwner: string;
    repoName: string;
    templateOwner: string;
    templateRepo: string;
    /** The SC's branch to rewrite. Default `main`. */
    repoBranch?: string;
    /** The template's branch to read. Default `main`. */
    templateBranch?: string;
}

/** A temp clone of the SC's repo with the template fetched and the preserved files backed up. */
export interface Checkout {
    tempDir: string;
    repoDir: string;
    backups: Map<string, string>;
    /** The SC's branch the result is pushed to. */
    branch: string;
}
