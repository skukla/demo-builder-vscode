/**
 * AutoUpdater fixtures.
 *
 * Typed to the real `GitHubRelease` so a shape invented here fails
 * `npm run typecheck:tests` rather than at runtime — the mocked-response trap
 * that keeps producing suites which agree with a payload GitHub never sends.
 *
 * The jest.mock preamble is NOT here: it has to hoist above the SUT import in
 * the file that uses it, and a mock hoisted inside this module runs only when
 * this module is imported.
 */
import type { GitHubRelease, GitHubReleaseAsset } from '@/features/updates/services/types';
import type { Logger } from '@/types/logger';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import type * as vscode from 'vscode';

export function makeAsset(overrides: Partial<GitHubReleaseAsset> = {}): GitHubReleaseAsset {
    return {
        name: 'extension.vsix',
        browser_download_url: 'https://example.invalid/releases/download/v1.1.0/extension.vsix',
        size: 1024,
        content_type: 'application/octet-stream',
        state: 'uploaded',
        ...overrides,
    };
}

/**
 * What GitHub actually sends, which is `GitHubRelease` plus `html_url` — a field
 * AutoUpdater reads (as `changelogUrl`) off an untyped `response.data` and the
 * repo's own interface does not declare. Widened here rather than in src/: nothing
 * in the extension consumes it through the typed interface.
 */
export type ReleasePayload = GitHubRelease & { html_url: string };

export function makeRelease(overrides: Partial<ReleasePayload> = {}): ReleasePayload {
    const tag = overrides.tag_name ?? 'v1.1.0';
    return {
        html_url: `https://example.invalid/releases/${tag}`,
        tag_name: tag,
        name: tag,
        body: '',
        draft: false,
        prerelease: false,
        published_at: '2026-01-01T00:00:00Z',
        zipball_url: `https://example.invalid/zip/${tag}`,
        tarball_url: `https://example.invalid/tar/${tag}`,
        assets: [makeAsset()],
        ...overrides,
    };
}

/** An extension context whose installed version is `version`. */
export function contextAtVersion(version: string): vscode.ExtensionContext {
    return createMockExtensionContext({
        extension: { packageJSON: { version } },
    } as unknown as Partial<vscode.ExtensionContext>);
}

export function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}
