/**
 * EDS Helpers — the public surface for EDS handler helpers.
 *
 * This file used to hold all of it: 1200 lines carrying six unrelated reasons
 * to change. The implementations now live in the modules re-exported below,
 * one responsibility each. This barrel stays because ~100 files import from
 * `edsHelpers` and 45 test suites mock this specifier — the module path IS the
 * public API, and moving code is not a reason to break it.
 *
 * **New code belongs in the specialized module, never here.** A helper added
 * to this file rather than to its module rebuilds the god file behind a barrel
 * that looks tidy. There is nothing to add to: this file declares no symbols.
 *
 * | Module | Owns |
 * |---|---|
 * | `edsServiceCache` | cached GitHub + DA.live service instances |
 * | `daLiveAuthPrompt` | token validation and the sign-in flow |
 * | `byomOverlay` | overlay URL resolution and its failure messages |
 * | `authoringExperience` | which AEM authoring experience a project uses |
 * | `blockLibraryPublish` | publishing the block library and verifying it |
 * | `daLiveSiteConfig` | writes to a site's own DA.live config |
 *
 * @module features/eds/handlers/edsHelpers
 */

export {
    type GitHubServices,
    getGitHubServices,
    tryCreateDaLiveTokenProvider,
    getDaLiveAuthService,
    clearServiceCache,
} from './edsServiceCache';

export {
    type DaLiveTokenValidationResult,
    validateDaLiveToken,
    type QuickPickAuthResult,
    type DaLiveGuardResult,
    ensureDaLiveAuth,
    showDaLiveAuthQuickPick,
} from './daLiveAuthPrompt';

export {
    resolveByomOverlayUrl,
    appendOverlayParams,
    resolveByomOverlayConfig,
    BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE,
    BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE,
    byomRegistrationFailureMessage,
    BYOM_DISABLED_MESSAGE,
    BYOM_OVERLAY_URL_MISSING_MESSAGE,
    explainAbsentOverlay,
    addPdpCaveat,
    describeSmart404Skip,
    surfaceOverlayRegistrationFailure,
} from './byomOverlay';

export {
    resolveAuthoringExperience,
    resolveProjectAuthoringExperience,
    getEwCanvasBranch,
} from './authoringExperience';

export { publishLibraryPaths, verifyLibraryPreviewed } from './blockLibraryPublish';

export { applyDaLiveOrgConfigSettings, configureDaLivePermissions } from './daLiveSiteConfig';
