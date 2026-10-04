import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { feature } from "topojson-client";
import atlas from "world-atlas/land-110m.json";
import type { Topology } from "topojson-specification";
import type { CountryCode, Place } from "../types";
import "./globe.css";

const markets: Record<
  CountryCode,
  { name: string; coordinates: [number, number] }
> = {
  BR: { name: "Brasil", coordinates: [-23.5505, -46.6333] },
  ES: { name: "Espanha", coordinates: [40.4168, -3.7038] },
  IT: { name: "Itália", coordinates: [45.4642, 9.19] },
  US: { name: "Estados Unidos", coordinates: [40.7128, -74.006] },
  NL: { name: "Holanda", coordinates: [52.3676, 4.9041] },
};
const countryCodes = Object.keys(markets) as CountryCode[];
const EARTH_RADIUS = 1.43;
type Coordinate = [number, number];
type LandGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: Coordinate[][] | Coordinate[][][];
};
const topology = atlas as unknown as Topology;
const geography = feature(topology, topology.objects.land) as unknown as {
  type: string;
  geometry?: LandGeometry;
  features?: { geometry: LandGeometry }[];
};
const landShapes =
  geography.type === "FeatureCollection"
    ? (geography.features || []).map((item) => item.geometry)
    : geography.geometry
      ? [geography.geometry]
      : [];
const polygons = landShapes.flatMap((geometry): Coordinate[][][] =>
  geometry.type === "Polygon"
    ? [geometry.coordinates as Coordinate[][]]
    : (geometry.coordinates as Coordinate[][][]),
);

function position(lat: number, lng: number, radius = 1) {
  const latitude = THREE.MathUtils.degToRad(90 - lat);
  const longitude = THREE.MathUtils.degToRad(lng + 180);
  return new THREE.Vector3(
    -radius * Math.sin(latitude) * Math.cos(longitude),
    radius * Math.cos(latitude),
    radius * Math.sin(latitude) * Math.sin(longitude),
  );
}
function countryOrientation(code: CountryCode) {
  const view = new THREE.PerspectiveCamera();
  view.position.copy(position(...markets[code].coordinates, 5));
  view.lookAt(0, 0, 0);
  return view.quaternion.clone();
}
function paintLand(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  for (const polygon of polygons) {
    context.beginPath();
    for (const ring of polygon) {
      ring.forEach(([longitude, latitude], index) => {
        const x = ((longitude + 180) / 360) * width;
        const y = ((90 - latitude) / 180) * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
    }
    context.fill("evenodd");
    context.stroke();
  }
}
// Geographic fallback follows the selected camera and omits back-side coastlines.
function fallbackCoastlines(code: CountryCode) {
  const inverse = countryOrientation(code).invert();
  const paths: string[] = [];
  for (const polygon of polygons)
    for (const ring of polygon) {
      let open = false;
      let path = "";
      for (const [longitude, latitude] of ring) {
        const point = position(latitude, longitude).applyQuaternion(inverse);
        if (point.z < 0) {
          open = false;
          continue;
        }
        path += `${open ? "L" : "M"}${(200 + point.x * 139).toFixed(2)},${(175 - point.y * 139).toFixed(2)}`;
        open = true;
      }
      if (path) paths.push(path);
    }
  return paths;
}
export interface GlobeProps {
  country: CountryCode;
  paused: boolean;
  compact?: boolean;
  onCountrySelect?: (code: CountryCode) => void;
  markers?: Place[];
}
export default function Globe({
  country,
  paused,
  compact = false,
  onCountrySelect,
  markers = [],
}: GlobeProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ country, paused, onCountrySelect, markers });
  latest.current = { country, paused, onCountrySelect, markers };
  const invalidate = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  const id = useId().replace(/:/g, "");
  const fallbackPaths = useMemo(() => fallbackCoastlines(country), [country]);
  useEffect(() => {
    invalidate.current?.();
  }, [country, paused, markers]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    let destroyed = false;
    const smallScreen = window.matchMedia("(max-width: 640px)").matches;
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, smallScreen ? 1.25 : 1.65),
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    Object.assign(canvas.style, {
      width: "100%",
      height: "100%",
      display: "block",
      touchAction: "pan-y",
      cursor: onCountrySelect ? "grab" : "default",
    });
    element.appendChild(canvas);
    const scene = new THREE.Scene();
    const environmentGenerator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = environmentGenerator.fromScene(room, 0.06);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.2;
    room.dispose();
    environmentGenerator.dispose();
    const camera = new THREE.PerspectiveCamera(compact ? 39 : 36, 1, 0.1, 40);
    const earth = new THREE.Group();
    scene.add(earth);
    const size = smallScreen ? 1024 : 2048;
    const createTexture = (
      background: string,
      fill: string,
      stroke: string,
      lineWidth: number,
    ) => {
      const image = document.createElement("canvas");
      image.width = size;
      image.height = size / 2;
      const context = image.getContext("2d");
      if (context) {
        context.fillStyle = background;
        context.fillRect(0, 0, image.width, image.height);
        context.fillStyle = fill;
        context.strokeStyle = stroke;
        context.lineWidth = lineWidth;
        paintLand(context, image.width, image.height);
      }
      const texture = new THREE.CanvasTexture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const surfaceTexture = createTexture("#08090d", "#686167", "#6c4249", 1);
    const emissiveTexture = createTexture(
      "#000000",
      "#160000",
      "#ff193c",
      smallScreen ? 0.6 : 0.8,
    );
    const heightTexture = createTexture("#171717", "#b6b6b6", "#b6b6b6", 0.5);
    heightTexture.colorSpace = THREE.NoColorSpace;
    const earthMaterial = new THREE.MeshPhysicalMaterial({
      map: surfaceTexture,
      bumpMap: heightTexture,
      bumpScale: 0.028,
      emissive: "#ff1436",
      emissiveMap: emissiveTexture,
      emissiveIntensity: 0.6,
      roughness: 0.95,
      metalness: 0.12,
      clearcoat: 0.08,
      clearcoatRoughness: 0.85,
    });
    const earthMesh = new THREE.Mesh(
      new THREE.SphereGeometry(
        EARTH_RADIUS,
        smallScreen ? 64 : 96,
        smallScreen ? 40 : 64,
      ),
      earthMaterial,
    );
    earth.add(earthMesh);
    const coastlinePositions: number[] = [];
    for (const polygon of polygons)
      for (const ring of polygon)
        for (let index = 1; index < ring.length; index++) {
          for (const [longitude, latitude] of [ring[index - 1], ring[index]]) {
            const point = position(latitude, longitude, EARTH_RADIUS + 0.006);
            coastlinePositions.push(point.x, point.y, point.z);
          }
        }
    const coastlineGeometry = new THREE.BufferGeometry();
    coastlineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(coastlinePositions, 3),
    );
    earth.add(
      new THREE.LineSegments(
        coastlineGeometry,
        new THREE.LineBasicMaterial({
          color: "#ff2542",
          transparent: true,
          opacity: 0.32,
          toneMapped: false,
        }),
      ),
    );
    // The terrestrial colour, relief and cloud assets are bundled locally. A
    // graphite treatment preserves their real detail without blue/green UI colours.
    const ownedTextures: THREE.Texture[] = [
      surfaceTexture,
      emissiveTexture,
      heightTexture,
    ];
    const pendingImages: HTMLImageElement[] = [];
    const textureFromImage = (
      image: HTMLImageElement,
      treatment: "graphite" | "roughness" | "height" | "clouds",
    ) => {
      const imageCanvas = document.createElement("canvas");
      imageCanvas.width = Math.min(
        image.naturalWidth,
        smallScreen ? 1024 : 2048,
      );
      imageCanvas.height = Math.round(
        (imageCanvas.width * image.naturalHeight) / image.naturalWidth,
      );
      const context = imageCanvas.getContext("2d");
      if (context) {
        context.drawImage(image, 0, 0, imageCanvas.width, imageCanvas.height);
        const pixels = context.getImageData(
          0,
          0,
          imageCanvas.width,
          imageCanvas.height,
        );
        for (let i = 0; i < pixels.data.length; i += 4) {
          const [red, green, blue] = [
            pixels.data[i],
            pixels.data[i + 1],
            pixels.data[i + 2],
          ];
          if (treatment !== "graphite") {
            // Solar System Scope's combined map stores height / roughness /
            // clouds in R / G / B respectively, as in the official Three example.
            const value =
              treatment === "height"
                ? red
                : treatment === "clouds"
                  ? Math.max(0, ((blue - 48) / 207) * 255)
                  : Math.round(155 + green * 0.28);
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
          } else {
            const ocean = blue > red * 1.2 && blue > green * 1.08;
            const luminance = red * 0.3 + green * 0.59 + blue * 0.11;
            const shade = ocean ? 13 + luminance * 0.16 : 38 + luminance * 0.64;
            pixels.data[i] = Math.min(255, shade * 1.08);
            pixels.data[i + 1] = shade * 0.91;
            pixels.data[i + 2] = shade * 0.92;
          }
        }
        context.putImageData(pixels, 0, 0);
      }
      return new THREE.CanvasTexture(imageCanvas);
    };
    const loadTexture = (
      path: string,
      treatment: "graphite",
      apply: (texture: THREE.Texture) => void,
    ) => {
      const image = new Image();
      pendingImages.push(image);
      image.onload = () => {
        if (destroyed) return;
        const texture = textureFromImage(image, treatment);
        texture.needsUpdate = true;
        texture.anisotropy = Math.min(
          renderer.capabilities.getMaxAnisotropy(),
          4,
        );
        ownedTextures.push(texture);
        apply(texture);
        invalidate.current?.();
      };
      image.src = path;
    };
    loadTexture("/textures/earth_day_4096.jpg", "graphite", (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      earthMaterial.map = texture;
      earthMaterial.needsUpdate = true;
    });
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: "#9b858a",
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      roughness: 1,
      metalness: 0,
      blending: THREE.NormalBlending,
    });
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(
        EARTH_RADIUS * 1.009,
        smallScreen ? 48 : 80,
        smallScreen ? 32 : 48,
      ),
      cloudMaterial,
    );
    clouds.visible = false;
    earth.add(clouds);
    const reliefImage = new Image();
    pendingImages.push(reliefImage);
    reliefImage.onload = () => {
      if (destroyed) return;
      const height = textureFromImage(reliefImage, "height");
      const roughness = textureFromImage(reliefImage, "roughness");
      const cloudMask = textureFromImage(reliefImage, "clouds");
      for (const texture of [height, roughness, cloudMask]) {
        texture.colorSpace = THREE.NoColorSpace;
        texture.anisotropy = Math.min(
          renderer.capabilities.getMaxAnisotropy(),
          4,
        );
        ownedTextures.push(texture);
      }
      earthMaterial.bumpMap = height;
      earthMaterial.bumpScale = 0.045;
      earthMaterial.roughnessMap = roughness;
      earthMaterial.needsUpdate = true;
      cloudMaterial.alphaMap = cloudMask;
      cloudMaterial.needsUpdate = true;
      clouds.visible = true;
      invalidate.current?.();
    };
    reliefImage.src = "/textures/earth_bump_roughness_clouds_4096.jpg";
    earth.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.055, 64, 40),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { glowColor: { value: new THREE.Color("#ff1235") } },
          vertexShader: `
        varying vec3 worldNormal;
        varying vec3 worldPosition;
        void main() {
          worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          worldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
        }
      `,
          fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 worldNormal;
        varying vec3 worldPosition;
        void main() {
          vec3 toCamera = normalize(cameraPosition - worldPosition);
          float fresnel = 1.0 - max(dot(normalize(worldNormal), toCamera), 0.0);
          float rim = pow(fresnel, 4.4);
          gl_FragColor = vec4(glowColor, rim * 0.44);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
        }),
      ),
    );
    scene.add(new THREE.AmbientLight("#c3b6bf", 0.7));
    const lightRig = new THREE.Group();
    const keyLight = new THREE.DirectionalLight("#e5dde2", 1.9);
    keyLight.position.set(-3, 4, 5);
    const redLight = new THREE.DirectionalLight("#ff1235", 4.6);
    redLight.position.set(3, -0.6, 2.8);
    const rimLight = new THREE.DirectionalLight("#ff1740", 7);
    rimLight.position.set(-2, -2, -3);
    lightRig.add(keyLight, redLight, rimLight);
    scene.add(lightRig);
    const countryPoints = new Map<CountryCode, THREE.Mesh>();
    const countryHalos = new Map<CountryCode, THREE.Mesh>();
    const hitTargets: THREE.Mesh[] = [];
    for (const code of countryCodes) {
      const point = position(
        ...markets[code].coordinates,
        EARTH_RADIUS + 0.022,
      );
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 12, 12),
        new THREE.MeshBasicMaterial({ color: "#ff405c", toneMapped: false }),
      );
      dot.position.copy(point);
      dot.userData.country = code;
      earth.add(dot);
      countryPoints.set(code, dot);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.044, 0.058, 32),
        new THREE.MeshBasicMaterial({
          color: "#ff203f",
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      halo.position.copy(point.clone().multiplyScalar(1.008));
      halo.lookAt(point.clone().multiplyScalar(2));
      earth.add(halo);
      countryHalos.set(code, halo);
      const hitTarget = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      hitTarget.position.copy(point);
      hitTarget.userData.country = code;
      earth.add(hitTarget);
      hitTargets.push(hitTarget);
    }
    // This geometric orbit is decoration, never a commercial activity flow.
    const orbitalRig = new THREE.Group();
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.77, 0.005, 6, 180),
      new THREE.MeshBasicMaterial({
        color: "#ff2144",
        transparent: true,
        opacity: 0.47,
        toneMapped: false,
      }),
    );
    orbit.rotation.set(1.1, 0.25, 0.28);
    orbitalRig.add(orbit);
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 181 }, (_, index) => {
        const angle = (index / 180) * Math.PI * 2;
        return new THREE.Vector3(
          Math.cos(angle) * 1.9,
          Math.sin(angle) * 1.9,
          0,
        );
      }),
    );
    const outerOrbit = new THREE.Line(
      orbitGeometry,
      new THREE.LineDashedMaterial({
        color: "#ff4c62",
        transparent: true,
        opacity: 0.26,
        dashSize: 0.018,
        gapSize: 0.034,
        toneMapped: false,
      }),
    );
    outerOrbit.computeLineDistances();
    outerOrbit.rotation.set(0.82, -0.32, 0.42);
    orbitalRig.add(outerOrbit);
    // An instrument calibration ring, unrelated to client or sales activity.
    const tickPositions: number[] = [];
    for (let index = 0; index < 72; index++) {
      const angle = (index / 72) * Math.PI * 2;
      for (const radius of [1.89, index % 6 === 0 ? 1.955 : 1.92]) {
        tickPositions.push(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0,
        );
      }
    }
    const tickGeometry = new THREE.BufferGeometry();
    tickGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(tickPositions, 3),
    );
    const ticks = new THREE.LineSegments(
      tickGeometry,
      new THREE.LineBasicMaterial({
        color: "#f75567",
        transparent: true,
        opacity: 0.22,
        toneMapped: false,
      }),
    );
    ticks.rotation.copy(outerOrbit.rotation);
    orbitalRig.add(ticks);
    scene.add(orbitalRig);
    const manualPoints = new THREE.Group();
    earth.add(manualPoints);
    let lastMarkers: Place[] | null = null;
    const disposeObject = (object: THREE.Object3D) => {
      object.traverse((item) => {
        if (
          item instanceof THREE.Mesh ||
          item instanceof THREE.Line ||
          item instanceof THREE.Points
        ) {
          item.geometry.dispose();
          (Array.isArray(item.material)
            ? item.material
            : [item.material]
          ).forEach((material) => material.dispose());
        }
      });
    };
    const updateManualMarkers = () => {
      if (lastMarkers === latest.current.markers) return;
      lastMarkers = latest.current.markers;
      disposeObject(manualPoints);
      manualPoints.clear();
      // Google content cannot be placed on a custom map without permission.
      const allowed = lastMarkers
        .filter(
          (place) =>
            place.source === "manual" &&
            Number.isFinite(place.lat) &&
            Number.isFinite(place.lng) &&
            Math.abs(place.lat) <= 90 &&
            Math.abs(place.lng) <= 180 &&
            (place.lat !== 0 || place.lng !== 0),
        )
        .slice(0, 200);
      for (const place of allowed) {
        const point = new THREE.Mesh(
          new THREE.SphereGeometry(0.016, 8, 8),
          new THREE.MeshBasicMaterial({ color: "#ff8495", toneMapped: false }),
        );
        point.position.copy(
          position(place.lat, place.lng, EARTH_RADIUS + 0.018),
        );
        manualPoints.add(point);
      }
    };
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let reducedMotion = motionPreference.matches;
    let visible = true;
    let contextAvailable = true;
    let frame = 0;
    let previousTime = 0;
    let clock = 0;
    let lastCountry = latest.current.country;
    let focusOrientation = countryOrientation(lastCountry);
    const targetOrientation = focusOrientation.clone();
    const orientation = focusOrientation.clone();
    let distance = compact ? 5.25 : 5.55;
    let targetDistance = distance;
    let manuallyOrbiting = false;
    let dragging = false;
    let moved = false;
    let pointerStart = { x: 0, y: 0 };
    let pointerLast = { x: 0, y: 0 };
    let latitude = markets[lastCountry].coordinates[0];
    let longitude = markets[lastCountry].coordinates[1];
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const cameraHelper = new THREE.PerspectiveCamera();
    const offsetRotation = new THREE.Quaternion();
    const verticalAxis = new THREE.Vector3(0, 1, 0);
    const schedule = () => {
      if (
        !destroyed &&
        contextAvailable &&
        visible &&
        !document.hidden &&
        !frame
      )
        frame = requestAnimationFrame(render);
    };
    const render = (time: number) => {
      frame = 0;
      if (destroyed || !contextAvailable || !visible || document.hidden) return;
      const delta = Math.min((time - previousTime) / 1000 || 0.016, 0.05);
      previousTime = time;
      const staticMotion = latest.current.paused || reducedMotion;
      if (staticMotion && entrance?.isActive()) entrance.progress(1).kill();
      if (lastCountry !== latest.current.country) {
        lastCountry = latest.current.country;
        [latitude, longitude] = markets[lastCountry].coordinates;
        focusOrientation = countryOrientation(lastCountry);
        targetOrientation.copy(focusOrientation);
        manuallyOrbiting = false;
        clock = 0;
      }
      updateManualMarkers();
      if (!staticMotion && !manuallyOrbiting) {
        clock += delta;
        offsetRotation.setFromAxisAngle(
          verticalAxis,
          Math.sin(clock * 0.15) * 0.075,
        );
        targetOrientation.copy(focusOrientation).premultiply(offsetRotation);
      }
      if (staticMotion) {
        orientation.copy(targetOrientation);
        distance = targetDistance;
      } else {
        orientation.slerp(targetOrientation, 1 - Math.exp(-delta * 4.2));
        distance = THREE.MathUtils.lerp(
          distance,
          targetDistance,
          1 - Math.exp(-delta * 4.2),
        );
      }
      camera.quaternion.copy(orientation);
      camera.position.set(0, 0, distance).applyQuaternion(orientation);
      lightRig.quaternion.copy(orientation);
      // Keep the instrument framing coherent as the chosen market turns.
      orbitalRig.quaternion.copy(orientation);
      if (!staticMotion) clouds.rotation.y += delta * 0.007;
      for (const code of countryCodes) {
        const selected = code === latest.current.country;
        countryPoints.get(code)?.scale.setScalar(selected ? 1.6 : 1);
        countryHalos
          .get(code)
          ?.scale.setScalar(
            selected
              ? 1.4 + (staticMotion ? 0 : Math.sin(clock * 2) * 0.08)
              : 1,
          );
      }
      renderer.render(scene, camera);
      if (!staticMotion || dragging) schedule();
    };
    invalidate.current = schedule;
    const resizeScene = () => {
      const bounds = element.getBoundingClientRect();
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.setViewOffset(
        width,
        height,
        0,
        latest.current.onCountrySelect ? height * 0.05 : 0,
        width,
        height,
      );
      camera.updateProjectionMatrix();
      targetDistance =
        (compact ? 5.2 : 5.45) * Math.max(1, 0.94 / camera.aspect);
      schedule();
    };
    const resize = new ResizeObserver(resizeScene);
    resize.observe(element);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      previousTime = performance.now();
      schedule();
    });
    intersection.observe(element);
    const visibilityChanged = () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      previousTime = performance.now();
      schedule();
    };
    const preferenceChanged = () => {
      reducedMotion = motionPreference.matches;
      schedule();
    };
    const countryAt = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      mouse.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(
        [earthMesh, ...hitTargets],
        false,
      )[0];
      return hit?.object.userData.country as CountryCode | undefined;
    };
    const pointerDown = (event: PointerEvent) => {
      if (!latest.current.onCountrySelect || event.button !== 0) return;
      dragging = true;
      moved = false;
      pointerStart = pointerLast = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const pointerMove = (event: PointerEvent) => {
      if (!latest.current.onCountrySelect) return;
      if (!dragging) {
        canvas.style.cursor = countryAt(event) ? "pointer" : "grab";
        return;
      }
      if (
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y,
        ) > 5
      )
        moved = true;
      if (!moved) return;
      longitude -= (event.clientX - pointerLast.x) * 0.3;
      latitude = THREE.MathUtils.clamp(
        latitude + (event.clientY - pointerLast.y) * 0.23,
        -75,
        75,
      );
      pointerLast = { x: event.clientX, y: event.clientY };
      cameraHelper.position.copy(position(latitude, longitude, 5));
      cameraHelper.lookAt(0, 0, 0);
      targetOrientation.copy(cameraHelper.quaternion);
      manuallyOrbiting = true;
      schedule();
    };
    const pointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (!moved) {
        const code = countryAt(event);
        if (code) latest.current.onCountrySelect?.(code);
      }
      schedule();
    };
    const pointerCancel = () => {
      dragging = false;
      canvas.style.cursor = "grab";
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      contextAvailable = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      setFailed(true);
    };
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerCancel);
    canvas.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", visibilityChanged);
    motionPreference.addEventListener("change", preferenceChanged);
    resizeScene();
    const entrance =
      !reducedMotion && !latest.current.paused
        ? gsap.fromTo(
            earth.scale,
            { x: 0.92, y: 0.92, z: 0.92 },
            {
              x: 1,
              y: 1,
              z: 1,
              duration: 1.3,
              ease: "power3.out",
              onUpdate: schedule,
            },
          )
        : null;
    return () => {
      destroyed = true;
      entrance?.kill();
      invalidate.current = null;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerCancel);
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", visibilityChanged);
      motionPreference.removeEventListener("change", preferenceChanged);
      disposeObject(scene);
      pendingImages.forEach((image) => {
        image.onload = null;
        image.onerror = null;
        image.src = "";
      });
      ownedTextures.forEach((texture) => texture.dispose());
      environment.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [compact]);
  return (
    <div
      className={`globe-stage ghost-earth${compact ? " globe-compact" : ""}${paused ? " globe-paused" : ""}`}
      aria-label={`Globo de navegação dos mercados disponíveis. Selecionado: ${markets[country].name}.`}
    >
      <div className="globe-aura" aria-hidden="true" />
      <div className="globe-instrument-grid" aria-hidden="true" />
      <div
        ref={host}
        className="globe-canvas"
        aria-hidden="true"
        style={{ display: failed ? "none" : "block" }}
      />
      {failed && (
        <div className="globe-fallback" aria-hidden="true">
          <svg
            viewBox="0 0 400 350"
            style={{ width: "100%", height: "100%", maxWidth: 480 }}
          >
            <defs>
              <radialGradient id={`${id}-surface`} cx="30%" cy="25%">
                <stop stopColor="#797074" />
                <stop offset="0.36" stopColor="#353034" />
                <stop offset="0.76" stopColor="#330b14" />
                <stop offset="1" stopColor="#120409" />
              </radialGradient>
              <radialGradient id={`${id}-halo`}>
                <stop offset="0.72" stopColor="#ff1739" stopOpacity="0" />
                <stop offset="0.87" stopColor="#ff1739" stopOpacity="0.4" />
                <stop offset="1" stopColor="#ff1739" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`${id}-shadow`} cx="24%" cy="25%" r="75%">
                <stop stopColor="#000" stopOpacity="0" />
                <stop offset="0.65" stopColor="#120008" stopOpacity="0.1" />
                <stop offset="1" stopColor="#090208" stopOpacity="0.84" />
              </radialGradient>
              <clipPath id={`${id}-clip`}>
                <circle cx="200" cy="175" r="139" />
              </clipPath>
            </defs>
            <circle cx="200" cy="175" r="170" fill={`url(#${id}-halo)`} />
            <ellipse
              cx="200"
              cy="175"
              rx="174"
              ry="52"
              transform="rotate(-24 200 175)"
              fill="none"
              stroke="#ff2448"
              strokeOpacity="0.7"
            />
            <ellipse
              cx="200"
              cy="175"
              rx="184"
              ry="88"
              transform="rotate(26 200 175)"
              fill="none"
              stroke="#ff6a7c"
              strokeOpacity="0.2"
              strokeDasharray="2 5"
            />
            <circle
              cx="200"
              cy="175"
              r="139"
              fill={`url(#${id}-surface)`}
              stroke="#ff193c"
              strokeOpacity="0.72"
            />
            <g
              clipPath={`url(#${id}-clip)`}
              stroke="#ff455f"
              strokeWidth="0.9"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              {fallbackPaths.map((path, index) => (
                <path key={index} d={path} fill="#675159" fillOpacity="0.38" />
              ))}
              <ellipse
                cx="200"
                cy="175"
                rx="72"
                ry="139"
                fill="none"
                strokeOpacity="0.12"
              />
              <ellipse
                cx="200"
                cy="175"
                rx="139"
                ry="48"
                fill="none"
                strokeOpacity="0.12"
              />
              <circle
                cx="200"
                cy="175"
                r="139"
                fill={`url(#${id}-shadow)`}
                stroke="none"
              />
            </g>
            <circle cx="200" cy="175" r="4" fill="#ffe5e9" />
            <circle
              cx="200"
              cy="175"
              r="9"
              fill="none"
              stroke="#ff3c59"
              strokeOpacity="0.9"
            />
            <circle
              cx="200"
              cy="175"
              r="14"
              fill="none"
              stroke="#ff3c59"
              strokeOpacity="0.3"
            />
          </svg>
        </div>
      )}
      {!compact && (
        <div className="globe-hud" aria-hidden="true">
          <span className="globe-hud-line" />
          <span>
            TERRA
            <br />
            <b>EXPLORAÇÃO GLOBAL</b>
          </span>
          <span className="globe-hud-cross">+</span>
        </div>
      )}
      <span className="globe-texture-credit">
        <a
          href="https://www.solarsystemscope.com/textures/"
          target="_blank"
          rel="noreferrer"
          aria-label="Texturas terrestres de Solar System Scope, com cores adaptadas para grafite"
        >
          Solar System Scope
        </a>
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
      </span>
      <div
        className={`globe-market-label${onCountrySelect ? " globe-market-selectable" : ""}`}
      >
        <span className="globe-market-dot" />
        <span>
          Mercado selecionado<b>{markets[country].name}</b>
        </span>
        {!compact && (
          <span className="globe-coordinate" aria-hidden="true">
            {Math.abs(markets[country].coordinates[0]).toFixed(2)}°{" "}
            {markets[country].coordinates[0] < 0 ? "S" : "N"}
            <br />
            {Math.abs(markets[country].coordinates[1]).toFixed(2)}°{" "}
            {markets[country].coordinates[1] < 0 ? "W" : "E"}
          </span>
        )}
      </div>
      {onCountrySelect && (
        <div
          className="globe-market-controls"
          role="group"
          aria-label="Selecionar mercado no globo"
        >
          {countryCodes.map((code) => (
            <button
              key={code}
              type="button"
              aria-label={`Selecionar ${markets[code].name}`}
              aria-pressed={country === code}
              onClick={() => onCountrySelect(code)}
            >
              {code}
            </button>
          ))}
          <span className="globe-drag-hint" aria-hidden="true">
            Arraste para explorar
          </span>
        </div>
      )}
    </div>
  );
}
