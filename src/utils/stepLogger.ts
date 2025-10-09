import { Logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * StepLogger provides consistent, configuration-driven logging for wizard steps.
 * Step names come from wizard-steps.json configuration rather than being hardcoded.
 */
export class StepLogger {
    private stepNames: Map<string, string>;
    private logger: Logger;
    private templates: any;
    
    constructor(logger: Logger, wizardSteps?: any[], templatesPath?: string) {
        this.logger = logger;
        this.stepNames = new Map();
        this.templates = this.loadTemplates(templatesPath);
        this.loadStepNames(wizardSteps);
    }
    
    /**
     * Load step names from configuration or use defaults
     */
    private loadStepNames(wizardSteps?: any[]) {
        // Default names (fallback if no config provided)
        const defaults = {
            'welcome': 'Project Setup',
            'component-selection': 'Components',
            'prerequisites': 'Prerequisites',
            'adobe-setup': 'Adobe Setup',
            'adobe-auth': 'Adobe Setup',  // Map legacy steps to current names
            'adobe-context': 'Adobe Setup',
            'org-selection': 'Adobe Setup',
            'project-selection': 'Adobe Setup',
            'settings': 'Settings Collection',
            'commerce-config': 'Configuration',  // Legacy
            'review': 'Review',
            'creating': 'Creating'
        };
        
        // Start with defaults
        Object.entries(defaults).forEach(([id, name]) => {
            this.stepNames.set(id, name);
        });
        
        // Override with config if provided
        if (wizardSteps && Array.isArray(wizardSteps)) {
            wizardSteps.forEach(step => {
                if (step.id && step.name && step.enabled !== false) {
                    this.stepNames.set(step.id, step.name);
                }
            });
        }
    }
    
    /**
     * Load logging templates from configuration
     */
    private loadTemplates(templatesPath?: string): any {
        // Default templates
        const defaults = {
            operations: {
                checking: 'Checking {item}...',
                fetching: 'Fetching {item}...',
                installing: 'Installing {item}...',
                creating: 'Creating {item}...',
                loading: 'Loading {item}...',
                validating: 'Validating {item}...',
                configuring: 'Configuring {item}...',
                starting: 'Starting {item}...',
                completed: '{item} completed successfully',
                failed: '{item} failed'
            },
            statuses: {
                found: 'Found {count} {item}',
                'found-single': 'Found: {item}',
                installed: '{item} installed: {version}',
                missing: '{item} not found',
                ready: '{item} ready',
                success: '✓ {item}',
                error: '✗ {item}: {error}',
                warning: '⚠ {item}'
            }
        };
        
        // Try to load custom templates if path provided
        if (templatesPath && fs.existsSync(templatesPath)) {
            try {
                const content = fs.readFileSync(templatesPath, 'utf8');
                return JSON.parse(content);
            } catch (error) {
                // Fall back to defaults on error
                this.logger.debug('Failed to load logging templates, using defaults');
            }
        }
        
        return defaults;
    }
    
    /**
     * Get the display name for a step ID
     */
    public getStepName(stepId: string): string {
        // Normalize step ID (adobe-auth -> adobe-setup)
        const normalizedId = stepId === 'adobe-auth' ? 'adobe-setup' : stepId;
        
        // Get the step name or create a fallback
        const stepName = this.stepNames.get(normalizedId);
        if (stepName) {
            return stepName;
        }
        
        // Create a readable fallback from the ID
        const fallback = normalizedId
            .replace(/-/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        return fallback;
    }
    
    /**
     * Log a message with step context
     */
    public log(stepId: string, message: string, level: 'info' | 'debug' | 'error' | 'warn' = 'info') {
        const stepName = this.getStepName(stepId);
        const formattedMessage = `[${stepName}] ${message}`;
        
        switch(level) {
        case 'debug':
            this.logger.debug(formattedMessage);
            break;
        case 'error':
            this.logger.error(formattedMessage);
            break;
        case 'warn':
            this.logger.warn(formattedMessage);
            break;
        default:
            this.logger.info(formattedMessage);
        }
    }
    
    /**
     * Log an operation within a step (e.g., "Checking Node.js...")
     */
    public logOperation(stepId: string, operation: string, item?: string, level: 'info' | 'debug' = 'info') {
        const message = item ? `${operation} ${item}` : operation;
        this.log(stepId, message, level);
    }
    
    /**
     * Log a status/result within a step (e.g., "Found 5 projects")
     */
    public logStatus(stepId: string, status: string, count?: number, itemName?: string) {
        if (count !== undefined && itemName) {
            const plural = count !== 1 ? 's' : '';
            const message = `${status} ${count} ${itemName}${plural}`;
            this.log(stepId, message);
        } else if (itemName) {
            const message = `${status}: ${itemName}`;
            this.log(stepId, message);
        } else {
            this.log(stepId, status);
        }
    }
    
    /**
     * Log using a template with parameter substitution
     */
    public logTemplate(stepId: string, templateKey: string, params: Record<string, any> = {}, level: 'info' | 'debug' | 'error' | 'warn' = 'info') {
        // Try to find template in both sections
        const templatePath = templateKey.includes('.') ? templateKey.split('.') : [templateKey];
        
        let template: string | undefined;
        if (templatePath.length === 2) {
            // Path like 'operations.fetching'
            const [section, key] = templatePath;
            template = this.templates[section]?.[key];
        } else {
            // Single key - search both sections
            template = this.templates.operations[templateKey] || 
                      this.templates.statuses[templateKey];
        }
        
        // Fallback: if template not found, log the key itself as a warning in debug
        if (!template) {
            this.logger.debug(`[StepLogger] Template not found: ${templateKey}, using fallback`);
            // Create a reasonable fallback message
            template = templateKey.replace(/-/g, ' ').replace(/_/g, ' ');
            // Capitalize first letter
            template = template.charAt(0).toUpperCase() + template.slice(1);
            // Add any item parameter if provided
            if (params.item) {
                template = `${template}: ${params.item}`;
            }
        }
        
        // Replace all parameters in template
        let finalMessage = template;
        Object.entries(params).forEach(([key, value]) => {
            const placeholder = `{${key}}`;
            finalMessage = finalMessage.replace(new RegExp(placeholder, 'g'), value ?? '');
        });
        
        // Clean up any remaining placeholders
        finalMessage = finalMessage.replace(/\{\w+\}/g, '');
        
        this.log(stepId, finalMessage, level);
    }
    
    /**
     * Log the start of a step
     */
    public logStepStart(stepId: string) {
        const stepName = this.getStepName(stepId);
        this.logger.info(`[${stepName}] Starting ${stepName.toLowerCase()}...`);
    }
    
    /**
     * Log the completion of a step
     */
    public logStepComplete(stepId: string, success: boolean = true) {
        const stepName = this.getStepName(stepId);
        if (success) {
            this.logger.info(`[${stepName}] ✓ Complete`);
        } else {
            this.logger.error(`[${stepName}] ✗ Failed`);
        }
    }
    
    /**
     * Create a child logger for a specific step
     * This allows passing around a logger that's pre-configured for a step
     */
    public forStep(stepId: string): StepLoggerContext {
        return new StepLoggerContext(this, stepId);
    }
}

/**
 * A logger context that's bound to a specific step
 * Allows cleaner API when logging multiple messages for the same step
 */
export class StepLoggerContext {
    constructor(
        private parent: StepLogger,
        private stepId: string
    ) {}
    
    log(message: string, level: 'info' | 'debug' | 'error' | 'warn' = 'info') {
        this.parent.log(this.stepId, message, level);
    }
    
    logOperation(operation: string, item?: string, level: 'info' | 'debug' = 'info') {
        this.parent.logOperation(this.stepId, operation, item, level);
    }
    
    logStatus(status: string, count?: number, itemName?: string) {
        this.parent.logStatus(this.stepId, status, count, itemName);
    }
    
    logTemplate(templateKey: string, params: Record<string, any> = {}, level: 'info' | 'debug' | 'error' | 'warn' = 'info') {
        this.parent.logTemplate(this.stepId, templateKey, params, level);
    }
    
    logStart() {
        this.parent.logStepStart(this.stepId);
    }
    
    logComplete(success: boolean = true) {
        this.parent.logStepComplete(this.stepId, success);
    }
}

// Export a singleton getter for convenience
let defaultStepLogger: StepLogger | null = null;

export function getStepLogger(logger?: Logger): StepLogger {
    if (!defaultStepLogger && logger) {
        defaultStepLogger = new StepLogger(logger);
    }
    if (!defaultStepLogger) {
        throw new Error('StepLogger not initialized. Call with a logger first.');
    }
    return defaultStepLogger;
}