"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { useMapStore } from "@/store/map";

/**
 * M1: a quick "go to coordinates" bar. Type `20.44, 69.02` (lat, lon) and press
 * Enter to fly there. Full entity search (incidents / vessels / reports) is M5.
 */
export function CommandBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const flyTo = useMapStore((s) => s.flyTo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) {
      setHint("enter coordinates as  lat, lon");
      return;
    }
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setHint("out of range");
      return;
    }
    flyTo({ center: [lon, lat], zoom: 9 });
    setHint(null);
  };

  return (
    <div className="panel flex w-[min(30rem,60vw)] items-center gap-2 px-3 py-2">
      <Search size={14} className="shrink-0 text-text-subtle" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setHint(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Go to coordinates (lat, lon)"
        className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-text-subtle focus:outline-none"
      />
      {hint ? (
        <span className="shrink-0 text-[11px] text-warning">{hint}</span>
      ) : (
        <kbd className="shrink-0 rounded-[4px] border border-border px-1 text-[10px] text-text-subtle">
          ⌘K
        </kbd>
      )}
      <button
        onClick={submit}
        aria-label="Go"
        className="shrink-0 text-text-subtle transition-colors hover:text-accent"
      >
        <CornerDownLeft size={14} />
      </button>
    </div>
  );
}
