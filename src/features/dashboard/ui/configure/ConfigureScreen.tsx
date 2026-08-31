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
 * @module features/dashboard/ui/configure/ConfigureScreen
 */

import { Form, Button, View } from '@adobe/react-spectrum';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { buildAppBuilderComponentFieldGroups } from './appBuilderComponentFieldModel';
import { validateServiceGroups } from './configureFieldValidation';
import { ConfigureSectionBody } from './ConfigureSectionBody';
import { buildConfigureSections, toStepRailTabs } from './configureSections';
import type { SaveConfigurationResponse, ServiceGroup, UniqueField } from './configureTypes';
import { useConfigureFieldValues } from './hooks/useConfigureFieldValues';
import { useSelectedComponents } from './hooks/useSelectedComponents';
import { useServiceGroups } from './hooks/useServiceGroups';
import { withStoredSecretsPreserved } from './storedSecretPayload';
import { PageHeader, PageFooter } from '@/core/ui/components/layout';
// Direct paths, not the barrels: several Configure suites mock `components/layout`
// wholesale to stub PageHeader/PageFooter, and a barrel import would hand this screen an
// undefined shell/rail. Both are plain presentational markup, so tests render the REAL
// ones and drive the rail the way a user does.
import { StepAreaShell } from '@/core/ui/components/layout/StepAreaShell';
import { StepRail } from '@/core/ui/components/navigation/StepRail';
import { useFocusTrap } from '@/core/ui/hooks';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { normalizeProjectName, getProjectNameError } from '@/core/validation/normalizers';
import { ACCS_OAUTH_CLIENT_ID } from '@/core/config/envVarKeys';
import { StoreConfigFieldRow } from '@/features/components/ui/components/StoreConfigFieldRow';
import { useAutoStoreDetect } from '@/features/components/ui/hooks/useAutoStoreDetect';
import { useCredentialService } from '@/features/components/ui/hooks/useCredentialService';
import { useStoreDiscovery } from '@/features/components/ui/hooks/useStoreDiscovery';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AuthoringExperience } from '@/types/base';
import { hasEntries } from '@/types/typeGuards';
import type { DeploymentStatusPayload, ConfigureInitialData } from '@/types/webviewPayloads';

/** Stable empty references for optional appBuilderComponent props (avoid hook churn). */
const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];
const EMPTY_PROVIDED: Record<string, string> = {};
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
    if (isSaving) return 'Saving...';
    if (isDeploying) return 'Deploying...';
    return 'Save Changes';
}

export function ConfigureScreen({
    project,
    componentsData,
    existingEnvValues,
    existingProjectNames = [],
    isEds = false,
    authoringExperience: initialAuthoringExperience,
    appBuilderComponentCatalog = EMPTY_CATALOG,
    providedEnvVars = EMPTY_PROVIDED,
    appBuilderComponentSecretFlags = EMPTY_SECRET_FLAGS,
    componentSecretFlags = EMPTY_SECRET_FLAGS,
}: ConfigureScreenProps) {
    const [authoringExperience, setAuthoringExperience] = useState<AuthoringExperience>(
        initialAuthoringExperience ?? 'da-live-classic',
    );
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isDeploying, setIsDeploying] = useState(false);
    // Which section the rail is on. Re-opening Configure re-sends `init` WITHOUT
    // remounting React (baseWebviewCommand.createOrRevealPanel), so this deliberately
    // survives a re-open and puts the user back where they were — matching
    // `retainContextWhenHidden`, which already preserves it across a tab-away.
    // `componentConfigs` does reset on that init; the asymmetry is accepted.
    const [activeSectionId, setActiveSectionId] = useState('project-info');
    // The TITLE as typed, not the slug. `handleRenameProject` derives the slug
    // from it on save, so this field never has to show hyphens.
    // Explicitly `string`: this holds RAW user input while they type. It is
    // seeded from the display name but stops being one the moment a key lands,
    // so branding the state would be a lie the compiler then enforces.
    const [projectName, setProjectName] = useState<string>(getProjectDisplayName(project));
    const [projectNameTouched, setProjectNameTouched] = useState(false);

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
        stageAppBuilderComponentValue,
    } = useConfigureFieldValues({ project, existingEnvValues });

    // Listen for deployment status updates from backend
    // This keeps the Save button disabled during mesh/storefront deployment
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('deployment-status', (data) => {
            const payload = data as DeploymentStatusPayload;
            setIsDeploying(payload.isDeploying);
        });
        return unsubscribe;
    }, []);

    // Validate project name
    const projectNameError = useMemo(() => {
        if (!projectNameTouched) return undefined;
        // Validate the DERIVED slug: it is what has to be a legal folder and what
        // `existingProjectNames` holds. Validating the raw title would reject
        // every capital and space the field now exists to allow.
        return getProjectNameError(
            normalizeProjectName(projectName),
            existingProjectNames,
            project.name,
        );
    }, [projectName, existingProjectNames, project.name, projectNameTouched]);

    // Keep what was typed. It used to run `normalizeProjectName` on every
    // keystroke, so "My Bodea Demo" rewrote itself under the cursor.
    const handleProjectNameChange = useCallback((value: string) => {
        setProjectName(value);
        setProjectNameTouched(true);
    }, []);

    // Get all selected components with their data (using extracted hook)
    const selectedComponents = useSelectedComponents({ project, componentsData });

    // Deduplicate fields and organize by service group
    const serviceGroups = useServiceGroups({ selectedComponents, componentsData });

    // Commerce store discovery — matches wizard UX. Connection fields (ACCS endpoint,
    // PaaS URL + credentials) trigger automatic discovery; store-code fields render as
    // cascading Pickers once results arrive.
    const {
        isFetching,
        fetchError,
        hasStoreData,
        fetchStores,
        getWebsiteItems,
        getStoreGroupItems,
        getStoreViewItems,
        isStoreGroup,
    } = useStoreDiscovery();

    const { autoDetectKey, forceFetch } = useAutoStoreDetect({
        configs: componentConfigs,
        orgId: project.adobe?.organization,
        fetchStores,
        hasStoreData,
        isFetching,
        // Configure is the surface that renders a SAVED project, so it is the one
        // whose password may already have migrated out of the config map.
        secretFlags: componentSecretFlags,
    });

    // GLOBAL validation: every service group, not the one on screen. An error the user
    // cannot see must still block Save, and its rail tab is what points them at it.
    useEffect(() => {
        setValidationErrors(validateServiceGroups(serviceGroups, getValueFromConfigs));
    }, [serviceGroups, getValueFromConfigs]);

    const fieldHasError = useCallback(
        (field: UniqueField): boolean => validationErrors[field.key] !== undefined,
        [validationErrors],
    );

    // One App Builder render group per selected component that has visible fields.
    const appBuilderGroups = useMemo(
        () => buildAppBuilderComponentFieldGroups(appBuilderComponentCatalog, providedEnvVars),
        [appBuilderComponentCatalog, providedEnvVars],
    );

    // Validate project name — see projectNameError above; the rail reads it too.
    const sections = useMemo(
        () =>
            buildConfigureSections({
                serviceGroups,
                isFieldComplete,
                fieldHasError,
                appBuilderGroups,
                isEds,
                isProjectNameValid: !projectNameError,
            }),
        [serviceGroups, isFieldComplete, fieldHasError, appBuilderGroups, isEds, projectNameError],
    );

    // Sections come and go as components are configured, so the stored id can go stale;
    // fall back to the first tab (Project, which is always present) rather than a blank view.
    const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

    const railTabs = useMemo(
        () => toStepRailTabs(sections, activeSection.id),
        [sections, activeSection.id],
    );

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            // Include projectName if it changed
            // Compare against the TITLE, so editing only the capitalisation of a
            // title still counts as a change. Comparing to the slug would treat
            // "bodea demo" -> "Bodea Demo" as a no-op and silently discard it.
            const newProjectName =
                projectName.trim() !== getProjectDisplayName(project)
                    ? projectName.trim()
                    : undefined;
            // The authoring-experience preference is EDS-only; for non-EDS projects
            // it is omitted entirely so the payload shape is unchanged.
            const result = await webviewClient.request<SaveConfigurationResponse>(
                'save-configuration',
                {
                    componentConfigs: withStoredSecretsPreserved(
                        componentConfigs,
                        componentSecretFlags,
                        touchedFields,
                    ),
                    newProjectName,
                    ...(isEds ? { authoringExperience } : {}),
                },
            );
            if (!result.success) {
                throw new Error(result.error || 'Failed to save configuration');
            }
        } catch {
            // Error handled by extension - no action needed
            // Extension shows user-facing error message via webview communication
        } finally {
            setIsSaving(false);
        }
    }, [
        componentConfigs,
        // Both feed the stored-secret filter. A stale closure here would send the
        // blank placeholder and delete the credential — the exact failure the
        // filter exists to prevent.
        componentSecretFlags,
        touchedFields,
        projectName,
        // `project`, not `project.name`: handleSave now compares against
        // `getProjectDisplayName(project)`, which reads `title` too. Depending on
        // `.name` alone left a stale closure that would compare a new title
        // against an old one and silently drop the rename.
        project,
        isEds,
        authoringExperience,
    ]);

    const handleCancel = useCallback(() => {
        webviewClient.postMessage('cancel');
    }, []);

    // Can save if no validation errors (env vars and project name). This walks EVERY
    // group's errors, not the rendered one's — a hidden section can still block Save,
    // and its rail tab carries `hasError` so the user can reach it.
    const canSave = !hasEntries(validationErrors) && !projectNameError;

    // Same treatment the wizard's Connection step gets: these two fields are an
    // override, and an empty box that cannot say so is what sent people to the
    // Developer Console. One config entry, two surfaces — they must agree.
    const hasBrokeredCredentialField = useMemo(
        () =>
            serviceGroups.some((group) =>
                group.fields.some((field) => field.key === ACCS_OAUTH_CLIENT_ID),
            ),
        [serviceGroups],
    );
    const credentialService = useCredentialService(
        hasBrokeredCredentialField,
        project.adobe?.organization,
    );

    const renderFieldRow = useCallback(
        (field: UniqueField, group: ServiceGroup) => (
            <StoreConfigFieldRow
                field={field}
                group={group}
                credentialService={credentialService}
                secretFlags={componentSecretFlags}
                autoDetectKey={autoDetectKey}
                isFetching={isFetching}
                hasStoreData={hasStoreData}
                fetchError={fetchError}
                isStoreGroup={isStoreGroup}
                getFieldValue={getFieldValue}
                updateField={updateField}
                validationErrors={validationErrors}
                touchedFields={touchedFields}
                normalizeUrlField={normalizeUrlField}
                getWebsiteItems={getWebsiteItems}
                getStoreGroupItems={getStoreGroupItems}
                getStoreViewItems={getStoreViewItems}
                onRefresh={forceFetch}
            />
        ),
        [
            autoDetectKey,
            isFetching,
            hasStoreData,
            fetchError,
            isStoreGroup,
            getFieldValue,
            updateField,
            validationErrors,
            touchedFields,
            normalizeUrlField,
            getWebsiteItems,
            getStoreGroupItems,
            getStoreViewItems,
            forceFetch,
            credentialService,
            componentSecretFlags,
        ],
    );

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
                                projectFolder={normalizeProjectName(projectName)}
                                appBuilderComponentCatalog={appBuilderComponentCatalog}
                                componentConfigs={componentConfigs}
                                providedEnvVars={providedEnvVars}
                                appBuilderComponentSecretFlags={appBuilderComponentSecretFlags}
                                onAppBuilderValueChange={stageAppBuilderComponentValue}
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
