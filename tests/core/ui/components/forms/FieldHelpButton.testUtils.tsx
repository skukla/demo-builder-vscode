/**
 * Opening a FieldHelpButton, and the help content the suites open it with.
 *
 * Every spec in this family starts the same way — render, click the info icon,
 * wait for the content to arrive — because the content lives behind a
 * DialogTrigger and is not in the DOM until it does.
 */
import React from 'react';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../../helpers/react-test-utils';
import { FieldHelpButton } from '@/core/ui/components/forms/FieldHelpButton';
import type { FieldHelp } from '@/types/webview';

/** Three steps, the first two with screenshots and the last without. */
export const HELP_WITH_STEPS: FieldHelp = {
    title: 'Step-by-Step Help',
    steps: [
        { text: 'Step 1: Do this first', screenshot: 'step1.png', screenshotAlt: 'Screenshot of step 1' },
        { text: 'Step 2: Then do this', screenshot: 'step2.png', screenshotAlt: 'Screenshot of step 2' },
        { text: 'Step 3: Finally do this' },
    ],
};

/** Click the info icon and wait for `settled` to appear. */
export async function openHelp(settled: string, fieldLabel = 'Test Field'): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`Help for ${fieldLabel}`, 'i') }));
    await waitFor(() => {
        expect(screen.getByText(settled)).toBeInTheDocument();
    });
}

/** Render the button, open it, and hand back the document it rendered into. */
export async function renderAndOpen(
    props: React.ComponentProps<typeof FieldHelpButton>,
    settled: string,
): Promise<HTMLElement> {
    const { baseElement } = renderWithProviders(<FieldHelpButton {...props} />);
    await openHelp(settled, props.fieldLabel);
    return baseElement;
}
