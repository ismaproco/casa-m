import { Crosshair, MapPinned, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  CircleMarker,
  LayerGroup,
  Map as LeafletMap,
} from "leaflet";
import { formatCop } from "@/app/lib/i18n";
import { mapPriceBucket, mapPriceBucketLabel } from "@/app/lib/mapPricing";
import type { Listing, Locale, MapBounds } from "@/app/lib/types";

type Props = {
  listings: Listing[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  unavailableLabel: string;
  locale: Locale;
};

export function MapPanel({
  listings,
  selectedId,
  hoveredId,
  onSelect,
  onBoundsChange,
  unavailableLabel,
  locale,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pointsRef = useRef<LayerGroup | null>(null);
  const markersByListingRef = useRef(new Map<string, CircleMarker>());
  const highlightedMarkerRef = useRef<CircleMarker | null>(null);
  const callbacksRef = useRef({ onSelect, onBoundsChange });
  const listingsRef = useRef(listings);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapSummary, setMapSummary] = useState("OpenStreetMap");
  const listingSignature = useMemo(
    () =>
      listings
        .map(
          (listing) =>
            `${listing.id}:${listing.priceCop}:${listing.coordinatePrecision}`,
        )
        .join("|"),
    [listings],
  );

  useEffect(() => {
    callbacksRef.current = { onSelect, onBoundsChange };
  }, [onBoundsChange, onSelect]);

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  const fitListings = useCallback((rows: Listing[], animate = false) => {
    const map = mapRef.current;
    if (!map || rows.length === 0) return;
    void import("leaflet").then((leaflet) => {
      const bounds = leaflet.latLngBounds(
        rows.map((listing) => [listing.latitude, listing.longitude]),
      );
      map.invalidateSize();
      if (rows.length === 1) {
        map.setView(
          [rows[0].latitude, rows[0].longitude],
          15,
          { animate },
        );
      } else {
        map.fitBounds(bounds, {
          padding: [48, 48],
          maxZoom: 14,
          animate,
        });
      }
    });
  }, []);

  const changeZoom = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.stop();
    const nextZoom = Math.max(4, Math.min(18, map.getZoom() + delta));
    map.setView(map.getCenter(), nextZoom, {
      animate: false,
    });
    window.setTimeout(() => {
      const center = map.getCenter();
      setMapSummary(
        `OpenStreetMap, zoom ${map.getZoom().toFixed(1)}, center ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`,
      );
    }, 50);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const markersByListing = markersByListingRef.current;
    if (!containerRef.current || mapRef.current) return;

    void import("leaflet")
      .then((leaflet) => {
        if (cancelled || !containerRef.current) return;
        const map = leaflet.map(containerRef.current, {
          center: [4.57, -74.3],
          zoom: 5,
          minZoom: 4,
          maxZoom: 18,
          zoomControl: false,
          attributionControl: false,
          preferCanvas: true,
        });
        const tiles = leaflet.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            minZoom: 8,
            maxZoom: 19,
            attribution: "© OpenStreetMap contributors",
          },
        );
        tiles.on("tileload", () => setMapError(false));
        tiles.on("tileerror", () => setMapError(true));
        tiles.addTo(map);

        const points = leaflet.layerGroup().addTo(map);
        mapRef.current = map;
        pointsRef.current = points;

        const updateMapDescription = () => {
          const center = map.getCenter();
          setMapSummary(
            `OpenStreetMap, zoom ${map.getZoom().toFixed(1)}, center ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`,
          );
        };
        map.on("moveend", () => {
          const bounds = map.getBounds();
          updateMapDescription();
          callbacksRef.current.onBoundsChange({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          });
        });

        resizeObserver = new ResizeObserver(() => map.invalidateSize());
        resizeObserver.observe(containerRef.current);
        window.requestAnimationFrame(() => {
          map.invalidateSize();
          updateMapDescription();
          setMapReady(true);
        });
      })
      .catch((error) => {
        console.error("Casa Mapa OpenStreetMap failed to initialize", error);
        setMapError(true);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      pointsRef.current = null;
      markersByListing.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const points = pointsRef.current;
    if (!mapReady || !map || !points) return;

    void import("leaflet").then((leaflet) => {
      points.clearLayers();
      markersByListingRef.current.clear();

      const currentListings = listingsRef.current;
      for (const listing of currentListings) {
        const priceBucket = mapPriceBucket(listing.priceCop);
        const hasApproximateCoordinates =
          listing.coordinatePrecision === "neighborhood_centroid";
        const marker = leaflet.circleMarker(
          [listing.latitude, listing.longitude],
          {
            radius: 4,
            color: "#f7faf9",
            weight: 1,
            opacity: 1,
            dashArray: hasApproximateCoordinates ? "2 2" : undefined,
            fillColor: priceBucket.color,
            fillOpacity: 0.94,
          },
        );
        marker.bindTooltip(
          [
            listing.neighborhood ?? listing.city,
            listing.city,
            formatCop(listing.priceCop, locale),
            mapPriceBucketLabel(listing.priceCop, locale),
            listing.id,
          ].join(" · "),
          {
            direction: "top",
            offset: [0, -7],
          },
        );
        marker.on("click", () => {
          callbacksRef.current.onSelect(listing.id);
        });
        marker.addTo(points);
        markersByListingRef.current.set(listing.id, marker);
      }

      fitListings(currentListings);
    });
  }, [fitListings, listingSignature, locale, mapReady]);

  useEffect(() => {
    highlightedMarkerRef.current?.setStyle({
      weight: 1,
      color: "#f7faf9",
    });
    const highlightedId = selectedId ?? hoveredId;
    if (!highlightedId) {
      highlightedMarkerRef.current = null;
      return;
    }
    const marker = markersByListingRef.current.get(highlightedId);
    highlightedMarkerRef.current = marker ?? null;
    marker?.setStyle({ weight: 4, color: "#10212a" });
    if (selectedId && marker) {
      const map = mapRef.current;
      if (map) {
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), {
          animate: true,
        });
      }
      marker.openTooltip();
    }
  }, [hoveredId, selectedId]);

  return (
    <section className="relative size-full min-h-[320px] overflow-hidden bg-muted" aria-label={mapSummary}>
      <div ref={containerRef} className="map-canvas absolute inset-0 size-full" />
      <div className="pointer-events-none absolute top-3 left-3 z-[500] inline-flex items-center gap-1.5 rounded-lg border bg-card/90 px-2.5 py-1.5 font-mono text-[10px] font-bold shadow-md backdrop-blur-md">
        <Crosshair size={14} />
        {listings.length.toLocaleString()}
      </div>
      <div className="absolute top-3 right-3 z-[500] grid overflow-hidden rounded-lg border bg-card/90 shadow-md backdrop-blur-md [&>button]:rounded-none [&>button+button]:border-t" aria-label="Map controls">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Zoom in"
          disabled={!mapReady}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            changeZoom(1);
          }}
        >
          <Plus size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Zoom out"
          disabled={!mapReady}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            changeZoom(-1);
          }}
        >
          <Minus size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label="Fit listings on map"
          disabled={!mapReady || listings.length === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            fitListings(listings, true);
          }}
        >
          <Crosshair size={17} />
        </Button>
      </div>
      <div className="absolute right-2.5 bottom-2 z-[500] rounded-md bg-card/85 px-2 py-1 text-[8px] text-muted-foreground shadow-sm backdrop-blur-md [&_a]:font-semibold [&_a]:text-primary [&_a]:no-underline">
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap contributors
        </a>
      </div>
      {mapError && (
        <div className="absolute inset-0 z-[450] grid place-content-center justify-items-center gap-2.5 bg-card/90 p-6 text-center text-xs font-semibold backdrop-blur-sm" role="status">
          <MapPinned size={22} />
          <span>{unavailableLabel}</span>
        </div>
      )}
    </section>
  );
}
