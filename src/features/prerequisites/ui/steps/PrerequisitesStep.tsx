import {
    View,
    Flex,
    Text,
    Button,
    ProgressBar,
} from '@adobe/react-spectrum';
import React, { useRef, useCallback } from 'react';
import {
    usePrerequisiteState,
    usePrerequisiteAutoScroll,
    usePrerequisiteNavigation,
    shouldShowPluginDetails,
    getStatusIcon,
    renderPluginStatusIcon,
    getProgressValue,
    renderPrerequisiteMessage,
} from './hooks';
import { cn } from '@/core/ui/utils/classNames';
import { NavigableStepProps } from '@/types/wizard';

// Extracted hooks and helpers

interface PrerequisitesStepProps extends NavigableStepProps {
    componentsData?: Record<string, unknown>;
    currentStep?: string;
}

export function PrerequisitesStep({ setCanProceed, currentStep }: PrerequisitesStepProps) {
    // Create scroll container ref at component level to break circular dependency
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    // scrollToTop callback using the component-level ref
    const scrollToTop = useCallback(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, []);

    // State management hook
    const {
        checks,
        isChecking,
        installingIndex,
        checkInProgressRef,
        checkPrerequisites,
        installPrerequisite,
    } = usePrerequisiteState(scrollToTop);

    // Auto-scroll hook with actual checks (pass the shared ref)
    const {
        itemRefs,
        resetAutoScroll,
    } = usePrerequisiteAutoScroll(checks, setCanProceed, scrollContainerRef);

    // Navigation effects (recheck on step change)
    usePrerequisiteNavigation(
        currentStep,
        isChecking,
        checks,
        checkInProgressRef,
        checkPrerequisites,
        resetAutoScroll,
    );

    const hasErrors = checks.some(check => check.status === 'error');

    return (
        <div className="container-wizard">
            <Text marginBottom="size-200" UNSAFE_className={cn('text-gray-700', 'text-md')}>
                Checking required tools. Missing tools can be installed automatically.
            </Text>

            <div
                ref={scrollContainerRef}
                className="prerequisites-container">
                <Flex direction="column" gap="size-150">
                    {checks.map((check, index) => (
                        <div
                            key={check.name}
                            ref={el => { itemRefs.current[index] = el; }}
                        >
                            <Flex justifyContent="space-between" alignItems="center"
                                UNSAFE_className={cn('prerequisite-item', index !== checks.length - 1 && 'mb-2')}
                            >
                            <Flex gap="size-150" alignItems="center" flex>
                                {getStatusIcon(check.status)}
                                <View flex UNSAFE_className={cn('prerequisite-content')}>
                                            <Text UNSAFE_className={cn('prerequisite-title')}>
                                                {check.name}
                                                {check.isOptional && <span className="text-muted-label"> (Optional)</span>}
                                                {check.status === 'pending' && <span className="text-muted-label"> (Waiting)</span>}
                                            </Text>
                                            <Text UNSAFE_className={cn('prerequisite-description')}>
                                                {check.description}
                                            </Text>
                                            {renderPrerequisiteMessage(check)}
                                            {check.status === 'checking' && check.unifiedProgress && (
                                                <View marginTop="size-100" UNSAFE_className="animate-fade-in">
                                                    <ProgressBar
                                                        label={
                                                            `Step ${check.unifiedProgress.overall.currentStep}/${check.unifiedProgress.overall.totalSteps}: ${check.unifiedProgress.overall.stepName}${
                                                                check.unifiedProgress.command?.detail ? ` - ${check.unifiedProgress.command.detail}` : ''
                                                            }`
                                                        }
                                                        value={getProgressValue(check.unifiedProgress)}
                                                        maxValue={100}
                                                        size="S"
                                                        UNSAFE_className="mb-2 progress-bar-small-label progress-bar-full-width"
                                                    />
                                                </View>
                                            )}
                                            {check.plugins && check.plugins.length > 0 &&
                                                shouldShowPluginDetails(check.status, check.nodeVersionStatus) && (
                                                <View marginTop={check.nodeVersionStatus ? 'size-50' : 'size-100'} UNSAFE_className="animate-fade-in">
                                                    {(() => {
                                                        if (check.nodeVersionStatus && check.plugins.length === 1) {
                                                            const plugin = check.plugins[0];
                                                            const versions = check.nodeVersionStatus
                                                                .filter(v => v.installed)
                                                                .map(v => v.version)
                                                                .join(', ');
                                                            return (
                                                                <Flex key={plugin.id} alignItems="center" marginBottom="size-50">
                                                                    <Text UNSAFE_className={cn(check.status === 'success' ? 'text-sm' : 'prerequisite-plugin-item')}>
                                                                        {plugin.name.replace(/\s*✓\s*$/, '').replace(/\s*✗\s*$/, '')}
                                                                        {versions ? ` (${versions})` : ''}
                                                                    </Text>
                                                                    {renderPluginStatusIcon(check.status, plugin.installed)}
                                                                </Flex>
                                                            );
                                                        }
                                                        return (
                                                            <>
                                                                {check.plugins.map(plugin => (
                                                                    <Flex key={plugin.id} alignItems="center" marginBottom="size-50">
                                                                        <Text UNSAFE_className={cn(check.status === 'success' ? 'text-sm' : 'prerequisite-plugin-item')}>
                                                                            {plugin.name.replace(/\s*✓\s*$/, '').replace(/\s*✗\s*$/, '')}
                                                                        </Text>
                                                                        {renderPluginStatusIcon(check.status, plugin.installed)}
                                                                    </Flex>
                                                                ))}
                                                            </>
                                                        );
                                                    })()}
                                                 </View>
                                             )}
                                </View>
                            </Flex>
                            {check.status === 'error' && check.canInstall && (
                                <Button
                                            variant="secondary"
                                            onPress={() => installPrerequisite(index)}
                                            isDisabled={installingIndex !== null}
                                            UNSAFE_className={cn('btn-compact', 'min-w-100')}
                                        >
                                            Install
                                </Button>
                            )}
                        </Flex>
                        </div>
                    ))}
                </Flex>

            </div>

            <Flex gap="size-150" marginTop="size-200">
                <Button
                    variant="secondary"
                    onPress={checkPrerequisites}
                    isDisabled={isChecking || installingIndex !== null}
                    UNSAFE_className={cn('btn-standard', 'text-base')}
                >
                    Recheck
                </Button>
            </Flex>
        </div>
    );
}
