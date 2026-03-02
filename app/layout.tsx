import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ThemeToggle from './theme-toggle'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Sapien Eleven - Project Dashboard',
  description: 'Project management for Sapien Eleven'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){try{var t=localStorage.getItem('azul-theme');var l=t==='light';document.documentElement.classList.toggle('theme-light',l);if(document.body){document.body.classList.toggle('theme-light',l);}}catch(e){}})();"
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeToggle />
        {children}
      </body>
    </html>
  )
}
