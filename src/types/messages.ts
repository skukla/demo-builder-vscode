/**
 * Message Protocol Type Definitions
 *
 * Provides type-safe interfaces for extension ↔ webview communication.
 * Replaces `any` types in message handlers with specific payload types.
 */

/**
 * MessageType - All valid message types in the extension
 */
export type MessageType =
    // Lifecycle messages
    | 'ready'
    | 'cancel'
    | 'cancel-project-creation'
    | 'cancel-mesh-creation'
    | 'cancel-auth-polling'
    | 'openProject'
    | 'browseFiles'
    | 'log'

    // Prerequisites messages
    | 'check-prerequisites'
    | 'continue-prerequisites'
    | 'install-prerequisite'

    // Authentication messages
    | 'check-auth'
    | 'authenticate'
    | 'ensure-org-selected'

    // Project messages
    | 'get-projects'
    | 'select-project'
    | 'check-project-apis'
    | 'project-selected' // UI-only selection

    // Workspace messages
    | 'get-workspaces'
    | 'select-workspace'
    | 'workspace-selected' // UI-only selection

    // Component messages
    | 'update-component-selection'
    | 'update-components-data'
    | 'loadComponents'
    | 'get-components-data'
    | 'checkCompatibility'
    | 'loadDependencies'
    | 'loadPreset'
    | 'validateSelection'

    // API Mesh messages
    | 'check-api-mesh'
    | 'create-api-mesh'
    | 'delete-api-mesh'
    | 'check-mesh-status-async'

    // Project creation messages
    | 'create-project'
    | 'validate'

    // Dashboard messages
    | 'toggle-logs'
    | 'open-component-file'

    // Generic
    | 'continue-step'
    | string; // Allow custom message types

/**
 * MessagePayload - Union type of all possible message payloads
 */
export type MessagePayload =
    | PrerequisitePayload
    | AuthPayload
    | ProjectPayload
    | WorkspacePayload
    | ComponentPayload
    | MeshPayload
    | CreationPayload
    | DashboardPayload
    | GenericPayload;

/**
 * MessageResponse - Standard response structure
 */
export interface MessageResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    [key: string]: unknown;
}

// ===== Payload Type Definitions =====

/**
 * PrerequisitePayload - Prerequisites-related payloads
 */
export interface PrerequisitePayload {
    prereqId?: string;
    version?: string;
    nodeVersion?: string;
}

/**
 * AuthPayload - Authentication-related payloads
 */
export interface AuthPayload {
    force?: boolean;
    orgId?: string;
    orgCode?: string;
}

/**
 * ProjectPayload - Adobe project-related payloads
 */
export interface ProjectPayload {
    orgId?: string;
    projectId?: string;
    project?: {
        id: string;
        name: string;
        title?: string;
        description?: string;
        org_id?: number;
    };
}

/**
 * WorkspacePayload - Adobe workspace-related payloads
 */
export interface WorkspacePayload {
    projectId?: string;
    workspaceId?: string;
    workspace?: {
        id: string;
        name: string;
        title?: string;
    };
}

/**
 * ComponentPayload - Component-related payloads
 */
export interface ComponentPayload {
    componentId?: string;
    category?: 'frontend' | 'backend' | 'dependencies' | 'externalSystems' | 'appBuilder';
    selection?: {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        externalSystems?: string[];
        appBuilder?: string[];
    };
    presetId?: string;
    components?: Record<string, unknown>;
}

/**
 * MeshPayload - API Mesh-related payloads
 */
export interface MeshPayload {
    workspaceId?: string;
    meshId?: string;
    config?: Record<string, unknown>;
}

/**
 * CreationPayload - Project creation-related payloads
 */
export interface CreationPayload {
    projectName?: string;
    template?: string;
    components?: Record<string, unknown>;
    configs?: Record<string, unknown>;
}

/**
 * DashboardPayload - Dashboard-related payloads
 */
export interface DashboardPayload {
    action?: 'start' | 'stop' | 'deploy' | 'configure';
    componentId?: string;
    filePath?: string;
}

/**
 * GenericPayload - Generic payload for unknown messages
 */
export type GenericPayload = Record<string, unknown>;

/**
 * Message - Complete message structure with ID and metadata
 */
export interface Message<T = MessagePayload> {
    id: string;
    type: MessageType;
    payload?: T;
    timestamp: number;
    isResponse?: boolean;
    responseToId?: string;
    expectsResponse?: boolean;
    error?: string;
}

/**
 * MessageHandler - Type-safe message handler function
 */
export type MessageHandler<P = MessagePayload, R = MessageResponse> = (
    payload: P
) => Promise<R> | R;

/**
 * PendingRequest - Pending request awaiting response
 */
export interface PendingRequest<T = unknown> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    retryCount: number;
    message: Message;
}
