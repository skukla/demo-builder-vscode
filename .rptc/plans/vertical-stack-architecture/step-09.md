# Step 9: Wizard Steps (UI Components and Handlers)

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Create the new wizard UI steps for EDS configuration that enable users to:
1. Configure ACCS data source credentials and select commerce data variations
2. Authenticate with GitHub and configure DA.live organization/site

This step builds on the services created in Steps 2-4 (GitHubService, DaLiveService, EdsProjectService) and follows the established wizard step patterns used throughout the extension.

---

## Prerequisites

- [ ] Step 1 complete: Component registry updated with eds-citisignal-storefront component
- [ ] Step 2 complete: GitHubService for OAuth and repository operations
- [ ] Step 3 complete: DaLiveService for content management
- [ ] Step 4 complete: EdsProjectService for orchestration
- [ ] Step 5 complete: Tool integration (commerce-demo-ingestion)

---

## Dependencies

### Existing Dependencies (Reused)

- `@adobe/react-spectrum` - UI components (Heading, Text, TextField, Picker, etc.)
- `@spectrum-icons/workflow` - Icons (Key, Cloud, GitHub, etc.)
- `@/core/ui/components/feedback/StatusDisplay` - Status indicators
- `@/core/ui/components/layout/SingleColumnLayout` - Layout wrapper
- `@/core/ui/utils/WebviewClient` - Extension communication
- `@/core/ui/utils/webviewLogger` - Logging utility
- `@/types/wizard` - BaseStepProps and related types

### From Previous Steps

- `@/features/eds/services/githubService` - GitHub OAuth and API (Step 2)
- `@/features/eds/services/daLiveService` - DA.live operations (Step 3)
- `@/features/eds/services/edsProjectService` - Project orchestration (Step 4)
- `@/features/eds/services/types` - TypeScript interfaces

---

## Files to Create/Modify

### New Files

- [ ] `src/features/eds/ui/steps/DataSourceConfigStep.tsx` - ACCS credentials and data source configuration
- [ ] `src/features/eds/ui/steps/GitHubDaLiveSetupStep.tsx` - Combined GitHub/DA.live setup
- [ ] `src/features/eds/ui/hooks/useEdsSetup.ts` - Custom hook for EDS setup state management
- [ ] `src/features/eds/ui/hooks/useGitHubAuth.ts` - Custom hook for GitHub OAuth flow
- [ ] `src/features/eds/handlers/edsHandlers.ts` - Message handlers for EDS operations
- [ ] `src/features/eds/handlers/index.ts` - Handler exports
- [ ] `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx` - Unit tests
- [ ] `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx` - Unit tests
- [ ] `tests/unit/features/eds/handlers/edsHandlers.test.ts` - Handler tests

### Files to Modify

- [ ] `templates/wizard-steps.json` - Add new step configurations
- [ ] `src/features/project-creation/handlers/HandlerRegistry.ts` - Register EDS handlers
- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx` - Import and render new steps
- [ ] `src/types/webview.ts` - Add EDS state to WizardState

### Directory Structure

```
src/features/eds/
├── index.ts                    # Public API exports
├── services/                   # From Steps 2-4
│   ├── types.ts
│   ├── githubService.ts
│   ├── daLiveService.ts
│   └── edsProjectService.ts
├── handlers/
│   ├── index.ts               # Handler exports
│   └── edsHandlers.ts         # Message handlers
└── ui/
    ├── steps/
    │   ├── DataSourceConfigStep.tsx
    │   └── GitHubDaLiveSetupStep.tsx
    └── hooks/
        ├── useEdsSetup.ts
        └── useGitHubAuth.ts

tests/unit/features/eds/
├── services/                  # From Steps 2-4
└── ui/
    ├── steps/
    │   ├── DataSourceConfigStep.test.tsx
    │   └── GitHubDaLiveSetupStep.test.tsx
    └── hooks/
        └── useGitHubAuth.test.ts
```

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with @testing-library/react
- **Environment:** jsdom (React components)
- **Mocking:** Mock webviewClient, services, and VS Code API
- **Coverage Target:** 85% for UI components, 90% for handlers

### Test Categories

1. **Component Rendering Tests** - Verify correct UI states render
2. **User Interaction Tests** - Verify form inputs and button actions
3. **State Management Tests** - Verify hook state transitions
4. **Handler Tests** - Verify message handler responses
5. **Integration Tests** - Verify step flow and data passing

---

## Tests to Write First (RED Phase)

### DataSourceConfigStep Tests

#### Test File: `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should render ACCS credentials form when EDS component selected
  - **Given:** Wizard state has eds-citisignal-storefront as frontend
  - **When:** DataSourceConfigStep renders
  - **Then:** Shows ACCS Host, Store View Code, and Customer Group inputs
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should show data source picker with available options
  - **Given:** Step renders successfully
  - **When:** User views the data source section
  - **Then:** Picker shows options: citisignal-electronics, citisignal-fashion, custom
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should validate ACCS host URL format
  - **Given:** User enters invalid URL in ACCS Host field
  - **When:** Input loses focus
  - **Then:** Shows validation error message
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should enable Continue when all required fields valid
  - **Given:** All required fields populated with valid values
  - **When:** Form validation runs
  - **Then:** setCanProceed(true) is called
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should disable Continue when required fields empty
  - **Given:** One or more required fields empty
  - **When:** Form validation runs
  - **Then:** setCanProceed(false) is called
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should update wizard state on field changes
  - **Given:** User types in ACCS Host field
  - **When:** Input value changes
  - **Then:** updateState called with new edsConfig.accsHost value
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should show loading indicator during validation
  - **Given:** User clicks validate credentials button
  - **When:** Backend validation in progress
  - **Then:** Shows loading spinner on validate button
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should display validation success message
  - **Given:** Backend validates ACCS credentials successfully
  - **When:** Validation response received
  - **Then:** Shows success status with green checkmark
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should display validation error with recovery hint
  - **Given:** Backend validates ACCS credentials and fails
  - **When:** Error response received
  - **Then:** Shows error status with helpful message
  - **File:** `tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

### GitHubDaLiveSetupStep Tests

#### Test File: `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show GitHub sign-in prompt when not authenticated
  - **Given:** No GitHub token stored
  - **When:** GitHubDaLiveSetupStep renders
  - **Then:** Shows "Sign in with GitHub" button
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show GitHub authenticated state with username
  - **Given:** Valid GitHub token and user data available
  - **When:** Step renders
  - **Then:** Shows "Connected as @username" with avatar
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should initiate OAuth flow on sign-in button click
  - **Given:** User not authenticated with GitHub
  - **When:** User clicks "Sign in with GitHub"
  - **Then:** webviewClient.postMessage('github-oauth') is called
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show repository name input after GitHub auth
  - **Given:** GitHub authentication complete
  - **When:** Step renders authenticated state
  - **Then:** Shows "Repository Name" text input
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should validate repository name format
  - **Given:** User enters repo name with invalid characters
  - **When:** Input validation runs
  - **Then:** Shows error "Repository names can only contain letters, numbers, and hyphens"
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show DA.live organization input field
  - **Given:** GitHub authenticated
  - **When:** Step renders DA.live section
  - **Then:** Shows "DA.live Organization" input field
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show DA.live site name input field
  - **Given:** GitHub authenticated
  - **When:** Step renders DA.live section
  - **Then:** Shows "Site Name" input field
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should verify DA.live org access on blur
  - **Given:** User enters DA.live org name
  - **When:** Input loses focus
  - **Then:** webviewClient.postMessage('verify-dalive-org') is called
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show DA.live access verified indicator
  - **Given:** Backend verifies DA.live org access successfully
  - **When:** Verification response received
  - **Then:** Shows green checkmark next to org input
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show DA.live access denied error
  - **Given:** Backend returns access denied for org
  - **When:** Verification response received
  - **Then:** Shows error message with "Request access" hint
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should enable Continue only when all requirements met
  - **Given:** GitHub authed, valid repo name, DA.live org verified
  - **When:** Form validation runs
  - **Then:** setCanProceed(true) is called
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should handle GitHub OAuth timeout
  - **Given:** OAuth flow started
  - **When:** 2 minutes pass without callback
  - **Then:** Shows timeout error with retry button
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should handle GitHub OAuth cancellation
  - **Given:** OAuth flow started
  - **When:** User cancels in browser
  - **Then:** Shows "Authorization cancelled" message
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should preserve state when navigating back
  - **Given:** User has entered GitHub/DA.live config
  - **When:** User navigates back then returns to step
  - **Then:** All previously entered values restored
  - **File:** `tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

### useGitHubAuth Hook Tests

#### Test File: `tests/unit/features/eds/ui/hooks/useGitHubAuth.test.ts`

- [ ] **Test:** Should check GitHub auth status on mount
  - **Given:** Hook is mounted
  - **When:** useEffect runs
  - **Then:** Sends 'check-github-auth' message
  - **File:** `tests/unit/features/eds/ui/hooks/useGitHubAuth.test.ts`

- [ ] **Test:** Should update state when auth-status received
  - **Given:** Hook listening for messages
  - **When:** 'github-auth-status' message received
  - **Then:** Updates isAuthenticated, user, and scopes state
  - **File:** `tests/unit/features/eds/ui/hooks/useGitHubAuth.test.ts`

- [ ] **Test:** Should set isAuthenticating during OAuth flow
  - **Given:** User initiates OAuth
  - **When:** initiateOAuth() called
  - **Then:** isAuthenticating is true until response
  - **File:** `tests/unit/features/eds/ui/hooks/useGitHubAuth.test.ts`

- [ ] **Test:** Should handle OAuth error response
  - **Given:** OAuth flow in progress
  - **When:** 'github-oauth-error' message received
  - **Then:** Sets error state with message
  - **File:** `tests/unit/features/eds/ui/hooks/useGitHubAuth.test.ts`

### EDS Handlers Tests

#### Test File: `tests/unit/features/eds/handlers/edsHandlers.test.ts`

- [ ] **Test:** handleCheckGitHubAuth should check token validity
  - **Given:** Handler context with GitHubService
  - **When:** handleCheckGitHubAuth called
  - **Then:** Returns auth status via sendMessage
  - **File:** `tests/unit/features/eds/handlers/edsHandlers.test.ts`

- [ ] **Test:** handleGitHubOAuth should initiate OAuth flow
  - **Given:** Handler context with GitHubService
  - **When:** handleGitHubOAuth called
  - **Then:** Calls gitHubService.initiateOAuth()
  - **File:** `tests/unit/features/eds/handlers/edsHandlers.test.ts`

- [ ] **Test:** handleVerifyDaLiveOrg should check org access
  - **Given:** Handler context with DaLiveService
  - **When:** handleVerifyDaLiveOrg called with {org: "test-org"}
  - **Then:** Returns access verification result
  - **File:** `tests/unit/features/eds/handlers/edsHandlers.test.ts`

- [ ] **Test:** handleValidateAccsCredentials should test ACCS endpoint
  - **Given:** Handler context with network access
  - **When:** handleValidateAccsCredentials called with credentials
  - **Then:** Tests ACCS endpoint and returns validation result
  - **File:** `tests/unit/features/eds/handlers/edsHandlers.test.ts`

- [ ] **Test:** handleCheckGitHubAuth should handle missing token
  - **Given:** No GitHub token stored
  - **When:** handleCheckGitHubAuth called
  - **Then:** Returns {isAuthenticated: false}
  - **File:** `tests/unit/features/eds/handlers/edsHandlers.test.ts`

- [ ] **Test:** handleGitHubOAuth should send auth-complete on success
  - **Given:** OAuth flow completes successfully
  - **When:** Token received
  - **Then:** Sends 'github-auth-complete' with user data
  - **File:** `tests/unit/features/eds/handlers/edsHandlers.test.ts`

- [ ] **Test:** handleGitHubOAuth should send error on OAuth failure
  - **Given:** OAuth flow fails (timeout/cancelled)
  - **When:** Error received
  - **Then:** Sends 'github-oauth-error' with error details
  - **File:** `tests/unit/features/eds/handlers/edsHandlers.test.ts`

---

## Implementation Details

### RED Phase (Write Failing Tests First)

```typescript
// tests/unit/features/eds/ui/steps/DataSourceConfigStep.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataSourceConfigStep } from '@/features/eds/ui/steps/DataSourceConfigStep';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { WizardState } from '@/types/webview';

// Mock dependencies
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()), // Returns unsubscribe function
    },
}));

jest.mock('@/core/ui/utils/webviewLogger', () => ({
    webviewLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('DataSourceConfigStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const defaultState: Partial<WizardState> = {
        selectedComponents: {
            frontend: 'eds-citisignal-storefront',
            backend: 'accs-backend',
            dependencies: new Set(['commerce-mesh']),
            services: new Set(),
        },
        edsConfig: {
            accsHost: '',
            storeViewCode: '',
            customerGroup: '',
            dataSource: undefined,
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render ACCS credentials form when EDS component selected', () => {
        render(
            <DataSourceConfigStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        expect(screen.getByLabelText(/ACCS Host/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Store View Code/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Customer Group/i)).toBeInTheDocument();
    });

    it('should show data source picker with available options', () => {
        render(
            <DataSourceConfigStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const picker = screen.getByLabelText(/Data Source/i);
        expect(picker).toBeInTheDocument();

        // Open picker to see options
        fireEvent.click(picker);

        expect(screen.getByText(/CitiSignal Electronics/i)).toBeInTheDocument();
        expect(screen.getByText(/CitiSignal Fashion/i)).toBeInTheDocument();
    });

    it('should validate ACCS host URL format', async () => {
        const user = userEvent.setup();

        render(
            <DataSourceConfigStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const hostInput = screen.getByLabelText(/ACCS Host/i);
        await user.type(hostInput, 'not-a-valid-url');
        await user.tab(); // Trigger blur

        await waitFor(() => {
            expect(screen.getByText(/Please enter a valid URL/i)).toBeInTheDocument();
        });
    });

    it('should enable Continue when all required fields valid', async () => {
        const stateWithData: Partial<WizardState> = {
            ...defaultState,
            edsConfig: {
                accsHost: 'https://commerce.example.com',
                storeViewCode: 'default',
                customerGroup: '0',
                dataSource: 'citisignal-electronics',
            },
        };

        render(
            <DataSourceConfigStep
                state={stateWithData as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        await waitFor(() => {
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });

    it('should disable Continue when required fields empty', () => {
        render(
            <DataSourceConfigStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        expect(mockSetCanProceed).toHaveBeenCalledWith(false);
    });

    it('should update wizard state on field changes', async () => {
        const user = userEvent.setup();

        render(
            <DataSourceConfigStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const hostInput = screen.getByLabelText(/ACCS Host/i);
        await user.type(hostInput, 'https://commerce.adobe.com');

        expect(mockUpdateState).toHaveBeenCalledWith(
            expect.objectContaining({
                edsConfig: expect.objectContaining({
                    accsHost: expect.stringContaining('https://commerce.adobe.com'),
                }),
            })
        );
    });

    it('should show loading indicator during validation', async () => {
        const user = userEvent.setup();

        render(
            <DataSourceConfigStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        // Fill in required fields first
        const hostInput = screen.getByLabelText(/ACCS Host/i);
        await user.type(hostInput, 'https://commerce.adobe.com');

        const validateButton = screen.getByRole('button', { name: /Validate/i });
        await user.click(validateButton);

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
});
```

```typescript
// tests/unit/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GitHubDaLiveSetupStep } from '@/features/eds/ui/steps/GitHubDaLiveSetupStep';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { WizardState } from '@/types/webview';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

describe('GitHubDaLiveSetupStep', () => {
    const mockUpdateState = jest.fn();
    const mockSetCanProceed = jest.fn();

    const defaultState: Partial<WizardState> = {
        edsConfig: {
            accsHost: 'https://commerce.adobe.com',
            storeViewCode: 'default',
            customerGroup: '0',
            dataSource: 'citisignal-electronics',
            githubAuth: undefined,
            repoName: '',
            daLiveOrg: '',
            daLiveSite: '',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should show GitHub sign-in prompt when not authenticated', () => {
        render(
            <GitHubDaLiveSetupStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        expect(screen.getByRole('button', { name: /Sign in with GitHub/i })).toBeInTheDocument();
    });

    it('should show GitHub authenticated state with username', () => {
        const authState: Partial<WizardState> = {
            ...defaultState,
            edsConfig: {
                ...defaultState.edsConfig!,
                githubAuth: {
                    isAuthenticated: true,
                    user: {
                        login: 'testuser',
                        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
                    },
                },
            },
        };

        render(
            <GitHubDaLiveSetupStep
                state={authState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        expect(screen.getByText(/Connected as @testuser/i)).toBeInTheDocument();
    });

    it('should initiate OAuth flow on sign-in button click', async () => {
        const user = userEvent.setup();

        render(
            <GitHubDaLiveSetupStep
                state={defaultState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const signInButton = screen.getByRole('button', { name: /Sign in with GitHub/i });
        await user.click(signInButton);

        expect(webviewClient.postMessage).toHaveBeenCalledWith('github-oauth');
    });

    it('should show repository name input after GitHub auth', () => {
        const authState: Partial<WizardState> = {
            ...defaultState,
            edsConfig: {
                ...defaultState.edsConfig!,
                githubAuth: { isAuthenticated: true, user: { login: 'testuser' } },
            },
        };

        render(
            <GitHubDaLiveSetupStep
                state={authState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        expect(screen.getByLabelText(/Repository Name/i)).toBeInTheDocument();
    });

    it('should validate repository name format', async () => {
        const user = userEvent.setup();
        const authState: Partial<WizardState> = {
            ...defaultState,
            edsConfig: {
                ...defaultState.edsConfig!,
                githubAuth: { isAuthenticated: true, user: { login: 'testuser' } },
            },
        };

        render(
            <GitHubDaLiveSetupStep
                state={authState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const repoInput = screen.getByLabelText(/Repository Name/i);
        await user.type(repoInput, 'invalid repo name!');
        await user.tab();

        await waitFor(() => {
            expect(screen.getByText(/letters, numbers, and hyphens/i)).toBeInTheDocument();
        });
    });

    it('should show DA.live organization input field', () => {
        const authState: Partial<WizardState> = {
            ...defaultState,
            edsConfig: {
                ...defaultState.edsConfig!,
                githubAuth: { isAuthenticated: true, user: { login: 'testuser' } },
            },
        };

        render(
            <GitHubDaLiveSetupStep
                state={authState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        expect(screen.getByLabelText(/DA\.live Organization/i)).toBeInTheDocument();
    });

    it('should verify DA.live org access on blur', async () => {
        const user = userEvent.setup();
        const authState: Partial<WizardState> = {
            ...defaultState,
            edsConfig: {
                ...defaultState.edsConfig!,
                githubAuth: { isAuthenticated: true, user: { login: 'testuser' } },
            },
        };

        render(
            <GitHubDaLiveSetupStep
                state={authState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        const orgInput = screen.getByLabelText(/DA\.live Organization/i);
        await user.type(orgInput, 'my-org');
        await user.tab();

        expect(webviewClient.postMessage).toHaveBeenCalledWith('verify-dalive-org', { org: 'my-org' });
    });

    it('should enable Continue only when all requirements met', async () => {
        const completeState: Partial<WizardState> = {
            ...defaultState,
            edsConfig: {
                ...defaultState.edsConfig!,
                githubAuth: { isAuthenticated: true, user: { login: 'testuser' } },
                repoName: 'my-storefront',
                daLiveOrg: 'my-org',
                daLiveOrgVerified: true,
                daLiveSite: 'my-site',
            },
        };

        render(
            <GitHubDaLiveSetupStep
                state={completeState as WizardState}
                updateState={mockUpdateState}
                setCanProceed={mockSetCanProceed}
            />
        );

        await waitFor(() => {
            expect(mockSetCanProceed).toHaveBeenCalledWith(true);
        });
    });
});
```

```typescript
// tests/unit/features/eds/handlers/edsHandlers.test.ts

import {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleVerifyDaLiveOrg,
    handleValidateAccsCredentials,
} from '@/features/eds/handlers/edsHandlers';
import type { HandlerContext } from '@/commands/handlers/HandlerContext';

// Mock services
const mockGitHubService = {
    validateToken: jest.fn(),
    initiateOAuth: jest.fn(),
    getAuthenticatedUser: jest.fn(),
};

const mockDaLiveService = {
    verifyOrgAccess: jest.fn(),
};

describe('EDS Handlers', () => {
    let mockContext: Partial<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            sendMessage: jest.fn(),
            logger: {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as any,
            getGitHubService: jest.fn(() => mockGitHubService),
            getDaLiveService: jest.fn(() => mockDaLiveService),
        };
    });

    describe('handleCheckGitHubAuth', () => {
        it('should check token validity and return auth status', async () => {
            mockGitHubService.validateToken.mockResolvedValue({
                valid: true,
                scopes: ['repo', 'user:email'],
                user: 'testuser',
            });
            mockGitHubService.getAuthenticatedUser.mockResolvedValue({
                login: 'testuser',
                avatarUrl: 'https://avatars.github.com/u/123',
            });

            const result = await handleCheckGitHubAuth(mockContext as HandlerContext);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-status', {
                isAuthenticated: true,
                user: expect.objectContaining({ login: 'testuser' }),
            });
        });

        it('should handle missing token', async () => {
            mockGitHubService.validateToken.mockResolvedValue({ valid: false });

            const result = await handleCheckGitHubAuth(mockContext as HandlerContext);

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-status', {
                isAuthenticated: false,
            });
        });
    });

    describe('handleGitHubOAuth', () => {
        it('should initiate OAuth flow', async () => {
            mockGitHubService.initiateOAuth.mockResolvedValue({
                token: 'gho_test123',
                scopes: ['repo', 'user:email'],
            });
            mockGitHubService.getAuthenticatedUser.mockResolvedValue({
                login: 'testuser',
                avatarUrl: 'https://avatars.github.com/u/123',
            });

            const result = await handleGitHubOAuth(mockContext as HandlerContext);

            expect(result.success).toBe(true);
            expect(mockGitHubService.initiateOAuth).toHaveBeenCalled();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-auth-complete', {
                isAuthenticated: true,
                user: expect.objectContaining({ login: 'testuser' }),
            });
        });

        it('should send error on OAuth failure', async () => {
            mockGitHubService.initiateOAuth.mockRejectedValue(new Error('OAuth timeout'));

            const result = await handleGitHubOAuth(mockContext as HandlerContext);

            expect(result.success).toBe(false);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('github-oauth-error', {
                error: 'OAuth timeout',
            });
        });
    });

    describe('handleVerifyDaLiveOrg', () => {
        it('should verify org access', async () => {
            mockDaLiveService.verifyOrgAccess.mockResolvedValue({
                hasAccess: true,
                orgName: 'my-org',
            });

            const result = await handleVerifyDaLiveOrg(
                mockContext as HandlerContext,
                { org: 'my-org' }
            );

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('dalive-org-verified', {
                hasAccess: true,
                orgName: 'my-org',
            });
        });

        it('should return access denied reason', async () => {
            mockDaLiveService.verifyOrgAccess.mockResolvedValue({
                hasAccess: false,
                orgName: 'private-org',
                reason: 'access denied',
            });

            const result = await handleVerifyDaLiveOrg(
                mockContext as HandlerContext,
                { org: 'private-org' }
            );

            expect(mockContext.sendMessage).toHaveBeenCalledWith('dalive-org-verified', {
                hasAccess: false,
                orgName: 'private-org',
                reason: 'access denied',
            });
        });
    });

    describe('handleValidateAccsCredentials', () => {
        it('should validate ACCS endpoint', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200,
            });

            const result = await handleValidateAccsCredentials(
                mockContext as HandlerContext,
                {
                    host: 'https://commerce.adobe.com',
                    storeViewCode: 'default',
                    customerGroup: '0',
                }
            );

            expect(result.success).toBe(true);
            expect(mockContext.sendMessage).toHaveBeenCalledWith('accs-validation-result', {
                valid: true,
            });
        });

        it('should return validation failure details', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 401,
            });

            const result = await handleValidateAccsCredentials(
                mockContext as HandlerContext,
                {
                    host: 'https://commerce.adobe.com',
                    storeViewCode: 'default',
                    customerGroup: '0',
                }
            );

            expect(mockContext.sendMessage).toHaveBeenCalledWith('accs-validation-result', {
                valid: false,
                error: expect.stringContaining('401'),
            });
        });
    });
});
```

### GREEN Phase (Minimal Implementation)

#### Types Addition (`src/types/webview.ts`)

Add to WizardState interface:

```typescript
// Add to WizardState in src/types/webview.ts
export interface EDSConfig {
    // Data source configuration
    accsHost: string;
    storeViewCode: string;
    customerGroup: string;
    dataSource?: 'citisignal-electronics' | 'citisignal-fashion' | 'custom';
    accsValidated?: boolean;
    accsValidationError?: string;

    // GitHub configuration
    githubAuth?: {
        isAuthenticated: boolean;
        isAuthenticating?: boolean;
        user?: {
            login: string;
            avatarUrl?: string;
            email?: string;
        };
        error?: string;
    };
    repoName: string;

    // DA.live configuration
    daLiveOrg: string;
    daLiveOrgVerified?: boolean;
    daLiveOrgError?: string;
    daLiveSite: string;
}

// Add to WizardState
export interface WizardState {
    // ... existing fields
    edsConfig?: EDSConfig;
}
```

#### DataSourceConfigStep (`src/features/eds/ui/steps/DataSourceConfigStep.tsx`)

```typescript
/**
 * DataSourceConfigStep - Configure ACCS credentials and data source
 *
 * Collects:
 * - ACCS Host URL
 * - Store View Code
 * - Customer Group
 * - Data source selection (citisignal-electronics, citisignal-fashion, custom)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    Heading,
    Text,
    TextField,
    Picker,
    Item,
    View,
    Flex,
    Button,
    ProgressCircle,
} from '@adobe/react-spectrum';
import Cloud from '@spectrum-icons/workflow/Cloud';
import Checkmark from '@spectrum-icons/workflow/Checkmark';
import Alert from '@spectrum-icons/workflow/Alert';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import type { BaseStepProps } from '@/types/wizard';
import type { EDSConfig } from '@/types/webview';

const log = webviewLogger('DataSourceConfigStep');

/**
 * Available data source options for CitiSignal EDS
 */
const DATA_SOURCES = [
    {
        id: 'citisignal-electronics',
        name: 'CitiSignal Electronics',
        description: 'Electronics product catalog',
    },
    {
        id: 'citisignal-fashion',
        name: 'CitiSignal Fashion',
        description: 'Fashion and apparel catalog',
    },
    {
        id: 'custom',
        name: 'Custom Data Source',
        description: 'Use your own product catalog',
    },
];

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return url.startsWith('https://');
    } catch {
        return false;
    }
}

export function DataSourceConfigStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps) {
    const edsConfig = state.edsConfig || {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        dataSource: undefined,
        repoName: '',
        daLiveOrg: '',
        daLiveSite: '',
    };

    const [isValidating, setIsValidating] = useState(false);
    const [hostError, setHostError] = useState<string | undefined>();

    // Update edsConfig helper
    const updateEdsConfig = useCallback((updates: Partial<EDSConfig>) => {
        updateState({
            edsConfig: { ...edsConfig, ...updates },
        });
    }, [edsConfig, updateState]);

    // Validate host URL on blur
    const handleHostBlur = useCallback(() => {
        if (edsConfig.accsHost && !isValidUrl(edsConfig.accsHost)) {
            setHostError('Please enter a valid HTTPS URL');
        } else {
            setHostError(undefined);
        }
    }, [edsConfig.accsHost]);

    // Validate ACCS credentials
    const handleValidate = useCallback(async () => {
        if (!isValidUrl(edsConfig.accsHost)) {
            setHostError('Please enter a valid HTTPS URL');
            return;
        }

        setIsValidating(true);
        log.debug('Validating ACCS credentials...');

        webviewClient.postMessage('validate-accs-credentials', {
            host: edsConfig.accsHost,
            storeViewCode: edsConfig.storeViewCode,
            customerGroup: edsConfig.customerGroup,
        });
    }, [edsConfig]);

    // Listen for validation results
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('accs-validation-result', (data) => {
            setIsValidating(false);

            if (data.valid) {
                log.info('ACCS credentials validated');
                updateEdsConfig({
                    accsValidated: true,
                    accsValidationError: undefined,
                });
            } else {
                log.warn('ACCS validation failed:', data.error);
                updateEdsConfig({
                    accsValidated: false,
                    accsValidationError: data.error,
                });
            }
        });

        return unsubscribe;
    }, [updateEdsConfig]);

    // Update canProceed based on form validity
    useEffect(() => {
        const isValid =
            isValidUrl(edsConfig.accsHost) &&
            edsConfig.storeViewCode.trim() !== '' &&
            edsConfig.customerGroup.trim() !== '' &&
            edsConfig.dataSource !== undefined;

        setCanProceed(isValid);
    }, [edsConfig, setCanProceed]);

    return (
        <SingleColumnLayout>
            <Heading level={2} marginBottom="size-300">
                Configure Data Source
            </Heading>

            <Text marginBottom="size-400">
                Enter your ACCS (Adobe Commerce Cloud Service) credentials
                and select a data source for your storefront.
            </Text>

            {/* ACCS Credentials Section */}
            <View marginBottom="size-400">
                <Heading level={3} marginBottom="size-200">
                    <Flex alignItems="center" gap="size-100">
                        <Cloud size="S" />
                        <Text>ACCS Configuration</Text>
                    </Flex>
                </Heading>

                <Flex direction="column" gap="size-200">
                    <TextField
                        label="ACCS Host"
                        placeholder="https://your-instance.adobecommerce.com"
                        value={edsConfig.accsHost}
                        onChange={(value) => updateEdsConfig({ accsHost: value })}
                        onBlur={handleHostBlur}
                        validationState={hostError ? 'invalid' : undefined}
                        errorMessage={hostError}
                        width="100%"
                        isRequired
                    />

                    <Flex gap="size-200" wrap>
                        <TextField
                            label="Store View Code"
                            placeholder="default"
                            value={edsConfig.storeViewCode}
                            onChange={(value) => updateEdsConfig({ storeViewCode: value })}
                            width="size-2400"
                            isRequired
                        />

                        <TextField
                            label="Customer Group"
                            placeholder="0"
                            value={edsConfig.customerGroup}
                            onChange={(value) => updateEdsConfig({ customerGroup: value })}
                            width="size-2400"
                            isRequired
                        />
                    </Flex>

                    <View marginTop="size-100">
                        <Button
                            variant="secondary"
                            onPress={handleValidate}
                            isDisabled={
                                isValidating ||
                                !edsConfig.accsHost ||
                                !edsConfig.storeViewCode
                            }
                        >
                            {isValidating ? (
                                <ProgressCircle
                                    size="S"
                                    aria-label="Validating"
                                    isIndeterminate
                                />
                            ) : (
                                'Validate Credentials'
                            )}
                        </Button>
                    </View>
                </Flex>

                {/* Validation Status */}
                {edsConfig.accsValidated && (
                    <StatusDisplay
                        variant="success"
                        icon={<Checkmark size="S" />}
                        title="Credentials Verified"
                        message="Successfully connected to ACCS endpoint"
                    />
                )}

                {edsConfig.accsValidationError && (
                    <StatusDisplay
                        variant="error"
                        icon={<Alert size="S" />}
                        title="Validation Failed"
                        message={edsConfig.accsValidationError}
                    />
                )}
            </View>

            {/* Data Source Selection */}
            <View marginBottom="size-400">
                <Heading level={3} marginBottom="size-200">
                    Data Source
                </Heading>

                <Text marginBottom="size-200">
                    Select the demo data catalog to populate your storefront.
                </Text>

                <Picker
                    label="Data Source"
                    selectedKey={edsConfig.dataSource}
                    onSelectionChange={(key) =>
                        updateEdsConfig({ dataSource: key as EDSConfig['dataSource'] })
                    }
                    width="100%"
                    isRequired
                >
                    {DATA_SOURCES.map((source) => (
                        <Item key={source.id} textValue={source.name}>
                            <Text>{source.name}</Text>
                            <Text slot="description">{source.description}</Text>
                        </Item>
                    ))}
                </Picker>
            </View>
        </SingleColumnLayout>
    );
}
```

#### GitHubDaLiveSetupStep (`src/features/eds/ui/steps/GitHubDaLiveSetupStep.tsx`)

```typescript
/**
 * GitHubDaLiveSetupStep - Configure GitHub and DA.live for EDS deployment
 *
 * Handles:
 * - GitHub OAuth authentication
 * - Repository name configuration
 * - DA.live organization verification
 * - DA.live site name configuration
 */

import React, { useEffect, useCallback } from 'react';
import {
    Heading,
    Text,
    TextField,
    View,
    Flex,
    Button,
    Avatar,
    ProgressCircle,
    Divider,
} from '@adobe/react-spectrum';
import Login from '@spectrum-icons/workflow/Login';
import Checkmark from '@spectrum-icons/workflow/Checkmark';
import Alert from '@spectrum-icons/workflow/Alert';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import { SingleColumnLayout } from '@/core/ui/components/layout/SingleColumnLayout';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { useGitHubAuth } from '../hooks/useGitHubAuth';
import type { BaseStepProps } from '@/types/wizard';
import type { EDSConfig } from '@/types/webview';

const log = webviewLogger('GitHubDaLiveSetupStep');

/**
 * Validate repository name format
 */
function isValidRepoName(name: string): boolean {
    // GitHub repo names: alphanumeric, hyphens, underscores, periods
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

export function GitHubDaLiveSetupStep({
    state,
    updateState,
    setCanProceed,
}: BaseStepProps) {
    const edsConfig = state.edsConfig || {
        accsHost: '',
        storeViewCode: '',
        customerGroup: '',
        repoName: '',
        daLiveOrg: '',
        daLiveSite: '',
    };

    const {
        isAuthenticated,
        isAuthenticating,
        user,
        error: authError,
        initiateOAuth,
    } = useGitHubAuth(state, updateState);

    // Update edsConfig helper
    const updateEdsConfig = useCallback((updates: Partial<EDSConfig>) => {
        updateState({
            edsConfig: { ...edsConfig, ...updates },
        });
    }, [edsConfig, updateState]);

    // Verify DA.live org access on blur
    const handleOrgBlur = useCallback(() => {
        const org = edsConfig.daLiveOrg?.trim();
        if (org) {
            log.debug('Verifying DA.live org access:', org);
            webviewClient.postMessage('verify-dalive-org', { org });
        }
    }, [edsConfig.daLiveOrg]);

    // Listen for DA.live verification results
    useEffect(() => {
        const unsubscribe = webviewClient.onMessage('dalive-org-verified', (data) => {
            log.debug('DA.live org verification result:', data);
            updateEdsConfig({
                daLiveOrgVerified: data.hasAccess,
                daLiveOrgError: data.hasAccess ? undefined : data.reason,
            });
        });

        return unsubscribe;
    }, [updateEdsConfig]);

    // Validate repository name
    const repoNameError = edsConfig.repoName && !isValidRepoName(edsConfig.repoName)
        ? 'Repository names can only contain letters, numbers, hyphens, and underscores'
        : undefined;

    // Update canProceed based on all requirements
    useEffect(() => {
        const isValid =
            isAuthenticated &&
            edsConfig.repoName?.trim() !== '' &&
            isValidRepoName(edsConfig.repoName || '') &&
            edsConfig.daLiveOrg?.trim() !== '' &&
            edsConfig.daLiveOrgVerified === true &&
            edsConfig.daLiveSite?.trim() !== '';

        setCanProceed(isValid);
    }, [
        isAuthenticated,
        edsConfig.repoName,
        edsConfig.daLiveOrg,
        edsConfig.daLiveOrgVerified,
        edsConfig.daLiveSite,
        setCanProceed,
    ]);

    return (
        <SingleColumnLayout>
            <Heading level={2} marginBottom="size-300">
                GitHub & DA.live Setup
            </Heading>

            <Text marginBottom="size-400">
                Connect to GitHub to create your repository and configure DA.live
                for content management.
            </Text>

            {/* GitHub Authentication Section */}
            <View marginBottom="size-400">
                <Heading level={3} marginBottom="size-200">
                    GitHub Authentication
                </Heading>

                {!isAuthenticated && !isAuthenticating && (
                    <StatusDisplay
                        variant="info"
                        title="Connect to GitHub"
                        message="Sign in with GitHub to create your storefront repository."
                        actions={[
                            {
                                label: 'Sign in with GitHub',
                                icon: <Login size="S" />,
                                variant: 'accent',
                                onPress: initiateOAuth,
                            },
                        ]}
                    />
                )}

                {isAuthenticating && (
                    <StatusDisplay
                        variant="info"
                        title="Signing in..."
                        message="Complete authentication in your browser."
                    >
                        <ProgressCircle size="M" isIndeterminate aria-label="Authenticating" />
                    </StatusDisplay>
                )}

                {isAuthenticated && user && (
                    <Flex alignItems="center" gap="size-200" marginBottom="size-200">
                        <Avatar
                            src={user.avatarUrl}
                            alt={user.login}
                            size="avatar-size-400"
                        />
                        <View>
                            <Text UNSAFE_className="font-semibold">
                                Connected as @{user.login}
                            </Text>
                            <Text UNSAFE_className="text-gray-500 text-sm">
                                GitHub account linked successfully
                            </Text>
                        </View>
                        <Checkmark size="S" UNSAFE_className="text-green-500" />
                    </Flex>
                )}

                {authError && (
                    <StatusDisplay
                        variant="error"
                        icon={<Alert size="S" />}
                        title="Authentication Failed"
                        message={authError}
                        actions={[
                            {
                                label: 'Try Again',
                                variant: 'secondary',
                                onPress: initiateOAuth,
                            },
                        ]}
                    />
                )}
            </View>

            {/* Repository Configuration - Only show when authenticated */}
            {isAuthenticated && (
                <>
                    <Divider marginY="size-300" />

                    <View marginBottom="size-400">
                        <Heading level={3} marginBottom="size-200">
                            Repository Configuration
                        </Heading>

                        <TextField
                            label="Repository Name"
                            placeholder="my-citisignal-storefront"
                            value={edsConfig.repoName}
                            onChange={(value) => updateEdsConfig({ repoName: value })}
                            validationState={repoNameError ? 'invalid' : undefined}
                            errorMessage={repoNameError}
                            description={`Will be created as github.com/${user?.login}/${edsConfig.repoName || '<name>'}`}
                            width="100%"
                            isRequired
                        />
                    </View>

                    <Divider marginY="size-300" />

                    {/* DA.live Configuration */}
                    <View marginBottom="size-400">
                        <Heading level={3} marginBottom="size-200">
                            DA.live Configuration
                        </Heading>

                        <Text marginBottom="size-200">
                            Configure the DA.live organization and site for content authoring.
                        </Text>

                        <Flex direction="column" gap="size-200">
                            <Flex alignItems="end" gap="size-200">
                                <TextField
                                    label="DA.live Organization"
                                    placeholder="my-org"
                                    value={edsConfig.daLiveOrg}
                                    onChange={(value) => updateEdsConfig({
                                        daLiveOrg: value,
                                        daLiveOrgVerified: undefined,
                                        daLiveOrgError: undefined,
                                    })}
                                    onBlur={handleOrgBlur}
                                    validationState={edsConfig.daLiveOrgError ? 'invalid' : undefined}
                                    width="size-3600"
                                    isRequired
                                />
                                {edsConfig.daLiveOrgVerified && (
                                    <Checkmark size="S" UNSAFE_className="text-green-500 mb-2" />
                                )}
                            </Flex>

                            {edsConfig.daLiveOrgError && (
                                <Text UNSAFE_className="text-red-500 text-sm">
                                    {edsConfig.daLiveOrgError}
                                </Text>
                            )}

                            <TextField
                                label="Site Name"
                                placeholder="my-storefront"
                                value={edsConfig.daLiveSite}
                                onChange={(value) => updateEdsConfig({ daLiveSite: value })}
                                description="The site name within your DA.live organization"
                                width="size-3600"
                                isRequired
                            />
                        </Flex>
                    </View>
                </>
            )}
        </SingleColumnLayout>
    );
}
```

#### useGitHubAuth Hook (`src/features/eds/ui/hooks/useGitHubAuth.ts`)

```typescript
/**
 * useGitHubAuth - Hook for managing GitHub OAuth state
 *
 * Handles:
 * - Initial auth status check
 * - OAuth flow initiation
 * - Auth status updates from extension
 */

import { useEffect, useCallback } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { WizardState } from '@/types/webview';

const log = webviewLogger('useGitHubAuth');

interface GitHubAuthState {
    isAuthenticated: boolean;
    isAuthenticating: boolean;
    user?: {
        login: string;
        avatarUrl?: string;
        email?: string;
    };
    error?: string;
}

interface UseGitHubAuthReturn extends GitHubAuthState {
    initiateOAuth: () => void;
}

export function useGitHubAuth(
    state: WizardState,
    updateState: (updates: Partial<WizardState>) => void,
): UseGitHubAuthReturn {
    const githubAuth = state.edsConfig?.githubAuth;

    const updateGitHubAuth = useCallback((updates: Partial<GitHubAuthState>) => {
        updateState({
            edsConfig: {
                ...state.edsConfig!,
                githubAuth: {
                    ...state.edsConfig?.githubAuth,
                    ...updates,
                },
            },
        });
    }, [state.edsConfig, updateState]);

    // Check auth status on mount
    useEffect(() => {
        log.debug('Checking GitHub auth status');
        webviewClient.postMessage('check-github-auth');

        // Listen for auth status
        const unsubscribeStatus = webviewClient.onMessage('github-auth-status', (data) => {
            log.debug('GitHub auth status received:', data);
            updateGitHubAuth({
                isAuthenticated: data.isAuthenticated,
                isAuthenticating: false,
                user: data.user,
                error: undefined,
            });
        });

        // Listen for auth complete
        const unsubscribeComplete = webviewClient.onMessage('github-auth-complete', (data) => {
            log.info('GitHub OAuth complete');
            updateGitHubAuth({
                isAuthenticated: true,
                isAuthenticating: false,
                user: data.user,
                error: undefined,
            });
        });

        // Listen for auth errors
        const unsubscribeError = webviewClient.onMessage('github-oauth-error', (data) => {
            log.warn('GitHub OAuth error:', data.error);
            updateGitHubAuth({
                isAuthenticated: false,
                isAuthenticating: false,
                error: data.error,
            });
        });

        return () => {
            unsubscribeStatus();
            unsubscribeComplete();
            unsubscribeError();
        };
    }, [updateGitHubAuth]);

    // Initiate OAuth flow
    const initiateOAuth = useCallback(() => {
        log.info('Initiating GitHub OAuth');
        updateGitHubAuth({
            isAuthenticating: true,
            error: undefined,
        });
        webviewClient.postMessage('github-oauth');
    }, [updateGitHubAuth]);

    return {
        isAuthenticated: githubAuth?.isAuthenticated ?? false,
        isAuthenticating: githubAuth?.isAuthenticating ?? false,
        user: githubAuth?.user,
        error: githubAuth?.error,
        initiateOAuth,
    };
}
```

#### EDS Handlers (`src/features/eds/handlers/edsHandlers.ts`)

```typescript
/**
 * EDS Handlers - Message handlers for EDS wizard operations
 *
 * Handles:
 * - GitHub authentication check and OAuth
 * - DA.live organization verification
 * - ACCS credentials validation
 */

import type { HandlerContext, MessageHandler } from '@/commands/handlers/HandlerContext';
import { SimpleResult } from '@/types/results';
import { ErrorCode } from '@/types/errorCodes';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Check GitHub authentication status
 */
export const handleCheckGitHubAuth: MessageHandler = async (
    context: HandlerContext,
): Promise<SimpleResult> => {
    context.logger.debug('[EDS] Checking GitHub auth status');

    try {
        const githubService = context.getGitHubService?.();
        if (!githubService) {
            context.logger.warn('[EDS] GitHubService not available');
            await context.sendMessage('github-auth-status', { isAuthenticated: false });
            return { success: true };
        }

        const validation = await githubService.validateToken();

        if (validation.valid) {
            const user = await githubService.getAuthenticatedUser();
            await context.sendMessage('github-auth-status', {
                isAuthenticated: true,
                user: {
                    login: user.login,
                    avatarUrl: user.avatarUrl,
                    email: user.email,
                },
            });
        } else {
            await context.sendMessage('github-auth-status', {
                isAuthenticated: false,
                missingScopes: validation.missingScopes,
            });
        }

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] GitHub auth check failed:', error as Error);
        await context.sendMessage('github-auth-status', { isAuthenticated: false });
        return { success: true }; // Still success - UI handles unauthenticated state
    }
};

/**
 * Initiate GitHub OAuth flow
 */
export const handleGitHubOAuth: MessageHandler = async (
    context: HandlerContext,
): Promise<SimpleResult> => {
    context.logger.info('[EDS] Starting GitHub OAuth flow');

    try {
        const githubService = context.getGitHubService?.();
        if (!githubService) {
            await context.sendMessage('github-oauth-error', {
                error: 'GitHub service not available',
            });
            return { success: false, code: ErrorCode.UNKNOWN };
        }

        // This opens browser and waits for callback
        const token = await githubService.initiateOAuth();
        context.logger.info('[EDS] GitHub OAuth completed, token received');

        // Get user info for UI
        const user = await githubService.getAuthenticatedUser();

        await context.sendMessage('github-auth-complete', {
            isAuthenticated: true,
            user: {
                login: user.login,
                avatarUrl: user.avatarUrl,
                email: user.email,
            },
        });

        return { success: true };
    } catch (error: any) {
        context.logger.error('[EDS] GitHub OAuth failed:', error);

        let errorMessage = 'GitHub authentication failed';
        if (error.message?.includes('timeout')) {
            errorMessage = 'Authentication timed out. Please try again.';
        } else if (error.message?.includes('cancelled')) {
            errorMessage = 'Authorization was cancelled.';
        }

        await context.sendMessage('github-oauth-error', { error: errorMessage });
        return { success: false, code: ErrorCode.AUTH_REQUIRED };
    }
};

/**
 * Verify DA.live organization access
 */
export const handleVerifyDaLiveOrg: MessageHandler = async (
    context: HandlerContext,
    payload?: { org: string },
): Promise<SimpleResult> => {
    const org = payload?.org;
    if (!org) {
        await context.sendMessage('dalive-org-verified', {
            hasAccess: false,
            reason: 'Organization name is required',
        });
        return { success: false, code: ErrorCode.VALIDATION };
    }

    context.logger.debug(`[EDS] Verifying DA.live org access: ${org}`);

    try {
        const daLiveService = context.getDaLiveService?.();
        if (!daLiveService) {
            await context.sendMessage('dalive-org-verified', {
                hasAccess: false,
                orgName: org,
                reason: 'DA.live service not available',
            });
            return { success: false, code: ErrorCode.UNKNOWN };
        }

        const result = await daLiveService.verifyOrgAccess(org);

        await context.sendMessage('dalive-org-verified', {
            hasAccess: result.hasAccess,
            orgName: result.orgName,
            reason: result.reason,
        });

        return { success: true };
    } catch (error) {
        context.logger.error('[EDS] DA.live org verification failed:', error as Error);
        await context.sendMessage('dalive-org-verified', {
            hasAccess: false,
            orgName: org,
            reason: 'Failed to verify organization access',
        });
        return { success: false, code: ErrorCode.NETWORK };
    }
};

/**
 * Validate ACCS credentials
 */
export const handleValidateAccsCredentials: MessageHandler = async (
    context: HandlerContext,
    payload?: { host: string; storeViewCode: string; customerGroup: string },
): Promise<SimpleResult> => {
    if (!payload?.host) {
        await context.sendMessage('accs-validation-result', {
            valid: false,
            error: 'ACCS host is required',
        });
        return { success: false, code: ErrorCode.VALIDATION };
    }

    context.logger.debug(`[EDS] Validating ACCS credentials for ${payload.host}`);

    try {
        // Test GraphQL endpoint connectivity
        const graphqlUrl = `${payload.host}/graphql`;

        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            TIMEOUTS.API_CALL,
        );

        const response = await fetch(graphqlUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Store': payload.storeViewCode,
            },
            body: JSON.stringify({
                query: '{ storeConfig { store_code } }',
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            if (data.data?.storeConfig?.store_code) {
                context.logger.info('[EDS] ACCS credentials validated successfully');
                await context.sendMessage('accs-validation-result', { valid: true });
                return { success: true };
            }
        }

        const errorMsg = response.ok
            ? 'Invalid response from ACCS endpoint'
            : `HTTP ${response.status}: ${response.statusText}`;

        await context.sendMessage('accs-validation-result', {
            valid: false,
            error: errorMsg,
        });
        return { success: true }; // Handler succeeded, validation failed

    } catch (error: any) {
        const errorMsg = error.name === 'AbortError'
            ? 'Connection timed out'
            : `Connection failed: ${error.message}`;

        context.logger.warn('[EDS] ACCS validation failed:', error);
        await context.sendMessage('accs-validation-result', {
            valid: false,
            error: errorMsg,
        });
        return { success: true };
    }
};
```

#### Handler Index (`src/features/eds/handlers/index.ts`)

```typescript
/**
 * EDS Handlers - Public exports
 */

export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleVerifyDaLiveOrg,
    handleValidateAccsCredentials,
} from './edsHandlers';
```

### Modifications Required

#### wizard-steps.json Update

```json
{
  "steps": [
    // ... existing steps up to component-selection
    {
      "id": "data-source-config",
      "name": "Data Source",
      "enabled": true,
      "requiredComponents": ["eds-citisignal-storefront"]
    },
    {
      "id": "github-dalive-setup",
      "name": "GitHub & DA.live",
      "enabled": true,
      "requiredComponents": ["eds-citisignal-storefront"]
    },
    // ... remaining steps (prerequisites, adobe-auth, etc.)
  ]
}
```

#### HandlerRegistry Update

Add to `src/features/project-creation/handlers/HandlerRegistry.ts`:

```typescript
import * as eds from '@/features/eds/handlers';

// In registerHandlers():
this.handlers.set('check-github-auth', eds.handleCheckGitHubAuth as MessageHandler);
this.handlers.set('github-oauth', eds.handleGitHubOAuth as MessageHandler);
this.handlers.set('verify-dalive-org', eds.handleVerifyDaLiveOrg as MessageHandler);
this.handlers.set('validate-accs-credentials', eds.handleValidateAccsCredentials as MessageHandler);
```

### REFACTOR Phase

1. **Extract validation utilities** to shared location if reused elsewhere
2. **Add debouncing** to org verification for better UX
3. **Improve error messages** with specific recovery hints
4. **Add telemetry** for OAuth flow tracking
5. **Consider caching** DA.live org verification results

---

## Expected Outcome

After completing this step:

- [ ] DataSourceConfigStep fully functional with ACCS config
- [ ] GitHubDaLiveSetupStep with OAuth flow and DA.live verification
- [ ] All message handlers registered and working
- [ ] Wizard-steps.json updated with new step configs
- [ ] Component-aware step visibility (only shows for eds-citisignal-storefront)
- [ ] Form validation prevents invalid configurations
- [ ] State properly persists when navigating between steps

**What can be demonstrated:**

- User can enter ACCS credentials and validate them
- User can authenticate with GitHub via OAuth
- User can enter DA.live org and site, with access verification
- Wizard properly shows/hides EDS steps based on component selection
- Continue button enables only when all requirements met

---

## Acceptance Criteria

- [ ] All unit tests passing (50+ tests across components and handlers)
- [ ] DataSourceConfigStep renders correctly with all form fields
- [ ] GitHubDaLiveSetupStep handles OAuth flow properly
- [ ] DA.live org verification provides clear feedback
- [ ] ACCS validation tests endpoint connectivity
- [ ] wizard-steps.json updated with requiredComponents
- [ ] HandlerRegistry has all EDS handlers registered
- [ ] State management preserves data across step navigation
- [ ] Error states show user-friendly messages with recovery hints
- [ ] Coverage >= 85% for UI components, >= 90% for handlers
- [ ] No TypeScript errors
- [ ] Follows existing wizard step patterns

---

## Estimated Time

**Total:** 8-12 hours

- Test writing (RED): 3-4 hours
- Implementation (GREEN): 4-6 hours
- Refactoring and polish: 1-2 hours

---

## Notes

### Step Ordering in Wizard

The EDS steps should appear in this order:

1. Welcome/Demo Setup
2. Component Selection
3. **Data Source Config** (EDS-specific)
4. **GitHub & DA.live Setup** (EDS-specific)
5. Prerequisites
6. Adobe Authentication
7. Adobe Project/Workspace
8. API Mesh Setup
9. Review
10. Project Creation

### Component Visibility

Both EDS steps use `requiredComponents: ["eds-citisignal-storefront"]` in wizard-steps.json. The WizardContainer should filter visible steps based on selected frontend component.

### State Management

The `edsConfig` object in WizardState stores all EDS-specific configuration. This keeps it separate from other wizard state while allowing easy serialization for project creation.

### OAuth Flow

The GitHub OAuth flow follows the pattern established by Adobe authentication:
1. UI initiates via message
2. Handler opens browser
3. URI handler receives callback
4. Handler sends completion message
5. UI updates state

---

## Dependencies on This Step

- **Step 7 (Integration):** Uses these wizard steps in the complete flow
- **Review Step:** Displays EDS configuration summary
- **Project Creation:** Consumes edsConfig for repository and content setup
