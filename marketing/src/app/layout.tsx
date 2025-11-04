import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Little Hero Labs - Personalized Children's Books",
  description: "Every child is the hero of their own story. Create magical, personalized children's books with The Adventure Compass.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

