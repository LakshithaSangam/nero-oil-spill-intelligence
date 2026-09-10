import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Serif, Inter, Libre_Baskerville } from "next/font/google";
import "./globals.css";
import { BootSequence } from "@/components/effects/BootSequence";
import { HowItWorks } from "@/components/layout/HowItWorks";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { ThemeManager } from "@/components/layout/ThemeManager";
import { Watermark } from "@/components/layout/Watermark";

/** Set the stored theme before first paint so there is no light/dark flash. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("neuro.theme");document.documentElement.dataset.theme=(t==="light"||t==="dark")?t:"dark";}catch(e){}})();`;

const serif = IBM_Plex_Serif({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--ff-serif",
});

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--ff-mono",
});

const display = Libre_Baskerville({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--ff-display",
});

export const metadata: Metadata = {
  title: "Nero · Maritime Oil Spill Intelligence",
  description:
    "Detection, origin reconstruction, vessel attribution, drift forecasting "
    + "and environmental response for marine oil spills.",
};

export const viewport: Viewport = {
  themeColor: "#0B2234",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <ThemeManager />
        <BootSequence />
        {children}
        <HowItWorks />
        <SettingsPanel />
        <Watermark />
      </body>
    </html>
  );
}
