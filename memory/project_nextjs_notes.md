---
name: Next.js 16 breaking changes
description: Important Next.js 16.2.1 differences from earlier versions
type: project
---

Next.js 16.2.1 key differences:
- Tailwind v4: use `@import "tailwindcss"` in globals.css, no tailwind.config.js needed, PostCSS plugin is `@tailwindcss/postcss`
- `next build` no longer runs linter automatically
- Turbopack is the default bundler (use `--webpack` to opt out)
- Lint script uses `eslint` directly (not `next lint`)
- AGENTS.md is included by create-next-app by default to guide AI agents

**How to apply:** Always read `node_modules/next/dist/docs/` before coding in this project.
