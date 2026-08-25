import type { Metadata } from "next";
import {
  Inter,
  Cinzel,
  Cinzel_Decorative,
  UnifrakturMaguntia,
  EB_Garamond,
  Press_Start_2P,
  Baloo_2,
} from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

const cinzelDecorative = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-elden",
});
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-elden-body",
});

const unifraktur = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-ds3",
});
const garamond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-ds3-body",
});

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-terraria",
});

const baloo = Baloo_2({
  subsets: ["latin"],
  variable: "--font-palworld",
});

export const metadata: Metadata = {
  title: "BossForge — AI Boss Concept Art",
  description:
    "Pick a game, describe a boss idea, and get three concept renders tailored to that game's exact art style.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={[
          inter.variable,
          cinzelDecorative.variable,
          cinzel.variable,
          unifraktur.variable,
          garamond.variable,
          pressStart.variable,
          baloo.variable,
          "min-h-screen antialiased",
        ].join(" ")}
      >
        {children}
      </body>
    </html>
  );
}
