/**
 * Component Handlers
 *
 * Handles component selection and management:
 * - update-component-selection: Update current component selection
 * - update-components-data: Update components data cache
 * - loadComponents: Load component definitions
 * - get-components-data: Fetch component data
 * - checkCompatibility: Check component compatibility
 * - loadDependencies: Load component dependencies
 * - loadPreset: Load preset configuration
 * - validateSelection: Validate component selection
 */

import { ComponentSelection } from '../../types/components';
import { HandlerContext } from './HandlerContext';

/**
 * update-component-selection - Update current component selection
 *
 * Stores the user's current component selection in context state.
 */
export async function handleUpdateComponentSelection(
    context: HandlerContext,
    payload: ComponentSelection,
): Promise<{ success: boolean }> {
    context.sharedState.currentComponentSelection = payload;
    context.logger.debug(`Updated component selection: ${payload.frontend || 'none'}/${payload.backend || 'none'} + ${payload.dependencies?.length || 0} deps + ${payload.services?.length || 0} services`);
    return { success: true };
}

/**
 * update-components-data - Update components data cache
 *
 * Stores the components data in context state.
 */
export async function handleUpdateComponentsData(
    context: HandlerContext,
    payload: import('../../types/components').ComponentConfigs,
): Promise<{ success: boolean }> {
    context.sharedState.componentsData = payload;
    context.logger.debug('Updated components data');
    return { success: true };
}

/**
 * loadComponents - Load component definitions
 *
 * Loads component definitions from the component registry.
 */
export async function handleLoadComponents(context: HandlerContext): Promise<{ success: boolean }> {
    try {
        await context.componentHandler.handleMessage({ type: 'loadComponents' }, context.panel!);
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to load components:', error as Error);
        return { success: false };
    }
}

/**
 * get-components-data - Fetch component data
 *
 * Retrieves component data from the component handler.
 */
export async function handleGetComponentsData(context: HandlerContext): Promise<{ success: boolean }> {
    try {
        await context.componentHandler.handleMessage({ type: 'get-components-data' }, context.panel!);
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to get components data:', error as Error);
        return { success: false };
    }
}

/**
 * checkCompatibility - Check component compatibility
 *
 * Validates that selected components are compatible with each other.
 */
export async function handleCheckCompatibility(
    context: HandlerContext,
    payload: ComponentSelection,
): Promise<{ success: boolean }> {
    try {
        await context.componentHandler.handleMessage({ type: 'checkCompatibility', payload }, context.panel!);
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to check compatibility:', error as Error);
        return { success: false };
    }
}

/**
 * loadDependencies - Load component dependencies
 *
 * Loads dependencies for the selected components.
 */
export async function handleLoadDependencies(
    context: HandlerContext,
    payload: ComponentSelection,
): Promise<{ success: boolean }> {
    try {
        await context.componentHandler.handleMessage({ type: 'loadDependencies', payload }, context.panel!);
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to load dependencies:', error as Error);
        return { success: false };
    }
}

/**
 * loadPreset - Load preset configuration
 *
 * Loads a preset configuration of components.
 */
export async function handleLoadPreset(
    context: HandlerContext,
    payload: { presetId: string },
): Promise<{ success: boolean }> {
    try {
        await context.componentHandler.handleMessage({ type: 'loadPreset', payload }, context.panel!);
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to load preset:', error as Error);
        return { success: false };
    }
}

/**
 * validateSelection - Validate component selection
 *
 * Validates the current component selection is valid.
 */
export async function handleValidateSelection(
    context: HandlerContext,
    payload: ComponentSelection,
): Promise<{ success: boolean }> {
    try {
        await context.componentHandler.handleMessage({ type: 'validateSelection', payload }, context.panel!);
        return { success: true };
    } catch (error) {
        context.logger.error('Failed to validate selection:', error as Error);
        return { success: false };
    }
}
