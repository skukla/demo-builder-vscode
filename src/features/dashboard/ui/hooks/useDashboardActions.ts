/**
 * useDashboardActions Hook
 *
 * Extracts all action handlers from ProjectDashboardScreen.
 * Handles user interactions with the dashboard control panel.
 *
 * @module features/dashboard/ui/hooks/useDashboardActions
 */

import { useCallback, Dispatch, SetStateAction } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';

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
    /** Setter for logs hover suppression state */
    setIsLogsHoverSuppressed: Dispatch<SetStateAction<boolean>>;
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
    /** Re-authenticate with Adobe */
    handleReAuthenticate: () => void;
    /** View logs in output channel */
    handleViewLogs: () => void;
    /** Deploy API Mesh */
    handleDeployMesh: () => void;
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
    /** View components in file browser */
    handleViewComponents: () => void;
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
    setIsLogsHoverSuppressed,
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

    const handleReAuthenticate = useCallback(() => {
        webviewClient.postMessage('re-authenticate');
    }, []);

    const handleViewLogs = useCallback(() => {
        // Suppress hover styles during layout shift
        setIsLogsHoverSuppressed(true);
        (document.activeElement as HTMLElement)?.blur();
        webviewClient.postMessage('viewLogs');
        // Re-enable hover after layout stabilizes (SOP section 1: using TIMEOUTS constant)
        setTimeout(() => setIsLogsHoverSuppressed(false), TIMEOUTS.HOVER_SUPPRESSION_DELAY);
    }, [setIsLogsHoverSuppressed]);

    const handleDeployMesh = useCallback(() => {
        setIsTransitioning(true);
        webviewClient.postMessage('deployMesh');
    }, [setIsTransitioning]);

    const handleOpenBrowser = useCallback(() => {
        if (isOpeningBrowser) return; // Prevent double-click
        setIsOpeningBrowser(true);
        webviewClient.postMessage('openBrowser');
        // Re-enable after delay (browser open is fast, this just prevents double-click)
        setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
    }, [isOpeningBrowser, setIsOpeningBrowser]);

    const handleOpenLiveSite = useCallback(() => {
        console.log('[Dashboard] handleOpenLiveSite called, edsLiveUrl:', edsLiveUrl);
        if (isOpeningBrowser || !edsLiveUrl) {
            console.warn('[Dashboard] Cannot open live site - isOpeningBrowser:', isOpeningBrowser, 'edsLiveUrl:', edsLiveUrl);
            return;
        }
        setIsOpeningBrowser(true);
        webviewClient.postMessage('openLiveSite', { url: edsLiveUrl });
        // Re-enable after delay
        setTimeout(() => setIsOpeningBrowser(false), FRONTEND_TIMEOUTS.DOUBLE_CLICK_PREVENTION);
    }, [isOpeningBrowser, setIsOpeningBrowser, edsLiveUrl]);

    const handleOpenDaLive = useCallback(() => {
        console.log('[Dashboard] handleOpenDaLive called, edsDaLiveUrl:', edsDaLiveUrl);
        if (isOpeningBrowser || !edsDaLiveUrl) {
            console.warn('[Dashboard] Cannot open DA.live - isOpeningBrowser:', isOpeningBrowser, 'edsDaLiveUrl:', edsDaLiveUrl);
            return;
        }
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

    const handleViewComponents = useCallback(() => {
        webviewClient.postMessage('viewComponents');
    }, []);

    return {
        handleStartDemo,
        handleStopDemo,
        handleReAuthenticate,
        handleViewLogs,
        handleDeployMesh,
        handleOpenBrowser,
        handleOpenLiveSite,
        handleOpenDaLive,
        handleConfigure,
        handleOpenDevConsole,
        handleDeleteProject,
        handleNavigateBack,
        handleViewComponents,
    };
}
