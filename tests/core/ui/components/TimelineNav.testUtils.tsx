/**
 * Shared setup for the TimelineNav suites.
 *
 * All three suites render the same three-step rail through a Spectrum
 * Provider and reach for steps by the same testid, so the render wrapper, the
 * step fixtures and the element accessors live here rather than three times.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { TimelineStep } from '@/core/ui/components/TimelineNav';

/** Every TimelineNav render needs a Spectrum Provider around it. */
export const renderWithProvider = (ui: React.ReactElement) =>
    render(<Provider theme={defaultTheme}>{ui}</Provider>);

/** The mid-wizard shape the suites use: 0 completed, 1 current, 2 upcoming. */
export const STEPS: TimelineStep[] = [
    { id: 'welcome', name: 'Welcome' },
    { id: 'build', name: 'Build Your Project' },
    { id: 'review', name: 'Review' },
];

/** Build-Your-Project's areas, as the rail renders them under the current step. */
export const CHILDREN: TimelineStep[] = [
    { id: 'commerce', name: 'Commerce' },
    { id: 'storefront', name: 'Storefront' },
    { id: 'integrations', name: 'Integrations' },
];

/** The step element for an id — the tooltip host that carries the classes. */
export const step = (id: string): HTMLElement => screen.getByTestId(`timeline-step-${id}`);
