/**
 * Prerequisites HandlerRegistry
 *
 * Central message dispatcher for prerequisites message handlers.
 * Maps message types to handler functions for prerequisite checking and installation.
 */

import { MessageHandler } from '@/commands/handlers/HandlerContext';
import { BaseHandlerRegistry } from '@/core/base';
import { handleCheckPrerequisites } from './checkHandler';
import { handleContinuePrerequisites } from './continueHandler';
import { handleInstallPrerequisite } from './installHandler';

/**
 * PrerequisitesHandlerRegistry class
 *
 * Provides centralized registration and dispatching of prerequisites message handlers.
 */
export class PrerequisitesHandlerRegistry extends BaseHandlerRegistry {
    /**
     * Register all prerequisites message handlers
     */
    protected registerHandlers(): void {
        this.handlers.set('check-prerequisites', handleCheckPrerequisites as MessageHandler);
        this.handlers.set('continue-prerequisites', handleContinuePrerequisites as MessageHandler);
        this.handlers.set('install-prerequisite', handleInstallPrerequisite as MessageHandler);
    }
}
