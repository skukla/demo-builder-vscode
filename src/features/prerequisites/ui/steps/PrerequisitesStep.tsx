import React, { useRef, useCallback } from 'react';
import stylesImport from '../styles/prerequisites.module.css';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

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
            <Text className={cn(styles.descriptionText, 'text-gray-700', 'text-md')}>
                Checking required tools. Missing tools can be installed automatically.
            </Text>

            <div
                ref={scrollContainerRef}
                className={styles.prerequisitesContainer}>
                <div className={styles.prerequisitesList}>
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
                                    <div className={cn(styles.progressBarContainer, 'animate-fade-in')}>
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
                                    </div>
                                )}
                                {check.plugins && check.plugins.length > 0 &&
                                    shouldShowPluginDetails(check.status, check.nodeVersionStatus) && (
                                    <div className={cn(
                                        check.nodeVersionStatus ? styles.pluginDetailsCompact : styles.pluginDetails,
                                        'animate-fade-in'
                                    )}>
                                        {(() => {
                                            if (check.nodeVersionStatus && check.plugins.length === 1) {
                                                const plugin = check.plugins[0];
                                                const versions = check.nodeVersionStatus
                                                    .filter(v => v.installed)
                                                    .map(v => v.version)
                                                    .join(', ');
                                                return (
                                                    <div key={plugin.id} className={styles.pluginItemRow}>
                                                        <Text className={cn(check.status === 'success' ? 'text-sm' : styles.prerequisitePluginItem)}>
                                                            {plugin.name.replace(/\s*✓\s*$/, '').replace(/\s*✗\s*$/, '')}
                                                            {versions ? ` (${versions})` : ''}
                                                        </Text>
                                                        {renderPluginStatusIcon(check.status, plugin.installed)}
                                                    </div>
                                                );
                                            }
                                            return (
                                                <>
                                                    {check.plugins.map(plugin => (
                                                        <div key={plugin.id} className={styles.pluginItemRow}>
                                                            <Text className={cn(check.status === 'success' ? 'text-sm' : styles.prerequisitePluginItem)}>
                                                                {plugin.name.replace(/\s*✓\s*$/, '').replace(/\s*✗\s*$/, '')}
                                                            </Text>
                                                            {renderPluginStatusIcon(check.status, plugin.installed)}
                                                        </div>
                                                    ))}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

            </div>

            <div className={styles.recheckSection}>
                <Button
                    variant="secondary"
                    onPress={() => checkPrerequisites(true)}
                    isDisabled={isChecking || installingIndex !== null}
                    className={cn('btn-standard', 'text-base')}
                >
                    Recheck
                </Button>
            </div>
        </div>
    );
}
