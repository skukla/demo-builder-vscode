/**
 * Which Node a thing runs on (PR-1a): one answer for everything Demo Builder ships.
 *
 * Demo Builder keeps no Node version of its own. Each component declares the Node it
 * accepts in its own repo (`engines.node`); at a release cut `npm run node:resolve`
 * reads every one of those ranges and writes the one Node they all accept to
 * `node-version.generated.json` (`nodeResolution.ts` holds the rule). This module only
 * reads that answer. Before, the same "24" was typed into four catalogs, copied into
 * two constants and backed by five hardcoded "20"s, and the mesh's lookups never found
 * their file.
 *
 * The one exception is a custom integration, which carries the Node
 * worked out for it when it was added (`nodeForAppBuilderEntry`).
 *
 * @module core/shell/demoBuilderNode
 */

import generated from './config/node-version.generated.json';
import { validateNodeVersion } from '@/core/validation/validators/NodeVersionValidator';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

// The value reaches shell commands; a hand-edited file must fail here, at load, not there.
validateNodeVersion(generated.node);

/** The Node every component Demo Builder ships runs on: the Adobe CLI, meshes, storefronts, App Builder apps, the AI tools. */
export function demoBuilderNode(): string {
    return generated.node;
}

/**
 * The Node an App Builder entry installs and deploys on: Demo Builder's Node, unless it is
 * a custom integration that was given its own when it was added.
 */
export function nodeForAppBuilderEntry(entry: Pick<AppBuilderComponentCatalogEntry, 'nodeVersion'>): string {
    return entry.nodeVersion ?? demoBuilderNode();
}

/**
 * The Node a component installs its packages under: Demo Builder's Node, or null for
 * one that installs none (`skipNpmInstall`, an EDS storefront) or that no definition
 * describes. The one rule the installer's record and the updater both follow.
 */
export function nodeForInstall(definition: { configuration?: { skipNpmInstall?: boolean } } | undefined): string | null {
    return definition && definition.configuration?.skipNpmInstall !== true ? demoBuilderNode() : null;
}
