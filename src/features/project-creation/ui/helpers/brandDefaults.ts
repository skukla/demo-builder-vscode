/**
 * Brand Defaults
 *
 * Utility functions for applying brand configuration defaults to wizard state.
 * Used when a user selects a brand to pre-populate store codes and other config.
 */

import type { Brand } from '@/types/brands';
import type { WizardState } from '@/types/webview';

/**
 * Apply brand configuration defaults to wizard state
 *
 * Takes the current wizard state and applies the brand's configDefaults
 * to the componentConfigs under the frontend component ID. Returns unchanged
 * state if no frontend is selected or if the brand has no configDefaults.
 *
 * @param state - Current wizard state
 * @param brand - The brand definition with configDefaults
 * @returns New state with brand defaults applied to componentConfigs
 */
export function applyBrandDefaults(state: WizardState, brand: Brand): WizardState {
    const frontendId = state.components?.frontend;

    // If no frontend selected, return state unchanged
    if (!frontendId) {
        return state;
    }

    const configDefaults = brand.configDefaults || {};

    // If brand has no config defaults, return state unchanged
    if (Object.keys(configDefaults).length === 0) {
        return state;
    }

    // Apply brand defaults under the frontend component ID
    return {
        ...state,
        componentConfigs: {
            ...state.componentConfigs,
            [frontendId]: {
                ...state.componentConfigs?.[frontendId],
                ...configDefaults,
            },
        },
    };
}
