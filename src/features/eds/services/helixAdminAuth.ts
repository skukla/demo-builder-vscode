/**
 * HelixAdminAuth — the tokens and auth headers every Helix Admin call rides on.
 *
 * One object that knows where the DA.live IMS token and the GitHub token come
 * from, and how each admin operation spells its credentials: the optional
 * admin Bearer ({@link tryAdminBearer}), the DELETE header set (the DA.live
 * Bearer that bypasses the "source exists" restriction), and the job-status
 * headers the bulk-job protocol polls with. This is the injection seam the
 * page/bulk/key collaborators take instead of reaching into the service.
 *
 * Extracted from `helixService.ts` (god-file cut 3, 2026-08-23).
 *
 * @module features/eds/services/helixAdminAuth
 */

import type { GitHubTokenService } from './githubTokenService';
import { buildDeleteHeaders } from './helixApiClient';

/** Token provider interface for DA.live authentication (same shape the service exposes). */
export interface DaLiveTokenSource {
    getAccessToken: () => Promise<string | null>;
}

/**
 * Resolves DA.live / GitHub credentials and spells them as admin-API headers.
 */
export class HelixAdminAuth {
    constructor(
        /** Explicit provider wins; otherwise {@link getDefaultProvider}'s answer. */
        private daLiveTokenProvider: DaLiveTokenSource | undefined,
        /** The activation-registered default (read at call time, not construction). */
        private getDefaultProvider: () => DaLiveTokenSource | null,
        private githubTokenService?: GitHubTokenService,
    ) {}

    /**
     * Get DA.live IMS token for content source authorization
     *
     * IMPORTANT: DA.live uses a SEPARATE IMS authentication from Adobe Console.
     * The x-content-source-authorization header MUST use the DA.live IMS token,
     * NOT the Adobe Console IMS token - they are different authentication systems.
     *
     * Using the wrong token (Adobe IMS instead of DA.live IMS) causes the Admin API
     * to fail silently when downloading images, resulting in `about:error` in img src.
     *
     * @throws Error if DA.live token provider not configured or token expired
     */
    async getDaLiveToken(): Promise<string> {
        // Explicit provider wins; otherwise the one registered at activation.
        const provider = this.daLiveTokenProvider ?? this.getDefaultProvider();
        if (!provider) {
            throw new Error(
                'DA.live token provider not configured. ' +
                    'HelixService requires a DA.live token provider for content source operations.',
            );
        }

        const token = await provider.getAccessToken();
        if (!token) {
            throw new Error('DA.live session expired. Please sign in to DA.live.');
        }
        return token;
    }

    /**
     * Get GitHub token for Helix Admin API authentication
     * The Helix Admin API uses GitHub-based auth to verify repo write access.
     * @throws Error if GitHub token not available
     */
    async getGitHubToken(): Promise<string> {
        if (!this.githubTokenService) {
            throw new Error(
                'GitHub authentication required for Helix Admin API. Please log in to GitHub.',
            );
        }

        const tokenData = await this.githubTokenService.getToken();
        if (!tokenData) {
            throw new Error('GitHub token not found. Please log in to GitHub.');
        }

        return tokenData.token;
    }

    /**
     * The DA.live IMS Bearer as an `Authorization` header, or `{}` when no
     * DA.live session exists.
     *
     * Deliberately swallows the failure. Operations that never needed a DA.live
     * token before must keep working without one on an UNPROTECTED site; only a
     * protected site actually requires it, and there the 401 message says so.
     */
    async tryAdminBearer(): Promise<Record<string, string>> {
        try {
            return { Authorization: `Bearer ${await this.getDaLiveToken()}` };
        } catch {
            return {};
        }
    }

    /** Headers for DELETE /live|/preview — the DA.live Bearer (see ADR 002 / getDeleteAuthHeaders history). */
    async getDeleteAuthHeaders(): Promise<Record<string, string>> {
        // Token discovery here; the credential SPELLING is the client's
        // buildDeleteHeaders — one definition instead of the old hand-kept
        // "matches exactly" mirror.
        return buildDeleteHeaders({ daLiveToken: await this.getDaLiveToken() });
    }

    /**
     * Headers for job-status GETs — the identity that created the bulk job:
     * the optional admin Bearer plus the GitHub `x-auth-token`.
     */
    async jobStatusHeaders(): Promise<Record<string, string>> {
        return {
            ...(await this.tryAdminBearer()),
            'x-auth-token': await this.getGitHubToken(),
        };
    }
}
