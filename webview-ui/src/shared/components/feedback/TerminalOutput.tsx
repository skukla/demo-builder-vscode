import React, { useEffect, useRef } from 'react';
import { View } from '@adobe/react-spectrum';

interface TerminalOutputProps {
    logs: string[];
    maxHeight?: string;
}

export function TerminalOutput({ logs, maxHeight = '300px' }: TerminalOutputProps) {
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Auto-scroll to bottom when new logs arrive
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <View 
            borderWidth="thin" 
            borderColor="gray-400" 
            borderRadius="medium"
            overflow="hidden"
        >
            <div 
                ref={terminalRef}
                className="terminal-output"
                style={{ maxHeight }}
            >
                {logs.map((log, index) => (
                    <div key={index}>{log}</div>
                ))}
                {logs.length === 0 && (
                    <div style={{ opacity: 0.5 }}>Waiting for output...</div>
                )}
            </div>
        </View>
    );
}