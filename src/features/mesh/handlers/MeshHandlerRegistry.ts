/**
 * Mesh HandlerRegistry
 *
 * Central message dispatcher for API Mesh message handlers.
 * Maps message types to handler functions for mesh operations.
 */

import { MessageHandler } from '@/commands/handlers/HandlerContext';
import { BaseHandlerRegistry } from '@/core/base';
import { handleCheckApiMesh } from './checkHandler';
import { handleCreateApiMesh } from './createHandler';
import { handleDeleteApiMesh } from './deleteHandler';

/**
 * MeshHandlerRegistry class
 *
 * Provides centralized registration and dispatching of mesh message handlers.
 */
export class MeshHandlerRegistry extends BaseHandlerRegistry {
    /**
     * Register all mesh message handlers
     */
    protected registerHandlers(): void {
        this.handlers.set('check-api-mesh', handleCheckApiMesh as MessageHandler);
        this.handlers.set('create-api-mesh', handleCreateApiMesh as MessageHandler);
        this.handlers.set('delete-api-mesh', handleDeleteApiMesh as MessageHandler);
    }
}
