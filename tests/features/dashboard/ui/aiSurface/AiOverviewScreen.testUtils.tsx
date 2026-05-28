/**
 * AiOverviewScreen test utilities
 *
 * Shared jest.mock setup, fixtures, and render helpers for the AiOverviewScreen
 * suite, which is split into per-aspect files:
 *   - AiOverviewScreen-rendering.test.tsx  (page chrome, body, mount)
 *   - AiOverviewScreen-skills.test.tsx     (installed-skills modal, refresh, sessions)
 *   - AiOverviewScreen-prompts.test.tsx    (user prompt launch, CRUD, copy)
 *
 * The jest.mock calls live here (hoisted above the component import) so every
 * sibling shares one source of truth; the component renders only through the
 * exported helpers, never imported directly by the test files.
 */

import { render, act } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AiOverviewScreen } from '@/features/dashboard/ui/aiSurface/AiOverviewScreen';
import '@testing-library/jest-dom';
import type { Project } from '@/types/base';
import type { AiInventory, SkillInventoryEntry } from '@/types/ai';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

// Mock the page chrome to keep tests focused on composition.
jest.mock('@/core/ui/components/layout', () => ({
    PageLayout: ({
        header,
        footer,
        children,
    }: {
        header?: React.ReactNode;
        footer?: React.ReactNode;
        children: React.ReactNode;
    }) => (
        <div data-testid="page-layout">
            <div data-testid="page-layout-header">{header}</div>
            <div data-testid="page-layout-body">{children}</div>
            <div data-testid="page-layout-footer">{footer}</div>
        </div>
    ),
    PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <h3 data-testid="page-header-subtitle">{subtitle}</h3>}
        </div>
    ),
    PageFooter: ({ leftContent, rightContent }: { leftContent?: React.ReactNode; rightContent?: React.ReactNode }) => (
        <div data-testid="page-footer">
            <div data-testid="footer-left">{leftContent}</div>
            <div data-testid="footer-right">{rightContent}</div>
        </div>
    ),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

export function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'My Demo Project',
        path: '/projects/my-demo',
        ...overrides,
    } as Project;
}

function makeSkill(overrides: Partial<SkillInventoryEntry> = {}): SkillInventoryEntry {
    return {
        name: 'add-component',
        description: 'Adds a component to a project.',
        path: '/p/.claude/skills/add-component.md',
        source: 'demo-builder',
        ...overrides,
    };
}

export function makeFullInventory(): AiInventory {
    return {
        skills: [
            makeSkill({
                name: 'add-component',
                description: 'Adds a component to a project.',
                path: '/p/.claude/skills/add-component.md',
                source: 'demo-builder',
            }),
            makeSkill({
                name: 'sync-changes',
                description: 'Chooses the correct sync operation.',
                path: '/p/.claude/skills/sync-changes.md',
                source: 'demo-builder',
            }),
            makeSkill({
                name: 'aem-block-developer',
                description: 'Develops EDS blocks for Adobe Commerce storefronts.',
                path: '/p/.claude/skills/aem-block-developer/SKILL.md',
                source: 'adobe',
            }),
        ],
        mcps: [],
        sessionMcps: [],
    };
}

export function makeProjectWithUserPrompts(): Project {
    return makeProject({
        aiPrompts: [
            { id: 'u1', title: 'My first user prompt', prompt: 'Do thing one' },
            { id: 'u2', title: 'My second user prompt', prompt: 'Do thing two' },
        ],
    } as Partial<Project>);
}

// ─── Render helpers ──────────────────────────────────────────────────────────

export async function renderScreen(opts: {
    projectOverrides?: Partial<Project>;
    inventory?: AiInventory;
    status?: 'ok' | 'warning' | 'error';
    /**
     * Override the response for specific request types. Used in handful of
     * cases where the default verify-ai-setup response shape is wrong for
     * the test.
     */
    requestOverrides?: Record<string, unknown>;
} = {}) {
    const { webviewClient } = jest.requireMock('@/core/ui/utils/WebviewClient') as {
        webviewClient: { request: jest.Mock; postMessage: jest.Mock; onMessage: jest.Mock };
    };
    const defaultVerifyResponse = {
        success: true,
        status: opts.status ?? 'ok',
        checks: [],
        inventory: opts.inventory ?? makeFullInventory(),
        globalMcpRegistration: 'registered',
    };
    webviewClient.request.mockImplementation((type: string) => {
        if (opts.requestOverrides && type in opts.requestOverrides) {
            return Promise.resolve(opts.requestOverrides[type]);
        }
        return Promise.resolve(defaultVerifyResponse);
    });

    const project = makeProject(opts.projectOverrides);
    let result!: ReturnType<typeof render>;
    await act(async () => {
        result = render(
            <Provider theme={defaultTheme}>
                <AiOverviewScreen project={project} />
            </Provider>,
        );
        jest.runAllTimers();
    });
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return { ...result, project, webviewClient };
}
