/**
 * EDS HandlerRegistry
 *
 * Central message dispatcher for EDS (Edge Delivery Services) message handlers.
 * Maps message types to handler functions for EDS operations.
 */

import { MessageHandler } from '@/commands/handlers/HandlerContext';
import { BaseHandlerRegistry } from '@/core/base';
import {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleVerifyGitHubRepo,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
    handleGetDaLiveSites,
    handleVerifyDaLiveOrg,
    handleValidateAccsCredentials,
    handleDaLiveOAuth,
} from './edsHandlers';

/**
 * EdsHandlerRegistry class
 *
 * Provides centralized registration and dispatching of EDS message handlers.
 */
export class EdsHandlerRegistry extends BaseHandlerRegistry {
    /**
     * Register all EDS message handlers
     */
    protected registerHandlers(): void {
        // GitHub handlers
        this.handlers.set('check-github-auth', handleCheckGitHubAuth as MessageHandler);
        this.handlers.set('github-oauth', handleGitHubOAuth as MessageHandler);
        this.handlers.set('github-change-account', handleGitHubChangeAccount as MessageHandler);
        this.handlers.set('get-github-repos', handleGetGitHubRepos as MessageHandler);
        this.handlers.set('verify-github-repo', handleVerifyGitHubRepo as MessageHandler);

        // DA.live handlers
        this.handlers.set('check-dalive-auth', handleCheckDaLiveAuth as MessageHandler);
        this.handlers.set('dalive-oauth', handleDaLiveOAuth as MessageHandler);
        this.handlers.set('open-dalive-login', handleOpenDaLiveLogin as MessageHandler);
        this.handlers.set('store-dalive-token', handleStoreDaLiveToken as MessageHandler);
        this.handlers.set('store-dalive-token-with-org', handleStoreDaLiveTokenWithOrg as MessageHandler);
        this.handlers.set('clear-dalive-auth', handleClearDaLiveAuth as MessageHandler);
        this.handlers.set('get-dalive-sites', handleGetDaLiveSites as MessageHandler);
        this.handlers.set('verify-dalive-org', handleVerifyDaLiveOrg as MessageHandler);

        // ACCS handlers
        this.handlers.set('validate-accs-credentials', handleValidateAccsCredentials as MessageHandler);
    }
}
