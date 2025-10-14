# Adobe Demo Builder v1.0.0-beta.18

**Release Date**: October 14, 2025

> **Note**: This is the eighteenth beta iteration toward v1.0.0 stable release.

## ✨ New Features

### Interactive Homebrew Installation

Homebrew installation now opens VS Code's integrated terminal automatically and guides users through the interactive installation process.

**The Problem:**
- Homebrew requires user interaction (password + confirmation)
- Previous approach tried to run it non-interactively and failed
- Users couldn't complete the installation

**The Solution:**
Automated terminal-based installation with clear guidance:

1. User clicks `[Install]` on Homebrew
2. **Terminal opens automatically** with installation command running
3. **Notification guides user** through the process:
   - Press ENTER when prompted
   - Enter password when requested  
   - Wait for completion
   - Click Recheck when done
4. User interacts directly with Homebrew installer in terminal
5. After completion, user clicks `[Recheck]` to verify

**Benefits:**
- ✅ Fully automated terminal opening and command execution
- ✅ Clear step-by-step instructions in notification
- ✅ User sees full installation output and progress
- ✅ Extension remains responsive during installation
- ✅ Familiar VS Code terminal experience

---

## 🐛 Bug Fixes (from Beta.17)

### 1. Dependency Gating for Homebrew Prerequisites

Fixed Install buttons appearing for fnm and git when Homebrew is not installed.

- Added `"depends": ["homebrew"]` to fnm prerequisite
- Added `"depends": ["homebrew"]` to git prerequisite
- Clear dependency chain: Homebrew → fnm/git → Node → aio-cli

### 2. Homebrew-Specific Git Requirement

Changed git prerequisite to require **Homebrew's git** specifically, not Xcode or system git.

- Check command: `git --version` → `brew list git --versions`
- Ensures consistent git version across all users
- Extension controls and manages the git version

### 3. Per-Node-Version UI Without fnm

Fixed UI showing incorrect green checkmarks for Node versions when fnm is not installed.

- Per-node-version status now shows correct red X icons when fnm is missing
- Clear warning messages about missing prerequisites

### 4. Extension Update Progress

Fixed progress notification hanging at "Installing..." during extension updates.

- Progress notification now completes properly
- Reload prompt appears after progress completes (not during)
- No more hung notifications

---

## 📝 Technical Details

### Interactive Installation Implementation

```typescript
// Detects interactive installations
if ((prereq.install as any)?.interactive) {
    await this.handleInteractiveInstall(prereqId, prereq, installPlan.steps || []);
    return;
}
```

**Flow:**
1. Opens VS Code integrated terminal
2. Executes installation command automatically
3. Shows user-friendly notification with instructions
4. Updates prerequisite status to "Installation running in terminal"
5. User completes installation interactively
6. User clicks Recheck to verify

### Prerequisites Configuration

```json
{
  "id": "homebrew",
  "install": {
    "interactive": true,
    "interactiveMode": "terminal",
    "steps": [{
      "commands": ["/bin/bash -c \"$(curl -fsSL ...)\""],
      "requiresUserInput": true
    }]
  }
}
```

---

## 📦 Installation

### From VSIX

1. Download `adobe-demo-builder-1.0.0-beta.18.vsix` from the [Releases page](https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.18)
2. Install via VS Code:
   ```bash
   code --install-extension adobe-demo-builder-1.0.0-beta.18.vsix
   ```
3. Reload VS Code

### Upgrading from Previous Beta

**Option 1: Use Auto-Update** (Recommended)
1. Open Command Palette (`Cmd+Shift+P`)
2. Run: "Demo Builder: Check for Updates"
3. Click "Update All"
4. Reload when prompted

**Option 2: Manual Install**
```bash
code --uninstall-extension adobe-demo-team.adobe-demo-builder
code --install-extension adobe-demo-builder-1.0.0-beta.18.vsix
```

---

## 🔍 Verification Steps

After installation and VS Code reload:

### Test Interactive Homebrew Installation

1. If you don't have Homebrew installed, uninstall it temporarily:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)"
   ```

2. Run "Demo Builder: Create Project"
3. Go to Prerequisites step
4. Homebrew should show red X with `[Install]` button
5. Click `[Install]`
6. Verify:
   - Terminal opens automatically
   - Installation command runs automatically
   - Notification appears with instructions
   - You can interact with prompts in terminal
7. Complete installation in terminal
8. Click `[Recheck]`
9. Homebrew should show green checkmark ✓

### Verify Dependency Chain

With all prerequisites uninstalled:
- Homebrew: `[Install]` enabled
- fnm: `[Install]` disabled (grayed out)
- git: `[Install]` disabled (grayed out)

After installing Homebrew:
- Homebrew: ✓
- fnm: `[Install]` enabled
- git: `[Install]` enabled

---

## 🚀 What's Next?

Future beta releases will focus on:
- Additional interactive installations for other prerequisites
- Performance optimizations
- Bug fixes as reported
- Path to v1.0.0 stable

---

## 🔗 Quick Links

- **Release**: https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.18
- **Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.17...v1.0.0-beta.18
- **Issues**: https://github.com/skukla/demo-builder-vscode/issues

---

**Thank you for beta testing! Your feedback helps make Demo Builder better.** 🙏

