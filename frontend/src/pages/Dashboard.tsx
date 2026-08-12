import React, { useState, useEffect, useCallback } from "react";
import {
  Cloud,
  Droplets,
  Wind,
  AlertTriangle,
  TrendingUp,
  MapPin,
  Sprout,
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { getLiveWeather, LiveWeatherResponse, CropRecommendation } from "../api/service";

// All Karnataka districts with their coordinates
const KARNATAKA_DISTRICTS = [
  { name: "Bangalore",       lat: 12.9716, lng: 77.5946 },
  { name: "Mysuru",          lat: 12.2958, lng: 76.6394 },
  { name: "Mangalore",       lat: 12.9141, lng: 74.8560 },
  { name: "Hubli-Dharwad",   lat: 15.3647, lng: 75.1240 },
  { name: "Belgaum",         lat: 15.8497, lng: 74.4977 },
  { name: "Gulbarga",        lat: 17.3297, lng: 76.8343 },
  { name: "Davanagere",      lat: 14.4644, lng: 75.9218 },
  { name: "Bellary",         lat: 15.1420, lng: 76.9245 },
  { name: "Bijapur",         lat: 16.8302, lng: 75.7100 },
  { name: "Shimoga",         lat: 13.9299, lng: 75.5681 },
  { name: "Tumkur",          lat: 13.3379, lng: 77.1173 },
  { name: "Raichur",         lat: 16.2120, lng: 77.3439 },
  { name: "Bidar",           lat: 17.9133, lng: 77.5341 },
  { name: "Hassan",          lat: 13.0068, lng: 76.1004 },
  { name: "Mandya",          lat: 12.5210, lng: 76.8960 },
  { name: "Chikkamagaluru",  lat: 13.3161, lng: 75.7720 },
  { name: "Kodagu",          lat: 12.3375, lng: 75.8069 },
  { name: "Udupi",           lat: 13.3409, lng: 74.7500 },
  { name: "Kasaragod",       lat: 12.4965, lng: 74.9897 },
  { name: "Chitradurga",     lat: 14.2199, lng: 76.3996 },
  { name: "Kolar",           lat: 13.1369, lng: 78.1260 },
  { name: "Gadag",           lat: 15.4284, lng: 75.6205 },
  { name: "Haveri",          lat: 14.7950, lng: 75.4000 },
  { name: "Koppal",          lat: 15.3587, lng: 76.1549 },
  { name: "Yadgir",          lat: 16.7546, lng: 77.1465 },
  { name: "Bagalkot",        lat: 16.1825, lng: 75.6981 },
  { name: "Chamarajanagar",  lat: 11.9395, lng: 77.3010 },
  { name: "Ramanagara",      lat: 12.7247, lng: 77.3311 },
];

export const Dashboard: React.FC = () => {
  const [liveData, setLiveData] = useState<LiveWeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<typeof KARNATAKA_DISTRICTS[0] | null>(null);
  const [locationSource, setLocationSource] = useState<string>("detecting...");

  const fetchForCoords = useCallback(async (lat: number, lng: number) => {
    try {
      setRefreshing(true);
      const data = await getLiveWeather(lat, lng);
      setLiveData(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch weather data. Make sure backend is running.");
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Handle district dropdown change — immediately fetch for chosen district
  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const d = KARNATAKA_DISTRICTS.find(d => d.name === e.target.value);
    if (!d) return;
    setSelectedDistrict(d);
    setLocationSource("manual");
    fetchForCoords(d.lat, d.lng);
  };

  // On mount: try GPS → IP → Karnataka default
  useEffect(() => {
    const init = async () => {
      // Tier 1: Browser GPS
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation
            ? navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 })
            : reject(new Error("no geolocation"))
        );
        const { latitude, longitude } = position.coords;
        setLocationSource("GPS");
        // Find nearest district
        const nearest = KARNATAKA_DISTRICTS.reduce((best, d) => {
          const dist = Math.hypot(d.lat - latitude, d.lng - longitude);
          const bestDist = Math.hypot(best.lat - latitude, best.lng - longitude);
          return dist < bestDist ? d : best;
        });
        setSelectedDistrict(nearest);
        fetchForCoords(latitude, longitude);
        return;
      } catch { /* fall through */ }

      // Tier 2: IP geolocation
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (res.ok) {
          const d = await res.json();
          if (d.latitude && d.longitude) {
            const lat = parseFloat(d.latitude);
            const lng = parseFloat(d.longitude);
            setLocationSource(`IP (${d.city || "unknown"})`);
            const nearest = KARNATAKA_DISTRICTS.reduce((best, dist) => {
              const a = Math.hypot(dist.lat - lat, dist.lng - lng);
              const b = Math.hypot(best.lat - lat, best.lng - lng);
              return a < b ? dist : best;
            });
            setSelectedDistrict(nearest);
            fetchForCoords(lat, lng);
            return;
          }
        }
      } catch { /* fall through */ }

      // Tier 3: Karnataka default (Bangalore)
      const defaultDistrict = KARNATAKA_DISTRICTS[0];
      setSelectedDistrict(defaultDistrict);
      setLocationSource("default");
      fetchForCoords(defaultDistrict.lat, defaultDistrict.lng);
    };

    init();
    const interval = setInterval(() => {
      if (selectedDistrict) fetchForCoords(selectedDistrict.lat, selectedDistrict.lng);
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
          <p className="text-gray-600">Loading live weather data for Karnataka...</p>
        </div>
      </div>
    );
  }

  if (error || !liveData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
        <h3 className="font-semibold text-gray-900 mb-2">Error Loading Data</h3>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => selectedDistrict && fetchForCoords(selectedDistrict.lat, selectedDistrict.lng)}
          className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const { pest_prediction } = liveData;

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-green-600 text-sm font-semibold mb-2">
              <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
              LIVE DATA - KARNATAKA
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Pest Intelligence Dashboard
            </h1>
          </div>
          <button
            onClick={() => selectedDistrict && fetchForCoords(selectedDistrict.lat, selectedDistrict.lng)}
            disabled={refreshing}
            className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Location row: district picker + live weather location */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* District selector */}
          <div className="relative flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
            <div className="relative">
              <select
                value={selectedDistrict?.name || ""}
                onChange={handleDistrictChange}
                className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-gray-700 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer shadow-sm"
              >
                {KARNATAKA_DISTRICTS.map(d => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <span className="text-gray-300">|</span>

          {/* Live weather location from API */}
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <span className="capitalize">{liveData.description}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">
              {locationSource === "GPS" ? "📍 GPS" :
               locationSource === "manual" ? "📋 Manual" :
               locationSource.startsWith("IP") ? `🌐 ${locationSource}` :
               "🗺️ Default"}
            </span>
          </div>
        </div>
      </div>

      {/* Live Weather Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <WeatherCard
          icon={Cloud}
          label="Temperature"
          value={`${liveData.temperature.toFixed(1)}°C`}
        />
        <WeatherCard
          icon={Droplets}
          label="Humidity"
          value={`${liveData.humidity}%`}
          sublabel="RELATIVE"
        />
        <WeatherCard
          icon={Cloud}
          label="Rainfall"
          value={`${liveData.rainfall.toFixed(1)} mm`}
          sublabel="LAST HOUR"
        />
        <WeatherCard
          icon={Wind}
          label="Wind Speed"
          value={`${liveData.wind.toFixed(1)} km/h`}
          sublabel="SURFACE"
        />
      </div>

      {/* Pest Risk & Crop Recommendation */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Pest Risk */}
        <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl shadow-sm p-6 border border-red-100">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            PEST RISK LEVEL
          </h3>
          <div
            className={`text-5xl font-bold mb-4 ${
              pest_prediction.risk === "HIGH"
                ? "text-red-600"
                : pest_prediction.risk === "MEDIUM"
                ? "text-orange-600"
                : "text-green-600"
            }`}
          >
            {pest_prediction.risk}
          </div>
          <p className="text-gray-700 font-medium mb-2">{pest_prediction.pest}</p>
          <p className="text-sm text-gray-600 mb-4">{pest_prediction.scientific}</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Model Confidence</span>
              <span className="font-semibold">{pest_prediction.confidence}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  pest_prediction.risk === "HIGH"
                    ? "bg-red-600"
                    : pest_prediction.risk === "MEDIUM"
                    ? "bg-orange-600"
                    : "bg-green-600"
                }`}
                style={{ width: `${pest_prediction.confidence}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Top Crop Recommendation */}
        {liveData.crops_suggested.length > 0 && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm p-6 border border-green-100">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Sprout className="w-5 h-5 text-green-600" />
              TOP CROP RECOMMENDED
            </h3>
            <div className="mb-4">
              <p className="text-3xl font-bold text-green-700 mb-2">
                {liveData.crops_suggested[0].crop}
              </p>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                  liveData.crops_suggested[0].suitability === "Excellent"
                    ? "bg-green-200 text-green-800"
                    : "bg-yellow-200 text-yellow-800"
                }`}
              >
                {liveData.crops_suggested[0].suitability}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-gray-600">Temp Range</p>
                <p className="font-semibold text-gray-900">
                  {liveData.crops_suggested[0].temperature_range}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Humidity Range</p>
                <p className="font-semibold text-gray-900">
                  {liveData.crops_suggested[0].humidity_range}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Pest Risk</p>
                <p
                  className={`font-semibold ${
                    liveData.crops_suggested[0].pest_risk === "High"
                      ? "text-red-600"
                      : "text-yellow-600"
                  }`}
                >
                  {liveData.crops_suggested[0].pest_risk}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recommendation */}
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl shadow-sm p-6 border border-blue-100">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            MANAGEMENT ADVICE
          </h3>
          <p className="text-gray-700 text-sm mb-4">{pest_prediction.recommendation}</p>
          {liveData.crops_suggested.length > 0 && (
            <div className="bg-white rounded-lg p-3 text-sm">
              <p className="text-gray-600 mb-1">For {liveData.crops_suggested[0].crop}</p>
              <p className="font-semibold text-gray-900">
                {liveData.crops_suggested[0].management}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* All Suitable Crops */}
      {liveData.crops_suggested.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Sprout className="w-5 h-5 text-green-600" />
            ALL SUITABLE CROPS FOR CURRENT CONDITIONS
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {liveData.crops_suggested.map((crop, idx) => (
              <CropCard key={idx} crop={crop} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface WeatherCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sublabel?: string;
}

const WeatherCard: React.FC<WeatherCardProps> = ({
  icon: Icon,
  label,
  value,
  sublabel,
}) => (
  <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
    <div className="flex items-start justify-between mb-3">
      <Icon className="w-6 h-6 text-gray-400" />
      {sublabel && <span className="text-xs text-gray-500 font-medium">{sublabel}</span>}
    </div>
    <p className="text-xs text-gray-500 mb-1">{label}</p>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
  </div>
);

const CropCard: React.FC<{ crop: CropRecommendation }> = ({ crop }) => (
  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100">
    <div className="flex items-start justify-between mb-3">
      <h4 className="font-semibold text-gray-900">{crop.crop}</h4>
      <span
        className={`px-2 py-1 rounded-full text-xs font-semibold ${
          crop.suitability === "Excellent"
            ? "bg-green-200 text-green-800"
            : "bg-yellow-200 text-yellow-800"
        }`}
      >
        {crop.suitability}
      </span>
    </div>
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-gray-600">Temperature</span>
        <span className="font-semibold text-gray-900">{crop.temperature_range}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Humidity</span>
        <span className="font-semibold text-gray-900">{crop.humidity_range}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Pest Risk</span>
        <span
          className={`font-semibold ${
            crop.pest_risk === "High" ? "text-red-600" : "text-yellow-600"
          }`}
        >
          {crop.pest_risk}
        </span>
      </div>
      <p className="text-xs text-gray-600 pt-2 border-t border-green-200">
        {crop.management}
      </p>
    </div>
  </div>
);

export default Dashboard;
