"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, MapPin } from "lucide-react";

interface Props {
  defaultLat?: number | null;
  defaultLng?: number | null;
}

interface Suggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationPicker({ defaultLat, defaultLng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [lat, setLat] = useState<number | null>(defaultLat ?? null);
  const [lng, setLng] = useState<number | null>(defaultLng ?? null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const leafletRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced autocomplete fetch
  const fetchSuggestions = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=6&countrycodes=ph`,
          { headers: { "Accept-Language": "en" } },
        );
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setShowDropdown(data.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 350);
  }, []);

  const placePin = useCallback((rLat: number, rLng: number) => {
    setLat(rLat);
    setLng(rLng);
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    map.setView([rLat, rLng], 17);
    if (markerRef.current) {
      markerRef.current.setLatLng([rLat, rLng]);
    } else {
      markerRef.current = L.marker([rLat, rLng], { draggable: true }).addTo(map);
      markerRef.current.on("dragend", (e: any) => {
        const pos = e.target.getLatLng();
        setLat(parseFloat(pos.lat.toFixed(7)));
        setLng(parseFloat(pos.lng.toFixed(7)));
      });
    }
  }, []);

  const handleSelect = (s: Suggestion) => {
    setQuery(s.display_name.split(",").slice(0, 2).join(","));
    setShowDropdown(false);
    placePin(parseFloat(parseFloat(s.lat).toFixed(7)), parseFloat(parseFloat(s.lon).toFixed(7)));
  };

  // Map init
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      // Guard inside .then() — both Strict Mode runs start the import in parallel;
      // only the first one to resolve should create the map.
      if (!mapRef.current || mapInstanceRef.current) return;
      // Clear any leftover _leaflet_id from a previous mount cycle
      if ((mapRef.current as any)._leaflet_id) {
        delete (mapRef.current as any)._leaflet_id;
      }
      leafletRef.current = L;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      const startLat = defaultLat ?? 14.5995;
      const startLng = defaultLng ?? 120.9842;
      const map = L.map(mapRef.current!, { center: [startLat, startLng], zoom: defaultLat ? 16 : 12 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      if (defaultLat && defaultLng) {
        markerRef.current = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);
        markerRef.current.on("dragend", (e: any) => {
          const pos = e.target.getLatLng();
          setLat(parseFloat(pos.lat.toFixed(7)));
          setLng(parseFloat(pos.lng.toFixed(7)));
        });
      }
      map.on("click", (e: any) => {
        const rLat = parseFloat(e.latlng.lat.toFixed(7));
        const rLng = parseFloat(e.latlng.lng.toFixed(7));
        setLat(rLat);
        setLng(rLng);
        if (markerRef.current) {
          markerRef.current.setLatLng([rLat, rLng]);
        } else {
          markerRef.current = L.marker([rLat, rLng], { draggable: true }).addTo(map);
          markerRef.current.on("dragend", (ev: any) => {
            const pos = ev.target.getLatLng();
            setLat(parseFloat(pos.lat.toFixed(7)));
            setLng(parseFloat(pos.lng.toFixed(7)));
          });
        }
      });
      mapInstanceRef.current = map;
    });
    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      if (mapRef.current) delete (mapRef.current as any)._leaflet_id;
    };
  }, []);

  return (
    <div className="space-y-3">
      <input type="hidden" name="lat" value={lat ?? ""} />
      <input type="hidden" name="lng" value={lng ?? ""} />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />

      {/* Search with autocomplete */}
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); fetchSuggestions(e.target.value); }}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onKeyDown={(e) => e.key === "Escape" && setShowDropdown(false)}
            placeholder="Search address or place name…"
            className="admin-input pr-10"
            autoComplete="off"
          />
          {loadingSuggestions && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-amber" />
          )}
        </div>

        {showDropdown && suggestions.length > 0 && (
          <ul className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-bg-elev border border-line-bright rounded-lg overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
            {suggestions.map((s) => {
              const parts = s.display_name.split(", ");
              const main = parts.slice(0, 2).join(", ");
              const sub = parts.slice(2, 4).join(", ");
              return (
                <li key={s.place_id}>
                  <button
                    type="button"
                    onMouseDown={() => handleSelect(s)}
                    className="w-full text-left px-4 py-3 hover:bg-bg-soft transition flex flex-col gap-0.5 border-b border-line last:border-0"
                  >
                    <span className="text-sm text-cream font-medium truncate">{main}</span>
                    {sub && <span className="font-mono text-[0.65rem] text-mocha truncate">{sub}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div ref={mapRef} className="w-full rounded-lg overflow-hidden border border-line-bright" style={{ height: 320, position: "relative", zIndex: 0 }} />

      <div className="flex items-center gap-3">
        <MapPin className="h-3.5 w-3.5 text-amber shrink-0" />
        {lat && lng ? (
          <span className="font-mono text-xs text-phosphor">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
        ) : (
          <span className="font-mono text-xs text-mocha">Search or click the map to drop a pin</span>
        )}
        {lat && lng && (
          <button
            type="button"
            onClick={() => { setLat(null); setLng(null); markerRef.current?.remove(); markerRef.current = null; }}
            className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha hover:text-red-400 ml-auto"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
