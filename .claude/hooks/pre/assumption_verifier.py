#!/usr/bin/env python3
"""
Assumption Verifier Hook - PreToolUse
Verifies assumptions before making code changes
"""

import json
import sys
import os
from pathlib import Path

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from state_manager import StateManager
from decision_engine import DecisionEngine


def main():
    try:
        # Read hook input
        hook_input = json.loads(sys.stdin.read())
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Skip if verification disabled
        if not config.get("verification", {}).get("enabled", False):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Initialize components
        state_manager = StateManager()
        decision_engine = DecisionEngine(config)
        
        # Get tool details
        tool_name = hook_input.get("tool_name", "")
        tool_input = hook_input.get("tool_input", {})
        
        # Build context
        context = {
            "verification_count": state_manager.get_verification_count(),
            "modified_files_count": state_manager.get_modified_files_count(),
            "session_state": state_manager.load_session_state()
        }
        
        # Check for cached verification
        if tool_name in ["Write", "Edit", "MultiEdit"]:
            file_path = tool_input.get("file_path", "")
            if file_path:
                cache_key = f"{tool_name}:{file_path}"
                cached = state_manager.get_cached_verification(cache_key)
                if cached and cached.get("verified"):
                    print(json.dumps({"decision": "approve"}))
                    return
        
        # Evaluate tool call
        decision, reason, modified_input = decision_engine.evaluate_tool_call(
            tool_name, tool_input, context
        )
        
        # Track verification if blocked
        if decision == "block" and reason and "verification needed" in reason:
            state_manager.track_verification(
                "assumption_check",
                {"tool": tool_name, "file": tool_input.get("file_path", "")}
            )
        
        # Build response
        response = {"decision": decision}
        if reason:
            response["reason"] = reason
        if modified_input:
            response["modifiedToolInput"] = modified_input
        
        print(json.dumps(response))
        
    except Exception as e:
        # On error, don't block
        print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()