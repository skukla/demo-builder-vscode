# Demo Builder Architecture Plan

## Executive Summary

Create a modular demonstration toolkit consisting of independent tools (Frontend, Demo Inspector, Commerce Mesh) that can be composed into projects via a user-friendly management interface. The system will support non-technical users through guided setup, automatic configuration, and visual management.

## 1. Architecture Overview

### 1.1 Core Components

**Tools** (Independent Units)
- **Frontend Application**: Next.js e-commerce demo (runs locally or deployed)
- **Demo Inspector**: Visual debugging and data source overlay (optional npm package)
- **Commerce Mesh**: Adobe API Mesh configuration (must be deployed to Adobe infrastructure)

**Management Layer**
- **Desktop Manager**: Electron-based application with web UI
- **Project Orchestrator**: Coordinates tool lifecycle and configuration
- **Configuration System**: Multi-level configuration management

**Integration Layer**
- **Event Bus**: Inter-tool communication
- **Plugin System**: Dynamic tool loading
- **Version Manager**: Tool updates and compatibility

### 1.2 Repository Structure

```
GitHub Organization: demo-builder/
├── demo-builder-frontend/      # Next.js application
├── demo-builder-inspector/     # Demo Inspector tool
├── demo-builder-mesh/          # Commerce Mesh configurations
├── demo-builder-manager/       # Desktop management application
├── demo-builder-cli/           # Command-line interface
├── demo-builder-core/          # Shared libraries and types
└── demo-builder-templates/     # Project templates
```

## 2. Tool Independence Strategy

### 2.1 Tool Interface Specification

Each tool implements a standard interface:

```typescript
interface DemoTool {
  // Metadata
  name: string;
  version: string;
  description: string;
  requirements: ToolRequirements;
  
  // Lifecycle
  init(config: ToolConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  
  // Configuration
  getDefaultConfig(): ToolConfig;
  validateConfig(config: ToolConfig): ValidationResult;
  updateConfig(config: Partial<ToolConfig>): void;
  
  // Health & Status
  getStatus(): ToolStatus;
  getHealth(): HealthCheck;
  
  // Integration
  getIntegrationPoints(): IntegrationPoint[];
  subscribeToEvents(eventBus: EventBus): void;
}
```

### 2.2 Tool Packaging

Each tool is published as an npm package with:
- Standalone functionality
- Optional dependencies for integration
- Configuration schema
- Health check endpoints
- Event emitters for status updates

### 2.3 Tool-Specific Considerations

**Frontend Tool:**
- Can run locally (primary use case) or be deployed
- Configurable to work with or without Demo Inspector
- Points to deployed Commerce Mesh endpoint

**Demo Inspector:**
- Distributed as optional npm package
- Activated via environment variable
- Zero overhead when disabled
- Can be installed/removed without affecting Frontend

**Commerce Mesh:**
- Configuration and deployment tool only (doesn't run locally)
- Manages mesh.json and deployment to Adobe
- Provides endpoint configuration to Frontend

## 3. Management Interface (VSCode Extension)

### 3.1 VSCode Extension Architecture

**Technology Stack:**
- VSCode Extension API
- TypeScript/JavaScript
- Node.js for backend operations
- **React + Adobe React Spectrum for webview UI**
- VSCode Terminal API for process management
- Message passing between extension and webview

**UI Framework Decision:**
- **Selected:** React + Adobe React Spectrum
- **Reasoning:** Consistency with Adobe ecosystem, enterprise-ready components, accessibility built-in
- **Design Approach:** Use Spectrum's "quiet" variants for minimal, professional wizard UX
- **Alternative Considered:** Vue.js (used by SAP Yeoman UI), Svelte, vanilla Web Components

**Key Features:**
- Full-screen webview wizard for project creation
- Status bar monitoring
- Activity bar with custom view
- Integrated terminal for logs
- Settings UI for configuration
- Progress notifications

### 3.2 Extension Components

#### Webview Wizard Implementation
- Full-screen webview panel for complex interactions
- React-based SPA with Adobe React Spectrum components
- Multi-step wizard with progress indicator
- Clean, professional interface inspired by SAP Yeoman UI
- Message-based communication with extension host

#### Command Palette Commands
- `Demo Builder: Create Project` - Opens webview wizard
- `Demo Builder: Start` - Launch frontend
- `Demo Builder: Stop` - Stop frontend
- `Demo Builder: Configure` - Open settings
- `Demo Builder: Delete Project` - Remove project
- `Demo Builder: View Status` - Show project status

#### Status Bar
- Shows current project status
- Quick action buttons (Start/Stop)
- Port information when running
- Click to show output panel

Example: `Demo: my-project ▶️ Port: 3000`

#### Activity Bar View
Custom sidebar panel showing:
- Current project details
- Quick actions
- Configuration files
- Recent logs
- Adobe connection status

#### Setup Wizard Interface
**Primary Interface - Webview Wizard:**
- Full-screen React application using Adobe React Spectrum
- Multi-step form with validation
- Professional, minimal design using Spectrum's quiet mode
- Rich interactions for Adobe project selection
- Integrated search and filtering capabilities

**Fallback Interface - VSCode Native:**
- `showInputBox` for simple text inputs
- `showQuickPick` for basic selections
- `showInformationMessage` for confirmations
- `withProgress` for long operations
- Password prompts for API keys

#### Terminal Integration
- Dedicated terminal for frontend process
- Output channel for toolkit logs
- Problem matcher for errors
- Color-coded output

#### Webview Architecture
**Technology Stack:**
- React 18+ with TypeScript
- Adobe React Spectrum components
- Webpack for bundling
- PostCSS for styling

**Spectrum Components Used:**
- `Provider` with "quiet" color scheme
- `Form`, `TextField`, `Picker` for inputs
- `SearchField` with `ListView` for project selection
- `ProgressCircle` and `ProgressBar` for loading states
- `DialogTrigger` for confirmations
- `Tabs` for multi-section configuration

**Design Philosophy:**
- Minimal, professional appearance
- Focus on content, not chrome
- Consistent with Adobe Design System
- Accessible by default (WCAG 2.1 AA)

#### Settings Management
- Workspace settings for project config
- User settings for global preferences
- `.env` file integration
- IntelliSense for configuration files

## 4. Project Lifecycle Management

### 4.1 Multi-Project Support

Each project is an isolated environment with its own:
- Configuration files
- Environment variables
- Tool versions
- Adobe connections
- Mesh deployments

**Project Structure:**
```
~/.demo-builder/
├── config.yaml                 # Global TUI configuration
├── projects/
│   ├── citisignal-demo/
│   │   ├── config.yaml        # Project configuration
│   │   ├── .env               # Environment variables
│   │   ├── mesh.json          # Mesh configuration
│   │   └── frontend/          # Local frontend copy
│   └── aem-commerce-demo/
│       ├── config.yaml
│       ├── .env
│       ├── mesh.json
│       └── frontend/
└── cache/                      # Shared tool downloads
```

### 4.2 Project Templates

**Commerce Platform-as-a-Service:**
- Adobe Commerce instance connection
- Commerce Services (Catalog, Live Search)
- Full product catalog and search
- Requires API keys and endpoints

**Commerce Software-as-a-Service:**
- Simplified Commerce SaaS endpoint
- Built-in catalog service
- Streamlined configuration

**AEM + Commerce:**
- Content Fragment API integration
- Commerce backend connection
- Hybrid content/commerce queries

**Custom Configuration:**
- Start from scratch
- Add sources incrementally
- Advanced user option

### 4.3 Project Creation Flow

1. **Template Selection** → Determines required configurations
2. **Adobe Verification** → Check prerequisites
3. **Service Configuration** → Gather endpoints and API keys
4. **Tool Installation** → Clone/setup frontend
5. **Mesh Deployment** → Deploy or configure local proxy
6. **Validation** → Test all connections

## 5. Adobe Integration Requirements

### 5.1 Prerequisites Detection

The TUI performs checks for:
- Adobe I/O CLI installation
- API Mesh plugin presence
- Adobe authentication status
- Organization access
- App Builder project existence
- API enablements

### 5.2 Adobe Setup Orchestration

**For users WITHOUT Adobe setup:**
```
1. Guide through Adobe I/O CLI installation
2. Help install API Mesh plugin
3. Assist with authentication (aio auth:login)
4. Guide project creation in console
5. Help enable required APIs
6. Deploy initial mesh configuration
```

**For users WITH Adobe setup:**
```
1. Detect existing projects
2. List available meshes
3. Allow selection or creation
4. Validate API access
5. Update mesh if needed
```

### 5.3 Mesh Deployment Strategies

**Option 1: Deployed Mesh (Current)**
- Requires Adobe infrastructure
- Uses `aio api-mesh:create/update`
- Provides production-ready endpoint
- Slower iteration cycle

**Option 2: Local Proxy Mode (Proposed)**
- GraphQL proxy server running locally
- Routes to real services
- Faster development iteration
- No deployment required
- Falls back to deployed mesh

**Option 3: Hybrid Approach**
- Local proxy for development
- Deployed mesh for demos
- Configurable per project

### 5.4 Commerce Service Integration

**Platform-as-a-Service Requirements:**
- Commerce instance URL
- Store view configuration
- Catalog Service API key
- Live Search API key
- Customer group configuration (optional)

**Software-as-a-Service Requirements:**
- SaaS endpoint URL
- Authentication token
- Simplified configuration

## 6. Configuration Architecture

### 6.1 Configuration Hierarchy

```yaml
# Level 1: Tool Defaults (built into each tool)
tool-defaults.yaml

# Level 2: Project Configuration (stored with project)
.demo-builder/project.config.yaml

# Level 3: Environment Configuration (environment-specific)
.demo-builder/env/development.yaml

# Level 4: User Overrides (local to user)
.env
```

### 6.2 Configuration Schema Example

```yaml
# ~/.demo-builder/projects/citisignal-demo/config.yaml
project:
  name: "CitiSignal Demo"
  template: "commerce-paas"
  created: "2024-01-15T10:30:00Z"
  lastModified: "2024-01-16T14:20:00Z"

adobe:
  projectId: "abc123"
  projectName: "My Demo Project"
  organization: "My Org"
  mesh:
    id: "def456"
    status: "deployed"
    endpoint: "https://edge-sandbox.adobe.io/api/def456/graphql"
    lastDeployed: "2024-01-15T10:35:00Z"
    mode: "deployed"  # or "local-proxy"

commerce:
  type: "platform-as-a-service"
  instance:
    url: "https://my-instance.adobe.com"
    storeView: "default"
    websiteCode: "base"
    storeCode: "main_website_store"
  services:
    catalog:
      enabled: true
      endpoint: "https://catalog.adobe.io"
      apiKey: "${CATALOG_API_KEY}"  # From .env
    liveSearch:
      enabled: true
      endpoint: "https://search.adobe.io"
      apiKey: "${SEARCH_API_KEY}"

tools:
  frontend:
    path: "./frontend"
    version: "2.0.0"
    port: 3000
    status: "stopped"
    env:
      MESH_ENDPOINT: "${adobe.mesh.endpoint}"
      USE_MESH: "true"
    
  inspector:
    enabled: false
    version: "1.5.0"
    installed: false
    config:
      position: "right"
      startOpen: false
      
mesh:
  sources:
    - name: "magento"
      handler:
        graphql:
          endpoint: "${commerce.instance.url}/graphql"
    - name: "catalog"
      handler:
        graphql:
          endpoint: "${commerce.services.catalog.endpoint}"
          headers:
            "x-api-key": "${commerce.services.catalog.apiKey}"
    - name: "search"
      handler:
        graphql:
          endpoint: "${commerce.services.liveSearch.endpoint}"
          headers:
            "x-api-key": "${commerce.services.liveSearch.apiKey}"
```

## 7. User Workflows

### 7.1 First-Time Setup

1. **Install Extension**
   - Open VSCode
   - Go to Extensions (Cmd+Shift+X)
   - Search "Adobe Demo Builder"
   - Click Install

2. **Prerequisites Check**
   - Extension automatically checks on activation
   - Shows notification if missing requirements
   - Quick action: "Install Prerequisites"

3. **Create First Project**
   - Open Command Palette (Cmd+Shift+P)
   - Type: "Demo Builder: Create Project"
   - Follow guided inputs:
     - Project name (input box)
     - Backend selection (quick pick)
     - Commerce URL (input box with validation)
     - API keys (password input)
   - Progress notification shows deployment status

4. **Launch Demo**
   - Click status bar item: "▶️ Start Demo"
   - Or Command Palette: "Demo Builder: Start"
   - Terminal opens showing frontend logs
   - Browser auto-opens to localhost:3000

### 7.2 Daily Usage

1. **Open VSCode with Project**
   - Extension auto-detects project
   - Status bar shows: "Demo: my-project (stopped)"

2. **Start Demo**
   - Click status bar play button
   - Or Cmd+Shift+P → "Demo Builder: Start"

3. **Monitor Status**
   - Status bar shows running state
   - Activity bar panel shows details
   - Terminal shows live logs

4. **Stop Demo**
   - Click status bar stop button
   - Or Cmd+Shift+P → "Demo Builder: Stop"

### 7.3 Project Management Workflows

**Creating a New Project:**
- Cmd+Shift+P → "Demo Builder: Create Project"
- Guided wizard in VSCode

**Configuration:**
- Cmd+Shift+P → "Demo Builder: Configure"
- Opens settings UI or `.env` file
- IntelliSense for configuration

**View Status:**
- Click status bar item
- Or open Activity Bar panel
- Shows all project details

### 7.4 VSCode Integration Features

1. **Automatic File Opening**
   - `.env` opens after creation
   - Syntax highlighting for configs
   - IntelliSense for environment variables

2. **Problem Detection**
   - Invalid configuration highlighted
   - Problems panel shows issues
   - Quick fixes available

3. **Terminal Integration**
   - Dedicated terminal for frontend
   - Color-coded output
   - Clickable links in errors

4. **Source Control**
   - `.env` in `.gitignore` by default
   - Configuration tracked appropriately

## 8. Project Initialization Flow Details

### 8.1 Overview

The project initialization flow guides users through creating a fully configured demo project with all necessary Adobe services, Commerce backend, and frontend tools.

### 8.2 Prerequisites Installation

**System Requirements Check:**
```
Checking system prerequisites...
✓ macOS detected (supported)
✓ Git 2.39.0
✗ Node.js version manager not found
✗ Adobe I/O CLI not found
```

**Automated Installation:**
1. **fnm (Fast Node Manager)**
   - Install via curl
   - Auto-configure shell (bash/zsh)
   - Track installation for clean removal

2. **Node.js Versions**
   - Node 18 for API Mesh
   - Node 20 for NextJS frontend
   - Managed via `.node-version` files

3. **Adobe Tools**
   - Adobe I/O CLI (npm global)
   - API Mesh plugin

**Installation Tracking:**
```yaml
# ~/.demo-builder/.installed-by-toolkit
installations:
  - type: fnm
    location: ~/.fnm
    shell_modified: ~/.zshrc
  - type: npm-global
    package: "@adobe/aio-cli"
```

### 8.3 Project Creation Wizard (VSCode)

**Step 1: Command Palette Initiation**
- User presses Cmd+Shift+P
- Types: "Demo Builder: Create Project"
- Extension begins guided setup

**Step 2: Project Configuration**
```typescript
// VSCode Input Box
const projectName = await vscode.window.showInputBox({
  prompt: 'Project name',
  placeHolder: 'my-commerce-demo',
  validateInput: (value) => {
    if (!value) return 'Project name required';
    if (!/^[a-z0-9-]+$/.test(value)) return 'Use lowercase letters, numbers, and hyphens';
    return null;
  }
});

// VSCode Quick Pick
const backend = await vscode.window.showQuickPick([
  'Adobe Commerce (Platform-as-a-Service)',
  '[Future] Adobe Commerce (Software-as-a-Service)'
], {
  placeHolder: 'Select Commerce backend'
});
```

**Step 3: Adobe Authentication Check**
```typescript
// Progress notification
vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Checking Adobe authentication..."
}, async (progress) => {
  // Correct auth check using 'aio auth login -b'
  const isAuthenticated = await execAsync('aio auth login -b')
    .then(() => true)
    .catch(() => false);
  
  if (!isAuthenticated) {
    const choice = await vscode.window.showWarningMessage(
      'Adobe authentication required for API Mesh deployment',
      'Login Now',
      'Force Login',
      'Cancel'
    );
    
    if (choice === 'Login Now') {
      // Try normal login first
      const terminal = vscode.window.createTerminal('Adobe Auth');
      terminal.sendText('aio auth login');
      terminal.show();
      
      // Wait for completion and verify
      const verified = await verifyAuth();
      if (!verified && await confirm('Retry with force login?')) {
        terminal.sendText('aio auth logout --force');
        terminal.sendText('aio auth login -f');
      }
    } else if (choice === 'Force Login') {
      // Force fresh login
      const terminal = vscode.window.createTerminal('Adobe Auth');
      terminal.sendText('aio auth logout --force');
      terminal.sendText('aio auth login -f');
      terminal.show();
    }
  }
});
```

**Step 4: Adobe Organization and Project Selection**
```typescript
// Get organizations
const orgs = await execAsync('aio console org list --json')
  .then(stdout => JSON.parse(extractJson(stdout)));

if (orgs.length === 0) {
  // No orgs - guide to Adobe Console
  vscode.env.openExternal(vscode.Uri.parse('https://console.adobe.io'));
  return;
} else if (orgs.length === 1) {
  // Auto-select single org
  await execAsync(`aio console org select ${orgs[0].code}`);
} else {
  // Multiple orgs - show selection in webview
  const panel = vscode.window.createWebviewPanel(
    'adobeOrgProjectSelect',
    'Select Adobe Organization and Project',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
  
  // React app with searchable lists
  panel.webview.html = getReactWebviewHTML({
    organizations: orgs,
    projects: [], // Will load after org selection
    useSpectrum: true,
    quietMode: true
  });
}

// After org selection, get projects
const projects = await execAsync('aio console project list --json')
  .then(stdout => JSON.parse(extractJson(stdout)));

// Show searchable project list with filtering
// User can type to search by name, description, or ID
```

### 8.4 Commerce Configuration

**Auto-Detection Flow:**
```
Commerce Instance URL: [https://my-store.adobe.com]
⠋ Validating Commerce instance...
✓ Valid Commerce instance (v2.4.6)

Detecting store configuration...
Found 3 stores:
> Main Website Store (main_website_store)
  B2B Store (b2b_store)

Found 2 store views:
> Default Store View (default)
  French Store View (fr)
```

**API Keys Collection:**
```
Commerce Services API Keys:
(Get from https://commerce.adobe.com > API Portal)

Catalog Service API Key: [****************]
Live Search API Key: [****************]

⠋ Validating API keys...
✓ All services connected
```

### 8.5 Frontend Installation

**Version Selection:**
```
Installing Frontend Application...

Select version:
> Latest (recommended)
  Stable release (v2.0.0)
  Custom tag/branch
```

**Installation Process:**
```
⠋ Cloning citisignal-nextjs...
⠋ Creating .env configuration...
⠋ Demo Inspector enabled by default

Install dependencies? (350MB)
> Yes, install now
  No, I'll install later
```

### 8.6 Mesh Deployment

```
Configuring API Mesh...

Building configuration with:
- Commerce GraphQL endpoint
- Catalog Service endpoint
- Live Search endpoint

Deploying to Adobe...
> aio api-mesh:create mesh.json
⠋ Deploying (2-3 minutes)...
✓ Mesh deployed

Endpoint: https://edge-sandbox.adobe.io/api/abc123/graphql
```

### 8.7 Environment Configuration

All configuration stored in `.env`:
```bash
# ~/.demo-builder/projects/my-demo/.env
COMMERCE_URL=https://my-store.adobe.com
COMMERCE_ENV_ID=my-environment-id
COMMERCE_STORE_CODE=main_website_store
COMMERCE_STORE_VIEW=default

# API Keys
CATALOG_API_KEY=abc123...
SEARCH_API_KEY=def456...

# Mesh
MESH_ENDPOINT=https://edge-sandbox.adobe.io/api/abc123/graphql

# Demo Inspector
DEMO_INSPECTOR_ENABLED=true
```

## 9. Configuration Management

### 9.1 Ongoing Configuration

Users can reconfigure projects after creation:
```
demo-builder config

What would you like to configure?
> Demo Inspector (currently: enabled)
  Commerce Backend Settings
  Frontend Version
  Mesh Sources
```

### 9.2 Version Management

**Update Flow:**
```
Frontend Version Management
Current: latest (main branch)

New version available: v2.1.0
> Update now (backup created)
  View changelog
  Skip
```

**Rollback Capability:**
```
demo-builder rollback frontend

Current: v2.1.0 (installed 5 minutes ago)
Previous: v2.0.0

> Rollback to v2.0.0
  Cancel
```

### 9.3 Configuration History

Track all changes for debugging:
```yaml
# ~/.demo-builder/projects/my-demo/.config-history
- timestamp: 2024-01-15T10:30:00Z
  action: project_created
  template: commerce-paas
  
- timestamp: 2024-01-15T14:20:00Z
  action: inspector_disabled
  
- timestamp: 2024-01-16T09:15:00Z
  action: frontend_updated
  from: v2.0.0
  to: v2.1.0
```

## 10. System Prerequisites & Clean Installation

### 10.1 Installation Philosophy

- Track everything we install
- Clean uninstall possible
- Minimal system footprint
- No sudo unless absolutely necessary

### 10.2 Shell Configuration

Add clearly marked sections:
```bash
# ~/.zshrc or ~/.bashrc
# === BEGIN DEMO-TOOLKIT MANAGED ===
eval "$(fnm env --use-on-cd)"
# === END DEMO-TOOLKIT MANAGED ===
```

### 10.3 Complete Uninstall

```
demo-builder uninstall --complete

This will remove:
✓ Adobe I/O CLI
✓ fnm (if we installed it)
✓ Shell configuration changes
✓ All demo projects
✓ ~/.demo-builder directory

Note: Node.js versions remain (manage via fnm)
```

## 11. Implementation Phases

### Phase 1: VSCode Extension Foundation (Week 1-2)
- [ ] Set up VSCode extension project structure
- [ ] Implement activation events and commands
- [ ] Create status bar item
- [ ] Build output channel for logs
- [ ] Implement basic command palette commands

### Phase 2: Prerequisites & Adobe Integration (Week 2-3)
- [ ] Prerequisites detection and installation
- [ ] Adobe I/O CLI wrapper functions
- [ ] Authentication flow in terminal
- [ ] Project selection via webview
- [ ] API validation helpers

### Phase 3: Project Creation Wizard (Week 3-4)
- [ ] Input validation for all fields
- [ ] Commerce URL validation
- [ ] API key secure input
- [ ] Mesh deployment integration
- [ ] Progress notifications

### Phase 4: Process Management (Week 4-5)
- [ ] Frontend process spawning
- [ ] Terminal integration for logs
- [ ] PID tracking in workspace state
- [ ] Start/stop commands
- [ ] Port conflict detection

### Phase 5: UI Polish & Testing (Week 5-6)
- [ ] Activity bar view (optional)
- [ ] Webview for complex forms
- [ ] Error handling and recovery
- [ ] User testing with target audience
- [ ] Documentation

### Phase 6: Publishing (Week 6)
- [ ] Extension packaging
- [ ] Marketplace metadata
- [ ] Installation guide
- [ ] Video demo creation

## 12. Technical Decisions

### 12.1 Why VSCode Extension Instead of TUI or Electron?
- **User Familiarity**: Target users already use VSCode for demos
- **Rich UI**: Full-screen webview with React + Adobe Spectrum
- **Fast Development**: 4-5 weeks using React ecosystem
- **Natural Workflow**: Create project → Edit code → Run demo
- **Professional UX**: Wizard-based interface instead of command palette
- **Easy Distribution**: VSCode Marketplace or VSIX file

### 12.2 Why React + Adobe Spectrum for Webview?
- **Consistency**: Aligns with Adobe ecosystem and brand
- **Enterprise Ready**: Spectrum is battle-tested in Adobe products
- **Accessibility**: WCAG 2.1 AA compliance built-in
- **Quiet Mode**: Supports minimal, professional appearance
- **TypeScript Support**: Full type safety out of the box
- **Active Development**: Regular updates and improvements

### 12.3 Why Not Vue.js or Svelte?
- **Vue.js**: Used by SAP Yeoman UI, but less aligned with Adobe ecosystem
- **Svelte**: Smaller bundle size, but less enterprise adoption
- **Web Components**: Limited component library options
- **React**: Best ecosystem support, Adobe's choice for Spectrum

### 12.4 Why Full Webview Instead of Command Palette?
- **Better UX**: Users complained about small notifications and command palette
- **Rich Interactions**: Searchable lists, multi-step forms, validation
- **Professional Look**: Clean wizard interface vs terminal-like commands
- **Complex Workflows**: Adobe org/project selection needs rich UI
- **User Preference**: Direct feedback requesting GUI over command palette

### 12.5 Why Separate Repositories?
- Independent versioning and releases
- Clear ownership and responsibilities
- Easier to maintain and scale
- Can be developed independently

### 12.6 Why Optional NPM Packages for Inspector?
- Flexibility in what gets installed
- Reduced complexity for simple demos
- Zero overhead when disabled
- Familiar dependency management

### 12.7 Why Project-Based Configuration?
- Isolation between demos
- Easy switching between setups
- Shareable configurations
- Version control friendly

## 13. Success Metrics

### User Experience
- Time to first demo: < 10 minutes
- Setup success rate: > 90%
- User-reported issues: < 5%

### Technical
- Tool start time: < 30 seconds
- Memory usage: < 500MB total
- Update success rate: > 95%

### Adoption
- Active projects: Track growth
- Tool usage: Monitor which tools are most used
- User feedback: Regular surveys

## 14. Risks & Mitigations

### Risk: Complexity for Users
**Mitigation:** Extensive user testing, progressive disclosure, smart defaults

### Risk: Adobe API Changes
**Mitigation:** Version locking, compatibility layer, regular updates

### Risk: Tool Integration Issues
**Mitigation:** Well-defined interfaces, comprehensive testing, fallback modes

### Risk: Performance Problems
**Mitigation:** Lazy loading, resource monitoring, optimization passes

### Risk: Mesh Deployment Complexity
**Mitigation:** Automated deployment scripts, clear error messages, rollback capability

## 15. Future Enhancements

### Near-term (3-6 months)
- Cloud synchronization for projects
- Team collaboration features
- Additional tool templates
- Performance analytics

### Long-term (6-12 months)
- Web-based manager option
- CI/CD integration
- Custom tool SDK
- Marketplace for community tools

## 16. Open Architecture Questions

### Critical Decisions Needed

1. **Mesh Deployment Strategy**
   - Can we create a local GraphQL proxy to avoid deployment?
   - Should we support both local and deployed modes?
   - How to handle mesh iteration during development?

2. **Demo Inspector Packaging**
   - Separate npm package or monorepo?
   - How to handle version compatibility?
   - Optional peer dependency or dynamic import?

3. **Tool Update Management**
   - Git submodules vs npm packages vs direct cloning?
   - How to handle breaking changes?
   - Rollback strategy for failed updates?

4. **Commerce Service Variations**
   - How to handle PaaS vs SaaS differences?
   - Service discovery or manual configuration?
   - API key management and security?

5. **Project Portability**
   - How to share project configurations?
   - Cloud sync or file export/import?
   - Team collaboration features?

6. **Non-Technical User Support**
   - How much Adobe complexity to hide?
   - Automatic vs guided setup?
   - Error recovery strategies?

### Technical Decisions

1. **Configuration Format:** YAML vs JSON vs TOML?
2. **Storage:** SQLite vs JSON files vs both?
3. **Process Management:** Node child_process vs PM2?
4. **TUI Framework:** Ink vs Blessed vs Inquirer?
5. **Testing Strategy:** Unit tests vs integration tests focus?

## 17. MVP Scope Definition

### 17.1 Ultra-Minimal MVP Features

**Core VSCode Commands:**
- `Demo Builder: Create Project` - Full project setup wizard
- `Demo Builder: Start` - Start frontend process
- `Demo Builder: Stop` - Stop frontend process
- `Demo Builder: Delete Project` - Complete removal

**Required Features:**
1. **License Validation**
   - License key check on activation
   - Encrypted key database
   - Key stored in VSCode SecretStorage
   - Block activation without valid license

2. **Prerequisites Management**
   - Install fnm for Node version management
   - Install Node.js 18 (for API Mesh) and 20 (for frontend)
   - Install Adobe I/O CLI
   - Install API Mesh plugin
   - Track all installations for clean uninstall

3. **Adobe Authentication & Project Setup**
   - Check and handle Adobe auth (`aio auth login -b` for verification)
   - Force login option with `-f` flag when needed
   - Multi-org support with auto-selection for single org
   - Interactive project search with type-to-filter in webview
   - Console.json import option as alternative
   - Use Stage workspace by default
   - Validate API access

4. **Commerce Configuration**
   - Validate Commerce URL
   - Collect Environment ID (manual input)
   - Collect store configuration (manual input)
   - Validate API keys immediately
   - Store in `.env` file

5. **Mesh Management**
   - Check for existing meshes
   - Allow selection from existing or create new
   - Deploy mesh with validation
   - Store endpoint in state

6. **Frontend Installation**
   - Clone citisignal-nextjs (latest)
   - Install dependencies with confirmation
   - Create `.env` configuration
   - Demo Inspector enabled by default

7. **Process Management**
   - Launch frontend as detached process
   - Track PID and port in state file
   - Stop via tracked PID
   - Handle missing processes gracefully

8. **State Tracking**
   - Maintain `~/.demo-builder/state.yaml`
   - Track current project, PIDs, ports
   - Detect existing project and offer overwrite

9. **Automatic Updates**
   - Check for updates on activation
   - GitHub Releases integration
   - Download and install VSIX
   - User settings for auto-update control
   - Critical update notifications

10. **Security Implementation**
   - All API keys in SecretStorage
   - Process spawn with array form only
   - CSP for all webviews
   - Input validation on all user inputs
   - Workspace trust verification

**Validation Points:**
- Adobe authentication status
- Commerce URL responds with GraphQL
- API keys are valid (test query)
- Mesh deploys successfully
- Mesh endpoint responds
- Frontend builds without errors
- Port availability before starting

**Error Handling:**
- "Helpful" level messages (error + suggestion)
- Allow re-entry on validation failures
- Clean state on failures

**NOT in MVP:**
- ❌ Multiple projects (single project only)
- ❌ Logs rotation/management (simple single log)
- ❌ Version selection (always latest)
- ❌ Updates/rollback
- ❌ Import/export projects
- ❌ Health monitoring
- ❌ Auto-repair
- ❌ Commerce store auto-detection
- ❌ Custom port selection

### 17.2 MVP File Structure

```
~/.demo-builder/
├── state.yaml              # Project state and process tracking
├── config.yaml             # Project configuration
├── .env                    # All credentials and keys
├── mesh.json              # Generated mesh configuration
├── .installed-by-toolkit   # Track what we installed
└── frontend/              # Cloned NextJS application
    └── .env               # Frontend environment (copied from parent)
```

### 17.3 MVP Technical Decisions

**VSCode Extension Architecture:**
- TypeScript-based extension
- Use VSCode API for all UI
- Webview for complex forms (Adobe project selection)
- Terminal API for process management

**Process Management:**
- Spawn processes via VSCode Terminal API
- Track PID in workspace state
- Show logs in dedicated terminal
- Status bar for quick status

**Adobe Authentication & Selection:**
- Correct auth check: `aio auth login -b` (not `aio auth:list`)
- Force login: `aio auth logout --force && aio auth login -f`
- Get organizations: `aio console org list --json`
- Get projects: `aio console project list --json`
- React webview with searchable lists
- Auto-select when single org exists
- Console.json import as fallback option

**UI Components:**
- Full-screen React webview wizard for project creation
- Adobe React Spectrum components in quiet mode
- Searchable lists for org/project selection
- Multi-step form with validation
- Progress indicators for long operations
- Fallback to VSCode native UI for simple commands

**State Management:**
- Store in VSCode workspace state
- Single project per workspace
- Overwrite confirmation if exists
- Track PIDs, ports, configuration

**Error Handling:**
- VSCode warning/error messages
- Show in Problems panel when appropriate
- Terminal output for detailed errors
- Allow retry via notifications

### 17.4 MVP Implementation Timeline

**Week 1: Extension Foundation & Security**
- VSCode extension setup
- License key validation system
- SecretStorage implementation
- Command registration
- Status bar implementation

**Week 2: Prerequisites & Updates**
- Prerequisites installation system
- Auto-updater with GitHub Releases
- Update notification UI
- Version checking logic

**Week 3: Webview Development**
- React + Spectrum setup
- Multi-step wizard implementation
- Adobe org/project selector
- Commerce configuration forms
- Message passing with extension

**Week 4: Project Creation**
- Adobe auth handling with force login
- API key validation
- Input sanitization
- Mesh deployment
- Frontend installation

**Week 5: Integration & Polish**
- Process management
- State tracking
- UI polish and animations
- Error handling

**Week 6: Testing & Distribution**
- Security audit
- User testing
- VSIX packaging
- License key generation
- Distribution setup

Total: 6 weeks to secure MVP with professional UI

## 18. Webview Wizard Architecture

### 18.1 Design Philosophy

**Inspiration from SAP Yeoman UI:**
- Full-screen wizard experience
- Clean, minimal interface
- Step-by-step guided process
- Professional enterprise appearance
- Focus on task completion

**Adobe Spectrum Integration:**
- Use "quiet" color scheme for minimal chrome
- Leverage Spectrum's enterprise-grade components
- Maintain Adobe brand consistency
- Built-in accessibility (WCAG 2.1 AA)

### 18.2 React Application Structure

```typescript
// Webview React App Structure
src/webview/
├── app/
│   ├── App.tsx                 // Main React application
│   ├── store.ts                // State management (Redux/Context)
│   └── messageHandler.ts       // VSCode extension communication
├── components/
│   ├── wizard/
│   │   ├── WizardContainer.tsx // Main wizard container
│   │   ├── WizardStep.tsx      // Individual step component
│   │   └── WizardProgress.tsx  // Progress indicator
│   ├── forms/
│   │   ├── ProjectDetailsForm.tsx
│   │   ├── AdobeAuthForm.tsx
│   │   ├── OrgProjectSelector.tsx  // Searchable lists
│   │   └── CommerceConfigForm.tsx
│   └── shared/
│       ├── SearchableList.tsx  // Reusable search component
│       └── ValidationMessage.tsx
├── styles/
│   ├── wizard.css              // Custom wizard styles
│   └── overrides.css          // Spectrum overrides for quiet mode
└── index.tsx                   // Entry point
```

### 18.3 Spectrum Component Usage

```tsx
// Example: Minimal wizard with Spectrum quiet mode
import { Provider, defaultTheme, View, Flex } from '@adobe/react-spectrum';

function WizardApp() {
  return (
    <Provider 
      theme={defaultTheme} 
      colorScheme="light"
      // Enable quiet mode globally
      isQuiet
    >
      <View padding="size-400" height="100vh">
        <Flex direction="column" gap="size-300">
          {/* Wizard content */}
        </Flex>
      </View>
    </Provider>
  );
}
```

### 18.4 Multi-Step Wizard Implementation

```tsx
// Wizard with React and Spectrum
import { Tabs, TabList, Item, TabPanels } from '@adobe/react-spectrum';

function ProjectWizard() {
  const [step, setStep] = useState(1);
  const [projectData, setProjectData] = useState({});
  
  const steps = [
    { id: 'details', name: 'Project Details', component: ProjectDetailsStep },
    { id: 'adobe', name: 'Adobe Setup', component: AdobeAuthStep },
    { id: 'commerce', name: 'Commerce Config', component: CommerceConfigStep },
    { id: 'review', name: 'Review', component: ReviewStep }
  ];
  
  return (
    <View width="100%" height="100vh" backgroundColor="gray-50">
      {/* Minimal header */}
      <Flex marginBottom="size-400">
        <Heading level={1}>Create New Demo Project</Heading>
      </Flex>
      
      {/* Progress indicator */}
      <ProgressBar 
        label="Setup Progress" 
        value={step} 
        maxValue={steps.length}
        isQuiet
      />
      
      {/* Step content */}
      <View marginTop="size-600">
        {React.createElement(steps[step - 1].component, {
          data: projectData,
          onNext: (data) => {
            setProjectData({...projectData, ...data});
            setStep(step + 1);
          },
          onBack: () => setStep(step - 1)
        })}
      </View>
    </View>
  );
}
```

### 18.5 Organization and Project Selection

```tsx
// Searchable list for Adobe projects
import { SearchField, ListView, Item } from '@adobe/react-spectrum';

function OrgProjectSelector({ orgs, projects, onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrg] = useState(null);
  
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <Flex direction="column" gap="size-300">
      {/* Org selection */}
      {orgs.length > 1 && (
        <Picker 
          label="Organization" 
          items={orgs}
          onSelectionChange={setSelectedOrg}
          isQuiet
        >
          {org => <Item key={org.id}>{org.name}</Item>}
        </Picker>
      )}
      
      {/* Project search and selection */}
      <SearchField 
        label="Search projects"
        value={searchTerm}
        onChange={setSearchTerm}
        isQuiet
      />
      
      <ListView 
        items={filteredProjects}
        height="size-3600"
        onAction={key => onSelect(projects.find(p => p.id === key))}
        isQuiet
      >
        {item => (
          <Item key={item.id} textValue={item.name}>
            <Text>{item.name}</Text>
            <Text slot="description">{item.description}</Text>
          </Item>
        )}
      </ListView>
      
      {/* Alternative: Import console.json */}
      <Divider marginY="size-300" />
      <Button variant="secondary" isQuiet>
        Import console.json instead
      </Button>
    </Flex>
  );
}
```

### 18.6 Extension-Webview Communication

```typescript
// Message protocol between extension and webview
interface WebviewMessage {
  type: 'init' | 'validate' | 'save' | 'error' | 'success';
  payload: any;
}

// Extension side
class WebviewManager {
  private panel: vscode.WebviewPanel;
  
  constructor() {
    this.panel = vscode.window.createWebviewPanel(
      'demoBuilderWizard',
      'Create Demo Project',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    
    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.type) {
          case 'validate':
            const result = await this.validateConfig(message.payload);
            this.panel.webview.postMessage({ 
              type: 'validation-result', 
              payload: result 
            });
            break;
          case 'save':
            await this.createProject(message.payload);
            this.panel.dispose();
            break;
        }
      }
    );
  }
}

// Webview side
const vscode = acquireVsCodeApi();

function sendMessage(type: string, payload: any) {
  vscode.postMessage({ type, payload });
}

window.addEventListener('message', event => {
  const message = event.data;
  // Handle responses from extension
});
```

### 18.7 Styling for Minimal Professional Look

```css
/* Custom styles for quiet, professional appearance */
.wizard-container {
  --spectrum-global-dimension-size-100: 8px;
  background: var(--spectrum-global-color-gray-50);
  min-height: 100vh;
}

/* Remove excessive borders and shadows */
.spectrum--quiet {
  --spectrum-textfield-border-width: 0;
  --spectrum-textfield-border-width-focused: 1px;
  --spectrum-dropdown-border-width: 0;
}

/* Minimal form styling */
.wizard-form {
  max-width: 600px;
  margin: 0 auto;
  padding: var(--spectrum-global-dimension-size-400);
}

/* Clean step transitions */
.wizard-step {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

## 19. VSCode Extension Structure

### 19.1 Extension Architecture

```
demo-builder-vscode/
├── package.json           # Extension manifest
├── src/
│   ├── extension.ts      # Main activation
│   ├── license/
│   │   ├── validator.ts  # License validation
│   │   └── keys.enc      # Encrypted key database
│   ├── updater/
│   │   └── autoUpdater.ts # Auto-update system
│   ├── commands/
│   │   ├── createProject.ts
│   │   ├── startDemo.ts
│   │   ├── stopDemo.ts
│   │   └── deleteProject.ts
│   ├── providers/
│   │   ├── statusBar.ts
│   │   └── activityBar.ts
│   ├── webviews/
│   │   ├── projectSelector.ts
│   │   └── assets/
│   ├── utils/
│   │   ├── adobeAuth.ts
│   │   ├── validation.ts
│   │   ├── processManager.ts
│   │   └── security.ts   # Input sanitization
│   └── types/
│       └── index.ts
├── scripts/
│   ├── manage-keys.js    # License key management
│   └── keys.json         # Plaintext keys (gitignored)
├── media/                # Icons and images
├── templates/            # Project templates
└── .gitignore           # Exclude sensitive files
```

### 19.2 React + Spectrum Integration

**Package Dependencies:**
```json
{
  "dependencies": {
    "@adobe/react-spectrum": "^3.34.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "webpack": "^5.89.0",
    "ts-loader": "^9.5.0"
  }
}
```

**Webpack Configuration for Webview:**
```javascript
module.exports = {
  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'out', 'webview'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  }
};
```

**VSCode Webview UI Toolkit:**
- Official Microsoft toolkit for extension webviews
- Web Components that match VSCode themes
- Lightweight and performant
- No framework dependencies

```html
<!-- Example webview HTML -->
<!DOCTYPE html>
<html>
<head>
  <link href="${toolkitUri}" rel="stylesheet">
  <script type="module" src="${toolkitUri}"></script>
</head>
<body>
  <vscode-text-field id="search" placeholder="Search projects...">
    <span slot="start">🔍</span>
  </vscode-text-field>
  
  <vscode-data-grid id="projectGrid">
    <vscode-data-grid-row row-type="header">
      <vscode-data-grid-cell>Project Name</vscode-data-grid-cell>
      <vscode-data-grid-cell>Organization</vscode-data-grid-cell>
    </vscode-data-grid-row>
  </vscode-data-grid>
  
  <vscode-button id="selectBtn">Select Project</vscode-button>
</body>
</html>
```

### 19.3 Extension Manifest

```json
{
  "name": "adobe-demo-builder",
  "displayName": "Adobe Demo Builder",
  "description": "Create and manage Adobe Commerce demos",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.74.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onCommand:demoBuilder.createProject",
    "workspaceContains:.demo-builder"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "demoBuilder.createProject",
        "title": "Demo Builder: Create Project"
      }
    ],
    "configuration": {
      "title": "Demo Builder",
      "properties": {
        "demoBuilder.defaultPort": {
          "type": "number",
          "default": 3000
        }
      }
    }
  }
}
```

## 20. Security Considerations

### 20.1 API Key Management

**VSCode SecretStorage API:**
- Store all sensitive data (API keys, tokens) securely
- Never store in plain text files or workspace settings
- Keys encrypted by VSCode's credential manager

```typescript
// Store securely
await context.secrets.store('catalog-api-key', apiKey);

// Retrieve securely
const apiKey = await context.secrets.get('catalog-api-key');

// Never log or display full keys
console.log(`API Key: ${apiKey.substring(0, 4)}...`);
```

### 20.2 Process Execution Security

**Input Sanitization:**
- Validate all user inputs before execution
- Use array form for spawning processes
- Never use shell interpretation

```typescript
// GOOD: Array form prevents injection
spawn('git', ['clone', sanitizedProjectName]);

// BAD: Shell interpretation risk
exec(`git clone ${userInput}`);
```

### 20.3 Webview Security

**Content Security Policy:**
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'none'; 
               script-src 'self'; 
               style-src 'self' 'unsafe-inline';">
```

**Message Validation:**
```typescript
// Validate all webview messages
panel.webview.onDidReceiveMessage(message => {
  if (!isValidMessage(message)) return;
  // Process message
});
```

### 20.4 Workspace Trust

```typescript
// Check workspace trust before operations
if (!vscode.workspace.isTrusted) {
  vscode.window.showWarningMessage('Demo Builder requires a trusted workspace');
  return;
}
```

## 21. Distribution & Access Control

### 21.1 Distribution Model

**Skunkworks VSIX Distribution:**
- Build extension as `.vsix` file
- Distribute via private channels (Slack, email, GitHub)
- Manual installation: `code --install-extension demo-builder.vsix`
- Not published to public marketplace initially

### 21.2 License Key System

**Local Encrypted File Approach:**
- Keys stored in encrypted file within extension
- Management via Node.js script
- Instant revocation by rebuilding extension
- No external infrastructure required

**Key Database Structure:**
```json
{
  "keys": {
    "DEMO-2024-A1B2C3": {
      "email": "user@company.com",
      "issued": "2024-01-15",
      "expires": "2024-12-31",
      "revoked": false,
      "notes": "Alpha tester"
    }
  },
  "metadata": {
    "version": 1,
    "updated": "2024-01-15"
  }
}
```

### 21.3 Key Management Script

```javascript
// scripts/manage-keys.js
// Add new key
node manage-keys.js add user@company.com --expires 2024-12-31

// Revoke key
node manage-keys.js revoke DEMO-2024-A1B2C3

// List all keys
node manage-keys.js list

// Rebuild encrypted file
node manage-keys.js rebuild
```

### 21.4 License Validation in Extension

```typescript
export async function activate(context: vscode.ExtensionContext) {
  const validator = LicenseValidator.getInstance(context);
  
  // Check stored license
  const storedKey = await context.secrets.get('license-key');
  if (!storedKey || !await validator.validateLicense(storedKey)) {
    // Prompt for license key
    const key = await vscode.window.showInputBox({
      prompt: 'Enter Demo Builder License Key',
      password: true
    });
    
    if (!await validator.validateLicense(key)) {
      vscode.window.showErrorMessage('Invalid license key');
      return; // Don't activate
    }
    
    await context.secrets.store('license-key', key);
  }
  
  // Continue with activation
  registerCommands(context);
}
```

## 22. Automatic Updates

### 22.1 Update Architecture

**GitHub Releases Integration:**
- Host VSIX files as GitHub release assets
- Check for updates on extension activation
- Download and install updates automatically
- User control via settings

### 22.2 Version Manifest

```json
// https://api.github.com/repos/owner/demo-builder/releases/latest
// OR custom hosted JSON
{
  "version": "1.1.0",
  "critical": false,
  "downloadUrl": "https://github.com/.../demo-builder-1.1.0.vsix",
  "changelogUrl": "https://github.com/.../CHANGELOG.md",
  "releaseDate": "2024-01-20",
  "minSupportedVersion": "1.0.0"
}
```

### 22.3 Auto-Updater Implementation

```typescript
class AutoUpdater {
  async checkForUpdates(): Promise<void> {
    const current = this.context.extension.packageJSON.version;
    const latest = await this.fetchLatestVersion();
    
    if (this.isNewerVersion(current, latest.version)) {
      const choice = await vscode.window.showInformationMessage(
        `Demo Builder ${latest.version} is available`,
        'Install Now', 'Later'
      );
      
      if (choice === 'Install Now') {
        await this.downloadAndInstall(latest);
      }
    }
  }
  
  private async downloadAndInstall(version: any): Promise<void> {
    // Download VSIX to temp
    const vsixPath = await this.downloadVsix(version.downloadUrl);
    
    // Install using VSCode command
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      vscode.Uri.file(vsixPath)
    );
    
    // Prompt to reload
    const reload = await vscode.window.showInformationMessage(
      'Reload to apply update?',
      'Reload Now', 'Later'
    );
    
    if (reload === 'Reload Now') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }
}
```

### 22.4 Update Settings

```json
"contributes": {
  "configuration": {
    "properties": {
      "demoBuilder.autoUpdate": {
        "type": "boolean",
        "default": true,
        "description": "Automatically check for updates"
      },
      "demoBuilder.updateChannel": {
        "type": "string",
        "enum": ["stable", "beta"],
        "default": "stable"
      }
    }
  }
}
```

### 22.5 Critical Updates

For security fixes or revoked license keys:
```typescript
if (latestVersion.critical) {
  vscode.window.showWarningMessage(
    'Critical update required. Some features disabled until update.',
    'Update Now'
  );
  // Block certain features until updated
}
```

## 23. Component Architecture

### 23.1 Decoupled Repository Structure

**Independent Repositories:**
```
GitHub Organization/
├── citisignal-nextjs/      # Frontend application
├── commerce-mesh/          # API Mesh configuration
├── demo-inspector/         # Inspector package (to be extracted)
├── demo-builder-vscode/    # VSCode extension (orchestrator)
└── [custom-components]/    # User-added components
```

**Key Principle:** Each component is independently developed, versioned, and deployed. Demo Builder orchestrates without coupling.

### 23.2 Component Registry

**Core Components:**
```typescript
interface ComponentDefinition {
  id: string;
  name: string;
  type: 'frontend' | 'mesh' | 'inspector' | 'app-builder' | 'custom';
  source: {
    type: 'git' | 'npm' | 'local';
    url: string;
  };
  configuration?: {
    envVars?: string[];
    meshIntegration?: MeshIntegration;
  };
}

const CORE_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'citisignal-frontend',
    name: 'CitiSignal NextJS Frontend',
    type: 'frontend',
    source: {
      type: 'git',
      url: 'https://github.com/adobe/citisignal-nextjs.git'
    },
    configuration: {
      envVars: ['MESH_ENDPOINT', 'DEMO_INSPECTOR_ENABLED']
    }
  },
  {
    id: 'commerce-mesh',
    name: 'Commerce API Mesh',
    type: 'mesh',
    source: {
      type: 'git',
      url: 'https://github.com/adobe/commerce-mesh.git'
    }
  }
];
```

**Custom Components Registry:**
```json
// ~/.demo-builder/components.json
{
  "customComponents": [
    {
      "id": "inventory-app",
      "name": "Inventory Management",
      "type": "app-builder",
      "source": {
        "type": "git",
        "url": "https://github.com/myteam/inventory-app.git"
      },
      "meshIntegration": {
        "type": "graphql-source",
        "endpoint": "https://inventory-app.adobeioruntime.net/api/graphql"
      }
    }
  ]
}
```

### 23.3 Project Assembly

**Project Structure:**
```
~/.demo-builder/projects/my-demo/
├── .demo-builder.json         # Project manifest
├── components/
│   ├── frontend/             # Cloned/linked citisignal-nextjs
│   │   ├── .env             # Generated by Demo Builder
│   │   └── [frontend code]
│   ├── mesh/                # Cloned/linked commerce-mesh
│   │   ├── .env            # Generated by Demo Builder
│   │   └── mesh.json       # Enhanced with custom sources
│   └── custom/
│       └── inventory-app/   # Additional components
├── config/
│   ├── project.yaml        # Project configuration
│   └── state.json         # Runtime state
└── logs/
```

**Project Manifest (.demo-builder.json):**
```json
{
  "name": "my-demo",
  "created": "2024-01-15",
  "components": {
    "frontend": {
      "id": "citisignal-frontend",
      "version": "main",
      "source": "remote",
      "pinned": false
    },
    "mesh": {
      "id": "commerce-mesh",
      "version": "v1.2.0",
      "source": "remote",
      "pinned": true
    },
    "dataSources": [
      {
        "id": "inventory-app",
        "version": "latest",
        "enabled": true
      }
    ],
    "inspector": {
      "enabled": true,
      "version": "1.0.0"
    }
  }
}
```

### 23.4 Demo Inspector Integration

**Option A: Optional NPM Dependency (Recommended)**
```json
// citisignal-nextjs/package.json
{
  "optionalDependencies": {
    "@adobe/demo-inspector": "^1.0.0"
  }
}
```

```typescript
// citisignal-nextjs - Dynamic import
const DemoInspector = process.env.DEMO_INSPECTOR_ENABLED === 'true' 
  ? await import('@adobe/demo-inspector').catch(() => null)
  : null;
```

**Option B: Post-Install Injection**
```typescript
// Demo Builder installs inspector after frontend setup
if (project.inspector.enabled) {
  await exec('npm install @adobe/demo-inspector', {
    cwd: frontendPath
  });
}
```

### 23.5 Configuration Injection

Demo Builder manages all configuration without modifying source:

```typescript
class ConfigurationInjector {
  async configureFrontend(project: Project) {
    const env = {
      // Core configuration
      MESH_ENDPOINT: project.mesh.endpoint,
      ADOBE_COMMERCE_URL: project.commerce.url,
      
      // Feature flags
      DEMO_INSPECTOR_ENABLED: project.inspector.enabled,
      
      // Dynamic based on components
      CUSTOM_DATA_SOURCES: project.dataSources
        .map(ds => ds.endpoint)
        .join(',')
    };
    
    await this.writeEnvFile(project.frontendPath, env);
  }
  
  async configureMesh(project: Project) {
    // Read base mesh configuration
    const baseMesh = await this.readMeshConfig(project.meshPath);
    
    // Add custom data sources
    for (const dataSource of project.dataSources) {
      baseMesh.sources.push({
        name: dataSource.id,
        handler: {
          graphql: {
            endpoint: dataSource.endpoint
          }
        }
      });
    }
    
    // Write enhanced configuration
    await this.writeMeshConfig(project.meshPath, baseMesh);
  }
}
```

## 24. Developer Experience

### 24.1 Local Development Support

**Linking Local Repositories:**
```typescript
// Command: Demo Builder: Link Local Component
interface LocalLink {
  type: 'symlink' | 'copy';
  sourcePath: string;
  targetPath: string;
  watch: boolean;
}

async function linkLocalComponent() {
  // Auto-detect local repos
  const detected = await detectLocalRepositories();
  
  if (detected.length > 0) {
    const choice = await vscode.window.showQuickPick([
      ...detected.map(d => ({
        label: d.name,
        description: d.path,
        value: d
      })),
      { label: 'Browse...', value: 'browse' }
    ]);
  }
  
  // Create symlink for live development
  await fs.symlink(localPath, componentPath);
  
  // Optional file watching
  if (await confirm('Watch for changes?')) {
    const watcher = vscode.workspace.createFileSystemWatcher(localPath);
    watcher.onDidChange(() => {
      statusBar.text = '$(sync~spin) Component updated';
    });
  }
}
```

**Developer Workflow:**
```bash
# Independent development
cd ~/repos/citisignal-nextjs
npm run dev  # Works standalone

# Integrated development
# In VSCode with Demo Builder
Demo Builder: Link Local Component
> Select: Frontend
> Browse to: ~/repos/citisignal-nextjs
> Type: Symlink (live updates)

Demo Builder: Start
# Now uses local frontend with live reload
```

### 24.2 Version Management

**Flexible Version Strategies:**
```typescript
interface VersionStrategy {
  development: {
    default: 'main',
    updateStrategy: 'auto',
    pinned: false
  },
  staging: {
    default: 'latest-stable',
    updateStrategy: 'prompt',
    pinned: false
  },
  production: {
    default: 'specific-version',
    updateStrategy: 'manual',
    pinned: true
  }
}

// UI for version selection
async function selectVersion(component: string) {
  const strategies = await vscode.window.showQuickPick([
    '🚀 Latest (main/master branch)',
    '📌 Pin current version',
    '🏷️ Specific tag/release',
    '📅 Version from date',
    '🔗 Local development'
  ]);
}
```

### 24.3 Component Updates

**Independent Update Management:**
```typescript
class ComponentUpdater {
  async checkUpdates(project: Project) {
    const updates = [];
    
    for (const component of project.components) {
      if (!component.pinned) {
        const hasUpdate = await this.checkComponentUpdate(component);
        if (hasUpdate) updates.push(component);
      }
    }
    
    if (updates.length > 0) {
      const choice = await vscode.window.showInformationMessage(
        `${updates.length} component updates available`,
        'Update All',
        'Select Updates',
        'Later'
      );
    }
  }
  
  async updateComponent(component: Component) {
    // Pull latest for git sources
    if (component.source.type === 'git') {
      await exec('git pull', { cwd: component.path });
      await exec('npm install', { cwd: component.path });
    }
    
    // Update npm packages
    if (component.source.type === 'npm') {
      await exec(`npm update ${component.id}`, { 
        cwd: project.frontendPath 
      });
    }
  }
}
```

### 24.4 Adding Custom Components

**Extension Mechanism:**
```typescript
// Command: Demo Builder: Add Component
async function addCustomComponent() {
  const componentType = await vscode.window.showQuickPick([
    'App Builder App (Data Source)',
    'Frontend Application',
    'API Extension',
    'Custom Tool'
  ]);
  
  if (componentType === 'App Builder App') {
    const appDetails = {
      name: await input('App name'),
      repository: await input('Git repository'),
      endpoint: await input('GraphQL endpoint'),
      apiKey: await secretInput('API key (if required)')
    };
    
    // Register component
    await registerComponent(appDetails);
    
    // Auto-configure mesh integration
    await addMeshSource(appDetails);
    
    // Redeploy mesh
    await deployMesh();
  }
}
```

## 25. Component Management

### 25.1 Health Monitoring

**Light-Touch Health Checks:**
```typescript
interface HealthCheck {
  component: string;
  status: 'healthy' | 'warning' | 'error';
  checks: {
    name: string;
    passed: boolean;
    message?: string;
  }[];
}

const HEALTH_CHECKS = {
  frontend: [
    { name: 'Repository exists', check: () => fs.exists(path) },
    { name: 'Dependencies installed', check: () => fs.exists('node_modules') },
    { name: 'Build succeeds', check: () => canBuild(), optional: true }
  ],
  mesh: [
    { name: 'Configuration valid', check: () => validateJson() },
    { name: 'Endpoint reachable', check: () => ping(endpoint) }
  ],
  inspector: [
    { name: 'Package available', check: () => packageExists() }
  ]
};

// Status bar indicator
updateStatusBar(healthStatus: HealthStatus) {
  if (healthStatus.allHealthy) {
    statusBar.text = '$(check) Demo Ready';
    statusBar.color = 'green';
  } else if (healthStatus.hasWarnings) {
    statusBar.text = '$(warning) Minor Issues';
    statusBar.tooltip = healthStatus.warnings.join('\n');
  }
}
```

### 25.2 Component Lifecycle

```typescript
interface ComponentLifecycle {
  install: () => Promise<void>;
  configure: (config: any) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  update: () => Promise<void>;
  healthCheck: () => Promise<HealthStatus>;
}

// Each component type implements lifecycle
class FrontendComponent implements ComponentLifecycle {
  async install() {
    await git.clone(this.repository, this.path);
    await npm.install(this.path);
  }
  
  async configure(config) {
    await this.writeEnvFile(config);
  }
  
  async start() {
    // Use appropriate Node version
    await this.switchNodeVersion('20');
    
    this.process = spawn('npm', ['run', 'dev'], {
      cwd: this.path,
      env: { ...process.env, ...config }
    });
  }
  
  async stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

class MeshComponent implements ComponentLifecycle {
  async start() {
    // Use Node 18 for mesh
    await this.switchNodeVersion('18');
    
    // Build and deploy
    await exec('npm run build', { cwd: this.path });
    await exec('npm run update', { cwd: this.path });
    
    // Store endpoint for frontend
    const endpoint = await this.getMeshEndpoint();
    await this.updateProjectConfig({ meshEndpoint: endpoint });
  }
}
```

### 25.3 Dependency Management

```typescript
interface ComponentDependencies {
  requires: string[];  // Other components needed
  optional: string[];  // Enhanced functionality
  conflicts: string[]; // Cannot work with
}

// Validate dependencies on project creation
async function validateDependencies(components: Component[]) {
  for (const component of components) {
    for (const required of component.requires) {
      if (!components.find(c => c.id === required)) {
        throw new Error(`${component.name} requires ${required}`);
      }
    }
  }
}
```

## 26. Extension Structure for Components

### 26.1 Component Commands

```json
// package.json additions
{
  "contributes": {
    "commands": [
      {
        "command": "demoBuilder.components.add",
        "title": "Demo Builder: Add Component",
        "icon": "$(add)"
      },
      {
        "command": "demoBuilder.components.link",
        "title": "Demo Builder: Link Local Component",
        "icon": "$(link)"
      },
      {
        "command": "demoBuilder.components.update",
        "title": "Demo Builder: Update Components",
        "icon": "$(sync)"
      },
      {
        "command": "demoBuilder.components.health",
        "title": "Demo Builder: Check Component Health",
        "icon": "$(heart)"
      }
    ],
    "views": {
      "demoBuilder": [
        {
          "id": "components",
          "name": "Components",
          "icon": "$(extensions)",
          "contextualTitle": "Demo Components"
        }
      ]
    },
    "viewsContainers": {
      "activitybar": [
        {
          "id": "demoBuilder",
          "title": "Demo Builder",
          "icon": "resources/icon.svg"
        }
      ]
    }
  }
}
```

### 26.2 Component Tree Provider

```typescript
class ComponentTreeProvider implements vscode.TreeDataProvider<ComponentNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ComponentNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  constructor(private project: Project) {}
  
  getTreeItem(element: ComponentNode): vscode.TreeItem {
    return {
      label: element.name,
      collapsibleState: element.hasChildren ? 
        vscode.TreeItemCollapsibleState.Expanded : 
        vscode.TreeItemCollapsibleState.None,
      iconPath: this.getIcon(element),
      contextValue: element.type,
      command: element.type === 'component' ? {
        command: 'demoBuilder.components.open',
        title: 'Open Component',
        arguments: [element]
      } : undefined
    };
  }
  
  getChildren(element?: ComponentNode): ComponentNode[] {
    if (!element) {
      // Root level - show categories
      return [
        { name: 'Core', type: 'category', hasChildren: true },
        { name: 'Custom', type: 'category', hasChildren: true },
        { name: 'Local', type: 'category', hasChildren: true }
      ];
    }
    
    // Return components in category
    return this.getComponentsForCategory(element.name);
  }
  
  private getIcon(element: ComponentNode): vscode.ThemeIcon {
    const icons = {
      'frontend': new vscode.ThemeIcon('window'),
      'mesh': new vscode.ThemeIcon('cloud'),
      'inspector': new vscode.ThemeIcon('eye'),
      'app-builder': new vscode.ThemeIcon('extensions'),
      'category': new vscode.ThemeIcon('folder')
    };
    return icons[element.type] || new vscode.ThemeIcon('file');
  }
}
```

### 26.3 Component Status Bar

```typescript
class ComponentStatusBar {
  private items: Map<string, vscode.StatusBarItem> = new Map();
  
  constructor() {
    this.createStatusItems();
  }
  
  private createStatusItems() {
    // Frontend status
    const frontend = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    frontend.text = '$(window) Frontend: Ready';
    frontend.tooltip = 'Click to start frontend';
    frontend.command = 'demoBuilder.frontend.toggle';
    this.items.set('frontend', frontend);
    
    // Mesh status
    const mesh = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    mesh.text = '$(cloud) Mesh: Not Deployed';
    mesh.tooltip = 'Click to deploy mesh';
    mesh.command = 'demoBuilder.mesh.deploy';
    this.items.set('mesh', mesh);
    
    // Inspector status
    const inspector = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    inspector.text = '$(eye) Inspector: Disabled';
    inspector.tooltip = 'Click to toggle inspector';
    inspector.command = 'demoBuilder.inspector.toggle';
    this.items.set('inspector', inspector);
  }
  
  updateStatus(component: string, status: ComponentStatus) {
    const item = this.items.get(component);
    if (!item) return;
    
    const statusIcons = {
      'running': '$(check)',
      'stopped': '$(circle-outline)',
      'error': '$(error)',
      'loading': '$(sync~spin)'
    };
    
    item.text = `${statusIcons[status.state]} ${component}: ${status.message}`;
    item.show();
  }
}
```

### 26.4 Component Configuration Webview

```html
<!-- Component configuration panel -->
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="${webviewUri}/toolkit.css">
</head>
<body>
  <vscode-panels>
    <vscode-panel-tab id="config-tab">Configuration</vscode-panel-tab>
    <vscode-panel-tab id="sources-tab">Data Sources</vscode-panel-tab>
    <vscode-panel-tab id="versions-tab">Versions</vscode-panel-tab>
    
    <vscode-panel-view id="config-view">
      <section>
        <h3>Frontend Configuration</h3>
        <vscode-text-field 
          id="mesh-endpoint" 
          placeholder="https://...">
          Mesh Endpoint
        </vscode-text-field>
        
        <vscode-checkbox id="inspector-enabled">
          Enable Demo Inspector
        </vscode-checkbox>
      </section>
    </vscode-panel-view>
    
    <vscode-panel-view id="sources-view">
      <section>
        <h3>Custom Data Sources</h3>
        <vscode-data-grid id="sources-grid">
          <!-- Dynamic content -->
        </vscode-data-grid>
        <vscode-button id="add-source">
          <span slot="start" class="codicon codicon-add"></span>
          Add Data Source
        </vscode-button>
      </section>
    </vscode-panel-view>
    
    <vscode-panel-view id="versions-view">
      <section>
        <h3>Component Versions</h3>
        <div id="version-list">
          <!-- Component version controls -->
        </div>
      </section>
    </vscode-panel-view>
  </vscode-panels>
</body>
</html>
```

### 26.5 Component Registry Management

```typescript
class ComponentRegistry {
  private registryPath = path.join(os.homedir(), '.demo-builder', 'registry.json');
  private registry: ComponentDefinition[] = [];
  
  async initialize() {
    // Load core components
    this.registry = [...CORE_COMPONENTS];
    
    // Load custom components
    if (await fs.exists(this.registryPath)) {
      const custom = await fs.readJson(this.registryPath);
      this.registry.push(...custom.components);
    }
    
    // Validate all components
    await this.validateRegistry();
  }
  
  async registerComponent(component: ComponentDefinition) {
    // Validate component
    if (!await this.validateComponent(component)) {
      throw new Error('Invalid component definition');
    }
    
    // Add to registry
    this.registry.push(component);
    
    // Persist
    await this.saveRegistry();
    
    // Notify extension
    vscode.commands.executeCommand('demoBuilder.registry.refresh');
  }
  
  async discoverComponents() {
    // Auto-discover App Builder apps
    const ioProjects = await this.getIOProjects();
    
    for (const project of ioProjects) {
      if (this.isAppBuilderApp(project)) {
        const suggestion = this.createComponentFromProject(project);
        
        const add = await vscode.window.showInformationMessage(
          `Found App Builder app: ${project.name}`,
          'Add to Registry',
          'Skip'
        );
        
        if (add === 'Add to Registry') {
          await this.registerComponent(suggestion);
        }
      }
    }
  }
}
```

## 27. Next Steps

1. **Build MVP VSCode Extension:** 4-week development sprint
2. **Test with target users:** Validate with VSCode-familiar users
3. **Publish to Marketplace:** Beta release for feedback
4. **Iterate based on usage:** Refine based on telemetry and feedback
5. **Plan Phase 2:** Multiple projects, import/export, updates

## 28. Alternative Approaches Considered

### Monolithic Application
- **Pros:** Simpler deployment, easier version management
- **Cons:** Less flexible, harder to maintain, can't use tools independently
- **Decision:** Rejected in favor of modularity

### Electron Desktop Manager
- **Pros:** Rich UI, system tray integration, native notifications
- **Cons:** Complex development (12-16 weeks), high maintenance burden, 150-500MB size
- **Decision:** Rejected in favor of TUI for faster development and simpler maintenance

### Web-Only Manager
- **Pros:** No installation required, easier updates
- **Cons:** Limited system integration, can't manage local processes well
- **Decision:** Consider as Phase 2 enhancement after TUI

### Docker-Based Tools
- **Pros:** Better isolation, consistent environments
- **Cons:** Requires Docker knowledge, larger resource footprint, non-technical user barrier
- **Decision:** Consider as optional advanced mode

### Terminal User Interface (TUI)
- **Pros:** Lightweight, works over SSH, 3-week development
- **Cons:** Terminal intimidating for moderately technical users, limited UI
- **Decision:** Rejected in favor of VSCode extension for better user experience

### Pure CLI (No UI)
- **Pros:** Simplest to build, scriptable
- **Cons:** Not friendly for target users, no visual feedback
- **Decision:** VSCode extension provides familiar interface

---

## Document History

- **v1.0** - Initial architecture plan with Electron approach
- **v2.0** - Pivoted to TUI-based approach for simplicity
- **v3.0** - Pivoted to VSCode extension based on user profile (VSCode-familiar)
- **v4.0** - Added security, distribution, and auto-update specifications for skunkworks
- **v4.1** - Added detailed component architecture and extension structure for decoupled components
- **v5.0** - Major UI overhaul: React + Adobe Spectrum webview wizard, authentication improvements, multi-org support
  - Replaced command palette UI with full-screen webview wizard
  - Selected React + Adobe React Spectrum for UI framework
  - Implemented searchable org/project selection
  - Fixed Adobe auth check (`aio auth login -b` not `aio auth:list`)
  - Added force login option for authentication issues
  - Synthesis of Adobe design with minimal wizard UX (quiet mode)
- **Last Updated:** 2025-08-28
- **Status:** Ready for implementation with webview architecture

This document serves as the living plan for the Demo Builder project. It should be updated as decisions are made and requirements evolve.