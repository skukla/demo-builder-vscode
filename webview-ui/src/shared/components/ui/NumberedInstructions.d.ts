import React from 'react';
interface Instruction {
    step: string;
    details: string;
    important?: boolean;
}
interface NumberedInstructionsProps {
    description?: string;
    instructions: Instruction[];
}
export declare function NumberedInstructions({ description, instructions }: NumberedInstructionsProps): React.JSX.Element;
export {};
//# sourceMappingURL=NumberedInstructions.d.ts.map