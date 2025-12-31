/**
 * Prerequisites Feature Handler Map
 *
 * Maps message types to handler functions for prerequisite operations.
 * Replaces PrerequisitesHandlerRegistry class with simple object literal.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { defineHandlers } from '@/types/handlers';
import { handleCheckPrerequisites } from './checkHandler';
import { handleContinuePrerequisites } from './continueHandler';
import { handleInstallPrerequisite } from './installHandler';

/**
 * Prerequisites feature handler map
 * Maps message types to handler functions for prerequisite checking and installation
 */
export const prerequisitesHandlers = defineHandlers({
    'check-prerequisites': handleCheckPrerequisites,
    'continue-prerequisites': handleContinuePrerequisites,
    'install-prerequisite': handleInstallPrerequisite,
});
