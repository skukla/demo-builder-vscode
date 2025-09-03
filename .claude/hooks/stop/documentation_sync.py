#!/usr/bin/env python3
"""
Documentation Sync Hook - Stop
Checks if documentation needs updating at session end
"""

import json
import sys
from pathlib import Path

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from state_manager import StateManager
from sub_agent_invoker import SubAgentInvoker


def main():
    try:
        # Read hook input (may be minimal for stop hooks)
        hook_input = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Check if docs-sync is enabled
        docs_config = config.get("sub_agents", {}).get("docs-sync", {})
        if not docs_config.get("enabled", False):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Initialize components
        state_manager = StateManager()
        sub_agent_invoker = SubAgentInvoker(config)
        
        # Load session state
        session_state = state_manager.load_session_state()
        
        # Check if documentation needs updating
        modified_files = session_state.get("files_modified", [])
        modified_count = len(modified_files)
        
        # Check for CLAUDE.md files
        claude_md_modified = any("CLAUDE.md" in f["file"] for f in modified_files)
        
        # Build context
        context = {
            "modified_files_count": modified_count,
            "modified_files": [f["file"] for f in modified_files],
            "commits_since_doc_update": len(session_state.get("commits", [])),
            "session_state": session_state
        }
        
        # Check if docs sync needed
        if sub_agent_invoker._should_invoke_docs_sync(context):
            message = f"""📚 Documentation Update Reminder

Session ending with {modified_count} modified files.
{"CLAUDE.md files were modified." if claude_md_modified else ""}

Consider updating documentation:
1. Run: Use Task tool with subagent_type="docs-sync"
2. Update relevant CLAUDE.md files
3. Sync technical documentation
4. Update troubleshooting guides if needed

Modified files:
{chr(10).join(f"- {f}" for f in context['modified_files'][:10])}
{"..." if len(context['modified_files']) > 10 else ""}
"""
            
            print(json.dumps({
                "decision": "block",
                "reason": message
            }))
            return
        
        # Clean up old state files
        state_manager.cleanup_old_states(days=7)
        
        print(json.dumps({"decision": "approve"}))
        
    except Exception as e:
        # On error, don't block
        print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()