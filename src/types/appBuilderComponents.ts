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
    /**
     * `text` → the integration's Settings, stored in `componentConfigs[id]`;
     * `secret` → a masked field, stored in SecretStorage. Both reach the app only
     * through its deploy's process env.
     */
    type: 'text' | 'secret';
    /** Human-readable label for the collection UI. */
    label: string;
    /** Derived from another known value (e.g. Connect-Commerce backend config). */
    derivedFrom?: string;
    /** Provided by another appBuilderComponent that declares it in providesEnvVars. */
    providedBy?: string;
    /**
     * The value used when nobody typed one. A text var with a default is not
     * something the add door has to stop for: the app deploys with the default
     * and the integration's Settings let the SC change it later (the ERP's name).
     */
    default?: string;
}

/** One setting an SC can change, as the Settings modal shows it. */
export interface ComponentSettingField {
    name: string;
    label: string;
    type: 'text' | 'secret';
    /** A text setting's current value (typed, else the default). Never set for a secret. */
    value?: string;
    /** A secret setting: whether one is stored. The value itself never leaves SecretStorage. */
    isSet?: boolean;
    /** No default: the app cannot deploy until someone fills it in. */
    required: boolean;
}

/** A setting another component supplies, shown read-only ("ERP address, from ERP"). */
export interface ComponentConnectedSetting {
    name: string;
    label: string;
    /** The providing component's display name. */
    from: string;
    /** The provided value, once the provider is deployed. */
    value?: string;
}

/** What one component's Settings modal shows. */
export interface ComponentSettings {
    fields: ComponentSettingField[];
    connected: ComponentConnectedSetting[];
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
    /**
     * For `kind: 'system'` only: the id of the integration that brings this
     * system. Adding the integration adds and deploys the system first; in a
     * project the two are linked (`appBuilderComponentLinks`), and removing
     * either removes both (decision 2). The system is never offered alone.
     */
    boundTo?: string;
    /**
     * Set on a SECOND copy of a catalog entry (`demo-erp-2`): the entry it was made
     * from. Never written in the catalog JSON — `catalogEntryFor` sets it, and the
     * add persists it as the component's `catalogId`. Every "which kind is this"
     * question asks `entry.catalogId ?? entry.id`.
     */
    catalogId?: string;
    /**
     * kind 'system' only: what kind of system it is ("ERP"), shown as the badge
     * on its card. The SC names the system; the type says what it is.
     */
    systemType?: string;
    /**
     * The env var whose value NAMES this component's row (the ERP's row reads
     * "Acme ERP", or whatever the SC typed). Absent = the entry's `name`.
     */
    nameFromEnvVar?: string;
    /**
     * A screen this component serves from one of its own web actions, opened by
     * a link that carries a key Demo Builder generates (the ERP; see
     * `systemScreen.ts` for why it cannot use the static site).
     */
    screen?: {
        /** The web action that serves the page, e.g. "screen". */
        action: string;
        /** The deploy-time input that carries the key, e.g. "ERP_SCREEN_KEY". */
        keyEnvVar: string;
    };
    /**
     * kind 'system' only: the call that deletes the system's records (the ERP's
     * `POST admin/wipe`). Removal makes it before the undeploy, while the action
     * still exists: an undeploy removes code, not the workspace database, so
     * without it a removed system's records stay there with nothing left to
     * reach them.
     */
    wipe?: {
        /** The web action, e.g. "admin". */
        action: string;
        /** The path under it that wipes, POSTed with no body, e.g. "wipe". */
        path: string;
    };
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
