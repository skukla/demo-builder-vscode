/**
 * Shared State Management
 *
 * Provides project state persistence and management across all features.
 */

// State Manager (persistent state storage)
export { StateManager } from './stateManager';

// Project State Synchronization
export { updateFrontendState, getFrontendEnvVars } from './projectStateSync';
