"use client";

import { Crosshair, MapPinned } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import type { Listing, MapBounds } from "./lib/types";

type Props = {
  listings: Listing[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  unavailableLabel: string;
};

const DEFAULT_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "openstreetmap-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "openstreetmap-raster",
      type: "raster",
      source: "openstreetmap-raster",
      paint: {
        "raster-saturation": -0.45,
        "raster-opacity": 0.82,
      },
    },
  ],
};

function toGeoJson(listings: Listing[]) {
  return {
    type: "FeatureCollection" as const,
    features: listings.map((listing) => ({
      type: "Feature" as const,
      id: listing.id,
      geometry: {
        type: "Point" as const,
        coordinates: [listing.longitude, listing.latitude],
      },
      properties: {
        id: listing.id,
        approximate:
          listing.coordinatePrecision === "neighborhood_centroid" ? 1 : 0,
      },
    })),
  };
}

export function MapPanel({
  listings,
  selectedId,
  hoveredId,
  onSelect,
  onBoundsChange,
  unavailableLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onSelect, onBoundsChange });
  const markersRef = useRef<Marker[]>([]);
  const renderMarkersRef = useRef<((rows: Listing[]) => void) | null>(null);
  const [mapError, setMapError] = useState(false);
  const data = useMemo(() => toGeoJson(listings), [listings]);
  const initialDataRef = useRef(data);
  const initialListingsRef = useRef(listings);

  useEffect(() => {
    callbacksRef.current = { onSelect, onBoundsChange };
  }, [onBoundsChange, onSelect]);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current || mapRef.current) return;

    void import("maplibre-gl")
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style:
            process.env.NEXT_PUBLIC_MAP_STYLE_URL ??
            DEFAULT_MAP_STYLE,
          center: [-74.0721, 4.682],
          zoom: 10.6,
          attributionControl: true,
          cooperativeGestures: true,
        });
        mapRef.current = map;
        const loadTimeout = window.setTimeout(() => {
          if (!map.getSource("listings")) setMapError(true);
        }, 12_000);
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        const renderDomClusters = (rows: Listing[]) => {
          for (const marker of markersRef.current) marker.remove();
          const buckets = new Map<
            string,
            {
              latitude: number;
              longitude: number;
              count: number;
              firstId: string;
              approximate: boolean;
            }
          >();
          for (const listing of rows) {
            const key = `${listing.latitude.toFixed(2)}:${listing.longitude.toFixed(2)}`;
            const bucket = buckets.get(key);
            if (bucket) {
              bucket.latitude += listing.latitude;
              bucket.longitude += listing.longitude;
              bucket.count += 1;
              bucket.approximate ||= listing.coordinatePrecision === "neighborhood_centroid";
            } else {
              buckets.set(key, {
                latitude: listing.latitude,
                longitude: listing.longitude,
                count: 1,
                firstId: listing.id,
                approximate:
                  listing.coordinatePrecision === "neighborhood_centroid",
              });
            }
          }
          markersRef.current = [...buckets.values()].map((bucket) => {
            const element = document.createElement("button");
            element.className = `dom-map-marker${bucket.approximate ? " approximate" : ""}`;
            element.type = "button";
            element.textContent =
              bucket.count > 1 ? String(bucket.count) : "•";
            element.setAttribute(
              "aria-label",
              bucket.count > 1
                ? `${bucket.count} listings`
                : "Open listing",
            );
            const center: [number, number] = [
              bucket.longitude / bucket.count,
              bucket.latitude / bucket.count,
            ];
            element.addEventListener("click", () => {
              if (bucket.count === 1) {
                callbacksRef.current.onSelect(bucket.firstId);
              } else {
                map.easeTo({
                  center,
                  zoom: Math.min(map.getZoom() + 2, 14),
                  duration: 450,
                });
              }
            });
            return new maplibregl.Marker({ element })
              .setLngLat(center)
              .addTo(map);
          });
        };
        renderMarkersRef.current = renderDomClusters;
        const setupListingLayers = () => {
          if (map.getSource("listings")) return;
          window.clearTimeout(loadTimeout);
          setMapError(false);
          map.addSource("listings", {
            type: "geojson",
            data: initialDataRef.current,
            cluster: true,
            clusterRadius: 42,
            clusterMaxZoom: 13,
          });
          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "listings",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#2bb7a9",
                25,
                "#167d78",
                100,
                "#10212a",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                17,
                25,
                23,
                100,
                30,
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#f4f6f2",
            },
          });
          map.addLayer({
            id: "listing-points",
            type: "circle",
            source: "listings",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                10,
                ["boolean", ["feature-state", "hovered"], false],
                8,
                6,
              ],
              "circle-color": [
                "case",
                ["==", ["get", "approximate"], 1],
                "#ffb84d",
                "#ff6b5c",
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                4,
                2,
              ],
            },
          });
          map.on("click", "clusters", async (event) => {
            const feature = event.features?.[0];
            const clusterId = feature?.properties?.cluster_id;
            const source = map.getSource("listings") as GeoJSONSource;
            if (clusterId === undefined || !source) return;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            const coordinates =
              feature?.geometry.type === "Point"
                ? feature.geometry.coordinates
                : null;
            if (coordinates) map.easeTo({ center: coordinates, zoom });
          });
          map.on("click", "listing-points", (event) => {
            const id = String(event.features?.[0]?.properties?.id ?? "");
            if (id) callbacksRef.current.onSelect(id);
          });
          map.on("mouseenter", "clusters", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "clusters", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("mouseenter", "listing-points", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "listing-points", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("moveend", () => {
            const bounds = map.getBounds();
            callbacksRef.current.onBoundsChange({
              west: bounds.getWest(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              north: bounds.getNorth(),
            });
          });
          window.requestAnimationFrame(() => {
            map.resize();
            const listingBounds = new maplibregl.LngLatBounds();
            for (const feature of initialDataRef.current.features) {
              listingBounds.extend(
                feature.geometry.coordinates as [number, number],
              );
            }
            if (!listingBounds.isEmpty()) {
              map.fitBounds(listingBounds, {
                padding: 44,
                maxZoom: 11,
                duration: 0,
              });
            }
            renderDomClusters(initialListingsRef.current);
          });
        };
        map.on("style.load", setupListingLayers);
        if (map.isStyleLoaded()) setupListingLayers();
      })
      .catch((error) => {
        console.error("Casa Mapa map failed to initialize", error);
        setMapError(true);
      });

    return () => {
      cancelled = true;
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      renderMarkersRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource?.("listings");
    if (source?.setData) source.setData(data);
    renderMarkersRef.current?.(listings);
  }, [data, listings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource?.("listings")) return;
    if (selectedRef.current) {
      map.setFeatureState(
        { source: "listings", id: selectedRef.current },
        { selected: false },
      );
    }
    if (selectedId) {
      map.setFeatureState(
        { source: "listings", id: selectedId },
        { selected: true },
      );
      const listing = listings.find((item) => item.id === selectedId);
      if (listing) {
        map.easeTo({
          center: [listing.longitude, listing.latitude],
          duration: 450,
        });
      }
    }
    selectedRef.current = selectedId;
  }, [listings, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource?.("listings")) return;
    if (hoveredRef.current) {
      map.setFeatureState(
        { source: "listings", id: hoveredRef.current },
        { hovered: false },
      );
    }
    if (hoveredId) {
      map.setFeatureState(
        { source: "listings", id: hoveredId },
        { hovered: true },
      );
    }
    hoveredRef.current = hoveredId;
  }, [hoveredId]);

  return (
    <section className="map-panel" aria-label="Map">
      <div ref={containerRef} className="map-canvas" />
      <div className="map-status">
        <Crosshair size={14} />
        {listings.length.toLocaleString()}
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
