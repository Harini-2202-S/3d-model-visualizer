import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  Suspense,
  useCallback,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Html,
  useGLTF,
  Bounds,
  Environment,
  Sky,
} from "@react-three/drei";
import * as THREE from "three";
import "./WeatherBuildingViewer.css";

// Utility: fetch live weather using Open-Meteo
async function fetchWeather({ lat, lng }) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather fetch failed");
    const data = await res.json();

    const cw = data.current_weather;
    if (!cw) throw new Error("No current weather data available");

    return {
      temperature: cw.temperature ?? "--",
      windspeed: cw.windspeed ?? "--",
      winddirection: cw.winddirection ?? "--",
      weathercode: cw.weathercode ?? 0,
      time: cw.time ?? new Date().toISOString(),
      units: {
        temperature: "°C",
        windspeed: "km/h",
      },
    };
  } catch (err) {
    console.error("Weather fetch error:", err);
    return {
      temperature: "--",
      windspeed: "--",
      winddirection: "--",
      weathercode: 0,
      time: new Date().toISOString(),
      units: { temperature: "°C", windspeed: "km/h" },
    };
  }
}

// WMO weather code mapping
const WMO = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  95: "Thunderstorm",
};

// Building model loader
function Building({
  gltfUrl,
  highlight,
  onPointerOver,
  onPointerOut,
  onClick,
  onReady,
}) {
  const group = useRef();
  const [loaded, setLoaded] = useState(false);

  const pointerDownPos = useRef([0, 0]);
  const isDragging = useRef(false);

  const handlePointerDown = (e) => {
    pointerDownPos.current = [e.clientX, e.clientY];
    isDragging.current = false;
  };

  const handlePointerMove = (e) => {
    const [x0, y0] = pointerDownPos.current;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (Math.sqrt(dx * dx + dy * dy) > 2) {
      isDragging.current = true;
    }
  };

  const handlePointerUp = (e) => {
    if (!isDragging.current) {
      onClick && onClick(); 
    }
  };

  if (gltfUrl) {
    const { scene } = useGLTF(gltfUrl);
    useEffect(() => {
      if (!loaded) {
        scene.traverse((obj) => {
          if (obj.isMesh && !obj.name) obj.name = "BuildingMesh";
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        // Raise GLTF building above ground
        scene.position.y += 1.5;
        setLoaded(true);
        onReady && onReady(scene);
      }
    }, [loaded, onReady, scene]);

    useEffect(() => {
      scene.traverse((obj) => {
        if (obj.isMesh) {
          const mat = obj.material;
          if (!mat) return;
          if (highlight) {
            if (!mat.userData._baseEmissive) {
              mat.userData._baseEmissive = mat.emissive
                ? mat.emissive.clone()
                : new THREE.Color(0x000000);
            }
            if (!mat.emissive) mat.emissive = new THREE.Color(0x000000);
            mat.emissive.setRGB(0.1, 0.2, 0.6);
          } else if (mat.userData._baseEmissive) {
            mat.emissive.copy(mat.userData._baseEmissive);
          }
        }
      });
    }, [highlight, scene]);

    return (
      <primitive
        ref={group}
        object={scene}
        scale={[2.5, 2.5, 2.5]}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    );
  }

  const meshRef = useRef();
  useEffect(() => {
    onReady && onReady(meshRef.current);
  }, [onReady]);

  // Building parameters
  const floors = 10;
  const floorHeight = 3;
  const buildingWidth = 10;
  const buildingDepth = 6;

  return (
    <group
      ref={meshRef}
      scale={[1.5, 1.5, 1.5]}
      position={[0, 0, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Floors */}
      {[...Array(floors)].map((_, i) => {
        const y = floorHeight / 2 + i * floorHeight;
        const isGreen = i % 2 === 0;
        return (
          <mesh
            key={`floor-${i}`}
            castShadow
            receiveShadow
            position={[0, y, 0]}
          >
            <boxGeometry args={[buildingWidth, floorHeight, buildingDepth]} />
            <meshStandardMaterial
              color={isGreen ? "#c4d37f" : "#7d7d7d"}
              roughness={0.6}
              metalness={0.2}
            />
          </mesh>
        );
      })}

      {/* Vertical edges */}
      {[...Array(floors)].map((_, i) => {
        const y = floorHeight / 2 + i * floorHeight;
        const side = i % 2 === 0 ? -1 : 1;
        const xPos = side * (buildingWidth / 2);
        const zPos = buildingDepth / 2;
        return (
          <mesh key={`vert-${i}`} position={[xPos, y, zPos]}>
            <boxGeometry args={[0.3, floorHeight, 0.3]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
        );
      })}

      {/* Horizontal separators */}
      {[...Array(floors + 1)].map((_, i) => {
        const y = i * floorHeight;
        const zPos = buildingDepth / 2;
        return (
          <mesh key={`sep-${i}`} position={[0, y, zPos]}>
            <boxGeometry args={[buildingWidth + 0.3, 0.2, 0.3]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
        );
      })}

      {/* Windows */}
      {[...Array(floors)].map((_, i) => {
        if (i === 0) return null; 
        const y = floorHeight / 2 + i * floorHeight + 0.5; 
        return [-3, 3].map((x, j) => (
          <group key={`window-front-${i}-${j}`}>
            {/* Outer frame */}
            <mesh position={[x, y, buildingDepth / 2 + 0.03]}>
              <boxGeometry args={[0.82, 1.22, 0.05]} />
              <meshStandardMaterial color="white" roughness={0.6} />{" "}
              {/* wood color */}
            </mesh>

            {/* Vertical middle bar */}
            <mesh position={[x, y, buildingDepth / 2 + 0.06]}>
              <boxGeometry args={[0.03, 1.22, 0.03]} />
              <meshStandardMaterial color="#555" roughness={0.4} />{" "}
              {/* metal look */}
            </mesh>

            {/* Horizontal middle bar */}
            <mesh position={[x, y, buildingDepth / 2 + 0.06]}>
              <boxGeometry args={[0.82, 0.03, 0.03]} />
              <meshStandardMaterial color="#555" roughness={0.4} />
            </mesh>

            {/* small panes */}
            {[
              [-0.2, 0.2],
              [-0.2, 0.2],
            ].map((dx, idxX) =>
              [
                [-0.3, 0.3],
                [-0.3, 0.3],
              ].map((dy, idxY) => (
                <mesh
                  key={`pane-${i}-${j}-${idxX}-${idxY}`}
                  position={[
                    x + dx[idxX] / 2,
                    y + dy[idxY] / 2,
                    buildingDepth / 2,
                  ]}
                >
                  <boxGeometry args={[0.35, 0.55, 0.02]} />
                  <meshStandardMaterial
                    color="#88ccee"
                    transparent
                    opacity={0.35}
                    roughness={0.1}
                    metalness={0.1}
                  />
                </mesh>
              ))
            )}
          </group>
        ));
      })}

      {/* Side windows */}
      {[...Array(floors)].map((_, i) => {
        if (i === 0) return null; 
        const y = floorHeight / 1.35 + i * floorHeight; 
        const z = -2; 
        const windowWidth = 0.6;
        const windowHeight = 0.6;
        const windowDepth = 0.1;
        const frameThickness = 0.05;

        // Function for side window
        const createSideWindow = (xPos) => (
          <group
            key={`side-window-${xPos > 0 ? "right" : "left"}-${i}`}
            position={[xPos, y, z]}
          >
            {/* Frame */}
            <mesh>
              <boxGeometry
                args={[
                  frameThickness,
                  windowHeight + frameThickness * 2,
                  windowWidth + frameThickness * 2,
                ]}
              />
              <meshStandardMaterial color="white" roughness={0.5} />
            </mesh>

            {/* Glass */}
            <mesh
              position={[
                xPos > 0 ? -frameThickness / 2 : frameThickness / 2,
                0,
                0,
              ]}
            >
              <boxGeometry args={[windowDepth, windowHeight, windowWidth]} />
              <meshStandardMaterial
                color="#88ccee"
                transparent
                opacity={0.35}
                roughness={0.1}
                metalness={0.1}
              />
            </mesh>

            {/* Vertical crossbar */}
            <mesh
              position={[
                xPos > 0 ? -frameThickness / 2 : frameThickness / 2,
                0,
                0,
              ]}
            >
              <boxGeometry args={[windowDepth + 0.01, windowHeight, 0.02]} />
              <meshStandardMaterial color="#222" roughness={0.3} />
            </mesh>

            {/* Horizontal crossbar */}
            <mesh
              position={[
                xPos > 0 ? -frameThickness / 2 : frameThickness / 2,
                0,
                0,
              ]}
            >
              <boxGeometry args={[windowDepth + 0.01, 0.02, windowWidth]} />
              <meshStandardMaterial color="#222" roughness={0.3} />
            </mesh>
          </group>
        );

        return (
          <>
            {createSideWindow(-buildingWidth / 2 - windowDepth / 2)}{" "}
            {/* Left */}
            {createSideWindow(buildingWidth / 2 + windowDepth / 2)}{" "}
            {/* Right */}
          </>
        );
      })}

      {/* Balconies and doors */}
      {[...Array(floors)].map((_, i) => {
        if (i === 0) return null; 
        const y = floorHeight / 2 + i * floorHeight - 0.6; 
        const balconyWidth = 3;
        const balconyDepth = 0.7;
        const railingHeight = 0.35;
        const railingThickness = 0.05;
        const doorWidth = 1.2;
        const doorHeight = 1.8;

        return (
          <group
            key={`balcony-${i}`}
            position={[0, y, buildingDepth / 2 + balconyDepth / 2 + 0.05]}
          >
            {/* Balcony floor */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[balconyWidth, 0.15, balconyDepth]} />
              <meshStandardMaterial
                color="#88ccee"
                transparent
                opacity={0.35}
                roughness={0.1}
                metalness={0.1}
              />
            </mesh>

            {/* Corner posts */}
            {[
              [
                -balconyWidth / 2 + railingThickness / 2,
                -balconyDepth / 2 + railingThickness / 2,
              ],
              [
                balconyWidth / 2 - railingThickness / 2,
                -balconyDepth / 2 + railingThickness / 2,
              ],
              [
                -balconyWidth / 2 + railingThickness / 2,
                balconyDepth / 2 - railingThickness / 2,
              ],
              [
                balconyWidth / 2 - railingThickness / 2,
                balconyDepth / 2 - railingThickness / 2,
              ],
            ].map(([x, z], idx) => (
              <mesh
                key={`railing-post-${i}-${idx}`}
                position={[x, railingHeight / 2 + 0.075, z]}
              >
                <boxGeometry
                  args={[railingThickness, railingHeight, railingThickness]}
                />
                <meshStandardMaterial color="#222" roughness={0.3} />
              </mesh>
            ))}

            {/* Top rails */}
            {[
              [
                0,
                railingHeight + 0.075,
                -balconyDepth / 2 + railingThickness / 2,
                balconyWidth,
                railingThickness,
                railingThickness,
              ],
              [
                0,
                railingHeight + 0.075,
                balconyDepth / 2 - railingThickness / 2,
                balconyWidth,
                railingThickness,
                railingThickness,
              ],
              [
                -balconyWidth / 2 + railingThickness / 2,
                railingHeight + 0.075,
                0,
                railingThickness,
                railingThickness,
                balconyDepth,
              ],
              [
                balconyWidth / 2 - railingThickness / 2,
                railingHeight + 0.075,
                0,
                railingThickness,
                railingThickness,
                balconyDepth,
              ],
            ].map(([x, yPos, z, w, h, d], idx) => (
              <mesh key={`railing-top-${i}-${idx}`} position={[x, yPos, z]}>
                <boxGeometry args={[w, h, d]} />
                <meshStandardMaterial color="#222" roughness={0.3} />
              </mesh>
            ))}

            {/* Glass door */}
            <mesh
              position={[0, doorHeight / 2 + 0.075, -balconyDepth / 2 + 0.05]}
            >
              <boxGeometry args={[doorWidth, doorHeight, 0.05]} />
              <meshStandardMaterial
                color="#88ccee"
                transparent
                opacity={0.4}
                roughness={0.1}
                metalness={0.1}
              />
            </mesh>
          </group>
        );
      })}

      {/* Central glass door */}
      <mesh position={[0, 1.5, buildingDepth / 2 + 0.05]}>
        <boxGeometry args={[2, 3, 0.05]} />
        <meshStandardMaterial
          color="#88ccee"
          transparent
          opacity={0.4}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>

      {/* Roof */}
      <mesh position={[0, floors * floorHeight + 0.25, 0]}>
        <boxGeometry args={[buildingWidth + 0.5, 0.5, buildingDepth + 0.5]} />
        <meshStandardMaterial color="#7a7a7a" roughness={0.6} />
      </mesh>
    </group>
  );
}

// Floating animation
function FloatY({ children }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) ref.current.position.y = Math.sin(t * 0.5) * 0.1;
  });
  return <group ref={ref}>{children}</group>;
}

function Scene({ gltfUrl, onBuildingClick }) {
  const [hovered, setHovered] = useState(false);
  const dirLight = useRef();
  useEffect(() => {
    if (dirLight.current) dirLight.current.target.position.set(0, 0, 0);
  }, []);

  return (
    <>
      <Sky sunPosition={[100, 20, 100]} turbidity={8} rayleigh={6} />
      <ambientLight intensity={0.5} />
      <directionalLight
        ref={dirLight}
        position={[15, 10, 15]}
        intensity={1.3}
        castShadow
      />
      <Environment preset="sunset" />
      <mesh receiveShadow rotation-x={-Math.PI / 2}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#e6e9ef" />
      </mesh>

      <Bounds fit clip observe margin={1.2}>
        <FloatY>
          <Building
            gltfUrl={gltfUrl}
            highlight={hovered}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={() => onBuildingClick({ lat: 12.8385, lng: 80.1697 })}
            onReady={() => {}}
          />
        </FloatY>
      </Bounds>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={5}
        maxDistance={60}
      />
    </>
  );
}

export default function WeatherBuildingViewer({
  gltfUrl = "",
  buildingId = "A",
  coords = { lat: 12.8385, lng: 80.1697 },
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [weather, setWeather] = useState(null);

  // store coordinates of the last clicked building
  const [clickedCoords, setClickedCoords] = useState(coords);

  const onBuildingClick = useCallback(
    async (coord) => {
      setClickedCoords(coord);
      setModalOpen(true);

      if (
        weather &&
        weather.time &&
        clickedCoords.lat === coord.lat &&
        clickedCoords.lng === coord.lng
      ) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const data = await fetchWeather(coord);
        setWeather(data);
      } catch (e) {
        setError(e.message || "Failed to fetch weather");
      } finally {
        setLoading(false);
      }
    },
    [clickedCoords, weather]
  );

  // Close modal
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const canvasStyle = useMemo(
    () => ({ width: "100%", height: "100%", touchAction: "none" }),
    []
  );

  // Initial fetch for default coordinates
  useEffect(() => {
    const fetchCurrentWeather = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchWeather(coords);
        setWeather(data);
        setClickedCoords(coords);
      } catch (e) {
        setError(e.message || "Failed to fetch weather");
      } finally {
        setLoading(false);
      }
    };
    fetchCurrentWeather();
  }, [coords]);

  return (
    <div className="wbv-container">
      <div className="wbv-header">
        Hover to highlight • Click building to view weather • Drag to orbit •
        Pinch/scroll to zoom
      </div>

      <Canvas
        shadows
        linear
        style={canvasStyle}
        camera={{ position: [8, 25, 8], fov: 60 }}
      >
        <Suspense fallback={<Html center>Loading 3D…</Html>}>
          <Scene gltfUrl={gltfUrl} onBuildingClick={onBuildingClick} />
        </Suspense>
      </Canvas>

      {modalOpen && (
        <div className="wbv-modal-overlay">
          <div
            className="wbv-modal-backdrop"
            onClick={() => setModalOpen(false)}
          />
          <div className="wbv-modal">
            <button
              className="wbv-close-btn"
              onClick={() => setModalOpen(false)}
            >
              Close
            </button>
            <div className="wbv-modal-header">
              <div className="wbv-building-id">{buildingId}</div>
              <div>
                <h2>Current Weather</h2>
                <p>
                  Lat {clickedCoords.lat.toFixed(3)}, Lng{" "}
                  {clickedCoords.lng.toFixed(3)}
                </p>
              </div>
            </div>

            <div className="wbv-modal-content">
              {loading && <div>Fetching weather…</div>}
              {!loading && error && <div className="wbv-error">{error}</div>}
              {!loading && !error && weather && (
                <div className="wbv-weather-grid">
                  <div className="wbv-weather-card">
                    <div>Temperature</div>
                    <div>
                      {weather.temperature}
                      {weather.units.temperature}
                    </div>
                  </div>
                  <div className="wbv-weather-card">
                    <div>Wind</div>
                    <div>
                      {weather.windspeed} {weather.units.windspeed}
                    </div>
                    <div>Dir {Math.round(weather.winddirection)}°</div>
                  </div>
                  <div className="wbv-weather-card wbv-col-span-2">
                    <div>Condition</div>
                    <div>
                      {WMO[weather.weathercode] ||
                        `Code ${weather.weathercode}`}
                    </div>
                    <div>
                      Updated: {new Date(weather.time).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="wbv-safe-area" />
    </div>
  );
}

useGLTF.preload && useGLTF.preload;
