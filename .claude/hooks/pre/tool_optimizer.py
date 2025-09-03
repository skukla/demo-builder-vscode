#!/usr/bin/env python3
"""
Tool Optimizer Hook - PreToolUse
Replaces traditional tools with modern alternatives
"""

import json
import sys
import shutil
from pathlib import Path

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from decision_engine import DecisionEngine


def main():
    try:
        # Read hook input
        hook_input = json.loads(sys.stdin.read())
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Skip if tool optimization disabled
        if not config.get("tool_optimization", {}).get("enabled", False):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Only optimize Bash commands
        tool_name = hook_input.get("tool_name", "")
        if tool_name != "Bash":
            print(json.dumps({"decision": "approve"}))
            return
        
        tool_input = hook_input.get("tool_input", {})
        command = tool_input.get("command", "")
        
        if not command:
            print(json.dumps({"decision": "approve"}))
            return
        
        # Initialize decision engine for optimization
        decision_engine = DecisionEngine(config)
        
        # Try to optimize the command
        optimized_input = decision_engine._optimize_tool_call(tool_name, tool_input)
        
        if optimized_input:
            # Log the optimization
            original_command = command
            new_command = optimized_input["command"]
            
            # Add a comment about the optimization
            response = {
                "decision": "approve",
                "modifiedToolInput": optimized_input
            }
            
            # Only show message if verbose notifications enabled
            if config.get("notifications", {}).get("show_sub_agent_tips", True):
                response["info"] = f"🚀 Optimized: Using modern tool replacement"
            
            print(json.dumps(response))
        else:
            print(json.dumps({"decision": "approve"}))
        
    except Exception as e:
        # On error, don't block
        print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()