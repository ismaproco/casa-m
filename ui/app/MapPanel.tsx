"use client";

import { Crosshair, MapPinned, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CircleMarker,
  LayerGroup,
  Map as LeafletMap,
} from "leaflet";
import type { Listing, MapBounds } from "./lib/types";

type Props = {
  listings: Listing[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  unavailableLabel: string;
};

export function MapPanel({
  listings,
  selectedId,
  hoveredId,
  onSelect,
  onBoundsChange,
  unavailableLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pointsRef = useRef<LayerGroup | null>(null);
  const markersByListingRef = useRef(new Map<string, CircleMarker>());
  const callbacksRef = useRef({ onSelect, onBoundsChange });
  const listingsRef = useRef(listings);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapSummary, setMapSummary] = useState("OpenStreetMap");
  const listingSignature = useMemo(
    () => listings.map((listing) => listing.id).join("|"),
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
    const nextZoom = Math.max(8, Math.min(18, map.getZoom() + delta));
    map.setView(map.getCenter(), nextZoom, {
      animate: false,
      reset: true,
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
          center: [4.682, -74.0721],
          zoom: 11,
          minZoom: 8,
          maxZoom: 18,
          zoomControl: false,
          attributionControl: false,
          preferCanvas: false,
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
        const marker = leaflet.circleMarker(
          [listing.latitude, listing.longitude],
          {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillColor:
              listing.coordinatePrecision === "neighborhood_centroid"
              ? "#ffb84d"
              : "#f25f50",
            fillOpacity: 0.94,
          },
        );
        marker.bindTooltip(
          `${listing.neighborhood ?? "Bogotá"} · ${listing.id}`,
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
  }, [fitListings, listingSignature, mapReady]);

  useEffect(() => {
    for (const marker of new Set(markersByListingRef.current.values())) {
      marker.setStyle({ weight: 2, color: "#ffffff" });
    }
    const highlightedId = selectedId ?? hoveredId;
    if (!highlightedId) return;
    const marker = markersByListingRef.current.get(highlightedId);
    marker?.setStyle({ weight: 4, color: "#10212a" });
    if (selectedId && marker) {
      mapRef.current?.panTo(marker.getLatLng(), { animate: true });
      marker.openTooltip();
    }
  }, [hoveredId, selectedId]);

  return (
    <section className="map-panel" aria-label={mapSummary}>
      <div ref={containerRef} className="map-canvas" />
      <div className="map-status">
        <Crosshair size={14} />
        {listings.length.toLocaleString()}
      </div>
      <div className="map-controls" aria-label="Map controls">
        <button
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
        </button>
        <button
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
        </button>
        <button
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
        </button>
      </div>
      <div className="osm-attribution">
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
        <div className="map-error" role="status">
          <MapPinned size={22} />
          <span>{unavailableLabel}</span>
        </div>
      )}
    </section>
  );
}
