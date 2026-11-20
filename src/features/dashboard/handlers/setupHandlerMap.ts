/**
 * The demo setup handlers, as one group of the dashboard's map: the checklist (AB-26x:
 * the saved steps, marking one, the checks Demo Builder runs itself), the demo setup's Apply
 * and its undo (AB-77), the one settings write outside a catalog step, and the project's
 * Finish Setup steps (PL-101), which the same guide shows. Spread into
 * `dashboardHandlers`, which is at its size limit; the group is one job.
 *
 * @module features/dashboard/handlers/setupHandlerMap
 */

import {
    handleCheckFinishSetupSteps,
    handleGetFinishSetup,
    handlePrepareFinishSetupChecks,
    handleSetFinishSetupStep,
} from './finishSetupHandlers';
import {
    handleCheckSetupSteps,
    handleGetSetupChecklist,
    handlePrepareSetupChecks,
    handleSetSetupStep,
} from './setupChecklistHandlers';
import {
    handlePrepareCommerceStore,
    handleSetCommerceConfig,
    handleUndoCommerceStorePreparation,
} from './storePreparationHandlers';

export const setupHandlerMap = {
    getSetupChecklist: handleGetSetupChecklist,
    setSetupStep: handleSetSetupStep,
    checkSetupSteps: handleCheckSetupSteps,
    prepareSetupChecks: handlePrepareSetupChecks,
    prepareCommerceStore: handlePrepareCommerceStore,
    undoCommerceStorePreparation: handleUndoCommerceStorePreparation,
    setCommerceConfig: handleSetCommerceConfig,
    // The project's Finish Setup steps (PL-101): what a run left, in the same guide.
    getFinishSetup: handleGetFinishSetup,
    setFinishSetupStep: handleSetFinishSetupStep,
    checkFinishSetupSteps: handleCheckFinishSetupSteps,
    prepareFinishSetupChecks: handlePrepareFinishSetupChecks,
};
