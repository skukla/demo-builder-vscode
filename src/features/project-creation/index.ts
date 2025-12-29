/**
 * Project Creation Feature
 *
 * Handles the project creation wizard, component selection,
 * project initialization, and component installation.
 *
 * Public API:
 * - CreateProjectWebviewCommand: Main wizard command
 * - ProjectCreationHandlerRegistry: Message handler registry for wizard
 * - Helper functions for project setup
 *
 * Internal Services (not exported):
 * - services/componentInstallationOrchestrator: Component cloning and installation
 * - services/meshSetupService: API Mesh configuration and deployment
 * - services/projectFinalizationService: Environment file generation and cleanup
 */

// Command
export { CreateProjectWebviewCommand } from './commands/createProject';

// Handler Registry (with backward-compatible alias)
export { ProjectCreationHandlerRegistry, HandlerRegistry } from './handlers/ProjectCreationHandlerRegistry';

// Helpers - Public API for cross-feature use
export { formatGroupName, generateComponentEnvFile } from './helpers';
export type { EnvGenerationConfig } from './helpers';

// Note: UI Components (steps, hooks) are NOT exported here.
// They are imported directly by WizardContainer.tsx in the webpack bundle
// to avoid mixing React/Node.js compilation contexts.
