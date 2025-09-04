#!/usr/bin/env python3
"""
Commit Reminder Hook - Stop
Reminds to commit changes at session end
"""

import json
import sys
import subprocess
from pathlib import Path

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from state_manager import StateManager


def main():
    try:
        # Read hook input (may be minimal for stop hooks)
        hook_input = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Initialize state manager
        state_manager = StateManager()
        
        # Load session state
        session_state = state_manager.load_session_state()
        
        # Get modified files since last commit
        modified_count = state_manager.get_modified_files_count()
        
        # Check threshold for commit reminder
        threshold = config.get("thresholds", {}).get("commit_reminder", 3)
        
        # First check git status to see if there are actual uncommitted changes
        has_uncommitted = False
        git_available = False
        git_files = []
        
        try:
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True,
                text=True,
                cwd=Path.cwd()
            )
            
            if result.returncode == 0:
                git_available = True
                if result.stdout.strip():
                    has_uncommitted = True
                    git_files = result.stdout.strip().split('\n')
        except Exception:
            # Git command failed
            pass
        
        # Only show reminder if there are actual uncommitted changes
        # or if git is unavailable and many files were modified
        if has_uncommitted:
            uncommitted_count = len(git_files)
            message = f"""💾 Commit Reminder

You have {uncommitted_count} uncommitted changes:
{chr(10).join(f"  {line}" for line in git_files[:10])}
{"  ..." if len(git_files) > 10 else ""}

Consider committing your changes:
1. Review changes: git diff
2. Stage files: git add .
3. Commit: git commit -m "Your message"
4. Push if needed: git push

Modified files in this session: {modified_count}
"""
            print(json.dumps({
                "decision": "block",
                "reason": message
            }))
            return
        elif not git_available and modified_count >= threshold:
            # Git not available but many files were modified
            message = f"""💾 Commit Reminder

You have made {modified_count} file modifications in this session.
Consider reviewing and committing your changes if using version control.
"""
            print(json.dumps({
                "decision": "block",
                "reason": message
            }))
            return
        
        # Update metrics
        state_manager.update_metrics("session_files_modified", modified_count)
        state_manager.update_metrics("session_duration", 
                                    (sys.stdin.isatty() and "unknown" or "completed"))
        
        print(json.dumps({"decision": "approve"}))
        
    except Exception as e:
        # On error, don't block
        print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()