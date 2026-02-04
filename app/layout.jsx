import "./globals.css";
import { Bebas_Neue, Space_Grotesk } from "next/font/google";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const space = Space_Grotesk({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata = {
  title: "Btown Spartians",
  description: "Welcome to the Btown Spartians webpage",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${bebas.variable} ${space.variable}`}>
        {children}
      </body>
    </html>
  );
}
