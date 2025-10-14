/**
 * Handler Type Definitions
 *
 * Provides type-safe interfaces for message handlers and handler context.
 * Replaces `any` types in HandlerContext with specific types.
 */

import * as vscode from 'vscode';
import { AuthenticationService } from '@/features/authentication';
import { ErrorLogger, StepLogger } from '../shared/logging';
import {
    PrerequisitesManager,
    PrerequisiteDefinition,
    PrerequisiteStatus,
} from '../utils/prerequisitesManager';
import { ProgressUnifier } from '../utils/progressUnifier';
import { WebviewCommunicationManager } from '@/shared/communication';
import { ComponentSelection, ComponentConfigs } from './components';
import { Logger } from './logger';
import { StateManager } from './state';

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
 * SimpleMessage - Simplified message structure for internal handlers
 * (Used by ComponentHandler which predates the full Message protocol)
 */
export interface SimpleMessage {
    type: string;
    payload?: unknown;
}

/**
 * IComponentHandler - Interface for component handling operations
 *
 * Defines the contract for component handlers without creating circular dependencies.
 * The actual implementation is in commands/componentHandler.ts
 */
export interface IComponentHandler {
    handleMessage(message: SimpleMessage, panel: vscode.WebviewPanel): Promise<void>;
    generateProjectConfig(
        frontend: string,
        backend: string,
        dependencies: string[]
    ): Promise<ProjectConfig>;
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
    // Managers
    prereqManager: PrerequisitesManager;
    authManager: AuthenticationService;
    componentHandler: IComponentHandler;
    errorLogger: ErrorLogger;
    progressUnifier: ProgressUnifier;
    stepLogger: StepLogger;

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
 */
export type HandlerRegistryMap = Map<string, MessageHandler>;
