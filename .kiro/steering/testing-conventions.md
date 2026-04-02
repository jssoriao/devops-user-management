---
inclusion: always
---

# Testing Conventions

When writing unit tests, always cover both success and failure paths:

1. Test the happy path — valid inputs produce expected outputs
2. Test failure cases — invalid inputs, missing data, edge cases, and error conditions should be explicitly tested
3. Verify error messages are descriptive and actionable when testing failure paths
4. Use concrete example-based tests for known edge cases alongside property-based tests for general correctness
