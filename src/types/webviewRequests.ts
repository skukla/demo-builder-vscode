/**
 * Webview REQUEST payloads — the wire shapes for messages a webview sends TO
 * the extension (the request direction). The push direction lives in
 * `./webviewPayloads`; same rules apply here:
 *
 * - ONE declaration per channel, imported by BOTH the sender (webview) and
 *   the handler (extension), so drift fails the build instead of the feature.
 * - This module must NEVER import `vscode` — it compiles into the browser
 *   bundles.
 * - Types state the WIRE truth: `null` stays `null`, required means the
 *   sender always includes it; each side converts at its own edge.
 *
 * @module types/webviewRequests
 */

import type { AdobeConfig } from './base';
import type { CustomBlockLibrary } from './blockLibraries';
import type { CommerceStoreStructure } from './commerceStore';
import type { ComponentConfigs } from './components';

/**
 * Frontend source from template (same shape as TemplateSource)
 */
export interface FrontendSource {
    type: string;
    url: string;
    branch: string;
    gitOptions?: {
        shallow?: boolean;
    };
}

/**
 * `create-project` — the full project-creation request. Built by the
 * wizard's `buildProjectConfig` (and the MCP create_project tool),
 * consumed by `executeProjectCreation`.
 */
export interface ProjectCreationConfig {
    /** The SLUG — folder name and dedupe key. */
    projectName: string;
    /** What the user typed. Absent for a project with no title set. */
    projectTitle?: string;
    adobe?: AdobeConfig;
    components?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        integrations?: string[];
        appBuilder?: string[];
    };
    componentConfigs?: ComponentConfigs;
    /** The discovered Commerce store hierarchy (names for the chosen codes). */
    commerceStoreStructure?: CommerceStoreStructure;
    apiMesh?: {
        meshId?: string;
        endpoint?: string;
        meshStatus?: string;
        workspace?: string;
    };
    // For detecting same-workspace imports to skip mesh deployment
    importedWorkspaceId?: string;
    importedMeshEndpoint?: string;
    // Package/Stack selections
    selectedPackage?: string;
    datapack?: { name: string; version: string };
    selectedStack?: string;
    // Selected App Builder integration ids (Model B deploy) + custom GitHub sources
    selectedAppBuilderComponents?: string[];
    appBuilderComponentSources?: Record<
        string,
        { owner: string; repo: string; branch?: string; name?: string }
    >;
    // Free Console API picks (union across integrations) — persisted on the Project
    // so Phase 3b's subscribe union covers them. LEGACY: derived from the keyed
    // record below, which is the durable, attributed form.
    additionalConsoleApis?: string[];
    // The same picks keyed by integration id — what resolveDesiredApis unions.
    componentApiPicks?: Record<string, string[]>;
    // Selected optional addons (e.g., ['adobe-commerce-aco'])
    selectedAddons?: string[];
    // Selected block library IDs (e.g., ['isle5', 'demo-team-blocks'])
    selectedBlockLibraries?: string[];
    // Custom block libraries added by URL
    customBlockLibraries?: CustomBlockLibrary[];
    // Frontend source from template (templates are source of truth for repos)
    frontendSource?: FrontendSource;
    // Edit mode: re-use existing project directory (editProjectPath presence signals edit mode)
    editProjectPath?: string;
    // EDS-specific configuration (for Edge Delivery Services stacks)
    edsConfig?: {
        repoName: string;
        repoMode: 'new' | 'existing';
        existingRepo?: string;
        resetToTemplate?: boolean;
        daLiveOrg: string;
        daLiveSite: string;
        accsEndpoint?: string;
        githubOwner?: string;
        isPrivate?: boolean;
        skipContent?: boolean;
        skipTools?: boolean;
        // Template source repo (from frontendSource) for GitHub reset operations
        templateOwner?: string;
        templateRepo?: string;
        // DA.live content source (explicit config, not derived from GitHub)
        contentSource?: {
            org: string;
            site: string;
            indexPath?: string;
        };
        // Second content source for the account chrome (hybrid packages).
        accountContentSource?: {
            org: string;
            site: string;
        };
        // Preflight completion fields (set by StorefrontSetupStep)
        preflightComplete?: boolean;
        repoUrl?: string;
        // Note: previewUrl/liveUrl not stored - derived from githubRepo by typeGuards
        // Patch IDs to apply during reset (from demo-packages.json)
        patches?: string[];
        // Content patch IDs to apply during DA.live content copy
        contentPatches?: string[];
        // External source for content patches (from demo-packages.json)
        contentPatchSource?: {
            owner: string;
            repo: string;
            path: string;
        };
        // Code patch IDs to apply (canonical + block) — Step 5 populates these.
        codePatches?: string[];
        // External source for code patches (e.g., skukla/eds-demo-patches/citisignal).
        // When set, the storefront is "thin-layer": `lastSyncedCommit` records the
        // verified canonical LKG SHA (per ADR-006 D2) rather than the template
        // repo's `main` HEAD, so "is there an update?" means "did the LKG pointer
        // advance?" not "is canonical main ahead of where we created?".
        codePatchSource?: {
            owner: string;
            repo: string;
            path: string;
            /** Per-ledger LKG file when the ledger tracks a non-default canonical
             *  (e.g., b2b's B2B template). Omitted for ledgers sharing the
             *  default root `last-known-good`. */
            lkgFile?: string;
        };
    };
}
