/**
 * AppBuilderComponent Catalog Types (Step 03)
 *
 * The declarative catalog of pre-built appBuilderComponents (app-builder-components.json), mirroring
 * the block-libraries type-file. Each entry declares its kind, source repo,
 * backend/frontend compatibility, required Adobe APIs, provided env vars, and
 * its OWN env schema (the data backbone for D2's selection/config UX).
 */

import type { AppBuilderComponentKind } from './base';
import type { AddonSource } from './demoPackages';

/** A single env-var an App Builder component needs or provides, with collection metadata. */
export interface AppBuilderComponentEnvVar {
    /** Env-var name (e.g. "MESH_ENDPOINT", "ERP_API_KEY"). */
    name: string;
    /** `secret` → masked input + SecretStorage; `text` → Configure UI → .env. */
    type: 'text' | 'secret';
    /** Human-readable label for the collection UI. */
    label: string;
    /** Derived from another known value (e.g. Connect-Commerce backend config). */
    derivedFrom?: string;
    /** Provided by another appBuilderComponent that declares it in providesEnvVars. */
    providedBy?: string;
}

/** A pre-built appBuilderComponent catalog entry. */
export interface AppBuilderComponentCatalogEntry {
    id: string;
    name: string;
    description: string;
    kind: AppBuilderComponentKind;
    /**
     * App layout. Absent = 'standalone': `app.config.yaml` declares
     * `application.runtimeManifest.packages` at the clone root — the only
     * shape the deploy path accepted before 2026-08-27. 'extension': the root
     * config declares `extensions:` with the runtime manifest in an
     * `ext.config.yaml` (the App Management generation, e.g.
     * adobe/commerce-integration-starter-kit v4). The deploy path branches on
     * this and skips the ow-package rewrite — isolation comes from the
     * workspace, not package renaming.
     */
    layout?: 'standalone' | 'extension';
    /**
     * Post-deploy lifecycle. Absent = 'deploy-only' (deployed = done).
     * 'app-management': the app must also be installed/associated with a
     * Commerce instance through its own generated REST API (POST
     * /installation, /association — see the plan at
     * .rptc/plans/app-management-support/) before events flow; deploy alone
     * leaves it dormant.
     */
    lifecycle?: 'deploy-only' | 'app-management';
    /**
     * Node.js MAJOR version this app's install/build/deploy must run under
     * (e.g. `"24"`). The add door ensures it via fnm before installing —
     * measured 2026-08-27: the starter kit ships `.npmrc engine-strict` with
     * `engines: node ^24.0.0`, so npm under an older node refuses outright.
     * The graphical prerequisites step cannot know this (integrations are
     * selected after it runs, and the dashboard/MCP add paths never pass it),
     * so the add door is the one chokepoint every path shares. Omitted = the
     * executor's default node.
     */
    nodeVersion?: string;
    /**
     * A blank/starter app (the "build custom" custom-app path), NOT a
     * finished pre-built integration. Excluded from the catalog gallery and
     * reached via the kind picker's "Build custom" card instead.
     */
    blank?: boolean;
    /**
     * A SEED: scaffolding a custom app starts from (the Commerce integration
     * starter kit), NOT a finished pre-built integration. Owner decision
     * 2026-08-27: "It's a Custom App that's built using the starter kit."
     * Excluded from the pre-built gallery; offered as a starting point beside
     * "Blank" on the Build-custom naming stage instead. Seeded instances are
     * always NAMED clones of the seed's repo — capabilities survive via the
     * loader's source recognition.
     */
    seed?: boolean;
    /** Pre-built source repo (owner/repo/branch). */
    source: AddonSource;
    /** Backend ids this appBuilderComponent fits (omitted/empty = any backend). */
    compatibleBackends?: string[];
    /** Frontend ids this appBuilderComponent fits (omitted/empty = any frontend). */
    compatibleFrontends?: string[];
    /** Adobe API names to subscribe on the workspace (e.g. "GraphQLServiceSDK"). */
    requiredApis?: string[];
    /** Env-var names this appBuilderComponent provides to consumers (e.g. "MESH_ENDPOINT"). */
    providesEnvVars?: string[];
    /** The appBuilderComponent's own env-var schema (inputs it needs). */
    envSchema?: AppBuilderComponentEnvVar[];
    /**
     * Packages this appBuilderComponent is native to (auto-included + locked, like a
     * package-native block library). Mirrors block-libraries' nativeForPackages.
     */
    nativeForPackages?: string[];
    /**
     * Packages this appBuilderComponent is exclusive to. When set, the appBuilderComponent is
     * available ONLY for the listed packages. Mirrors block-libraries'
     * onlyForPackages.
     */
    onlyForPackages?: string[];
}

/** The app-builder-components.json catalog shape. */
export interface AppBuilderComponentsCatalog {
    version: string;
    appBuilderComponents: AppBuilderComponentCatalogEntry[];
}
