/**
 * Handler Context - Type definitions for message handlers
 *
 * Re-exports comprehensive type definitions from src/types/handlers.ts
 * to maintain backward compatibility while eliminating all `any` types.
 *
 * Phase 05: Type Safety Improvements
 */

// Re-export all handler types from the centralized types module
export {
    PrerequisiteCheckState,
    ApiServicesConfig,
    SharedState,
    HandlerContext,
    MessageHandler,
    HandlerResponse,
    HandlerRegistryMap as HandlerRegistry,
} from '@/types/handlers';

// Re-export prerequisite types from PrerequisitesManager
export {
    PrerequisiteDefinition,
    PrerequisiteStatus,
} from '@/features/prerequisites/services/PrerequisitesManager';
