/**
 * Shared fixtures and queries for the ApiAccessPicker suites.
 *
 * Extracted when the second suite arrived (the matching rules — pill patterns,
 * code text, reason wording), so both drive the picker through the same render
 * and read it through the same DOM queries.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ApiAccessPicker } from '@/core/ui/components/selection/ApiAccessPicker';

export interface ApiOption {
    code: string;
    name: string;
    locked: boolean;
    requiresProfile?: boolean;
    requiresReview?: boolean;
    group?: { code: string; name: string };
}

/** Seven services (> the search threshold of 5), one locked, unsorted on purpose. */
export const APIS: ApiOption[] = [
    { code: 'TargetSDK', name: 'Adobe Target', locked: false },
    { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: true },
    { code: 'CampaignSDK', name: 'Adobe Campaign', locked: false },
    { code: 'AssetsSDK', name: 'AEM Assets', locked: false },
    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
    { code: 'AudienceManagerSDK', name: 'Audience Manager', locked: false },
    { code: 'CloudManagerSDK', name: 'Cloud Manager', locked: false },
];

export type Props = React.ComponentProps<typeof ApiAccessPicker>;

export function renderPicker(props: Partial<Props> = {}): {
    onToggle: jest.Mock;
    container: HTMLElement;
} {
    const onToggle = jest.fn();
    const { container } = render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiAccessPicker
                apis={props.apis ?? APIS}
                selected={props.selected ?? []}
                onToggle={onToggle}
                helperText={props.helperText}
            />
        </Provider>
    );
    return { onToggle, container };
}

/** Like renderPicker, but exposes a typed rerender for interaction tests. */
export function renderPickerRerenderable(props: Partial<Props> = {}): {
    container: HTMLElement;
    rerender: (next: Partial<Props>) => void;
} {
    const onToggle = jest.fn();
    const ui = (p: Partial<Props>) => (
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiAccessPicker
                apis={p.apis ?? APIS}
                selected={p.selected ?? []}
                onToggle={onToggle}
                helperText={p.helperText}
            />
        </Provider>
    );
    const { container, rerender } = render(ui(props));
    return { container, rerender: (next) => rerender(ui({ ...props, ...next })) };
}

/** The checkbox input rendered for a given API display name. */
export function checkboxFor(name: string): HTMLInputElement {
    const label = screen.getByText(name).closest('label');
    if (!label) throw new Error(`No checkbox label found for "${name}"`);
    return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

/** Row display names in DOM (render) order — the flat list, checked-first. */
export function listNames(container: HTMLElement): (string | null)[] {
    return Array.from(container.querySelectorAll('.intflow-api-name')).map((el) => el.textContent);
}

/** Filter-pill labels in render order. */
export function chipLabels(container: HTMLElement): (string | null)[] {
    return Array.from(container.querySelectorAll('.intflow-api-chip')).map((el) => el.textContent);
}

/** Secondary sdk-code texts in render order. */
export function codeTexts(container: HTMLElement): (string | null)[] {
    return Array.from(container.querySelectorAll('.intflow-api-code')).map((el) => el.textContent);
}
