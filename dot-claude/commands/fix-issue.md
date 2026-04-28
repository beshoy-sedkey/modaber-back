---
description: Fix a specific bug or issue in the codebase
---

# /project:fix-issue

Fix the described issue. Follow these steps:

1. Read the relevant source files to understand the current code
2. Read related test files to understand expected behavior
3. Identify the root cause
4. Apply the minimal fix (don't refactor unrelated code)
5. Update or add tests to cover the fix
6. Run: docker compose exec app npx tsc --noEmit
7. Run: docker compose exec app npx jest
8. Report what you changed and why
