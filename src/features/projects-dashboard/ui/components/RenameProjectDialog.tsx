/**
 * RenameProjectDialog Component
 *
 * Simple dialog for renaming a project without going through the full edit wizard.
 * Uses React Spectrum's DialogContainer for modal presentation.
 *
 * Validates project names using the same rules as the project creation wizard:
 * - Required (not empty)
 * - Pattern (starts with letter, lowercase letters/numbers/hyphens only)
 * - Min length (3 characters)
 * - Max length (30 characters)
 * - Uniqueness (no duplicate names)
 */

import {
    Dialog,
    Heading,
    Content,
    ButtonGroup,
    Button,
    TextField,
    Flex,
    Text,
} from '@adobe/react-spectrum';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    normalizeProjectName,
    getProjectNameError,
} from '@/core/validation/normalizers';
import type { Project } from '@/types/base';

export interface RenameProjectDialogProps {
    /** The project to rename */
    project: Project;
    /** List of existing project names (for uniqueness validation) */
    existingProjectNames: string[];
    /** Called when rename is confirmed */
    onRename: (newName: string) => void;
    /** Called when dialog is dismissed */
    onClose: () => void;
}

/**
 * RenameProjectDialog - Modal dialog for renaming a project
 */
export function RenameProjectDialog({
    project,
    existingProjectNames,
    onRename,
    onClose,
}: RenameProjectDialogProps) {
    const [newName, setNewName] = useState(project.name);
    const [isTouched, setIsTouched] = useState(false);

    // Reset state when project changes
    useEffect(() => {
        setNewName(project.name);
        setIsTouched(false);
    }, [project]);

    // Validate using shared validation function
    // Allow the current project name (it's not a duplicate of itself)
    const validationError = useMemo(() => {
        if (!isTouched) return undefined;
        return getProjectNameError(newName, existingProjectNames, project.name);
    }, [newName, existingProjectNames, project.name, isTouched]);

    const handleNameChange = useCallback((value: string) => {
        // Normalize input as user types (same as WelcomeStep)
        const normalized = normalizeProjectName(value);
        setNewName(normalized);
        setIsTouched(true);
    }, []);

    const handleRename = useCallback(() => {
        const trimmedName = newName.trim();

        // Run validation
        const error = getProjectNameError(trimmedName, existingProjectNames, project.name);
        if (error) {
            setIsTouched(true);
            return;
        }

        if (trimmedName === project.name) {
            // No change, just close
            onClose();
            return;
        }

        onRename(trimmedName);
    }, [newName, existingProjectNames, project.name, onRename, onClose]);

    const isValid = !getProjectNameError(newName, existingProjectNames, project.name);
    const hasChanged = newName.trim() !== project.name;

    // Compute validation state for TextField
    // - 'invalid' when there's an error
    // - 'valid' when touched and valid
    // - undefined otherwise (neutral state)
    const getValidationState = (): 'invalid' | 'valid' | undefined => {
        if (validationError) return 'invalid';
        if (isTouched && isValid) return 'valid';
        return undefined;
    };

    return (
        <Dialog>
            <Heading>Rename Project</Heading>
            <Content>
                <Flex direction="column" gap="size-200">
                    <TextField
                        label="Project Name"
                        value={newName}
                        onChange={handleNameChange}
                        autoFocus
                        width="100%"
                        validationState={getValidationState()}
                        errorMessage={validationError}
                    />
                    {!validationError && (
                        <Text UNSAFE_className="text-xs text-gray-500">
                            This will update the project name in the dashboard.
                        </Text>
                    )}
                </Flex>
            </Content>
            <ButtonGroup>
                <Button variant="secondary" onPress={onClose}>
                    Cancel
                </Button>
                <Button
                    variant="accent"
                    onPress={handleRename}
                    isDisabled={!isValid || !hasChanged}
                >
                    Rename
                </Button>
            </ButtonGroup>
        </Dialog>
    );
}
