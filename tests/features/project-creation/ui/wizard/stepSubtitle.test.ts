/**
 * stepSubtitle — the step name in the wizard's header, in the mode's own words.
 *
 * Edit's last step is named for Create in wizard-steps.json, so an Edit that only
 * saved read "Edit Project — Create Project" (owner, 2026-10-17).
 */

import { stepSubtitle } from '@/features/project-creation/ui/wizard/stepSubtitle';

describe('stepSubtitle', () => {
    it('calls the last step "Save Changes" in Edit', () => {
        expect(stepSubtitle('create-project', 'Create Project', 'edit')).toBe('Save Changes');
    });

    it('keeps the step name when creating a project', () => {
        expect(stepSubtitle('create-project', 'Create Project', 'create')).toBe('Create Project');
    });

    it('keeps every other step name in Edit', () => {
        expect(stepSubtitle('review', 'Final Review', 'edit')).toBe('Final Review');
    });
});
