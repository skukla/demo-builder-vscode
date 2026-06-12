/**
 * Adobe MCP Update Checker
 *
 * Compares the storefront's installed `@adobe-commerce/commerce-extensibility-tools`
 * version (read from `node_modules/.../package.json`) against the latest GitHub
 * release for `adobe-commerce/commerce-extensibility-tools`. Surfaces in
 * `CheckUpdatesCommand` alongside the other update sources.
 *
 * Mirrors `TemplateUpdateChecker` in shape — `(secrets, logger)` constructor,
 * single `checkForUpdates(project)` method, `null` for "skip", populated
 * result for both "current" and "available" states.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import semver from 'semver';
import * as vscode from 'vscode';
import { getLatestRelease } from './githubApiClient';
import { resolveMcpToolsDir } from '@/features/project-creation/services';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

const ADOBE_MCP_PACKAGE = '@adobe-commerce/commerce-extensibility-tools';
const ADOBE_MCP_OWNER = 'adobe-commerce';
const ADOBE_MCP_REPO = 'commerce-extensibility-tools';

export interface AdobeMcpUpdateResult {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    packageName: string;
}

export class AdobeMcpUpdateChecker {
    constructor(
        private readonly secrets: vscode.SecretStorage,
        private readonly logger: Logger,
    ) {}

    /**
     * Check if the storefront has a newer Adobe MCP release available.
     * Returns `null` for any skip condition (no storefront, no install,
     * GitHub down) and a populated result for "current" and "available".
     */
    async checkForUpdates(project: Project): Promise<AdobeMcpUpdateResult | null> {
        try {
            const storefrontPath = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path;
            if (!storefrontPath) {
                this.logger.debug(`[AdobeMcpUpdates] No EDS storefront path for ${project.name}`);
                return null;
            }

            // MCP tools install into the per-project isolated dir (keyed to
            // project.path), not the storefront's node_modules. The EDS gate
            // above still applies — headless projects get no MCP tooling.
            const currentVersion = await this.readInstalledVersion(project.path);
            if (!currentVersion) return null;

            const latest = await getLatestRelease(this.secrets, ADOBE_MCP_OWNER, ADOBE_MCP_REPO);
            if (!latest) {
                this.logger.debug(`[AdobeMcpUpdates] Could not fetch latest release for ${ADOBE_MCP_PACKAGE}`);
                return null;
            }

            return {
                hasUpdate: semver.gt(latest.version, currentVersion),
                currentVersion,
                latestVersion: latest.version,
                packageName: ADOBE_MCP_PACKAGE,
            };
        } catch (err) {
            this.logger.error(
                `[AdobeMcpUpdates] Failed to check updates for ${project.name}`,
                err as Error,
            );
            return null;
        }
    }

    /**
     * Read the version from
     * `<project>/.demo-builder-mcp/node_modules/@adobe-commerce/commerce-extensibility-tools/package.json`.
     * Returns `null` when the file is missing (npm install not run), malformed,
     * lacks a version field, or carries a non-semver value.
     */
    private async readInstalledVersion(projectPath: string): Promise<string | null> {
        const pkgPath = path.join(
            resolveMcpToolsDir(projectPath),
            'node_modules', '@adobe-commerce', 'commerce-extensibility-tools', 'package.json',
        );

        let raw: string;
        try {
            raw = await fsPromises.readFile(pkgPath, 'utf-8');
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
            this.logger.debug(`[AdobeMcpUpdates] ${ADOBE_MCP_PACKAGE} not installed at ${pkgPath}`);
            return null;
        }

        let parsed: { version?: unknown };
        try {
            parsed = JSON.parse(raw);
        } catch {
            this.logger.warn(`[AdobeMcpUpdates] Malformed package.json at ${pkgPath}`);
            return null;
        }

        if (typeof parsed.version !== 'string') return null;

        const valid = semver.valid(semver.coerce(parsed.version));
        if (!valid) {
            this.logger.warn(`[AdobeMcpUpdates] Invalid semver in package.json: ${parsed.version}`);
            return null;
        }
        return valid;
    }
}
