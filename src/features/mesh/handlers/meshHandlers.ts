/**
 * Mesh Feature Handler Map
 *
 * Maps message types to handler functions for API Mesh operations.
 * Replaces MeshHandlerRegistry class with simple object literal.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { handleCheckApiMesh } from './checkHandler';
import { handleDeleteApiMesh } from './deleteHandler';
import { handleDeployApiMesh } from './deployHandler';
import { handleEnsureMeshApiSubscribed } from './subscribeHandler';
import { defineHandlers } from '@/types/handlers';

/**
 * Mesh feature handler map
 * Maps message types to handler functions for API Mesh operations
 */
export const meshHandlers = defineHandlers({
    'check-api-mesh': handleCheckApiMesh,
    'delete-api-mesh': handleDeleteApiMesh,
    'deploy-api-mesh': handleDeployApiMesh,
    'ensure-mesh-api-subscribed': handleEnsureMeshApiSubscribed,
});
