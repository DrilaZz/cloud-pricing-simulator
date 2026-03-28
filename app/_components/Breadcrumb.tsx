import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface Crumb {
  label: string
  href?: string
}

export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-6">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600 flex-shrink-0" />}
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-900 dark:text-slate-100">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
