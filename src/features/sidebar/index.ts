/**
 * Sidebar Feature
 *
 * Provides contextual navigation for the Demo Builder sidebar.
 */

// Types
export type { SidebarContext, NavItem, WizardStep } from './types';

// Provider
export { SidebarProvider } from './providers/sidebarProvider';

// Handlers
export {
    handleNavigate,
    handleGetContext,
    handleSetContext,
} from './handlers/sidebarHandlers';
