---
inclusion: always
---

# Import Ordering Convention

When writing TypeScript files, group and order imports as follows:

1. External packages (from `node_modules`) — ordered by line length (longest first)
2. Blank line separator
3. Relative imports (starting with `./` or `../`) — ordered by line length (longest first)

Example:

```typescript
import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";

import { loadConfig, UsersConfig } from "../src/config";
import { resourceName } from "../src/naming";
```
