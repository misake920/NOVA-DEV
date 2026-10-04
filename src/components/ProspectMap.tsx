import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Minus, Plus, Layers3 } from "lucide-react";
import type { Place, CountryCode } from "../types";
import { countries } from "../lib/data";
let loading: Promise<void> | undefined;
function loadMaps(key: string) {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=ghostMapsReady`;
    s.async = true;
    (window as unknown as Record<string, unknown>).ghostMapsReady = () =>
      resolve();
    s.onerror = () => {
      loading = undefined;
      s.remove();
      reject(
        new Error(
          "Não foi possível carregar o mapa. Verifique a chave e a conexão.",
        ),
      );
    };
    document.head.appendChild(s);
    setTimeout(() => {
      if (!window.google?.maps?.Map) {
        loading = undefined;
        reject(
          new Error("O mapa não respondeu. Verifique as restrições da chave."),
        );
      }
    }, 20000);
  });
  return loading;
}
export default function ProspectMap({
  country,
  city,
  places,
  selected,
  onSelect,
  browserKey,
  demo,
}: {
  country: CountryCode;
  city: string;
  places: Place[];
  selected: string | null;
  onSelect: (p: Place) => void;
  browserKey: string | null;
  demo: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<google.maps.Map | null>(null),
    markers = useRef<google.maps.Marker[]>([]),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1),
    c = countries.find((x) => x.code === country)!;
  const pick = useRef(onSelect);
  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!browserKey || demo || !host.current) return;
    let alive = true;
    setError("");
    loadMaps(browserKey)
      .then(() => {
        if (!alive || !host.current) return;
        map.current = new google.maps.Map(host.current, {
          center: { lat: c.lat, lng: c.lng },
          zoom: 13,
          disableDefaultUI: true,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#15151b" }] },
            {
              elementType: "labels.text.stroke",
              stylers: [{ color: "#15151b" }],
            },
            {
              elementType: "labels.text.fill",
              stylers: [{ color: "#97939c" }],
            },
            {
              featureType: "road",
              elementType: "geometry",
              stylers: [{ color: "#29252b" }],
            },
            {
              featureType: "water",
              elementType: "geometry",
              stylers: [{ color: "#090d14" }],
            },
          ],
        });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      markers.current.forEach((m) => m.setMap(null));
      map.current = null;
    };
  }, [browserKey, demo, c.lat, c.lng]);
  useEffect(() => {
    if (demo || !browserKey) return;
    let alive = true;
    loadMaps(browserKey).then(() => {
      if (!alive || !map.current) return;
      markers.current.forEach((m) => m.setMap(null));
      markers.current = places.map((p, i) => {
        const m = new google.maps.Marker({
          map: map.current,
          position: { lat: p.lat, lng: p.lng },
          title: p.name,
          label: { text: String(i + 1), color: "#ffffff", fontSize: "12px" },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: p.id === selected ? 16 : 12,
            fillColor: p.id === selected ? "#ff2438" : "#841727",
            fillOpacity: 1,
            strokeColor: "#ff6777",
            strokeWeight: 2,
          },
        });
        m.addListener("click", () => pick.current(p));
        return m;
      });
      if (places.length) {
        const bounds = new google.maps.LatLngBounds();
        places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.current.fitBounds(bounds, 55);
      }
    });
    return () => {
      alive = false;
    };
  }, [places, selected, demo, browserKey]);
  const center = () => {
    if (map.current) {
      map.current.setCenter({ lat: c.lat, lng: c.lng });
      map.current.setZoom(13);
    }
    setZoom(1);
  };
  const changeZoom = (n: number) => {
    if (map.current)
      map.current.setZoom(
        Math.max(3, Math.min(19, (map.current.getZoom() || 13) + n)),
      );
    else setZoom((z) => Math.max(0.85, Math.min(1.6, z + n * 0.15)));
  };
  const coords = [
    [236, 203],
    [409, 300],
    [495, 172],
    [164, 342],
  ];
  return (
    <div className="prospect-map">
      <div
        ref={host}
        className={`google-map ${!browserKey || demo ? "map-hidden" : ""}`}
      />
      {(!browserKey || demo) && (
        <svg
          viewBox="0 0 680 510"
          className="illustrated-map"
          role="img"
          aria-label={
            demo
              ? "Mapa ilustrativo dos exemplos fictícios"
              : "Ilustração de mapa, conecte o Google Maps para explorar"
          }
        >
          <defs>
            <pattern
              id="map-grid"
              width="100"
              height="86"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-21)"
            >
              <rect width="100" height="86" fill="#121217" />
              <rect x="10" y="9" width="31" height="28" rx="3" fill="#1c1b23" />
              <rect x="49" y="9" width="39" height="28" rx="3" fill="#1a1a21" />
              <rect
                x="10"
                y="45"
                width="78"
                height="30"
                rx="3"
                fill="#1b1a21"
              />
              <path d="M0 0H100M0 0V86" stroke="#33303b" strokeWidth="5" />
            </pattern>
            <radialGradient id="map-glow">
              <stop stopColor="#ff2438" stopOpacity=".14" />
              <stop offset="1" stopColor="#ff2438" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g
            transform={`translate(340 255) scale(${zoom}) translate(-340 -255)`}
          >
            <rect
              x="-200"
              y="-200"
              width="1080"
              height="910"
              fill="url(#map-grid)"
            />
            <path
              d="M-40 464C180 335 151 332 310 376S472 309 728 282"
              fill="none"
              stroke="#0b151b"
              strokeWidth="49"
            />
            <path
              d="M-30 54L730 386M79-20L536 548M-20 289L645 43"
              stroke="#3a3038"
              strokeWidth="14"
            />
            <path
              d="M-30 54L730 386M79-20L536 548M-20 289L645 43"
              stroke="#211d24"
              strokeWidth="10"
            />
            <path d="M478 398L535 366L580 410L529 455Z" fill="#1a2823" />
            <path d="M67 126L120 99L162 155L101 173Z" fill="#1b2824" />
            <circle cx="340" cy="245" r="195" fill="url(#map-glow)" />
            <text
              x="322"
              y="130"
              fill="#615b69"
              fontSize="13"
              letterSpacing="3"
              textAnchor="middle"
            >
              {city.toUpperCase()}
            </text>
            <text
              x="531"
              y="426"
              fill="#48554c"
              fontSize="9"
              textAnchor="middle"
            >
              PARQUE
            </text>
            {demo &&
              places.map((p, i) => {
                const [x, y] = coords[i % 4];
                return (
                  <g key={p.id} transform={`translate(${x} ${y})`}>
                    <circle
                      r={p.id === selected ? 30 : 24}
                      fill="#ff2438"
                      opacity=".08"
                    />
                    <circle
                      r={p.id === selected ? 21 : 17}
                      fill="#ff2438"
                      opacity=".12"
                    />
                    <circle
                      r="12"
                      fill={p.id === selected ? "#ff2438" : "#8f2032"}
                      stroke="#ff6a7b"
                      strokeWidth="1.5"
                    />
                    <text
                      textAnchor="middle"
                      y="4"
                      fill="white"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>
      )}
      {demo &&
        places.map((p, i) => {
          const [x, y] = coords[i % 4];
          return (
            <button
              key={p.id}
              className="map-marker-hit"
              style={{
                left: `${((340 + (x - 340) * zoom) / 680) * 100}%`,
                top: `${((255 + (y - 255) * zoom) / 510) * 100}%`,
              }}
              aria-label={`Selecionar ${p.name} no mapa`}
              onClick={() => onSelect(p)}
            />
          );
        })}
      <div className="map-top">
        <span>
          <MapPin size={13} />
          {city}, {c.name}
        </span>
        <span className="map-source">
          {demo
            ? "MAPA ILUSTRATIVO"
            : browserKey
              ? "GOOGLE MAPS"
              : "PRÉVIA VISUAL"}
        </span>
      </div>
      {!demo && !browserKey && (
        <div className="map-connect">
          <div className="map-icon">
            <MapPin size={23} />
          </div>
          <strong>Seu próximo cliente está por aí.</strong>
          <p>
            Conecte o Google Maps ou explore a demonstração para conhecer o
            fluxo.
          </p>
        </div>
      )}
      {error && (
        <div className="map-error" role="alert">
          {error}
        </div>
      )}
      <div className="map-bottom">
        <span>
          <Layers3 size={14} />{" "}
          {demo
            ? "Exemplos fictícios"
            : browserKey
              ? "Mapa interativo"
              : "Mapa não conectado"}
        </span>
        <div className="map-controls">
          <button aria-label="Centralizar mapa" onClick={center}>
            <Crosshair size={17} />
          </button>
          <button aria-label="Aproximar mapa" onClick={() => changeZoom(1)}>
            <Plus size={17} />
          </button>
          <button aria-label="Afastar mapa" onClick={() => changeZoom(-1)}>
            <Minus size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
