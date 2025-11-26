/**
 * Shared State Management
 *
 * Provides project state persistence and management across all features.
 */

// State Manager (file-based persistent state storage)
export { StateManager } from './stateManager';

// Transient State Manager (VS Code Memento-based transient state)
export { TransientStateManager } from './transientStateManager';

// Project State Synchronization
export { updateFrontendState, getFrontendEnvVars } from './projectStateSync';
