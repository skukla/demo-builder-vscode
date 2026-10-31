/**
 * useDashboardActions Hook
 *
 * Extracts all action handlers from ProjectDashboardScreen.
 * Handles user interactions with the dashboard control panel.
 *
 * @module features/dashboard/ui/hooks/useDashboardActions
 */

import { useCallback, useState, Dispatch, SetStateAction } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * Props for the useDashboardActions hook
 */
export interface UseDashboardActionsProps {
    /** Whether browser is currently opening (prevents double-click) */
    isOpeningBrowser: boolean;
    /** Setter for transitioning state */
    setIsTransitioning: Dispatch<SetStateAction<boolean>>;
    /** Setter for opening browser state */
    setIsOpeningBrowser: Dispatch<SetStateAction<boolean>>;
    /** Live URL for EDS projects (opens in browser) */
    edsLiveUrl?: string;
    /** DA.live authoring URL for EDS projects */
    edsDaLiveUrl?: string;
}

/**
 * Return type for the useDashboardActions hook
 */
export interface UseDashboardActionsReturn {
    /** Start the demo server */
    handleStartDemo: () => void;
    /** Stop the demo server */
    handleStopDemo: () => void;
    /**
     * Stop and start again — the fix for "Restart needed", a config change that
     * landed while the demo was running. Delegates the sequencing (and its
     * settle delay) to the extension rather than firing stop then start here.
     */
    handleRestartDemo: () => void;
    /** Sync storefront — git push + Helix preview/publish (EDS projects only) */
    /** Refresh DA.live block library from component-definition.json (EDS projects only) */
    /** Open demo in browser (non-EDS projects) */
    handleOpenBrowser: () => void;
    /** Open live site in browser (EDS projects) */
    handleOpenLiveSite: () => void;
    /** Open DA.live for authoring (EDS projects) */
    handleOpenDaLive: () => void;
    /** Open the Commerce admin panel (URL resolved backend-side) */
    handleOpenAdminPanel: () => void;
    /** Open configure screen */
    handleConfigure: () => void;
    /** Open the wizard in edit mode for the current project */
    handleEditProject: () => void;
    /** Open the bound AEM author in Assets View (URL resolved backend-side from the setting) */
    handleOpenAemAssets: () => void;
    /** Opens the Site access webview (EDS storefronts). */
    handleOpenSiteAccess: () => void;
    /** Delete the project */
    /** Republish DA.live content to CDN (EDS projects only) */
    /** Navigate back to projects list */
    handleNavigateBack: () => void;
    /** Re-authenticate with Adobe (after session expired) */
    handleReAuthenticate: () => void;
    /** Re-run the org check (and the other re-runnable status checks) — no sign-in */
    handleVerifyOrg: () => void;
    /** Forced Adobe account/org switch (after an org mismatch); resolves when the round-trip completes */
    handleSwitchOrg: () => Promise<void>;
    /**
     * The tile whose private Chrome window is opening, until the extension answers (once the window
     * is likely up): its icon is a spinner meanwhile (owner, 2026-10-31).
     */
    openingTile: OpeningTile;
}

/** Which tile is opening a private Chrome window, if one is. */
export type OpeningTile = 'live' | 'admin' | null;

/**
 * Hook to manage dashboard action handlers
 *
 * Extracts all action handlers from ProjectDashboardScreen for better
 * separation of concerns and testability.
 *
 * @param props - Hook configuration
 * @returns Object containing all action handlers
 */
export function useDashboardActions({
    isOpeningBrowser,
    setIsTransitioning,
    setIsOpeningBrowser,
    edsLiveUrl,
    edsDaLiveUrl,
}: UseDashboardActionsProps): UseDashboardActionsReturn {
    const handleStartDemo = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('startDemo');
    }, [setIsTransitioning]);

    const handleStopDemo = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('stopDemo');
    }, [setIsTransitioning]);

    const handleRestartDemo = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('restartDemo');
    }, [setIsTransitioning]);

    const handleOpenBrowser = useCallback(() => {
        if (isOpeningBrowser) return; // Prevent double-click
        setIsOpeningBrowser(true);
        webviewClient.postMessage('openBrowser');
        // Re-enable after delay (browser open is fast, this just prevents double-click)
        setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
    }, [isOpeningBrowser, setIsOpeningBrowser]);

    const [openingTile, setOpeningTile] = useState<OpeningTile>(null);
    /** Ask the extension to open a private window, the tile busy until it answers. */
    const openFromTile = useCallback((tile: Exclude<OpeningTile, null>, type: string, payload?: object): Promise<void> => {
        setOpeningTile(tile);
        return webviewClient
            .request(type, payload)
            .then(() => undefined, () => undefined)
            .finally(() => setOpeningTile(null));
    }, []);

    const handleOpenLiveSite = useCallback(() => {
        if (isOpeningBrowser || !edsLiveUrl) return; // Prevent double-click or missing URL
        setIsOpeningBrowser(true);
        // Asked, not posted: it answers once Chrome's window is likely up, and the tile shows a
        // spinner until then (owner, 2026-10-31).
        void openFromTile('live', 'openLiveSite', { url: edsLiveUrl }).finally(() => setIsOpeningBrowser(false));
    }, [isOpeningBrowser, setIsOpeningBrowser, edsLiveUrl, openFromTile]);

    const handleOpenDaLive = useCallback(() => {
        if (isOpeningBrowser || !edsDaLiveUrl) return; // Prevent double-click or missing URL
        setIsOpeningBrowser(true);
        webviewClient.postMessage('openDaLive', { url: edsDaLiveUrl });
        // Re-enable after delay
        setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
    }, [isOpeningBrowser, setIsOpeningBrowser, edsDaLiveUrl]);

    const handleOpenAdminPanel = useCallback(() => {
        if (openingTile === 'admin') return; // Prevent double-click
        void openFromTile('admin', 'openAdminPanel');
    }, [openingTile, openFromTile]);

    const handleConfigure = useCallback(() => {
        webviewClient.postMessage('configure');
    }, []);

    const handleEditProject = useCallback(() => {
        webviewClient.postMessage('editProject');
    }, []);

    const handleOpenAemAssets = useCallback(() => {
        webviewClient.postMessage('openAemAssets');
    }, []);

    const handleOpenSiteAccess = useCallback(() => {
        webviewClient.postMessage('openSiteAccess');
    }, []);

    const handleNavigateBack = useCallback(() => {
        webviewClient.postMessage('navigateBack');
    }, []);

    const handleReAuthenticate = useCallback(() => {
        webviewClient.postMessage('reAuthenticate');
    }, []);

    // A status request re-runs every re-runnable on-open check, the org check
    // included — the same path a switch or re-auth ends in, minus the sign-in.
    const handleVerifyOrg = useCallback(() => {
        webviewClient.postMessage('requestStatus');
    }, []);

    // Request (not fire-and-forget) so the caller gets a definitive completion
    // edge for the forced login + re-verify round-trip — used to drive the
    // banner's in-flight "Switching…" state across every outcome (success,
    // still-mismatched, cancelled, failed).
    const handleSwitchOrg = useCallback(async () => {
        await webviewClient.request('switchOrg');
    }, []);

    return {
        handleStartDemo,
        handleStopDemo,
        handleRestartDemo,
        handleOpenBrowser,
        handleOpenLiveSite,
        handleOpenDaLive,
        handleOpenAdminPanel,
        handleConfigure,
        handleEditProject,
        handleOpenAemAssets,
        handleOpenSiteAccess,
        handleNavigateBack,
        handleReAuthenticate,
        handleVerifyOrg,
        handleSwitchOrg,
        openingTile,
    };
}
