#!/usr/bin/env python3
"""
Setup script to register hooks with Claude Code
Creates or updates the global Claude Code settings
"""

import json
import os
from pathlib import Path
import shutil


def setup_hooks():
    """Set up Claude Code hooks"""
    
    # Get hook directory
    hooks_dir = Path(__file__).parent
    
    # Define hook mappings
    hooks = {
        "PreToolUse": [
            {
                "command": f"python3 {hooks_dir}/pre/tool_optimizer.py",
                "description": "Optimizes tool usage with modern alternatives"
            },
            {
                "command": f"python3 {hooks_dir}/pre/assumption_verifier.py",
                "description": "Verifies assumptions before code changes"
            }
        ],
        "PostToolUse": [
            {
                "command": f"python3 {hooks_dir}/post/quality_enforcer.py",
                "description": "Enforces quality checks after modifications"
            },
            {
                "command": f"python3 {hooks_dir}/post/auto_doc_updater.py",
                "description": "Checks documentation consistency with code"
            },
            {
                "command": f"python3 {hooks_dir}/post/link_validator.py",
                "description": "Validates links in markdown documentation"
            },
            {
                "command": f"python3 {hooks_dir}/post/smart_doc_sync.py",
                "description": "Generates documentation update suggestions"
            }
        ],
        "Stop": [
            {
                "command": f"python3 {hooks_dir}/stop/documentation_sync.py",
                "description": "Checks for documentation sync needs"
            },
            {
                "command": f"python3 {hooks_dir}/stop/commit_reminder.py",
                "description": "Reminds to commit changes"
            }
        ]
    }
    
    # Get Claude settings path
    settings_path = Path.home() / ".claude" / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Load existing settings or create new
    if settings_path.exists():
        with open(settings_path, 'r') as f:
            settings = json.load(f)
        
        # Backup existing settings
        backup_path = settings_path.with_suffix('.json.backup')
        shutil.copy(settings_path, backup_path)
        print(f"✅ Backed up existing settings to {backup_path}")
    else:
        settings = {}
    
    # Update hooks
    if "hooks" not in settings:
        settings["hooks"] = {}
    
    settings["hooks"].update(hooks)
    
    # Save updated settings
    with open(settings_path, 'w') as f:
        json.dump(settings, f, indent=2)
    
    print(f"✅ Hooks registered in {settings_path}")
    
    # Make hook scripts executable
    for hook_type in ["pre", "post", "stop"]:
        hook_type_dir = hooks_dir / hook_type
        if hook_type_dir.exists():
            for script in hook_type_dir.glob("*.py"):
                script.chmod(0o755)
                print(f"✅ Made {script.name} executable")
    
    # Create state directory
    state_dir = hooks_dir / "state"
    state_dir.mkdir(exist_ok=True)
    print(f"✅ State directory ready at {state_dir}")
    
    # Show configuration summary
    config_path = hooks_dir / "config.json"
    if config_path.exists():
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        print("\n📋 Configuration Summary:")
        print(f"  - Verification: {'✅ Enabled' if config.get('verification', {}).get('enabled') else '❌ Disabled'}")
        print(f"  - Quality Checks: {'✅ Enabled' if config.get('quality_checks', {}).get('enabled') else '❌ Disabled'}")
        print(f"  - Tool Optimization: {'✅ Enabled' if config.get('tool_optimization', {}).get('enabled') else '❌ Disabled'}")
        
        sub_agents = config.get('sub_agents', {})
        if sub_agents:
            print("\n🤖 Sub-Agents:")
            for agent, agent_config in sub_agents.items():
                status = '✅' if agent_config.get('enabled') else '❌'
                print(f"  - {agent}: {status}")
    
    print("\n✨ Hook setup complete!")
    print("\nTo test hooks, try:")
    print("  1. Make some code changes")
    print("  2. Use grep or find commands (will be optimized)")
    print("  3. End your session to see reminders")


def uninstall_hooks():
    """Remove hooks from Claude Code settings"""
    
    settings_path = Path.home() / ".claude" / "settings.json"
    
    if not settings_path.exists():
        print("❌ No Claude Code settings found")
        return
    
    with open(settings_path, 'r') as f:
        settings = json.load(f)
    
    if "hooks" in settings:
        del settings["hooks"]
        
        with open(settings_path, 'w') as f:
            json.dump(settings, f, indent=2)
        
        print("✅ Hooks removed from Claude Code settings")
    else:
        print("ℹ️ No hooks found in settings")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "uninstall":
        uninstall_hooks()
    else:
        setup_hooks()