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

// Load the Google Maps JS API once per page. Same pattern as the partner attendance page so the
// geofencing and this picker share a single script tag if they ever land on the same page. NO
// `loading=async` — with it google.maps.Map/Marker aren't ready synchronously after the script
// load event and you'd have to importLibrary() everywhere; the classic load is what the rest of
// the codebase uses.
let gmapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as { google?: typeof google }).google?.maps) {
      resolve();
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
      return;
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
  return gmapsPromise;
}

export default function LocationPicker({ defaultLat, defaultLng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [lat, setLat] = useState<number | null>(defaultLat ?? null);
  const [lng, setLng] = useState<number | null>(defaultLng ?? null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
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

  // Debounced autocomplete fetch. Kept on Nominatim (OpenStreetMap) — free, no extra GCP API
  // billing for a feature already working cheaply. The MAP itself is now Google Maps to match
  // the geofencing (that was the actual consistency concern). Pure lat/lng round-trips fine
  // between the two — they're both WGS-84.
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

  // Create (or move) the draggable marker on the map and update the lat/lng state. Shared by
  // search-suggestion-click and map-click code paths; on drag-end it re-fires to keep state
  // in sync. 7-decimal rounding gives ~1cm precision (more than enough for a cafe pin) and
  // keeps the hidden input values stable across re-renders.
  const placePin = useCallback((rLat: number, rLng: number) => {
    setLat(rLat);
    setLng(rLng);
    const map = mapInstanceRef.current;
    if (!map) return;
    const pos = { lat: rLat, lng: rLng };
    map.setCenter(pos);
    map.setZoom(17);
    if (markerRef.current) {
      markerRef.current.setPosition(pos);
    } else {
      const m = new google.maps.Marker({ position: pos, map, draggable: true });
      m.addListener("dragend", () => {
        const p = m.getPosition();
        if (!p) return;
        setLat(parseFloat(p.lat().toFixed(7)));
        setLng(parseFloat(p.lng().toFixed(7)));
      });
      markerRef.current = m;
    }
  }, []);

  const handleSelect = (s: Suggestion) => {
    setQuery(s.display_name.split(",").slice(0, 2).join(","));
    setShowDropdown(false);
    placePin(parseFloat(parseFloat(s.lat).toFixed(7)), parseFloat(parseFloat(s.lon).toFixed(7)));
  };

  // Map init (Google Maps). The browser-restricted NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is the same
  // key the staff attendance page uses for geofencing — never reuse the server-side Vision
  // key in the browser. Strict Mode in dev mounts twice, so we early-return if the map already
  // exists on a ref to avoid a double map / leaked listeners.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || mapInstanceRef.current) return;
        const startLat = defaultLat ?? 14.5995;
        const startLng = defaultLng ?? 120.9842;
        const map = new google.maps.Map(mapRef.current, {
          center: { lat: startLat, lng: startLng },
          zoom: defaultLat ? 16 : 12,
          // Strip the controls that don't make sense on a pin-picker (it's not a directions
          // widget). Keep zoom + the gesture controls so the user can pan/zoom precisely.
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        mapInstanceRef.current = map;
        if (defaultLat && defaultLng) {
          const m = new google.maps.Marker({
            position: { lat: defaultLat, lng: defaultLng },
            map,
            draggable: true,
          });
          m.addListener("dragend", () => {
            const p = m.getPosition();
            if (!p) return;
            setLat(parseFloat(p.lat().toFixed(7)));
            setLng(parseFloat(p.lng().toFixed(7)));
          });
          markerRef.current = m;
        }
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const rLat = parseFloat(e.latLng.lat().toFixed(7));
          const rLng = parseFloat(e.latLng.lng().toFixed(7));
          setLat(rLat);
          setLng(rLng);
          if (markerRef.current) {
            markerRef.current.setPosition({ lat: rLat, lng: rLng });
          } else {
            const m = new google.maps.Marker({ position: { lat: rLat, lng: rLng }, map, draggable: true });
            m.addListener("dragend", () => {
              const p = m.getPosition();
              if (!p) return;
              setLat(parseFloat(p.lat().toFixed(7)));
              setLng(parseFloat(p.lng().toFixed(7)));
            });
            markerRef.current = m;
          }
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message || "Map failed to load");
      });
    return () => {
      cancelled = true;
      // Google Maps has no explicit destroy; clearing the marker + dropping refs lets React
      // tear down the DOM cleanly. The map instance itself is GC'd when its DOM node unmounts.
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <input type="hidden" name="lat" value={lat ?? ""} />
      <input type="hidden" name="lng" value={lng ?? ""} />

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
                    title={`Select: ${main}`}
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

      <div
        ref={mapRef}
        className="w-full rounded-lg overflow-hidden border border-line-bright"
        style={{ height: 320, position: "relative", zIndex: 0 }}
      >
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-soft text-xs text-red-400 p-4 text-center">
            Map failed to load: {loadError}
          </div>
        )}
      </div>

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
            onClick={() => { setLat(null); setLng(null); markerRef.current?.setMap(null); markerRef.current = null; }}
            title="Clear selected location"
            className="font-mono text-[0.65rem] uppercase tracking-widest text-mocha hover:text-red-400 ml-auto"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
