import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sapien Eleven - Project Dashboard',
  description: 'Project management for Sapien Eleven',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
