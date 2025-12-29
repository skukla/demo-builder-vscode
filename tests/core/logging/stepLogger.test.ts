/**
 * StepLogger Tests
 *
 * Tests for configuration-driven logging with template-based messages.
 * StepLogger provides consistent logging for wizard steps with step names
 * from configuration and message templates.
 */

import * as fs from 'fs';
import type { Logger } from '@/types/logger';
import { StepLogger, StepLoggerContext, getStepLogger } from '@/core/logging/stepLogger';

// Mock fs module
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
}));

// Mock Logger
const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};

// Mock the parseJSON function from typeGuards
jest.mock('@/types/typeGuards', () => ({
    parseJSON: jest.fn((content: string) => {
        try {
            return JSON.parse(content);
        } catch {
            return null;
        }
    }),
}));

describe('StepLogger', () => {
    let stepLogger: StepLogger;

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(false);
    });

    describe('Initialization', () => {
        it('should initialize with default step names', () => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);

            expect(stepLogger.getStepName('welcome')).toBe('Project Setup');
            expect(stepLogger.getStepName('prerequisites')).toBe('Prerequisites');
            expect(stepLogger.getStepName('review')).toBe('Review');
        });

        it('should initialize with default templates', () => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);

            // Default templates should be available
            stepLogger.logTemplate('welcome', 'operations.checking', { item: 'test' });
            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Checking test...');
        });

        it('should override step names with provided wizard steps', () => {
            const wizardSteps = [
                { id: 'welcome', name: 'Custom Welcome', enabled: true },
                { id: 'prerequisites', name: 'Custom Prerequisites', enabled: true },
            ];

            stepLogger = new StepLogger(mockLogger as unknown as Logger, wizardSteps);

            expect(stepLogger.getStepName('welcome')).toBe('Custom Welcome');
            expect(stepLogger.getStepName('prerequisites')).toBe('Custom Prerequisites');
        });

        it('should ignore disabled wizard steps', () => {
            const wizardSteps = [
                { id: 'welcome', name: 'Custom Welcome', enabled: false },
            ];

            stepLogger = new StepLogger(mockLogger as unknown as Logger, wizardSteps);

            // Should use default name since step is disabled
            expect(stepLogger.getStepName('welcome')).toBe('Project Setup');
        });

        it('should ignore wizard steps without id or name', () => {
            const wizardSteps = [
                { id: '', name: 'No ID Step', enabled: true },
                { id: 'no-name', name: '', enabled: true },
            ];

            stepLogger = new StepLogger(mockLogger as unknown as Logger, wizardSteps);

            // Should fall back to defaults
            expect(stepLogger.getStepName('no-name')).toBe('No Name');
        });
    });

    describe('loadTemplates()', () => {
        it('should use default templates when no path provided', () => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);

            // Verify default templates work
            stepLogger.logTemplate('welcome', 'operations.fetching', { item: 'projects' });
            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Fetching projects...');
        });

        it('should load templates from file when path exists', () => {
            const customTemplates = {
                operations: {
                    checking: 'Custom checking {item}',
                    fetching: 'Custom fetching {item}',
                },
                statuses: {
                    found: 'Custom found {count} {item}',
                },
            };

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(customTemplates));

            stepLogger = new StepLogger(
                mockLogger as unknown as Logger,
                undefined,
                '/path/to/templates.json'
            );

            stepLogger.logTemplate('welcome', 'operations.checking', { item: 'test' });
            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Custom checking test');
        });

        it('should fall back to defaults on file read error', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('File read error');
            });

            stepLogger = new StepLogger(
                mockLogger as unknown as Logger,
                undefined,
                '/path/to/templates.json'
            );

            // Should still work with defaults
            stepLogger.logTemplate('welcome', 'operations.checking', { item: 'test' });
            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Checking test...');
        });

        it('should fall back to defaults on JSON parse error', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue('invalid json {{{');

            stepLogger = new StepLogger(
                mockLogger as unknown as Logger,
                undefined,
                '/path/to/templates.json'
            );

            // Should still work with defaults (parseJSON returns null for invalid JSON)
            stepLogger.logTemplate('welcome', 'operations.checking', { item: 'test' });
            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Checking test...');
        });
    });

    describe('getStepName()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
        });

        it('should return known step name', () => {
            expect(stepLogger.getStepName('welcome')).toBe('Project Setup');
            expect(stepLogger.getStepName('component-selection')).toBe('Components');
            expect(stepLogger.getStepName('prerequisites')).toBe('Prerequisites');
        });

        it('should normalize adobe-auth to adobe-setup', () => {
            expect(stepLogger.getStepName('adobe-auth')).toBe('Adobe Setup');
        });

        it('should return configured step name for adobe-setup', () => {
            expect(stepLogger.getStepName('adobe-setup')).toBe('Adobe Setup');
        });

        it('should create readable fallback for unknown step IDs', () => {
            expect(stepLogger.getStepName('my-custom-step')).toBe('My Custom Step');
        });

        it('should handle single word step IDs', () => {
            expect(stepLogger.getStepName('test')).toBe('Test');
        });

        it('should capitalize each word in fallback', () => {
            expect(stepLogger.getStepName('multi-word-step-id')).toBe('Multi Word Step Id');
        });
    });

    describe('log()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
            jest.clearAllMocks();
        });

        it('should format message with step prefix', () => {
            stepLogger.log('welcome', 'Test message');

            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Test message');
        });

        it('should route to info by default', () => {
            stepLogger.log('welcome', 'Test message');

            expect(mockLogger.info).toHaveBeenCalled();
            expect(mockLogger.debug).not.toHaveBeenCalled();
        });

        it('should route to debug level', () => {
            stepLogger.log('welcome', 'Debug message', 'debug');

            expect(mockLogger.debug).toHaveBeenCalledWith('[Project Setup] Debug message');
        });

        it('should route to error level', () => {
            stepLogger.log('welcome', 'Error message', 'error');

            expect(mockLogger.error).toHaveBeenCalledWith('[Project Setup] Error message');
        });

        it('should route to warn level', () => {
            stepLogger.log('welcome', 'Warning message', 'warn');

            expect(mockLogger.warn).toHaveBeenCalledWith('[Project Setup] Warning message');
        });
    });

    describe('logOperation()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
            jest.clearAllMocks();
        });

        it('should log operation without item', () => {
            stepLogger.logOperation('welcome', 'Checking prerequisites');

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Checking prerequisites'
            );
        });

        it('should log operation with item', () => {
            stepLogger.logOperation('welcome', 'Checking', 'Node.js');

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Checking Node.js'
            );
        });

        it('should support debug level', () => {
            stepLogger.logOperation('welcome', 'Debug operation', 'item', 'debug');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[Project Setup] Debug operation item'
            );
        });
    });

    describe('logStatus()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
            jest.clearAllMocks();
        });

        it('should log status with count and pluralization', () => {
            stepLogger.logStatus('welcome', 'Found', 5, 'project');

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Found 5 projects'
            );
        });

        it('should not pluralize when count is 1', () => {
            stepLogger.logStatus('welcome', 'Found', 1, 'project');

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Found 1 project'
            );
        });

        it('should log status with item name only', () => {
            stepLogger.logStatus('welcome', 'Found', undefined, 'Node.js v18.0.0');

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Found: Node.js v18.0.0'
            );
        });

        it('should log status message only', () => {
            stepLogger.logStatus('welcome', 'Ready to proceed');

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Ready to proceed'
            );
        });

        it('should handle zero count', () => {
            stepLogger.logStatus('welcome', 'Found', 0, 'project');

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Found 0 projects'
            );
        });
    });

    describe('logTemplate()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
            jest.clearAllMocks();
        });

        it('should find template by section.key path', () => {
            stepLogger.logTemplate('welcome', 'operations.checking', { item: 'Node.js' });

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Checking Node.js...'
            );
        });

        it('should search both sections for single key', () => {
            stepLogger.logTemplate('welcome', 'checking', { item: 'npm' });

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Checking npm...'
            );
        });

        it('should replace multiple parameters', () => {
            stepLogger.logTemplate('welcome', 'statuses.found', {
                count: 5,
                item: 'component',
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Found 5 component'
            );
        });

        it('should create fallback message for unknown template', () => {
            stepLogger.logTemplate('welcome', 'unknown_template', { item: 'test' });

            // Should capitalize and replace underscores
            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Unknown template: test'
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[StepLogger] Template not found: unknown_template, using fallback'
            );
        });

        it('should clean up unused placeholders', () => {
            stepLogger.logTemplate('welcome', 'statuses.found', { count: 3 });

            // {item} placeholder should be removed
            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Found 3 '
            );
        });

        it('should support different log levels', () => {
            stepLogger.logTemplate(
                'welcome',
                'statuses.error',
                { item: 'test', error: 'failed' },
                'error'
            );

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle null/undefined parameter values', () => {
            stepLogger.logTemplate('welcome', 'operations.checking', {
                item: null as unknown as string,
            });

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] Checking ...'
            );
        });
    });

    describe('logStepStart()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
            jest.clearAllMocks();
        });

        it('should log step start at debug level', () => {
            stepLogger.logStepStart('welcome');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[Project Setup] Starting project setup...'
            );
        });

        it('should use lowercase step name in message', () => {
            stepLogger.logStepStart('prerequisites');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[Prerequisites] Starting prerequisites...'
            );
        });
    });

    describe('logStepComplete()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
            jest.clearAllMocks();
        });

        it('should log success with checkmark', () => {
            stepLogger.logStepComplete('welcome', true);

            expect(mockLogger.info).toHaveBeenCalledWith(
                '[Project Setup] \u2713 Complete'
            );
        });

        it('should log failure with X mark', () => {
            stepLogger.logStepComplete('welcome', false);

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Project Setup] \u2717 Failed'
            );
        });

        it('should default to success', () => {
            stepLogger.logStepComplete('welcome');

            expect(mockLogger.info).toHaveBeenCalled();
            expect(mockLogger.error).not.toHaveBeenCalled();
        });
    });

    describe('forStep()', () => {
        beforeEach(() => {
            stepLogger = new StepLogger(mockLogger as unknown as Logger);
            jest.clearAllMocks();
        });

        it('should return StepLoggerContext bound to step', () => {
            const context = stepLogger.forStep('welcome');

            expect(context).toBeInstanceOf(StepLoggerContext);
        });

        it('should use correct step for all context methods', () => {
            const context = stepLogger.forStep('prerequisites');

            context.log('Test message');
            expect(mockLogger.info).toHaveBeenCalledWith('[Prerequisites] Test message');
        });
    });

    describe('static create()', () => {
        it('should return Promise resolving to StepLogger', async () => {
            const result = await StepLogger.create(mockLogger as unknown as Logger);

            expect(result).toBeInstanceOf(StepLogger);
        });

        it('should pass wizard steps to constructor', async () => {
            const wizardSteps = [{ id: 'test', name: 'Test Step', enabled: true }];
            const result = await StepLogger.create(
                mockLogger as unknown as Logger,
                wizardSteps
            );

            expect(result.getStepName('test')).toBe('Test Step');
        });
    });
});

describe('getStepLogger()', () => {
    // Reset module between tests to clear singleton
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('should throw when called without logger and not initialized', async () => {
        // Re-import to get fresh module state
        const { getStepLogger: freshGetStepLogger } = await import(
            '@/core/logging/stepLogger'
        );

        expect(() => freshGetStepLogger()).toThrow(
            'StepLogger not initialized. Call with a logger first.'
        );
    });

    it('should initialize and return singleton when called with logger', async () => {
        const { getStepLogger: freshGetStepLogger, StepLogger: FreshStepLogger } = await import(
            '@/core/logging/stepLogger'
        );

        const result = freshGetStepLogger(mockLogger as unknown as Logger);

        expect(result).toBeInstanceOf(FreshStepLogger);
    });

    it('should return same instance on subsequent calls', async () => {
        const { getStepLogger: freshGetStepLogger } = await import(
            '@/core/logging/stepLogger'
        );

        const first = freshGetStepLogger(mockLogger as unknown as Logger);
        const second = freshGetStepLogger();

        expect(first).toBe(second);
    });
});

describe('StepLoggerContext', () => {
    let stepLogger: StepLogger;
    let context: StepLoggerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        stepLogger = new StepLogger(mockLogger as unknown as Logger);
        context = stepLogger.forStep('welcome');
    });

    describe('log()', () => {
        it('should delegate to parent with step ID', () => {
            context.log('Test message');

            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Test message');
        });

        it('should support log level parameter', () => {
            context.log('Debug message', 'debug');

            expect(mockLogger.debug).toHaveBeenCalledWith('[Project Setup] Debug message');
        });
    });

    describe('logOperation()', () => {
        it('should delegate to parent with step ID', () => {
            context.logOperation('Checking', 'test');

            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Checking test');
        });

        it('should support level parameter', () => {
            context.logOperation('Debug op', 'item', 'debug');

            expect(mockLogger.debug).toHaveBeenCalledWith('[Project Setup] Debug op item');
        });
    });

    describe('logStatus()', () => {
        it('should delegate to parent with step ID', () => {
            context.logStatus('Found', 5, 'item');

            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Found 5 items');
        });
    });

    describe('logTemplate()', () => {
        it('should delegate to parent with step ID', () => {
            context.logTemplate('operations.checking', { item: 'test' });

            expect(mockLogger.info).toHaveBeenCalledWith('[Project Setup] Checking test...');
        });

        it('should support level parameter', () => {
            context.logTemplate('statuses.error', { item: 'test', error: 'fail' }, 'error');

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('logStart()', () => {
        it('should delegate to parent logStepStart', () => {
            context.logStart();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[Project Setup] Starting project setup...'
            );
        });
    });

    describe('logComplete()', () => {
        it('should delegate to parent logStepComplete with success', () => {
            context.logComplete(true);

            expect(mockLogger.info).toHaveBeenCalled();
        });

        it('should delegate to parent logStepComplete with failure', () => {
            context.logComplete(false);

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should default to success', () => {
            context.logComplete();

            expect(mockLogger.info).toHaveBeenCalled();
            expect(mockLogger.error).not.toHaveBeenCalled();
        });
    });
});
