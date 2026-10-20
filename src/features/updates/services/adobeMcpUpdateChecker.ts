/**
 * Adobe MCP Update Checker
 *
 * Compares the storefront's installed `@adobe-commerce/commerce-extensibility-tools`
 * version (read from `node_modules/.../package.json`) against the version npm publishes
 * as `latest`, which is where its update (`npm update`) installs from. Until 2026-10-20 it
 * asked GitHub for the repository's latest release; the repository is private and has no
 * releases, so no Adobe MCP update was ever offered (PL-80).
 *
 * Single `checkForUpdates(project)` method, `null` for "skip", populated result for both
 * "current" and "available" states.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import semver from 'semver';
import { getLatestNpmVersion } from './npmRegistry';
import { COMPONENT_IDS } from '@/core/constants';
import { resolveMcpToolsDir } from '@/features/project-creation/services/aiBundle/aiDefaultsInstaller';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

const ADOBE_MCP_PACKAGE = '@adobe-commerce/commerce-extensibility-tools';

export interface AdobeMcpUpdateResult {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    packageName: string;
}

export class AdobeMcpUpdateChecker {
    constructor(private readonly logger: Logger) {}

    /**
     * Check if the storefront has a newer Adobe MCP release available.
     * Returns `null` for any skip condition (no storefront, no install,
     * npm unreachable) and a populated result for "current" and "available".
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

            const latest = await getLatestNpmVersion(ADOBE_MCP_PACKAGE);
            if (!latest || !semver.valid(latest)) {
                this.logger.debug(`[AdobeMcpUpdates] Could not read the latest version of ${ADOBE_MCP_PACKAGE} from npm`);
                return null;
            }

            return {
                hasUpdate: semver.gt(latest, currentVersion),
                currentVersion,
                latestVersion: latest,
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
