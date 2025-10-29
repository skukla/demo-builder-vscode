/**
 * Shared Logging Infrastructure
 *
 * Provides centralized logging capabilities across all features.
 * Includes debug logging, error tracking, and step-based logging.
 */

// Debug Logger (main logging system)
export { DebugLogger, initializeLogger, getLogger } from './debugLogger';

// Extended CommandResult for logging with context
export type { CommandResultWithContext } from './debugLogger';

// Logger (backward-compatible wrapper)
export { Logger } from './logger';

// LogLevel type (re-exported from canonical source)
export type { LogLevel } from '@/types/logger';

// Error Logger (error tracking with UI integration)
export { ErrorLogger } from './errorLogger';

// Step Logger (configuration-driven step logging)
export { StepLogger, StepLoggerContext, getStepLogger } from './stepLogger';
