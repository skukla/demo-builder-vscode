// ===== Re-export base types =====
// Core types moved to base.ts to break circular dependencies
// Exclude ServiceDefinition to avoid conflict with enhanced version in components.ts
export {
    Project,
    CustomIconPaths,
    ComponentInstance,
    ComponentStatus,
    ProjectTemplate,
    ProjectStatus,
    AdobeConfig,
    CommerceConfig,
    ProcessInfo,
    ComponentDefinition,
    ComponentSource,
    ComponentDependencies,
    ComponentConfiguration,
    ConfigField,
    StateData,
    UpdateInfo,
    Prerequisites,
} from './base';

// ===== Re-export new type modules =====

// Logger types
export * from './logger';

// State management types
export * from './state';

// Message protocol types (explicit export to avoid conflicts)
export {
    MessageType,
    MessagePayload,
    MessageResponse,
    PrerequisitePayload,
    AuthPayload,
    ProjectPayload,
    WorkspacePayload,
    ComponentPayload,
    MeshPayload,
    CreationPayload,
    DashboardPayload,
    GenericPayload,
    Message,
    PendingRequest,
    WebviewMessageHandler,
} from './messages';

// Note: WebviewMessageHandler (from messages.ts) is for webview communication handlers
// MessageHandler (from handlers.ts) is for extension backend command handlers
// These are distinct types with different signatures

// Component types (enhanced) - includes enhanced ServiceDefinition
export * from './components';

// Handler types (explicit export to avoid conflicts)
export {
    PrerequisiteCheckState,
    ApiServicesConfig,
    SharedState,
    HandlerContext,
    HandlerResponse,
    HandlerRegistryMap,
} from './handlers';

// Type guards - Import directly from './typeGuards' when needed to avoid circular dependency
// export * from './typeGuards';

// Status enums for type safety
export { MeshStatus, ComponentStatusEnum } from './enums';

// Error codes for programmatic error handling
export {
    ErrorCode,
    ErrorCategory,
    getErrorCategory,
    isRecoverableError,
    getErrorTitle,
} from './errorCodes';

// Custom error classes
export {
    AppError,
    TimeoutError,
    NetworkError,
    AuthError,
    ValidationError,
    PrerequisiteError,
    MeshError,
    isAppError,
    isTimeout,
    isNetwork,
    isAuth,
    hasErrorCode,
    toAppError,
} from './errors';

// Stack types (frontend + backend architecture combinations)
export * from './stacks';

// Demo package types (unified packages + storefronts)
// Note: Replaces legacy brands + templates architecture
// See: .rptc/plans/demo-packages-simplification/
export * from './demoPackages';