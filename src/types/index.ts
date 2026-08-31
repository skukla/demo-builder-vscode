// ===== Re-export base types =====
// Core types moved to base.ts to break circular dependencies
// Exclude ServiceDefinition to avoid conflict with enhanced version in components.ts
export {
    Project,
    CustomIconPaths,
    ComponentInstance,
    AuthoringExperience,
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

// Prerequisites installation-step shapes (shared with core's progress engine)
export * from './prerequisites';

// State management types
export * from './state';

// Message protocol: the transport envelope only. Per-channel payload
// contracts live in ./webviewPayloads and ./webviewRequests. (The old
// MessageType/MessagePayload fake-constraint surface was deleted 2026-08-22 —
// nothing consumed it.)
export { Message, PendingRequest } from './messages';

// Component types (enhanced) - includes enhanced ServiceDefinition
export * from './components';

// Handler types (explicit export to avoid conflicts)
export {
    PrerequisiteCheckState,
    ApiServicesConfig,
    SharedState,
    HandlerContext,
    HandlerResponse,
} from './handlers';

// Type guards - Import directly from './typeGuards' when needed to avoid circular dependency
// export * from './typeGuards';

// enums.ts deleted 2026-08-21: its MeshStatus enum spoke a retired dialect
// ('not_deployed'/'stale') and, like ComponentStatusEnum, had ZERO consumers
// beyond its own test. The live MeshStatus union lives in webviewPayloads.

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
} from '@/core/errors';

// Stack types (frontend + backend architecture combinations)
export * from './stacks';

// Demo package types (unified packages + storefronts)
export * from './demoPackages';
