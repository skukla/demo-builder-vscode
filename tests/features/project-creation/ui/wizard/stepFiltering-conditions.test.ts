/**
 * Step Filtering Tests - edit mode and condition edge cases
 *
 * The sibling suite covers stackRequires / stackRequiresAny / showWhenNoStack for a
 * chosen stack. This one covers what nothing constrained: createModeOnly (the whole
 * edit-mode branch), and the conditions that reach the end of the filter without
 * matching any rule.
 */

import {
    filterStepsForStack,
    type WizardStepWithCondition,
} from '@/features/project-creation/ui/wizard/stepFiltering';
import { edgeDeliveryStack as stack, ids } from './stepFiltering.testUtils';

const welcome: WizardStepWithCondition = { id: 'welcome', name: 'Welcome' };
const createOnly: WizardStepWithCondition = {
    id: 'project-name',
    name: 'Project Name',
    condition: { createModeOnly: true },
};

describe('stepFiltering - createModeOnly', () => {
    it('hides a createModeOnly step in edit mode when a stack is selected', () => {
        const result = filterStepsForStack([welcome, createOnly], stack, { isEditMode: true });

        expect(ids(result)).toEqual(['welcome']);
    });

    it('hides a createModeOnly step in edit mode when NO stack is selected', () => {
        const result = filterStepsForStack([welcome, createOnly], undefined, { isEditMode: true });

        expect(ids(result)).toEqual(['welcome']);
    });

    it('hides a createModeOnly step in edit mode even when it opts into the no-stack view', () => {
        // showWhenNoStack would otherwise show it; createModeOnly is checked first and
        // wins, so an edit of a stackless project does not offer a create-only step.
        const createOnlyNoStack: WizardStepWithCondition = {
            id: 'settings',
            name: 'Settings',
            condition: { createModeOnly: true, showWhenNoStack: true },
        };

        const result = filterStepsForStack([welcome, createOnlyNoStack], undefined, {
            isEditMode: true,
        });

        expect(ids(result)).toEqual(['welcome']);
    });

    it('shows a createModeOnly step when no options are passed at all', () => {
        // The default is CREATE mode: omitting options must not hide create-only steps.
        const result = filterStepsForStack([welcome, createOnly], stack);

        expect(ids(result)).toEqual(['welcome', 'project-name']);
    });

    it('shows a createModeOnly step when options are given without isEditMode', () => {
        const result = filterStepsForStack([welcome, createOnly], stack, {});

        expect(ids(result)).toEqual(['welcome', 'project-name']);
    });

    it('leaves steps without a condition alone in edit mode', () => {
        // isHiddenInEditMode reads step.condition?.createModeOnly — in edit mode that
        // optional read is actually reached, and a step with no condition must survive.
        const result = filterStepsForStack([welcome], stack, { isEditMode: true });

        expect(ids(result)).toEqual(['welcome']);
    });

    it('shows a step that explicitly opts OUT of createModeOnly while editing', () => {
        const notCreateOnly: WizardStepWithCondition = {
            id: 'components',
            name: 'Components',
            condition: { createModeOnly: false },
        };

        const result = filterStepsForStack([notCreateOnly], stack, { isEditMode: true });

        expect(ids(result)).toEqual(['components']);
    });
});

describe('stepFiltering - conditions that require nothing of the stack', () => {
    it('shows a step whose condition names no stack requirement', () => {
        const noRequirement: WizardStepWithCondition = {
            id: 'components',
            name: 'Components',
            condition: { createModeOnly: false },
        };

        expect(ids(filterStepsForStack([noRequirement], stack))).toEqual(['components']);
    });

    it('shows a step whose stackRequiresAny list is empty', () => {
        // An empty list requires nothing, so it must not be treated as "matches none".
        const emptyAny: WizardStepWithCondition = {
            id: 'components',
            name: 'Components',
            condition: { stackRequiresAny: [] },
        };

        expect(ids(filterStepsForStack([emptyAny], stack))).toEqual(['components']);
    });
});
