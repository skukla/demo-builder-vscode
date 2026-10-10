/**
 * ConfigureScreen
 *
 * The Configure surface, laid out like a wizard area: a horizontal {@link StepRail}
 * across the top with one tab per configurable section, and exactly ONE section's fields
 * below it. It replaced a stacked form with a "Sections" sidebar that listed only the
 * service groups — so the sidebar was never the list of sections on screen.
 *
 * Three invariants survive the one-section-at-a-time layout, and each has a test:
 *   - Save submits EVERY section. `componentConfigs` spans all of them and stays lifted
 *     here; a section that is not rendered still contributes its values.
 *   - Validation stays GLOBAL. The validation effect walks every service group, not the
 *     mounted one, so an error in a hidden section still disables Save.
 *   - That error stays FINDABLE. `hasError` rides each section onto its rail tab,
 *     because a disabled Save with no visible cause is a dead end.
 *
 * This file is the wiring and the page chrome. The jobs live in hooks (EDS-8): the
 * project-name field in `useProjectNameField`, Save/Close and the busy flags in
 * `useConfigureSave`, the sections, global validation and rail in `useConfigureSections`,
 * and the field row with store discovery in `useConfigureFieldRow`. A new rail tab is a
 * new section kind in `buildConfigureSections` plus its body in `ConfigureSectionBody`.
 *
 * @module features/dashboard/ui/configure/ConfigureScreen
 */

import { Form, Button, View } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { ConfigureSectionBody } from './ConfigureSectionBody';
import { useConfigureFieldRow } from './hooks/useConfigureFieldRow';
import { useConfigureFieldValues } from './hooks/useConfigureFieldValues';
import { useConfigureSave } from './hooks/useConfigureSave';
import { useConfigureSections } from './hooks/useConfigureSections';
import { useProjectNameField } from './hooks/useProjectNameField';
import { useSelectedComponents } from './hooks/useSelectedComponents';
import { useServiceGroups } from './hooks/useServiceGroups';
import { PageFooter } from '@/core/ui/components/layout/PageFooter';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
// Direct paths, not the barrels: several Configure suites mock `components/layout`
// wholesale to stub PageHeader/PageFooter, and a barrel import would hand this screen an
// undefined shell/rail. Both are plain presentational markup, so tests render the REAL
// ones and drive the rail the way a user does.
import { StepAreaShell } from '@/core/ui/components/layout/StepAreaShell';
import { StepRail } from '@/core/ui/components/navigation/StepRail';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import type { AuthoringExperience } from '@/types/base';
import type { ConfigureInitialData } from '@/types/webviewPayloads';

/** Stable empty reference for an optional prop (avoid hook churn). */
const EMPTY_SECRET_FLAGS: Record<string, Record<string, boolean>> = {};

/**
 * Init payload (`ConfigureInitialData`): `project` and `componentsData` stay
 * required (the entry guards on them before mounting); the rest is relaxed to
 * Partial because tests render the screen without the full wire.
 */
export type ConfigureScreenProps = Pick<ConfigureInitialData, 'project' | 'componentsData'> &
    Partial<Omit<ConfigureInitialData, 'project' | 'componentsData'>>;

/** Derive save button label from saving/deploying state */
function getSaveButtonLabel(isSaving: boolean, isDeploying: boolean): string {
    if (isSaving) return 'Saving';
    if (isDeploying) return 'Deploying';
    return 'Save Changes';
}

export function ConfigureScreen({
    project,
    componentsData,
    existingEnvValues,
    existingProjectNames = [],
    isEds = false,
    authoringExperience: initialAuthoringExperience,
    componentSecretFlags = EMPTY_SECRET_FLAGS,
}: ConfigureScreenProps) {
    const [authoringExperience, setAuthoringExperience] = useState<AuthoringExperience>(
        initialAuthoringExperience ?? 'da-live-classic',
    );
    const {
        projectName,
        projectNameTouched,
        projectNameError,
        projectFolder,
        handleProjectNameChange,
    } = useProjectNameField({ project, existingProjectNames });

    // Focus trap for keyboard navigation
    const containerRef = useFocusTrap<HTMLDivElement>({
        enabled: true,
        autoFocus: false,
        containFocus: true,
    });

    // Every section's field values, lifted so an edit survives switching sections.
    const {
        componentConfigs,
        touchedFields,
        getFieldValue,
        getValueFromConfigs,
        isFieldComplete,
        updateField,
        normalizeUrlField,
    } = useConfigureFieldValues({ project, existingEnvValues });

    const { isSaving, isDeploying, handleSave, handleCancel } = useConfigureSave({
        project,
        projectName,
        componentConfigs,
        componentSecretFlags,
        touchedFields,
        isEds,
        authoringExperience,
    });

    // Get all selected components with their data (using extracted hook)
    const selectedComponents = useSelectedComponents({ project, componentsData });

    // Deduplicate fields and organize by service group
    const serviceGroups = useServiceGroups({ selectedComponents, componentsData });

    const { validationErrors, activeSection, railTabs, setActiveSectionId, canSave } =
        useConfigureSections({
            serviceGroups,
            getValueFromConfigs,
            isFieldComplete,
            isEds,
            projectNameError,
        });

    const { renderFieldRow, autoDetectKey } = useConfigureFieldRow({
        project,
        componentConfigs,
        componentSecretFlags,
        serviceGroups,
        getFieldValue,
        updateField,
        validationErrors,
        touchedFields,
        normalizeUrlField,
    });

    return (
        <div ref={containerRef} className="container-configure">
            <View width="100%" height="100%">
                <div className="content-area">
                    {/* Header */}
                    <PageHeader title="Configure Project" subtitle={projectName} />

                    {/* Content — the wizard's area shell: rail on top, one section below.
                        `.step-view` is the single scroller, so the Form is a plain block
                        (no `container-form`) and there is no second scroll parent. */}
                    <StepAreaShell
                        areaLabel="Configure"
                        viewKey={activeSection.id}
                        rail={
                            <StepRail
                                steps={railTabs}
                                activeId={activeSection.id}
                                onSelect={setActiveSectionId}
                            />
                        }
                    >
                        <Form>
                            <ConfigureSectionBody
                                section={activeSection}
                                serviceGroups={serviceGroups}
                                renderFieldRow={renderFieldRow}
                                // Same signal StoreConfigFieldRow discloses on, so the
                                // Business Structure heading and its fields appear together.
                                storeStructureReady={Boolean(autoDetectKey)}
                                projectName={projectName}
                                onProjectNameChange={handleProjectNameChange}
                                projectNameError={projectNameError}
                                projectNameTouched={projectNameTouched}
                                projectFolder={projectFolder}
                                authoringExperience={authoringExperience}
                                onAuthoringExperienceChange={setAuthoringExperience}
                            />
                        </Form>
                    </StepAreaShell>

                    {/* Footer */}
                    <PageFooter
                        leftContent={
                            <Button
                                variant="secondary"
                                onPress={handleCancel}
                                isQuiet
                                isDisabled={isSaving || isDeploying}
                            >
                                Close
                            </Button>
                        }
                        rightContent={
                            <Button
                                variant="accent"
                                onPress={handleSave}
                                isDisabled={!canSave || isSaving || isDeploying}
                            >
                                {getSaveButtonLabel(isSaving, isDeploying)}
                            </Button>
                        }
                    />
                </div>
            </View>
        </div>
    );
}
