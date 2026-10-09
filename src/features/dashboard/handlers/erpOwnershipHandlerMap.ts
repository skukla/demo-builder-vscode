/**
 * The handlers that decide which products each ERP owns, as one group of the dashboard's map:
 * what "Add another ERP" offers (AB-64), "Assign products" on an ERP's card and its undo, and
 * the attribute-set fix the erp-attributes setup check offers and its undo (AB-74).
 *
 * Spread into `dashboardHandlers`, which is at its size limit; the group is one job.
 *
 * @module features/dashboard/handlers/erpOwnershipHandlerMap
 */

import {
    handleAssignErpProducts,
    handleGetErpAssignOptions,
    handleUndoErpAssignment,
} from './erpAssignHandlers';
import {
    handleAddErpOwnerToAttributeSets,
    handleRemoveErpOwnerFromAttributeSets,
} from './erpOwnerSetsHandlers';
import { handleGetErpOwnershipOptions } from './erpOwnershipHandler';

export const erpOwnershipHandlerMap = {
    // What its dialog offers for "Which products belong to this ERP?" (AB-64): a read.
    getErpOwnershipOptions: handleGetErpOwnershipOptions,
    // "Assign products" on an ERP's card, and its undo (AB-74).
    getErpAssignOptions: handleGetErpAssignOptions,
    assignErpProducts: handleAssignErpProducts,
    undoErpAssignment: handleUndoErpAssignment,
    // erp_owner into every attribute set the products use, and out again (AB-74).
    addErpOwnerToAttributeSets: handleAddErpOwnerToAttributeSets,
    removeErpOwnerFromAttributeSets: handleRemoveErpOwnerFromAttributeSets,
};
