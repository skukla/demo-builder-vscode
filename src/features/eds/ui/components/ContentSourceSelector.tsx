/**
 * ContentSourceSelector
 *
 * Join-flow content-source declaration for ConnectServicesStep: DA.live
 * (default, today's flow) or AEM Sites — which reveals author-URL +
 * content-path fields. Deliberately NO credential field: the AEM content read
 * is authorized inside AEM and the config write reuses the existing Adobe IMS
 * login (Slice 2 R1).
 */

import { Radio, RadioGroup, TextField } from '@adobe/react-spectrum';
import React from 'react';
import type { UseAemContentSourceResult } from '../hooks/useAemContentSource';

/** Spectrum validationState for a field: only flag non-empty invalid input. */
function fieldValidationState(
    value: string,
    validation: { isValid: boolean },
): 'invalid' | undefined {
    return value && !validation.isValid ? 'invalid' : undefined;
}

export function ContentSourceSelector({
    contentSourceType,
    authorUrl,
    contentPath,
    authorUrlValidation,
    contentPathValidation,
    setContentSourceType,
    setAuthorUrl,
    setContentPath,
}: UseAemContentSourceResult): React.ReactElement {
    return (
        <div className="content-source-selector">
            <RadioGroup
                label="Content source"
                orientation="horizontal"
                value={contentSourceType}
                onChange={(value) => setContentSourceType(value as 'da-live' | 'aem-sites')}
            >
                <Radio value="da-live">DA.live</Radio>
                <Radio value="aem-sites">AEM Sites</Radio>
            </RadioGroup>
            {contentSourceType === 'aem-sites' && (
                <>
                    <TextField
                        label="AEM author URL"
                        width="100%"
                        value={authorUrl}
                        onChange={setAuthorUrl}
                        placeholder="https://author-pXXXXX-eXXXXXX.adobeaemcloud.com"
                        validationState={fieldValidationState(authorUrl, authorUrlValidation)}
                        errorMessage={authorUrlValidation.message}
                    />
                    <TextField
                        label="Content path"
                        width="100%"
                        value={contentPath}
                        onChange={setContentPath}
                        placeholder="/content/<site>"
                        validationState={fieldValidationState(contentPath, contentPathValidation)}
                        errorMessage={contentPathValidation.message}
                    />
                </>
            )}
        </div>
    );
}
