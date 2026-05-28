/**
 * AI Defaults Installer
 *
 * Mutates the storefront's `package.json` to add each MCP package declared in
 * `ai-defaults.json` as a devDependency. Must run AFTER the storefront repo is
 * cloned but BEFORE `npm install` runs — so the storefront's `node_modules`
 * contains every Adobe-supplied MCP after installation.
 *
 * Idempotent: re-running upserts the declared version, leaving other devDeps
 * (and the rest of the package.json) untouched.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import aiDefaultsConfig from '../config/ai-defaults.json';
import type { AiDefaults } from '@/types/aiDefaults';

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

/**
 * Add ai-defaults.json packages as devDependencies on the storefront's package.json.
 *
 * @param storefrontPath - absolute path to the cloned storefront directory
 * @throws if `<storefrontPath>/package.json` is missing or malformed
 */
export async function applyAiDefaultsToStorefrontPackageJson(
    storefrontPath: string,
): Promise<void> {
    const packageJsonPath = path.join(storefrontPath, 'package.json');

    let raw: string;
    try {
        raw = await fsPromises.readFile(packageJsonPath, 'utf-8');
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
            throw new Error(
                `Cannot apply AI defaults: storefront package.json not found at ${packageJsonPath}`,
            );
        }
        throw err;
    }

    let pkg: Record<string, unknown>;
    try {
        pkg = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
        throw new Error(
            `Cannot apply AI defaults: storefront package.json is not valid JSON ` +
            `(${packageJsonPath}): ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    const devDeps: Record<string, string> = (pkg.devDependencies as Record<string, string>) ?? {};
    for (const entry of aiDefaults.mcpServers) {
        devDeps[entry.package] = entry.version;
    }
    pkg.devDependencies = devDeps;

    await fsPromises.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}
