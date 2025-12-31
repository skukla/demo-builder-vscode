/**
 * Dashboard Feature
 *
 * Provides the project control panel with status monitoring,
 * log management, file browsing, and quick actions.
 *
 * Public API:
 * - ProjectDashboardWebviewCommand: Main dashboard view
 * - ConfigureProjectWebviewCommand: Project configuration view
 * - dashboardHandlers: Handler map for dashboard messages
 *
 * Internal Services (not exported):
 * - services/dashboardStatusService: Status payload building, mesh deployment checks
 *
 * Phase 3.8: Migrated to modern BaseWebviewCommand pattern.
 * Step 3: Simplified to object literal handler maps.
 */

// Commands
export { ProjectDashboardWebviewCommand } from './commands/showDashboard';
export { ConfigureProjectWebviewCommand } from './commands/configure';

// Handler map (Step 3: Handler Registry Simplification)
export { dashboardHandlers } from './handlers';

// Note: Individual handlers (handleReady, handleRequestStatus, etc.) are NOT exported.
// They are internal to the dashboard feature. Use dashboardHandlers with dispatchHandler.

// Note: UI Components (screens, hooks) are NOT exported here.
// They are imported directly by dashboard webview in the webpack bundle.
