<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Write the least code that solves it (ponytail)

Before adding code, stop at the first rung that holds:

1. Does this need to exist at all? → no: skip it (YAGNI)
2. Already in this codebase? → reuse it, don't rewrite
3. Stdlib/language feature does it? → use it
4. Native platform/browser feature does it? → use it
5. An installed dependency does it? → use it
6. One line? → one line
7. Only then: the minimum implementation that works

Lazy about the solution, never about reading — trace the real flow through the
code the change touches before picking a rung. And never lazy about
correctness: trust-boundary validation, data-loss handling, security, and
accessibility are never on the chopping block to save lines.
