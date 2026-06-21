/**
 * Deployable Catalog Types (Step 03)
 *
 * The declarative catalog of pre-built deployables (deployables.json), mirroring
 * the block-libraries type-file. Each entry declares its kind, source repo,
 * backend/frontend compatibility, required Adobe APIs, provided env vars, and
 * its OWN env schema (the data backbone for D2's selection/config UX).
 */

import type { DeployableKind } from './base';
import type { AddonSource } from './demoPackages';

/** A single env-var a deployable needs or provides, with collection metadata. */
export interface DeployableEnvVar {
    /** Env-var name (e.g. "MESH_ENDPOINT", "ERP_API_KEY"). */
    name: string;
    /** `secret` → masked input + SecretStorage; `text` → Configure UI → .env. */
    type: 'text' | 'secret';
    /** Human-readable label for the collection UI. */
    label: string;
    /** Derived from another known value (e.g. Connect-Commerce backend config). */
    derivedFrom?: string;
    /** Provided by another deployable that declares it in providesEnvVars. */
    providedBy?: string;
}

/** A pre-built deployable catalog entry. */
export interface DeployableCatalogEntry {
    id: string;
    name: string;
    description: string;
    kind: DeployableKind;
    /** Pre-built source repo (owner/repo/branch). */
    source: AddonSource;
    /** Backend ids this deployable fits (omitted/empty = any backend). */
    compatibleBackends?: string[];
    /** Frontend ids this deployable fits (omitted/empty = any frontend). */
    compatibleFrontends?: string[];
    /** Adobe API names to subscribe on the workspace (e.g. "GraphQLServiceSDK"). */
    requiredApis?: string[];
    /** Env-var names this deployable provides to consumers (e.g. "MESH_ENDPOINT"). */
    providesEnvVars?: string[];
    /** The deployable's own env-var schema (inputs it needs). */
    envSchema?: DeployableEnvVar[];
    /**
     * Packages this deployable is native to (auto-included + locked, like a
     * package-native block library). Mirrors block-libraries' nativeForPackages.
     */
    nativeForPackages?: string[];
    /**
     * Packages this deployable is exclusive to. When set, the deployable is
     * available ONLY for the listed packages. Mirrors block-libraries'
     * onlyForPackages.
     */
    onlyForPackages?: string[];
}

/** The deployables.json catalog shape. */
export interface DeployablesCatalog {
    version: string;
    deployables: DeployableCatalogEntry[];
}

/** A user-provided deployable from a GitHub URL (custom-URL acquisition mode). */
export interface CustomDeployable {
    /** User-provided display name (pre-filled from repo name). */
    name: string;
    /** Deployable kind. */
    kind: DeployableKind;
    /** GitHub source (owner, repo, branch). */
    source: AddonSource;
}
