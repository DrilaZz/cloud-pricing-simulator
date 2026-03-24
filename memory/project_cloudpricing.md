---
name: cloud-pricing-simulator project context
description: Cloud Pricing Simulator - Next.js 16 FinOps tool for comparing AWS/Azure/GCP costs
type: project
---

Cloud Pricing Simulator is a Next.js 16.2.1 frontend-only FinOps tool.

**Why:** Open source tool to compose cloud architectures and compare costs between providers, including Reserved Instance impact simulation.

**Stack:** Next.js 16.2.1, React 19, TypeScript, Tailwind CSS v4, Radix UI primitives (Dialog, Switch, Slider, Label), lucide-react, clsx, tailwind-merge, class-variance-authority.

**Structure:**
- `data/mock-pricing.ts` — all mock pricing data (AWS, Azure, GCP), price calculation helpers
- `lib/utils.ts` — cn(), formatCurrency(), formatPercent()
- `app/_components/Simulator.tsx` — main client component with CloudComponent state
- `app/_components/Header.tsx` — sticky header
- `app/_components/ProviderTabs.tsx` — provider switcher
- `app/_components/ComponentForm.tsx` — dialog form to add components
- `app/_components/ComponentCard.tsx` — individual component display with costs
- `app/_components/Summary.tsx` — total cost summary with RI stats
- `app/_components/ui/` — shadcn-style UI primitives (button, card, badge, dialog, switch, slider, label)

**How to apply:** No backend needed. All data is in `data/mock-pricing.ts`. Run with `npm run dev`. Build is clean with zero TS errors.
