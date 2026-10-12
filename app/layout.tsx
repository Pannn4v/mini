import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sovereign Sequencer · Mini-Instantly",
  description: "Autonomous multi-inbox outbound sequence engine on Vercel and Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-[#ededed] antialiased selection:bg-white selection:text-black">
        {children}
      </body>
    </html>
  );
}
