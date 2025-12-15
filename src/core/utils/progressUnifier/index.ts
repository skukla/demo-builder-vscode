/**
 * Progress Unifier Module
 *
 * Provides unified progress tracking for install step execution.
 * Uses strategy pattern for different progress tracking approaches.
 */

// Main orchestrator
export { ProgressUnifier } from './ProgressUnifier';

// Types
export {
    IDateProvider,
    ITimerProvider,
    IProcessSpawner,
    UnifiedProgress,
    ProgressHandler,
    ExecutionContext,
} from './types';

// Strategies
export {
    IProgressStrategy,
    StrategyDependencies,
    ExactProgressStrategy,
    MilestoneProgressStrategy,
    SyntheticProgressStrategy,
    ImmediateProgressStrategy,
} from './strategies';

// Utilities
export { ElapsedTimeTracker, formatElapsedTime } from './ElapsedTimeTracker';
export { CommandResolver, CommandResolveOptions } from './CommandResolver';
