# Release Notes - v1.0.0-beta.37

## 🔧 UX Fix: Close Entire Panel After Homebrew Installation

This release fixes the Homebrew installation UX to close the **entire bottom panel** (not just the terminal tab) when the user clicks "Continue".

---

## 🐛 Bug Fix

**Homebrew Terminal Panel Not Closing**
- **Problem**: After Homebrew installation, clicking "Continue" would close the terminal tab but leave the bottom panel open (showing Output, Problems, etc.)
- **Root Cause**: Code was only disposing the terminal, not closing the entire panel UI
- **Fix**: Now executes `workbench.action.closePanel` command to close the entire bottom panel
- **Impact**: Cleaner UX - the panel disappears completely as expected

---

## 🔧 Technical Changes

### Before (Incomplete)
```typescript
terminal.dispose(); // Only closes terminal tab
```

### After (Complete)
```typescript
terminal.dispose(); // Close terminal tab
await vscode.commands.executeCommand('workbench.action.closePanel'); // Close entire panel
```

---

## 📊 User Experience

**Now when you click "Continue"**:
1. Terminal tab is disposed ✅
2. **Entire bottom panel closes** ✅ (Terminal, Output, Problems, Debug Console, etc.)
3. Focus returns to the wizard ✅

If you want to keep the terminal/panel open for reference, press **Esc** instead of clicking "Continue".

---

## 🙏 Beta Tester Feedback

Thank you for reporting this UX issue! The fix ensures the panel closes completely as expected.

---

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.36...v1.0.0-beta.37

