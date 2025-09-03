#!/usr/bin/env python3
"""
Quality Enforcer Hook - PostToolUse
Enforces quality checks after file modifications
"""

import json
import sys
import os
from pathlib import Path

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from state_manager import StateManager
from decision_engine import DecisionEngine
from sub_agent_invoker import SubAgentInvoker


def main():
    try:
        # Read hook input
        hook_input = json.loads(sys.stdin.read())
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Skip if quality checks disabled
        if not config.get("quality_checks", {}).get("enabled", False):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Initialize components
        state_manager = StateManager()
        decision_engine = DecisionEngine(config)
        sub_agent_invoker = SubAgentInvoker(config)
        
        # Get tool details
        tool_name = hook_input.get("tool_name", "")
        tool_input = hook_input.get("tool_input", {})
        tool_response = hook_input.get("tool_response", {})
        
        # Track file modifications
        if tool_name in ["Write", "Edit", "MultiEdit", "NotebookEdit"]:
            file_path = tool_input.get("file_path", "")
            if file_path:
                state_manager.track_modification(file_path, tool_name)
        
        # Build context for decisions
        context = {
            "modified_files_count": state_manager.get_modified_files_count(),
            "verification_count": state_manager.get_verification_count(),
            "session_state": state_manager.load_session_state(),
            "recent_code_changes": tool_input.get("new_string", "") or tool_input.get("content", "")
        }
        
        # Check if quality guardian should be invoked
        recommendations = sub_agent_invoker.check_invocation_needed(context)
        
        for rec in recommendations:
            if rec["agent"] == "quality-guardian" and rec["priority"] == "high":
                if sub_agent_invoker.should_block_for_agent("quality-guardian", context):
                    message = sub_agent_invoker.create_invocation_message("quality-guardian", context)
                    print(json.dumps({
                        "decision": "block",
                        "reason": message
                    }))
                    return
        
        # Check if systematic quality check needed
        if config.get("quality_checks", {}).get("systematic_verification", False):
            modified_count = state_manager.get_modified_files_count()
            threshold = config.get("thresholds", {}).get("quality_check_files", 5)
            
            if modified_count >= threshold:
                # Get file extension to determine project type
                file_path = tool_input.get("file_path", "")
                file_ext = Path(file_path).suffix if file_path else ""
                
                # Skip non-code files
                skip_extensions = ['.md', '.yml', '.yaml', '.json', '.txt']
                if file_ext.lower() in skip_extensions:
                    print(json.dumps({"decision": "approve"}))
                    return
                
                message = self._create_quality_check_message(file_path, file_ext)
                print(json.dumps({
                    "decision": "block",
                    "reason": message
                }))
                return
        
        print(json.dumps({"decision": "approve"}))
        
    except Exception as e:
        # On error, don't block
        print(json.dumps({"decision": "approve"}))


def _create_quality_check_message(file_path: str, file_ext: str) -> str:
    """Create quality check message based on file type"""
    
    # Determine project type
    project_checks = {
        ".ts": "npm run build && npm run lint",
        ".tsx": "npm run build && npm run lint",
        ".js": "npm run build && npm run lint",
        ".jsx": "npm run build && npm run lint",
        ".py": "python -m py_compile {file} && mypy {file}",
        ".go": "go build ./... && go vet ./...",
        ".rs": "cargo build && cargo clippy",
        ".swift": "swiftlint {file}",
        ".java": "javac {file}"
    }
    
    check_command = project_checks.get(file_ext, "appropriate build/lint commands")
    if "{file}" in check_command:
        check_command = check_command.replace("{file}", file_path)
    
    return f"""✅ Quality check required after modifying {file_path}

Please run: {check_command}

Verify:
1. No compilation/build errors
2. No linting warnings (treat warnings as errors)
3. Type checking passes (if applicable)
4. Tests still pass (if test suite exists)

After running checks and fixing any issues, type 'continue' to proceed."""


if __name__ == "__main__":
    main()