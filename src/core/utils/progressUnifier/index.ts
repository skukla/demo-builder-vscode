/**
 * Progress Unifier Module
 *
 * Provides unified progress tracking for install step execution.
 * Uses config-driven approach (Step 6 of over-engineering remediation).
 *
 * Note: Strategy pattern and helper classes (CommandResolver, ElapsedTimeTracker)
 * were removed in Step 8 cleanup. Logic is now inlined in ProgressUnifier.
 */

// Main orchestrator
export { ProgressUnifier, formatElapsedTime } from './ProgressUnifier';

// Types
export {
    IDateProvider,
    ITimerProvider,
    IProcessSpawner,
    UnifiedProgress,
    ProgressHandler,
    ExecutionContext,
} from './types';
