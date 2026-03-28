import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from './_components/ThemeProvider'
import { SidebarProvider } from './_components/SidebarProvider'
import Sidebar from './_components/Sidebar'
import ApiConnectionBanner from './_components/ApiConnectionBanner'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Cloud Pricing Simulator',
  description: 'Multi-provider FinOps tool — compare AWS, Azure, and GCP pricing.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="h-screen flex overflow-hidden bg-white text-slate-900">
        <ThemeProvider>
          <SidebarProvider>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <ApiConnectionBanner />
              <main className="flex-1 overflow-y-auto bg-[#F8FAFC] pt-14 lg:pt-0">
                {children}
              </main>
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
