import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SupabaseProvider } from './lib/supabase-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'IBA - Role-based Access System',
  description: 'A system with Tenant, Worker, and Supervisor roles',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseProvider>
          {children}
        </SupabaseProvider>
      </body>
    </html>
  )
}