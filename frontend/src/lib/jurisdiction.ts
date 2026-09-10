/**
 * Fallback recipient resolution when the AI cannot attribute a spill to a
 * company: work out which maritime authority has jurisdiction over the spill
 * location and address the notification there instead.
 *
 * These are demo routes for the mock trial — the boxes are coarse and the
 * addresses use the reserved `.example` domain, never a real government inbox.
 */

export interface MaritimeAuthority {
  /** the body that would receive the pollution report */
  authority: string;
  /** short jurisdiction name shown to the operator */
  region: string;
  /** demo contact (reserved .example TLD — not a live address) */
  email: string;
  /** how this route was chosen */
  basis: string;
}

interface Rule {
  region: string;
  authority: string;
  email: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
}

// Ordered most-specific first; the Arabian Sea / north Indian Ocean is covered
// in detail because that is where the worked scenario sits.
const RULES: Rule[] = [
  {
    region: "Indian EEZ — Arabian Sea (Gujarat / Saurashtra approaches)",
    authority: "Indian Coast Guard, Region (North-West) · Directorate General of Shipping, India",
    email: "mrcc.mumbai@indiancoastguard.example",
    bbox: [66.0, 18.0, 72.5, 24.0],
  },
  {
    region: "Indian EEZ — west coast",
    authority: "Indian Coast Guard · Directorate General of Shipping, India",
    email: "occ@indiancoastguard.example",
    bbox: [68.0, 8.0, 77.5, 23.5],
  },
  {
    region: "Pakistan EEZ — northern Arabian Sea",
    authority: "Pakistan Maritime Security Agency · Karachi Port Authority",
    email: "occ@pmsa.example",
    bbox: [61.0, 22.0, 68.0, 25.5],
  },
  {
    region: "Oman EEZ — Gulf of Oman / Arabian Sea",
    authority: "Oman Maritime Security Centre · Environment Authority (Oman)",
    email: "duty@mosc.example",
    bbox: [52.0, 16.0, 60.0, 26.5],
  },
  {
    region: "UAE / Persian Gulf",
    authority: "UAE Federal Transport Authority — Maritime · MEMAC",
    email: "pollution@fta.example",
    bbox: [51.0, 22.5, 57.0, 27.0],
  },
  {
    region: "Red Sea / Gulf of Aden approaches",
    authority: "PERSGA regional node · nearest coastal-state maritime authority",
    email: "alert@persga.example",
    bbox: [32.0, 10.0, 45.0, 30.0],
  },
  {
    region: "Netherlands EEZ — southern North Sea (Maas / Rotterdam approaches)",
    authority: "Netherlands Coastguard (Kustwacht), Den Helder · Rijkswaterstaat",
    email: "ncc@kustwacht.example",
    bbox: [2.0, 51.0, 5.5, 54.5],
  },
  {
    region: "UK / North Sea — southern basin",
    authority: "HM Coastguard (MCA) · Marine Pollution Response",
    email: "ukmpc@mcga.example",
    bbox: [-4.0, 51.0, 2.0, 56.0],
  },
  {
    region: "US EEZ — Gulf of Mexico (Louisiana / Mississippi Delta)",
    authority: "USCG Sector New Orleans · National Response Center · NOAA OR&R",
    email: "watch@d8.uscg.example",
    bbox: [-95.0, 26.0, -87.0, 30.5],
  },
  {
    region: "Central Mediterranean — Sicily Strait / Malta channel",
    authority: "Italian Coast Guard (Guardia Costiera), Rome MRCC · REMPEC (Malta)",
    email: "roccc@guardiacostiera.example",
    bbox: [10.0, 33.0, 19.0, 39.0],
  },
];

const GEBCO_INDIA_MRCC = {
  region: "north Indian Ocean — high seas",
  authority: "Nearest coastal-state MRCC · IMO (flag-state referral)",
  email: "duty.officer@imo-referral.example",
} as const;

const HIGH_SEAS = {
  region: "high seas — outside any national EEZ",
  authority: "Flag-state administration via IMO · nearest MRCC",
  email: "duty.officer@imo-referral.example",
} as const;

const inBox = (lon: number, lat: number, [w, s, e, n]: [number, number, number, number]) =>
  lon >= w && lon <= e && lat >= s && lat <= n;

/** Resolve the authority for a spill at (lon, lat). */
export function resolveAuthority(lon: number, lat: number): MaritimeAuthority {
  for (const r of RULES) {
    if (inBox(lon, lat, r.bbox)) {
      return {
        authority: r.authority,
        region: r.region,
        email: r.email.trim(),
        basis:
          `No operator was identified from public ownership records. The spill at ` +
          `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ` +
          `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"} falls within ` +
          `${r.region}, so the notification is routed to the responsible maritime authority.`,
      };
    }
  }
  // broad north Indian Ocean → still route to a regional MRCC
  if (inBox(lon, lat, [45, -5, 100, 30])) {
    return {
      ...GEBCO_INDIA_MRCC,
      basis:
        "No operator identified and the position is outside a mapped national EEZ box; " +
        "routed to the nearest coastal-state MRCC with an IMO flag-state referral.",
    };
  }
  return {
    ...HIGH_SEAS,
    basis:
      "No operator identified and the spill is on the high seas; the report is referred to " +
      "the vessel's flag-state administration through the IMO and the nearest MRCC.",
  };
}
