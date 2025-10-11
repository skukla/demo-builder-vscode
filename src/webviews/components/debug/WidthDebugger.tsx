import React, { useEffect, useRef, useState } from 'react';

interface WidthInfo {
    offsetWidth: number;
    clientWidth: number;
    scrollWidth: number;
    computedStyle: {
        width: string;
        maxWidth: string;
        minWidth: string;
        padding: string;
        margin: string;
        boxSizing: string;
        display: string;
        position: string;
    };
    parentInfo?: {
        offsetWidth: number;
        clientWidth: number;
        tagName: string;
        className: string;
    };
}

export function WidthDebugger({ stepName }: { stepName: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [widthInfo, setWidthInfo] = useState<WidthInfo | null>(null);

    useEffect(() => {
        if (ref.current) {
            const element = ref.current;
            
            // Find the container div (should be 800px wide)
            let containerDiv = element.parentElement;
            while (containerDiv && !containerDiv.style.maxWidth?.includes('800px')) {
                containerDiv = containerDiv.parentElement;
            }
            
            if (containerDiv) {
                const containerComputed = window.getComputedStyle(containerDiv);
                console.log(`[WidthDebugger] ${stepName} CONTAINER:`, {
                    offsetWidth: containerDiv.offsetWidth,
                    clientWidth: containerDiv.clientWidth,
                    computedWidth: containerComputed.width,
                    computedMaxWidth: containerComputed.maxWidth,
                    display: containerComputed.display,
                    position: containerComputed.position,
                    grandparent: containerDiv.parentElement?.className,
                    grandparentWidth: containerDiv.parentElement?.offsetWidth,
                });
                
                // Check all ancestors for constraints
                let ancestor = containerDiv.parentElement;
                let level = 1;
                while (ancestor && level <= 5) {
                    const ancestorComputed = window.getComputedStyle(ancestor);
                    console.log(`[WidthDebugger] ${stepName} Ancestor ${level}:`, {
                        tag: ancestor.tagName,
                        class: ancestor.className.substring(0, 100),
                        width: ancestor.offsetWidth,
                        computedWidth: ancestorComputed.width,
                        display: ancestorComputed.display,
                        overflow: ancestorComputed.overflow,
                    });
                    ancestor = ancestor.parentElement;
                    level++;
                }
            }
            
            const computed = window.getComputedStyle(element);
            const parent = element.parentElement;

            const info: WidthInfo = {
                offsetWidth: element.offsetWidth,
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                computedStyle: {
                    width: computed.width,
                    maxWidth: computed.maxWidth,
                    minWidth: computed.minWidth,
                    padding: computed.padding,
                    margin: computed.margin,
                    boxSizing: computed.boxSizing,
                    display: computed.display,
                    position: computed.position,
                },
            };

            if (parent) {
                info.parentInfo = {
                    offsetWidth: parent.offsetWidth,
                    clientWidth: parent.clientWidth,
                    tagName: parent.tagName.toLowerCase(),
                    className: parent.className,
                };
            }

            setWidthInfo(info);

            // Log to console for easy debugging
            console.log(`[WidthDebugger] ${stepName}:`, info);
        }
    }, [stepName]);

    return (
        <div 
            ref={ref}
            style={{
                position: 'fixed',
                top: '10px',
                right: '10px',
                background: 'rgba(0, 0, 0, 0.9)',
                color: '#0f0',
                padding: '10px',
                fontSize: '11px',
                fontFamily: 'monospace',
                zIndex: 99999,
                maxWidth: '300px',
                borderRadius: '4px',
                border: '1px solid #0f0',
            }}
        >
            <div style={{ marginBottom: '5px', color: '#ff0', fontWeight: 'bold' }}>
                📏 {stepName}
            </div>
            {widthInfo && (
                <>
                    <div>offsetWidth: {widthInfo.offsetWidth}px</div>
                    <div>clientWidth: {widthInfo.clientWidth}px</div>
                    <div>scrollWidth: {widthInfo.scrollWidth}px</div>
                    <div style={{ marginTop: '5px', color: '#0ff' }}>Computed:</div>
                    <div>width: {widthInfo.computedStyle.width}</div>
                    <div>maxWidth: {widthInfo.computedStyle.maxWidth}</div>
                    <div>padding: {widthInfo.computedStyle.padding}</div>
                    <div>margin: {widthInfo.computedStyle.margin}</div>
                    <div>boxSizing: {widthInfo.computedStyle.boxSizing}</div>
                    {widthInfo.parentInfo && (
                        <>
                            <div style={{ marginTop: '5px', color: '#f0f' }}>Parent:</div>
                            <div>tag: {widthInfo.parentInfo.tagName}</div>
                            <div>width: {widthInfo.parentInfo.offsetWidth}px</div>
                            <div>clientWidth: {widthInfo.parentInfo.clientWidth}px</div>
                            <div>class: {widthInfo.parentInfo.className.substring(0, 50)}...</div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}