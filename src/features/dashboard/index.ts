/**
 * Dashboard Feature
 *
 * Provides the project control panel with status monitoring,
 * log management, file browsing, and quick actions.
 *
 * Public API:
 * - ProjectDashboardWebviewCommand: Main dashboard view
 * - ConfigureProjectWebviewCommand: Project configuration view
 * - DashboardHandlerRegistry: Message handler registry
 *
 * Internal Services (not exported):
 * - services/dashboardStatusService: Status payload building, mesh deployment checks
 *
 * Phase 3.8: Migrated to modern BaseWebviewCommand pattern.
 */

// Commands
export { ProjectDashboardWebviewCommand } from './commands/showDashboard';
export { ConfigureProjectWebviewCommand } from './commands/configure';

// Handler Registry (only the registry, not individual handlers)
export { DashboardHandlerRegistry } from './handlers';

// Note: Individual handlers (handleReady, handleRequestStatus, etc.) are NOT exported.
// They are internal to the dashboard feature. Use DashboardHandlerRegistry for message dispatch.

// Note: UI Components (screens, hooks) are NOT exported here.
// They are imported directly by dashboard webview in the webpack bundle.
