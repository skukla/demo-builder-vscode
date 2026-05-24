# Adobe Demo Builder for VSCode

Create and manage Adobe Commerce demos with ease directly from Visual Studio Code.

## Features

- 🚀 **Quick Project Creation** - Set up a complete Adobe Commerce demo in minutes
- 🔐 **License Protected** - Secure distribution with license key validation
- 🔄 **Automatic Updates** - Stay current with auto-update functionality
- 📊 **Status Bar Integration** - Monitor your demo status at a glance
- 🎯 **Guided Setup** - Step-by-step wizard for configuration
- 🔧 **Prerequisites Management** - Automatic detection and installation guidance
- ☁️ **API Mesh Integration** - Deploy and manage Adobe API Mesh
- 🤖 **Claude Code (CLI) Harness** - Open any project in Claude Code with one click; AI Configuration tab introspects skills, project MCP servers, and session MCPs

## Requirements

- Visual Studio Code 1.74.0 or higher
- Node.js 18.x or 20.x
- Valid Demo Builder license key
- Adobe I/O CLI (optional, for mesh deployment)

## Installation

### From VSIX Package
1. Download the `.vsix` file from your team
2. Open VSCode Command Palette (`Cmd+Shift+P` on Mac)
3. Run: `Extensions: Install from VSIX...`
4. Select the downloaded file
5. Reload VSCode when prompted

### From Source Code
1. Clone the repository
2. Checkout desired branch: `git checkout mvp/integration`
3. Run setup: `npm run setup`
4. Press `F5` to launch the extension in development mode

See [build documentation](docs/build.md) for detailed build instructions.

## Quick Start

1. **Create a Project**
   - Open Command Palette (`Cmd+Shift+P`)
   - Run: `Demo Builder: Create Project`
   - Follow the guided setup wizard

2. **Start Your Demo**
   - Click the Demo Builder status bar item
   - Or run: `Demo Builder: Start`

3. **View Status**
   - Check the status bar for real-time updates
   - Run: `Demo Builder: View Status` for details

## Commands

- `Demo Builder: Create Project` - Create a new demo project
- `Demo Builder: Start` - Start the frontend application
- `Demo Builder: Stop` - Stop the running demo
- `Demo Builder: Configure` - Modify project settings
- `Demo Builder: Delete Project` - Remove the current project
- `Demo Builder: View Status` - Display detailed project status
- `Demo Builder: Check for Updates` - Manually check for extension updates
- `Demo Builder: Diagnostics` - Run comprehensive system diagnostics
- `Demo Builder: Open in Claude Code` - Launch Claude Code on the current project (URI handler if the extension is installed, terminal otherwise)

## AI Configuration & Claude Code Integration

Demo Builder generates AI context files for every project (`AGENTS.md`, `.claude/skills/`, `.mcp.json`, `~/.claude.json` registration) so AI agents can reason about the project and use the Demo Builder MCP server. The intended harness is **Claude Code (CLI)** — either the standalone `claude` binary or Anthropic's official VS Code extension (`anthropic.claude-code`), which bundles the same binary.

### Opening a project in Claude Code

Each project has an **Open in Claude Code** action in two places:

- The project dashboard (under the action grid)
- The project card kebab menu on the home screen

Clicking it launches Claude Code based on two settings:

- **`demoBuilder.ai.engine`** — which AI tool. Currently only `claude-code` is supported; reserved for future engines (e.g. Codex).
- **`demoBuilder.ai.surface`** — how Demo Builder launches the configured engine:

| `surface` | Behavior |
|---|---|
| `extension` (default) | Launch the Claude Code VS Code extension's chat panel via its URI handler, with the prompt pre-filled when applicable. If the extension is not installed, a recovery dialog offers "Install Claude Code Extension" or "Switch to Terminal Mode." |
| `terminal` | Launch `claude --continue` in a VS Code integrated terminal rooted at the project. The "Claude Code" terminal is reused across launches (one terminal per project per window). For prompt clicks, the prompt is copied to your clipboard so you can paste it into Claude with one keystroke. |

The first time you activate the extension with `surface='extension'` but no Claude Code extension installed, a one-time setup dialog asks you to pick — install the extension for the chat panel UX, or switch to terminal.

### Prompt clicks anchor the project as the VS Code workspace

When you click a prompt from the AI surface, Demo Builder checks whether VS Code's workspace is already the project. If not, it briefly reloads the window with the project as the workspace before launching Claude Code — so the chat panel sees per-project skills, `.mcp.json` MCPs, and `AGENTS.md`. This happens automatically; you click once and the prompt is delivered with full project context.

### AI Configuration tab

The **AI Configuration** tab in `Demo Builder: Configure` shows live inventory for the open project:

- **Skills** — every file in `.claude/skills/`, classified as `demo-builder` (lifecycle), `adobe` (from `@adobe-commerce/commerce-extensibility-tools`), or `unknown`
- **Project MCP Servers** — each server declared in `.mcp.json`, expanded to show the tools it exposes
- **Session MCP Servers** — Adobe MCPs the user has connected via Claude Code's catalog (read from `~/.claude.json::claudeAiMcpEverConnected`)
- **Global MCP Registration** — whether the Demo Builder MCP is registered in `~/.claude.json` so Claude Code can find it from any project

The tab includes actions to **Refresh** the inventory (re-runs `inspect-mcp`), **Regenerate AI Files** (re-runs `aiContextWriter`, `mcpConfigWriter`, and `skillsWriter`), and **Register** the global MCP if it isn't already.

### Adobe MCP updates

`Demo Builder: Check for Updates` includes the `@adobe-commerce/commerce-extensibility-tools` package alongside the existing fork, template, component, and add-on update sources. Applying the update runs `npm update` in the storefront and regenerates AI files so the skills bundle stays in sync.

For architecture and rationale, see [ADR-004: Claude Code (CLI) as the AI Harness](docs/architecture/adr/004-claude-code-harness.md).

## Configuration

Configure Demo Builder through VSCode settings:

```json
{
  "demoBuilder.defaultPort": 3000,
  "demoBuilder.autoUpdate": true,
  "demoBuilder.updateChannel": "stable",
  "demoBuilder.logLevel": "info"
}
```

## Debugging and Troubleshooting

### Running Diagnostics

If you encounter issues, especially on different systems:

1. Open Command Palette (`Cmd+Shift+P`)
2. Run: `Demo Builder: Diagnostics`
3. Check the output in:
   - **Demo Builder: Logs** - User-friendly summary
   - **Demo Builder: Debug** - Detailed diagnostic information

### Output Channels

The extension uses two output channels:
- **Demo Builder: Logs** - General information, warnings, and errors
- **Demo Builder: Debug** - Detailed debugging information for troubleshooting

Access them via: View → Output → Select channel from dropdown

### Common Issues

- **Node.js not detected**: Run diagnostics to check PATH configuration
- **Adobe CLI browser not opening**: Check Debug channel for command execution details
- **Authentication issues**: Review token parsing in Debug channel

For detailed troubleshooting, see the [Troubleshooting Guide](docs/troubleshooting.md).

## License Key

A valid license key is required to use Demo Builder. Contact your team administrator to obtain a key.

License key format: `DEMO-YYYY-XXXXXX`

## Project Structure

Projects are stored in `~/.demo-builder/projects/` with the following structure:

```
project-name/
├── config.json      # Project configuration
├── .env            # Environment variables
├── mesh.json       # API Mesh configuration
└── frontend/       # Frontend application
```

## Troubleshooting

### Prerequisites Not Found
- Run the prerequisite checker from the wizard
- Follow installation guides for missing components

### Port Already in Use
- Change the port in configuration
- Or stop the conflicting process

### Mesh Deployment Failed
- Ensure Adobe I/O CLI is authenticated
- Check network connectivity
- Verify project permissions

## Support

For issues or questions:
- Check the output panel: View → Output → Demo Builder
- Contact your team administrator
- Report issues to the development team

## UI/UX Design Decisions

### Loading States
The extension uses a custom loading spinner for webview initialization with carefully tuned timing:
- **1.5 second minimum display time** - Ensures users see clear feedback (1.5 spinner rotations)
- **100ms initialization delay** - Prevents VSCode's default "Initializing web view..." message
- **Centralized loading utility** - Consistent experience across all webviews

### Visual Components
- **Adobe Spectrum Design System** - Consistent with Adobe's design language
- **Custom spinner component** - Pure HTML/CSS for initial loading before React
- **Timeline navigation** - Visual progress indicator in project creation wizard

## Development

This extension is part of Adobe's Demo Builder toolkit. For development setup:

1. Clone the repository
2. Run `npm install`
3. Open in VSCode
4. Press `F5` to launch Extension Development Host

### Documentation

- **Technical Documentation**: See `docs/technical.md`
- **Styling Guide**: See `docs/development/styling-guide.md` for CSS architecture
- **Architecture**: See `docs/architecture/` for system design documents
- **Changelog**: See `docs/CHANGELOG.md` for version history

## Security

- All API keys are stored securely using VSCode's Secret Storage
- License keys are validated locally with encrypted database
- Content Security Policy (CSP) with cryptographically secure nonces
- No sensitive data is logged or transmitted

## Version History

### 1.0.0
- Initial release
- Core project management
- License validation system
- Auto-update functionality
- Adobe I/O CLI integration
- API Mesh deployment
- Frontend installation

---

© 2024 Adobe Demo Team. Internal Use Only.