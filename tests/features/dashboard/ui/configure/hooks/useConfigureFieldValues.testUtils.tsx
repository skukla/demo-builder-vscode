/**
 * Shared harness for the `useConfigureFieldValues` suites.
 *
 * The family is split by QUESTION, not by size: one suite asks what the hook
 * READS back (defaults, shared env vars, the touched-field rule) and the other
 * what it WRITES (immutability, the linked PAAS field, URL normalisation). Both
 * need the same three things and nothing else — a project, a field, and a render
 * — so those live here rather than in two copies.
 *
 * No module mocks, and no Spectrum preamble: this is a plain hook whose
 * collaborators are pure functions over plain objects (`findFieldValue`,
 * `resolveWriteTargets`, `deriveGraphqlEndpoint`). Driving the real ones is what
 * makes an assertion about a written value mean anything.
 *
 * The SUT is imported HERE and re-exported so the specs never import it
 * directly — the convention from §3 of the webview-test-authoring skill.
 *
 * @see tests/sop/test-family-setup.test.ts
 */

import { renderHook, type RenderHookResult } from '@testing-library/react';
import type { UniqueField } from '@/features/dashboard/ui/configure/configureTypes';
import {
    useConfigureFieldValues,
    type UseConfigureFieldValuesReturn,
} from '@/features/dashboard/ui/configure/hooks/useConfigureFieldValues';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../../helpers/projectFake';

export type { UniqueField, UseConfigureFieldValuesReturn };
export { useConfigureFieldValues };

/** A project with no backend selection — the plain write path. */
export const project: Project = createMockProject({ name: 'demo', path: '/tmp/demo' });

/**
 * The linked PAAS URL field. `PAAS_URL` IS `ADOBE_COMMERCE_URL`, so this fixture
 * is also the one that exercises the derived-GraphQL-endpoint branch — worth
 * knowing before changing its key.
 */
export const urlField: UniqueField = {
    key: 'ADOBE_COMMERCE_URL',
    label: 'Commerce URL',
    type: 'url',
    required: true,
    componentIds: ['headless'],
};

/** A field declared by TWO components — the shared-env-var case. */
export const sharedField: UniqueField = { ...urlField, componentIds: ['headless', 'backend'] };

/** A plain text field, so URL-only behaviour can be shown NOT to apply. */
export const textField: UniqueField = {
    key: 'STORE_CODE',
    label: 'Store code',
    type: 'text',
    required: false,
    componentIds: ['headless'],
};

export type FieldValuesRender = RenderHookResult<
    UseConfigureFieldValuesReturn,
    { existingEnvValues: Record<string, Record<string, string>> | undefined }
>;

/**
 * Render the hook.
 *
 * `initialProps` rather than a closed-over value so a suite can `rerender` with a
 * different `existingEnvValues` — the seeding effect only re-runs when that prop's
 * identity changes, and that is a behaviour worth being able to drive.
 */
export function render(
    existingEnvValues?: Record<string, Record<string, string>>,
    withProject: Project = project
): FieldValuesRender {
    return renderHook(
        ({ existingEnvValues: values }) =>
            useConfigureFieldValues({ project: withProject, existingEnvValues: values }),
        { initialProps: { existingEnvValues } }
    );
}
