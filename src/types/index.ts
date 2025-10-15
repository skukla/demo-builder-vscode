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
} from './messages';

// Note: MessageHandler from messages is for webview communication
// MessageHandler from handlers is for command handlers
// Import them explicitly when needed with:
//   import { MessageHandler } from './types/messages' (for webview)
//   import { MessageHandler } from './types/handlers' (for command handlers)

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