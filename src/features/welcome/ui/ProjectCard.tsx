import React from 'react';
import {
    View,
    Flex,
    Text,
    ActionButton,
    Badge,
    Well
} from '@adobe/react-spectrum';
import { cn } from '@/webview-ui/shared/utils/classNames';
import Folder from '@spectrum-icons/workflow/Folder';
import Delete from '@spectrum-icons/workflow/Delete';
import Clock from '@spectrum-icons/workflow/Clock';
import Building from '@spectrum-icons/workflow/Building';

interface ProjectCardProps {
    project: {
        path: string;
        name: string;
        organization?: string;
        lastOpened: string;
    };
    onOpen: () => void;
    onDelete: () => void;
    isCurrent?: boolean;
}

export function ProjectCard({ project, onOpen, onDelete, isCurrent }: ProjectCardProps) {
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            return `${Math.floor(diffDays / 7)} weeks ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    return (
        <Well 
            UNSAFE_className={cn(
                'project-card-wrapper',
                isCurrent ? 'project-card-current' : 'project-card-default'
            )}
            onPress={onOpen}
        >
            <Flex direction="column" gap="size-100">
                {/* Header with badge */}
                <Flex justifyContent="space-between" alignItems="flex-start">
                    <Flex gap="size-100" alignItems="center">
                        <Folder size="S" />
                        <Text UNSAFE_className="project-card-title">
                            {project.name}
                        </Text>
                    </Flex>
                    {isCurrent && (
                        <Badge variant="positive">Current</Badge>
                    )}
                </Flex>

                {/* Organization */}
                {project.organization && (
                    <Flex gap="size-100" alignItems="center">
                        <Building size="XS" UNSAFE_className="opacity-60" />
                        <Text elementType="small" color="gray-700">
                            {project.organization}
                        </Text>
                    </Flex>
                )}

                {/* Last opened */}
                <Flex gap="size-100" alignItems="center">
                    <Clock size="XS" UNSAFE_className="opacity-60" />
                    <Text elementType="small" color="gray-600">
                        {formatDate(project.lastOpened)}
                    </Text>
                </Flex>

                {/* Path */}
                <Text elementType="small" color="gray-500" UNSAFE_className="project-card-path">
                    {project.path}
                </Text>

                {/* Actions */}
                <Flex gap="size-100" marginTop="size-100">
                    <ActionButton 
                        flex
                        variant="primary"
                        onPress={(e) => {
                            e.stopPropagation();
                            onOpen();
                        }}
                    >
                        Open
                    </ActionButton>
                    <ActionButton
                        variant="secondary"
                        isQuiet
                        onPress={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                    >
                        <Delete />
                    </ActionButton>
                </Flex>
            </Flex>
        </Well>
    );
}