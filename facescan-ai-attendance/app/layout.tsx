import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'AI Smart Attendance System | Facial Recognition',
  description:
    'Smart Attendance System with real-time facial recognition, anti-spoofing blink liveness verification, Supabase pgvector embedding matching, and reporting dashboard.',
  openGraph: {
    title: 'AI Smart Attendance System | Facial Recognition',
    description:
      'Smart Attendance System with real-time facial recognition, anti-spoofing blink liveness verification, Supabase pgvector embedding matching, and reporting dashboard.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Smart Attendance System | Facial Recognition',
    description:
      'Smart Attendance System with real-time facial recognition, anti-spoofing blink liveness verification, Supabase pgvector embedding matching, and reporting dashboard.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
