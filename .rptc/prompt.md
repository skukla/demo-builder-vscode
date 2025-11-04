# Prompt

ultrathink

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

What is this and can we fix it?

I am concerned about dead and/or inaccurate tests. Need a new plan to verify that our tests are testing against our actual implementation.

Each feature in features/ has a ui/ which contradicts our webviews-ui/ approach. Need to investigate this and decide what to do.
