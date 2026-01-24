/**
 * State Management Type Definitions
 *
 * Provides type-safe interfaces for StateManager and related state operations.
 * Replaces `any` types with proper state interfaces.
 */

import * as vscode from 'vscode';
import { Project, ProcessInfo } from './base';

/**
 * StateKey - Valid state keys for persistence
 */
export type StateKey =
    | 'currentProject'
    | 'recentProjects'
    | 'lastOpenedProject'
    | 'prerequisites'
    | 'adobeAuth'
    | 'userPreferences'
    | 'componentCache'
    | 'wizardState'
    | 'updateChannel'
    | 'autoUpdate'
    | 'lastUpdateCheck'
    | string; // Allow custom keys

/**
 * StateValue - Type-safe state values
 */
export type StateValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | Project
    | Project[]
    | Record<string, unknown>
    | unknown[];

/**
 * StateManager - Persistent state management interface
 *
 * Manages extension state using file-based storage in ~/.demo-builder/
 * Provides project management, process tracking, and recent projects.
 */
export interface StateManager {
    /**
     * Initialize state manager (loads state from disk)
     */
    initialize(): Promise<void>;

    /**
     * Check if a project is currently loaded
     */
    hasProject(): Promise<boolean>;

    /**
     * Get current project
     * @returns Current project or undefined
     */
    getCurrentProject(): Promise<Project | undefined>;

    /**
     * Save project (sets as current and persists)
     * @param project - Project to save
     */
    saveProject(project: Project): Promise<void>;

    /**
     * Clear current project
     */
    clearProject(): Promise<void>;

    /**
     * Clear all state (including processes)
     */
    clearAll(): Promise<void>;

    /**
     * Add process to tracking
     */
    addProcess(name: string, info: ProcessInfo): Promise<void>;

    /**
     * Remove process from tracking
     */
    removeProcess(name: string): Promise<void>;

    /**
     * Get process info
     */
    getProcess(name: string): Promise<ProcessInfo | undefined>;

    /**
     * Reload state from disk
     */
    reload(): Promise<void>;

    /**
     * Get recent projects list
     * @returns Array of recent projects
     */
    getRecentProjects(): Promise<RecentProject[]>;

    /**
     * Add project to recent projects
     * @param project - Project to add
     */
    addToRecentProjects(project: Project): Promise<void>;

    /**
     * Remove project from recent projects
     */
    removeFromRecentProjects(projectPath: string): Promise<void>;

    /**
     * Load project from filesystem path
     * @param projectPath - Path to the project directory
     * @param terminalProvider - Optional function to get terminals for process detection
     * @param options - Optional loading options
     * @param options.persistAfterLoad - Whether to save the project after loading (default: true)
     */
    loadProjectFromPath(
        projectPath: string,
        terminalProvider?: () => readonly import('vscode').Terminal[],
        options?: { persistAfterLoad?: boolean },
    ): Promise<Project | null>;

    /**
     * Get all projects from projects directory
     */
    getAllProjects(): Promise<{ name: string; path: string; lastModified: Date }[]>;

    /**
     * Event fired when current project changes
     */
    onProjectChanged: vscode.Event<Project | undefined>;

    /**
     * Mark a project field as dirty (changed but not yet saved)
     * Background operations should use this instead of saveProject()
     * @param field - The field that changed
     */
    markDirty(field: keyof Project): void;

    /**
     * Check if project has unsaved changes
     * @returns true if any fields are marked dirty
     */
    isDirty(): boolean;

    /**
     * Get the set of dirty fields
     * @returns Set of field names that have been marked dirty
     */
    getDirtyFields(): ReadonlySet<keyof Project>;

    /**
     * Clear dirty state (called after save)
     */
    clearDirty(): void;

    /**
     * Dispose resources
     */
    dispose(): void;
}

/**
 * RecentProject - Recent project metadata
 */
export interface RecentProject {
    path: string;
    name: string;
    organization?: string;
    lastOpened: string;
    // Metadata backup fields - used to recover data if manifest is corrupted
    selectedPackage?: string | null;
    selectedStack?: string | null;
    selectedAddons?: string[];
}

/**
 * WizardState - Wizard progress state
 */
export interface WizardStateData {
    currentStep: string;
    projectName?: string;
    selectedComponents?: string[];
    prerequisitesComplete?: boolean;
    adobeAuthComplete?: boolean;
    adobeProjectId?: string;
    adobeWorkspaceId?: string;
    [key: string]: unknown;
}

/**
 * UserPreferences - User preferences
 */
export interface UserPreferences {
    updateChannel?: 'stable' | 'beta';
    autoUpdate?: boolean;
    defaultTemplate?: string;
    [key: string]: unknown;
}
