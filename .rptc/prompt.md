# Prompt

ultrathink

 /rptc:helper-resume-plan "@fix-remaining-test-failures-phase2/"
 /rptc:helper-resume-plan "@standardize-component-naming/"

Need a new plan to reorganize all tests to match current code structure

I am concerned about dead and/or inaccurate tests. Need a new plan to verify that our tests are testing against our actual implementation.

Each feature in features/ has a ui/ which contradicts our webviews-ui/ approach. Need to investigate this and decide what to do.

ts-jest[ts-jest-transformer] (WARN) Define `ts-jest` config under `globals` is
    deprecated. Please do
    transform: {
        <transform_regex>: ['ts-jest', { /*ts-jest config goes here in Jest*/ }],
    },
    See more at
    <https://kulshekhar.github.io/ts-jest/docs/getting-started/presets#advanced>
      console.warn
        Placeholders are deprecated due to accessibility issues. Please use help text
    instead. See the docs for details:
    <https://react-spectrum.adobe.com/react-spectrum/TextField.html#help-text>



