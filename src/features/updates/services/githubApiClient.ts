/**
 * Shared GitHub API utilities for update-checking services.
 *
 * Centralises header construction, fetch-with-timeout boilerplate, and
 * common response types so that ForkSyncService, AddonUpdateChecker,
 * and (eventually) TemplateUpdateChecker don't each reimplement them.
 *
 * Each consumer still handles response status codes its own way —
 * this module only removes the mechanical duplication.
 */

import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GITHUB_API_BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Shared response types
// ---------------------------------------------------------------------------

export interface GitHubCompareResponse {
    ahead_by: number;
}

// ---------------------------------------------------------------------------
// Header construction
// ---------------------------------------------------------------------------

/**
 * Build standard GitHub API headers, optionally including an auth token
 * from VS Code's SecretStorage.
 */
export async function buildGitHubHeaders(
    secrets: vscode.SecretStorage,
): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Demo-Builder-VSCode',
    };

    const token = await secrets.get('githubToken');
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    return headers;
}

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with an AbortController timeout (`TIMEOUTS.QUICK`).
 *
 * Returns the raw `Response` — callers decide how to interpret
 * status codes and parse the body.
 */
export async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.QUICK);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}
