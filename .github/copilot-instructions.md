# Repository guidance

- Keep the six lifecycle department names and stage transitions aligned across the UI, API, tests, and documentation.
- Treat the CRM service as the system of record; workflow services request lifecycle changes from it rather than writing customer data directly.
- Do not add credentials or production secrets to source control. Keep cloud examples parameterized and clearly mark their prerequisites and costs.
- Keep documentation and user-facing text free of emojis.
