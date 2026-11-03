/**
 * The Modal family's shared setup: the subject, and rendering it inside a Spectrum Provider,
 * which every suite needs (the Dialog reads its theme).
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, type RenderResult } from '@testing-library/react';
import React from 'react';

export { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';

/** Render inside the Spectrum Provider. */
export function renderWithProvider(ui: React.ReactElement): RenderResult {
    return render(<Provider theme={defaultTheme}>{ui}</Provider>);
}
