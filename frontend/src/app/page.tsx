import { Libre_Baskerville } from "next/font/google";
import { LandingPage } from "@/components/landing/LandingPage";

const display = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

export const metadata = {
  title: "Nero · Maritime Oil Spill Intelligence",
  description:
    "Satellite imagery, AIS vessel tracking, ocean current modelling and AI-powered "
    + "investigation to identify the source of marine oil spills.",
};

export default function OverviewPage() {
  return (
    <div className={display.variable}>
      <LandingPage />
    </div>
  );
}
