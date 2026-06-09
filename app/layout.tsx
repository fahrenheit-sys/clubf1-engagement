import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Engagement Monitor — Fahrenheit One',
  description: 'Member engagement & at-risk monitor — risk scoring, suggested comms, trainer approval.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
