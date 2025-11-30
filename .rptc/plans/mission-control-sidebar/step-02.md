# Step 2: Sidebar WebviewView

## Objective

Create the `sidebar` feature with a WebviewViewProvider that replaces the TreeView, providing contextual navigation for different screens (Projects, Project Detail, Wizard).

## Test Strategy

### Unit Tests

1. **SidebarNav.test.tsx**
   - Renders navigation items
   - Highlights active item
   - Click triggers navigation callback
   - Shows correct items for each context

2. **BackButton.test.tsx**
   - Renders "← Projects" text
   - Click triggers onBack callback
   - Hidden when on Projects Dashboard

3. **WizardProgress.test.tsx**
   - Renders correct number of steps
   - Shows completed steps with checkmark (✓)
   - Shows current step with filled dot (●)
   - Shows future steps with empty dot (○)
   - Step click navigates (if allowed)

4. **Sidebar.test.tsx**
   - Renders Projects context correctly
   - Renders Project Detail context correctly
   - Renders Wizard context correctly
   - Handles context changes

5. **sidebarHandlers.test.ts**
   - `navigate` handles navigation commands
   - `getContext` returns current sidebar context
   - `setContext` updates sidebar state

6. **sidebarProvider.test.ts**
   - Creates webview with correct options
   - Sets up message handler
   - Disposes correctly

### Integration Tests

1. **Sidebar-integration.test.tsx**
   - Context switching between screens
   - Navigation state persistence
   - Wizard progress tracking

## Implementation Tasks

### 2.1 Create Feature Directory Structure

```
src/features/sidebar/
├── index.ts
├── providers/
│   └── sidebarProvider.ts
├── ui/
│   ├── index.tsx
│   ├── Sidebar.tsx
│   └── components/
│       ├── SidebarNav.tsx
│       ├── BackButton.tsx
│       └── WizardProgress.tsx
├── handlers/
│   └── sidebarHandlers.ts
├── types.ts
└── CLAUDE.md
```

### 2.2 Define Sidebar Context Types

```typescript
// src/features/sidebar/types.ts

export type SidebarContext =
    | { type: 'projects' }                           // Projects Dashboard
    | { type: 'project'; project: Project }          // Project Detail
    | { type: 'wizard'; step: number; total: number } // Wizard
    | { type: 'configure'; project: Project };       // Configure
```

### 2.3 Create SidebarNav Component

```typescript
// src/features/sidebar/ui/components/SidebarNav.tsx

interface NavItem {
  id: string;
  label: string;
  icon?: string;
  active?: boolean;
}

interface SidebarNavProps {
  items: NavItem[];
  onNavigate: (id: string) => void;
}

// Navigation list for sidebar
// Shows items with optional icons
// Highlights active item
```

**Context-Specific Navigation:**

| Context | Items |
|---------|-------|
| Projects | 🏠 Projects (active), Docs, Help |
| Project Detail | ← Projects, Project Name header, Overview (active), Configure, Updates |
| Wizard | ← Cancel, "NEW DEMO" header, Step progress list |
| Configure | Same as Project Detail with Configure active |

### 2.4 Create BackButton Component

```typescript
// src/features/sidebar/ui/components/BackButton.tsx

interface BackButtonProps {
  label?: string;  // Default: "Projects"
  onBack: () => void;
}

// Shows "← {label}" button
// Hidden when on Projects Dashboard
```

### 2.5 Create WizardProgress Component

```typescript
// src/features/sidebar/ui/components/WizardProgress.tsx

interface WizardStep {
  id: string;
  label: string;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
  completedSteps: number[];
  onStepClick?: (step: number) => void;
}

// Progress indicators:
// ✓ = Completed (checkmark, muted color)
// ● = Current (filled dot, accent color)
// ○ = Future (empty dot, muted color)
```

**Wizard Steps (Revised - No Welcome Step):**

| Step | Name |
|------|------|
| 1 | Sign In |
| 2 | Project |
| 3 | Workspace |
| 4 | Components |
| 5 | API Mesh |
| 6 | Review |

### 2.6 Create Sidebar Component

```typescript
// src/features/sidebar/ui/Sidebar.tsx

interface SidebarProps {
  context: SidebarContext;
  onNavigate: (target: string) => void;
}

// Main sidebar container
// Renders appropriate content based on context
// Handles navigation events
```

### 2.7 Create Sidebar Handlers

```typescript
// src/features/sidebar/handlers/sidebarHandlers.ts

// Message handlers:
// - navigate: Handle navigation commands
// - getContext: Return current sidebar context
// - setContext: Update sidebar state
// - getWizardProgress: Return wizard progress info
```

### 2.8 Create SidebarProvider

```typescript
// src/features/sidebar/providers/sidebarProvider.ts

export class SidebarProvider implements vscode.WebviewViewProvider {
    resolveWebviewView(webviewView: vscode.WebviewView): void {
        // Set up webview with:
        // - HTML content
        // - Message handlers
        // - Communication protocol
    }
}
```

### 2.9 Create Webview Entry Point

```typescript
// src/features/sidebar/ui/index.tsx

// Entry point for webpack
// Renders Sidebar wrapped in WebviewApp
```

### 2.10 Update package.json Views Configuration

```json
"views": {
  "demoBuilder": [
    {
      "id": "demoBuilder.sidebar",
      "name": "Demo Builder",
      "type": "webview"
    }
  ]
}
```

### 2.11 Add Webpack Entry Point

Update `webpack.config.js`:

```javascript
entry: {
    // ... existing
    sidebar: './src/features/sidebar/ui/index.tsx'
}
```

## Acceptance Criteria

- [ ] SidebarNav renders navigation items correctly
- [ ] BackButton shows/hides appropriately
- [ ] WizardProgress shows step indicators
- [ ] Sidebar renders correct context
- [ ] SidebarProvider creates webview correctly
- [ ] Navigation between contexts works
- [ ] package.json updated with webview type
- [ ] All tests pass with > 80% coverage

## Dependencies

- `@/core/communication/WebviewCommunicationManager` - For messaging
- `@/core/ui/components/WebviewApp` - For root wrapper
- `@/types/base` - For Project interface
- VS Code WebviewViewProvider API
