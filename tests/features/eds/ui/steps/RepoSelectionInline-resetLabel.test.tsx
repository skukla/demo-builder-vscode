/**
 * The reset tick names what it resets to: the template for a shipped brand,
 * the demo by name for an added one (D21).
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { ResetToTemplateOption } from '@/features/eds/ui/steps/repoSelectionInline.helpers';

describe('ResetToTemplateOption — the label', () => {
    it('says "template" for a shipped brand and the demo\'s name for an added one', () => {
        const { unmount } = render(<ResetToTemplateOption resetToTemplate={false} onResetToTemplateChange={jest.fn()} />);
        expect(screen.getByText('Reset to template (replaces all content)')).toBeInTheDocument();
        unmount();

        render(<ResetToTemplateOption resetToTemplate={false} onResetToTemplateChange={jest.fn()} templateName="Isle5 by Jen" />);
        expect(screen.getByText('Reset to Isle5 by Jen (replaces all content)')).toBeInTheDocument();
    });
});
