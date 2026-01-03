import React, { useRef, useCallback } from 'react';
import styles from '../styles/prerequisites.module.css';
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
import {
    View,
    Flex,
    Text,
    Button,
    ProgressBar,
} from '@/core/ui/components/aria';
import { cn } from '@/core/ui/utils/classNames';
import { WizardState } from '@/types/webview';
import { NavigableStepProps } from '@/types/wizard';

// Extracted hooks and helpers

interface PrerequisitesStepProps extends NavigableStepProps {
    state: WizardState;
    componentsData?: Record<string, unknown>;
    currentStep?: string;
}

export function PrerequisitesStep({ state, setCanProceed, currentStep }: PrerequisitesStepProps) {
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
    } = usePrerequisiteState(scrollToTop, state.components);

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

    return (
        <div className="container-wizard">
            <Text marginBottom="size-200" className={cn('text-gray-700', 'text-md')}>
                Checking required tools. Missing tools can be installed automatically.
            </Text>

            <div
                ref={scrollContainerRef}
                className={styles.prerequisitesContainer}>
                <Flex direction="column" gap="size-150">
                    {checks.map((check, index) => (
                        <div
                            key={check.name}
                            ref={el => { itemRefs.current[index] = el; }}
                            className={cn(styles.prerequisiteItem, styles.prerequisiteItemGrid, index !== checks.length - 1 && styles.prerequisiteItemSpacing)}
                        >
                            {/* Icon - spans both rows, centered vertically in the entire item */}
                            <div className={styles.prerequisiteIcon}>
                                {getStatusIcon(check.status)}
                            </div>

                            {/* Header content - row 1 */}
                            <div className={styles.prerequisiteHeader}>
                                <div className={styles.prerequisiteHeaderInner}>
                                    <div>
                                        <div className={styles.prerequisiteTitle}>
                                            {check.name}
                                            {check.isOptional && <span className="text-muted-label"> (Optional)</span>}
                                            {check.status === 'pending' && <span className="text-muted-label"> (Waiting)</span>}
                                        </div>
                                        <div className={styles.prerequisiteDescription}>
                                            {check.description}
                                        </div>
                                    </div>
                                    {check.status === 'error' && check.canInstall && (
                                        <Button
                                            variant="secondary"
                                            onPress={() => installPrerequisite(index)}
                                            isDisabled={installingIndex !== null}
                                            className={cn('btn-compact', 'min-w-100')}
                                        >
                                            Install
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Expandable content - row 2 */}
                            <div className={styles.prerequisiteExpandable}>
                                {renderPrerequisiteMessage(check)}
                                {check.status === 'checking' && check.unifiedProgress && (
                                    <View marginTop="size-100" className="animate-fade-in">
                                        <ProgressBar
                                            label={
                                                `Step ${check.unifiedProgress.overall.currentStep}/${check.unifiedProgress.overall.totalSteps}: ${check.unifiedProgress.overall.stepName}${
                                                    check.unifiedProgress.command?.detail ? ` - ${check.unifiedProgress.command.detail}` : ''
                                                }`
                                            }
                                            value={getProgressValue(check.unifiedProgress)}
                                            maxValue={100}
                                            size="S"
                                            className="progress-bar-spacing progress-bar-small-label progress-bar-full-width"
                                        />
                                    </View>
                                )}
                                {check.plugins && check.plugins.length > 0 &&
                                    shouldShowPluginDetails(check.status, check.nodeVersionStatus) && (
                                    <View marginTop={check.nodeVersionStatus ? 'size-50' : 'size-100'} className="animate-fade-in">
                                        {(() => {
                                            if (check.nodeVersionStatus && check.plugins.length === 1) {
                                                const plugin = check.plugins[0];
                                                const versions = check.nodeVersionStatus
                                                    .filter(v => v.installed)
                                                    .map(v => v.version)
                                                    .join(', ');
                                                return (
                                                    <Flex key={plugin.id} alignItems="center" marginBottom="size-50">
                                                        <Text className={cn(check.status === 'success' ? 'text-sm' : styles.prerequisitePluginItem)}>
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
                                                            <Text className={cn(check.status === 'success' ? 'text-sm' : styles.prerequisitePluginItem)}>
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
                            </div>
                        </div>
                    ))}
                </Flex>

            </div>

            <Flex gap="size-150" marginTop="size-200">
                <Button
                    variant="secondary"
                    onPress={() => checkPrerequisites(true)}
                    isDisabled={isChecking || installingIndex !== null}
                    className={cn('btn-standard', 'text-base')}
                >
                    Recheck
                </Button>
            </Flex>
        </div>
    );
}
