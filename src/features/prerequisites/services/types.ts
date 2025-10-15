/**
 * Shared types for prerequisites module
 */

/**
 * Prerequisite version check configuration
 */
export interface PrerequisiteCheck {
    command: string;
    parseVersion?: string;
    contains?: string;
}

/**
 * Progress milestone for installation tracking
 */
export interface ProgressMilestone {
    pattern: string;
    progress: number;
    message?: string;
}

/**
 * Individual installation step configuration
 */
export interface InstallStep {
    name: string;
    message: string;
    commands?: string[];
    commandTemplate?: string;
    estimatedDuration?: number;
    progressStrategy?: 'exact' | 'milestones' | 'synthetic' | 'immediate';
    milestones?: ProgressMilestone[];
    progressParser?: string;
    continueOnError?: boolean;
}

/**
 * Prerequisite installation configuration
 */
export interface PrerequisiteInstall {
    // Legacy format
    commands?: string[];
    message?: string;
    requires?: string[];
    dynamic?: boolean;
    template?: string;
    versions?: Record<string, string[]>;
    manual?: boolean;
    url?: string;
    // New step-based format
    steps?: InstallStep[];
}

/**
 * Prerequisite plugin configuration
 */
export interface PrerequisitePlugin {
    id: string;
    name: string;
    description: string;
    check: PrerequisiteCheck;
    install: {
        commands: string[];
        message?: string;
    };
    requiredFor?: string[];
}

/**
 * Prerequisite definition from prerequisites.json
 */
export interface PrerequisiteDefinition {
    id: string;
    name: string;
    description: string;
    optional?: boolean;
    depends?: string[];
    perNodeVersion?: boolean; // Install in each Node.js version
    check: PrerequisiteCheck;
    install?: PrerequisiteInstall; // Installation configuration
    uninstall?: {
        commands: string[];
        message?: string;
    };
    postInstall?: {
        message: string;
    };
    multiVersion?: boolean;
    versionCheck?: {
        command: string;
        parseInstalledVersions: string;
    };
    plugins?: PrerequisitePlugin[];
}

/**
 * Component-specific prerequisite requirements
 */
export interface ComponentRequirement {
    prerequisites?: string[];
    plugins?: string[];
}

/**
 * Root prerequisites configuration structure
 */
export interface PrerequisitesConfig {
    version: string;
    prerequisites: PrerequisiteDefinition[];
    componentRequirements?: Record<string, ComponentRequirement>;
}

/**
 * Runtime status of a prerequisite
 */
export interface PrerequisiteStatus {
    id: string;
    name: string;
    description: string;
    installed: boolean;
    version?: string;
    optional: boolean;
    canInstall: boolean;
    message?: string;
    plugins?: {
        id: string;
        name: string;
        installed: boolean;
    }[];
}
