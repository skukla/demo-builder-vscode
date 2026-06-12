/**
 * useDashboardActions Hook
 *
 * Extracts all action handlers from ProjectDashboardScreen.
 * Handles user interactions with the dashboard control panel.
 *
 * @module features/dashboard/ui/hooks/useDashboardActions
 */

import { useCallback, Dispatch, SetStateAction } from 'react';
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
    /** Deploy API Mesh */
    handleDeployMesh: () => void;
    /** Sync storefront — git push + Helix preview/publish (EDS projects only) */
    handleSyncStorefront: () => void;
    /** Refresh DA.live block library from component-definition.json (EDS projects only) */
    handleRefreshBlockLibrary: () => void;
    /** Open demo in browser (non-EDS projects) */
    handleOpenBrowser: () => void;
    /** Open live site in browser (EDS projects) */
    handleOpenLiveSite: () => void;
    /** Open DA.live for authoring (EDS projects) */
    handleOpenDaLive: () => void;
    /** Open configure screen */
    handleConfigure: () => void;
    /** Open Adobe Developer Console */
    handleOpenDevConsole: () => void;
    /** Delete the project */
    handleDeleteProject: () => void;
    /** Navigate back to projects list */
    handleNavigateBack: () => void;
    /** Re-authenticate with Adobe (after session expired) */
    handleReAuthenticate: () => void;
}

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

    const handleDeployMesh = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('deployMesh');
    }, [setIsTransitioning]);

    const handleSyncStorefront = useCallback(() => {
        webviewClient.postMessage('syncStorefront');
    }, []);

    const handleRefreshBlockLibrary = useCallback(() => {
        webviewClient.postMessage('refreshBlockLibrary');
    }, []);

    const handleOpenBrowser = useCallback(() => {
        if (isOpeningBrowser) return; // Prevent double-click
        setIsOpeningBrowser(true);
        webviewClient.postMessage('openBrowser');
        // Re-enable after delay (browser open is fast, this just prevents double-click)
        setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
    }, [isOpeningBrowser, setIsOpeningBrowser]);

    const handleOpenLiveSite = useCallback(() => {
        if (isOpeningBrowser || !edsLiveUrl) return; // Prevent double-click or missing URL
        setIsOpeningBrowser(true);
        webviewClient.postMessage('openLiveSite', { url: edsLiveUrl });
        // Re-enable after delay
        setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
    }, [isOpeningBrowser, setIsOpeningBrowser, edsLiveUrl]);

    const handleOpenDaLive = useCallback(() => {
        if (isOpeningBrowser || !edsDaLiveUrl) return; // Prevent double-click or missing URL
        setIsOpeningBrowser(true);
        webviewClient.postMessage('openDaLive', { url: edsDaLiveUrl });
        // Re-enable after delay
        setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
    }, [isOpeningBrowser, setIsOpeningBrowser, edsDaLiveUrl]);

    const handleConfigure = useCallback(() => {
        webviewClient.postMessage('configure');
    }, []);

    const handleOpenDevConsole = useCallback(() => {
        webviewClient.postMessage('openDevConsole');
    }, []);

    const handleDeleteProject = useCallback(() => {
        webviewClient.postMessage('deleteProject');
    }, []);

    const handleNavigateBack = useCallback(() => {
        webviewClient.postMessage('navigateBack');
    }, []);

    const handleReAuthenticate = useCallback(() => {
        webviewClient.postMessage('reAuthenticate');
    }, []);

    return {
        handleStartDemo,
        handleStopDemo,
        handleDeployMesh,
        handleSyncStorefront,
        handleRefreshBlockLibrary,
        handleOpenBrowser,
        handleOpenLiveSite,
        handleOpenDaLive,
        handleConfigure,
        handleOpenDevConsole,
        handleDeleteProject,
        handleNavigateBack,
        handleReAuthenticate,
    };
}
