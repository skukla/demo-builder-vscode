/**
 * Shared State Management
 *
 * Provides project state persistence and management across all features.
 */

// State Manager (file-based persistent state storage)
export { StateManager } from './stateManager';

// Transient State Manager (VS Code Memento-based transient state)
export { TransientStateManager } from './transientStateManager';

// Session UI State (in-memory session-only state for UI toggles and preferences)
export { sessionUIState } from './sessionUIState';
export type { ViewMode } from './sessionUIState';

// Project State Synchronization
export { updateFrontendState, getFrontendEnvVars } from './projectStateSync';

// Extracted services (used internally by StateManager, exported for testing/direct use)
export { ProjectFileLoader } from './projectFileLoader';
export type { ProjectManifest } from './projectFileLoader';
export { ProjectConfigWriter } from './projectConfigWriter';
export { RecentProjectsManager } from './recentProjectsManager';
export type { RecentProject } from './recentProjectsManager';
export { ProjectDirectoryScanner } from './projectDirectoryScanner';
export type { ProjectSummary } from './projectDirectoryScanner';
