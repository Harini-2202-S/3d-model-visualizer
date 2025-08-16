import WeatherBuildingViewer from "./WeatherBuildingViewer";

export default function App() {
  return (
    <WeatherBuildingViewer
      gltfUrl=""
      buildingId="Block A"
      coords={{ lat: 12.972, lng: 77.593 }}
    />
  );
}
