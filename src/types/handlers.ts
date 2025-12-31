/**
 * Handler Type Definitions
 *
 * Provides type-safe interfaces for message handlers and handler context.
 * Replaces `any` types in HandlerContext with specific types.
 */

import * as vscode from 'vscode';
import { ComponentSelection, ComponentConfigs } from './components';
import { Logger } from './logger';
import { StateManager } from './state';
import { WebviewCommunicationManager } from '@/core/communication';
import { ErrorLogger, StepLogger } from '@/core/logging';
import { ProgressUnifier } from '@/core/utils/progressUnifier';
import { AuthenticationService } from '@/features/authentication';
import {
    PrerequisitesManager,
    PrerequisiteDefinition,
    PrerequisiteStatus,
} from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * ProjectConfig - Project configuration generated from component selections
 * (Legacy type - kept for backwards compatibility)
 */
export interface ProjectConfig {
    envVars: Record<string, string>;
    frontend: {
        id: string;
        port: number;
        nodeVersion: string;
    };
    backend: {
        id: string;
        configuration: Record<string, unknown>;
    };
    dependencies: {
        id: string;
        type: string;
        configuration: Record<string, unknown>;
    }[];
}

/**
 * PrerequisiteCheckState - State for a single prerequisite check including check result
 *
 * This is what's actually stored in currentPrerequisiteStates during prerequisite checking.
 */
export interface PrerequisiteCheckState {
    prereq: PrerequisiteDefinition;
    result: PrerequisiteStatus;
    nodeVersionStatus?: {
        version: string;
        component: string;
        installed: boolean;
    }[];
}

/**
 * ApiServicesConfig - API services configuration
 */
export interface ApiServicesConfig {
    services?: {
        apiMesh?: {
            detection?: {
                namePatterns?: string[];
                codes?: string[];
                codeNames?: string[];
            };
            enabled?: boolean;
            endpoint?: string;
            setupInstructions?: {
                step: string;
                details: string;
                important?: boolean;
                dynamicValues?: {
                    ALLOWED_DOMAINS?: boolean;
                    [key: string]: unknown;
                };
            }[];
            [key: string]: unknown;
        };
        [serviceId: string]: {
            enabled?: boolean;
            endpoint?: string;
            detection?: Record<string, unknown>;
            [key: string]: unknown;
        } | undefined;
    };
}

/**
 * SharedState - Mutable state shared across handlers
 *
 * This object is passed by reference, so changes made by handlers
 * are automatically visible to the main class. This eliminates the
 * need for manual state synchronization after handler calls.
 */
export interface SharedState {
    // Component selection and data
    currentComponentSelection?: ComponentSelection;
    componentsData?: ComponentConfigs;

    // Prerequisites tracking
    currentPrerequisites?: PrerequisiteDefinition[];
    currentPrerequisiteStates?: Map<number, PrerequisiteCheckState>;

    // Authentication state
    isAuthenticating: boolean;

    // Project creation control
    projectCreationAbortController?: AbortController;

    // Mesh lifecycle tracking
    meshCreatedForWorkspace?: string;
    meshExistedBeforeSession?: string;

    // API services configuration
    apiServicesConfig?: ApiServicesConfig;
}

/**
 * HandlerContext - Encapsulates all dependencies needed by message handlers
 *
 * This context object is passed to all handler functions, providing access to:
 * - Managers (prerequisites, auth, components, error, progress)
 * - Loggers (main logger, debug logger, step logger)
 * - VS Code integration (context, panel, state, communication)
 * - Shared state (passed by reference for automatic synchronization)
 */
export interface HandlerContext {
    // Managers (optional - not all handlers need all managers)
    prereqManager?: PrerequisitesManager;
    authManager?: AuthenticationService;
    errorLogger?: ErrorLogger;
    progressUnifier?: ProgressUnifier;
    stepLogger?: StepLogger;

    // Loggers
    logger: Logger;
    debugLogger: Logger;

    // VS Code integration
    context: vscode.ExtensionContext;
    panel: vscode.WebviewPanel | undefined;
    stateManager: StateManager;
    communicationManager: WebviewCommunicationManager | undefined;
    sendMessage: (type: string, data?: unknown) => Promise<void>;

    // Shared state (by reference - changes persist automatically)
    sharedState: SharedState;
}

/**
 * MessageHandler - Type definition for message handler functions
 *
 * All handlers follow this signature:
 * - Take context and optional payload
 * - Return Promise with success status and optional data/error
 */
export type MessageHandler<P = unknown, R = HandlerResponse> = (
    context: HandlerContext,
    payload?: P
) => Promise<R>;

/**
 * HandlerResponse - Standard handler response
 */
export interface HandlerResponse {
    success: boolean;
    data?: unknown;
    error?: string;
    message?: string;
    [key: string]: unknown;
}

/**
 * HandlerRegistry - Maps message types to handler functions
 * @deprecated Use HandlerMap (object literal) instead
 */
export type HandlerRegistryMap = Map<string, MessageHandler>;

/**
 * AnyMessageHandler - Permissive type for handler functions
 *
 * Allows handlers with specific payload types to be used in handler maps.
 * The payload is typed as `any` to allow specific handler implementations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMessageHandler = (context: HandlerContext, payload?: any) => Promise<any>;

/**
 * HandlerMap - Simple object literal mapping message types to handlers
 *
 * Replaces class-based handler registries with plain objects.
 * Provides the same functionality with less ceremony.
 *
 * Uses AnyMessageHandler to allow handlers with specific payload types.
 *
 * Usage:
 * ```typescript
 * export const myHandlers: HandlerMap = {
 *   'action-a': handleActionA,
 *   'action-b': handleActionB,
 * };
 * ```
 */
export type HandlerMap = Record<string, AnyMessageHandler>;

/**
 * Helper function to create typed handler maps
 * Provides compile-time validation without runtime overhead
 *
 * Usage:
 * ```typescript
 * export const myHandlers = defineHandlers({
 *   'action-a': handleActionA,
 *   'action-b': handleActionB,
 * });
 * ```
 */
export function defineHandlers<T extends HandlerMap>(handlers: T): T {
    return handlers;
}
