import { View, Flex, Text } from '@/core/ui/components/aria';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import CloseCircle from '@spectrum-icons/workflow/CloseCircle';
import Pending from '@spectrum-icons/workflow/Pending';
import React from 'react';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import { cn } from '@/core/ui/utils/classNames';
import { PrerequisiteCheck, UnifiedProgress } from '@/types/webview';
import {
    prerequisiteMessage,
    prerequisiteMessageError,
    prerequisiteMessageDefault,
} from '../../styles/prerequisites.module.css';

/**
 * Check if plugin details should be shown for a prerequisite
 */
export function shouldShowPluginDetails(
    status: PrerequisiteCheck['status'],
    nodeVersionStatus: PrerequisiteCheck['nodeVersionStatus'],
): boolean {
    const isActiveStatus = status === 'checking' || status === 'success' || status === 'error';
    if (!isActiveStatus) return false;

    if (!nodeVersionStatus) return true;
    return nodeVersionStatus.every(v => v.installed);
}

/**
 * Get status icon for prerequisite check
 */
export function getStatusIcon(status: PrerequisiteCheck['status']): React.ReactNode {
    switch (status) {
        case 'success':
            return <CheckmarkCircle size="S" className="text-green-600" />;
        case 'error':
            return <CloseCircle size="S" className="text-red-600" />;
        case 'warning':
            return <AlertCircle size="S" className="text-yellow-600" />;
        case 'checking':
            return <Spinner size="S" />;
        case 'pending':
            return <Pending size="S" />;
        default:
            return <div className="placeholder-icon" />;
    }
}

/**
 * Render plugin status icon based on check status and plugin installation state
 */
export function renderPluginStatusIcon(
    checkStatus: PrerequisiteCheck['status'],
    pluginInstalled: boolean | undefined,
): React.ReactNode {
    if (checkStatus === 'checking' && pluginInstalled === undefined) {
        return <Pending size="XS" marginStart="size-50" />;
    }
    if (pluginInstalled) {
        return <CheckmarkCircle size="XS" className="text-green-600" marginStart="size-50" />;
    }
    return <CloseCircle size="XS" className="text-red-600" marginStart="size-50" />;
}

/**
 * Calculate progress bar value based on unified progress state
 */
export function getProgressValue(unifiedProgress: UnifiedProgress): number {
    if (unifiedProgress.overall.totalSteps > 1) {
        return unifiedProgress.overall.percent;
    }
    if (unifiedProgress.command?.type === 'determinate' && unifiedProgress.command?.percent != null) {
        return unifiedProgress.command.percent;
    }
    return unifiedProgress.overall.percent;
}

/**
 * Render Node.js success message as version items with checkmarks
 */
export function renderNodeVersionSuccess(message: string): React.ReactNode {
    return message.split(',').map((versionInfo, idx) => {
        const match = versionInfo.trim().match(/^([\d.]+)\s*(?:\((.+)\))?$/);
        const version = match?.[1] || versionInfo.trim();
        const component = match?.[2] || '';

        return (
            <Flex key={idx} alignItems="center" marginBottom="size-50">
                <Text className={cn('animate-fade-in', 'text-sm')}>
                    {version}
                    {component && ` (${component})`}
                </Text>
                <CheckmarkCircle size="XS" className="text-green-600" marginStart="size-50" />
            </Flex>
        );
    });
}

/**
 * Render Adobe I/O CLI error with Node versions as failed items
 */
export function renderAioCliErrorVersions(message: string): React.ReactNode {
    const nodes = (message.match(/Node\s+([\d.]+)/g) || []).map(s => s.replace('Node ', 'Node '));
    if (nodes.length) {
        return nodes.map((n, idx) => (
            <Flex key={idx} alignItems="center" marginBottom="size-50">
                <Text className={cn('animate-fade-in', 'text-sm')}>{n}</Text>
                <CloseCircle size="XS" className="text-red-600" marginStart="size-50" />
            </Flex>
        ));
    }
    return null;
}

/**
 * Render prerequisite message content based on check state
 */
export function renderPrerequisiteMessage(check: PrerequisiteCheck): React.ReactNode {
    // Case 1: nodeVersionStatus exists - render structured version items
    if (check.nodeVersionStatus) {
        return (
            <View className={cn(prerequisiteMessage, 'animate-fade-in')}>
                {check.nodeVersionStatus.map((item, idx) => (
                    <Flex key={idx} alignItems="center" marginBottom="size-50">
                        <Text className={cn('animate-fade-in', 'text-sm')}>
                            {item.version}
                            {item.component ? ` – ${item.component}` : ''}
                        </Text>
                        {item.installed ? (
                            <CheckmarkCircle size="XS" className="text-green-600" marginStart="size-50" />
                        ) : (
                            <CloseCircle size="XS" className="text-red-600" marginStart="size-50" />
                        )}
                    </Flex>
                ))}
            </View>
        );
    }

    // Case 2: Node.js success with comma-separated versions
    if (check.name === 'Node.js' && check.status === 'success' && check.message?.includes(',')) {
        return (
            <View className={cn(prerequisiteMessage, 'animate-fade-in')}>
                {renderNodeVersionSuccess(check.message)}
            </View>
        );
    }

    // Case 3: Adobe I/O CLI error with Node version info
    if (check.name === 'Adobe I/O CLI' && check.status === 'error' && check.message?.includes('Node')) {
        const versionItems = renderAioCliErrorVersions(check.message);
        if (versionItems) {
            return (
                <View className={cn(prerequisiteMessage, 'animate-fade-in')}>
                    {versionItems}
                </View>
            );
        }
    }

    // Case 4: Default - show message text if no plugins or not success
    if (!check.plugins || check.plugins.length === 0 || check.status !== 'success') {
        return (
            <Text className={cn(
                prerequisiteMessage,
                check.status === 'error'
                    ? prerequisiteMessageError
                    : prerequisiteMessageDefault,
                'animate-fade-in',
            )}>
                {check.message || 'Waiting...'}
            </Text>
        );
    }

    return null;
}
