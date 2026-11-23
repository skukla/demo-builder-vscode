/**
 * The handlers that change which Adobe APIs a project's workspace credential holds, as one group
 * of the dashboard's map: the Console API picks (list_console_apis, add_console_apis,
 * set_console_apis) and the ACO ingestion credential Demo Builder makes in the same workspace
 * (PL-60). Spread into `dashboardHandlers`, which is at its size limit; the group is one job.
 *
 * @module features/dashboard/handlers/consoleApiHandlerMap
 */

import { handleRemoveAcoCredential, handleSetUpAcoCredential } from './acoCredentialHandlers';
import { handleAddConsoleApis, handleListConsoleApis, handleSetConsoleApis } from './consoleApiHandlers';

export const consoleApiHandlerMap = {
    listConsoleApis: handleListConsoleApis,
    addConsoleApis: handleAddConsoleApis,
    setConsoleApis: handleSetConsoleApis,
    // The project's ACO ingestion credential (PL-60): made in its workspace, never typed.
    setUpAcoCredential: handleSetUpAcoCredential,
    removeAcoCredential: handleRemoveAcoCredential,
};
