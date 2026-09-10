import Link from "next/link";
import { SiteNav } from "@/components/layout/SiteNav";
import { OceanAtmosphere } from "@/components/effects/OceanAtmosphere";

export const metadata = { title: "About Nero" };

const SOURCES = [
  ["Satellite imagery", "Copernicus Data Space Ecosystem. Sentinel 1 radar is the primary source, with Sentinel 2 optical for validation. Catalogue search is keyless; downloading a scene needs a Copernicus account."],
  ["Ocean model", "Open-Meteo Marine and ERA5 for currents, wind, waves and sea surface temperature; Copernicus Marine Service (CMEMS) as the model grade alternative."],
  ["Ground truth", "NOAA IncidentNews. Recent response records, used as a sanity check on detections."],
  ["Vessel traffic", "Global Fishing Watch for global AIS presence and events; MarineCadastre for message-resolution US archives."],
];

const PRINCIPLES = [
  ["Every source is swappable", "The analysis never imports a vendor directly. It asks a provider registry, so a mock, a real API or a different vendor are one configuration line apart."],
  ["Evidence over verdicts", "Vessel attribution shows the incriminating and mitigating factors and their weights. The score is a summary of the file, not a black box."],
  ["Honest about simulation", "Where a step runs on a model rather than a trained network (segmentation, for now), the interface says so."],
];

export default function AboutPage() {
  return (
    <>
      <OceanAtmosphere />
      <SiteNav />

      <main className="relative mx-auto max-w-[860px] px-6 pb-24 pt-28">
        <p className="eyebrow">About</p>
        <h1 className="h-editorial mt-4 text-[clamp(2rem,4.4vw,3.1rem)] text-text">
          A single investigation, from radar to response.
        </h1>
        <p className="mt-6 max-w-[40rem] text-[0.96rem] leading-relaxed text-text-muted">
          Nero is a maritime oil spill intelligence platform. It automates the chain
          an operations centre would otherwise assemble by hand: find the slick,
          reconstruct its origin, identify the vessels that were there, forecast the
          drift, and assess what is at risk, with the working shown at each stage.
        </p>

        <hr className="rule my-16" />

        <section>
          <h2 className="font-serif text-[1.3rem] text-text">Data</h2>
          <div className="mt-6">
            {SOURCES.map(([k, v]) => (
              <div key={k} className="grid gap-1 border-b border-border/70 py-5 md:grid-cols-[13rem_1fr] md:gap-6">
                <span className="text-[0.88rem] text-text">{k}</span>
                <span className="text-[0.85rem] leading-relaxed text-text-muted">{v}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="font-serif text-[1.3rem] text-text">Principles</h2>
          <div className="mt-6 space-y-8">
            {PRINCIPLES.map(([k, v]) => (
              <div key={k}>
                <h3 className="text-[0.92rem] text-text">{k}</h3>
                <p className="mt-1.5 max-w-[42rem] text-[0.85rem] leading-relaxed text-text-muted">{v}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule my-16" />

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 border border-border-strong px-4 py-2.5 text-[0.78rem] tracking-wide text-text transition-colors duration-[180ms] hover:border-accent/70 hover:bg-surface-3/40"
        >
          Open live monitoring
        </Link>
      </main>
    </>
  );
}
