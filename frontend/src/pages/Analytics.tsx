import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AlertCircle, Loader2 } from "lucide-react";

interface DistrictRecord {
  district: string;
  crop: string;
  pest: string;
  outbreak: string;
  temperature: number;
  humidity: number;
  rainfall: number;
}

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

export const Analytics: React.FC = () => {
  const [districtData, setDistrictData] = useState<DistrictRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/district-data`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data: DistrictRecord[] = await res.json();
        setDistrictData(data);
      } catch (err) {
        setError("Failed to load analytics data. Make sure the backend is running.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-green-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-red-700 mb-1">Error Loading Analytics</h3>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  // ── Aggregate pest distribution from district data ────────────────────────
  const pestCounts: Record<string, number> = {};
  districtData.forEach(d => {
    const pest = d.pest ? d.pest.trim() : "Unknown";
    pestCounts[pest] = (pestCounts[pest] || 0) + 1;
  });
  const pestDistribution = Object.entries(pestCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // ── Outbreak breakdown ────────────────────────────────────────────────────
  const outbreakCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  districtData.forEach(d => {
    const o = (d.outbreak || "").toUpperCase();
    if (o === "HIGH") outbreakCounts.HIGH++;
    else if (o === "MEDIUM") outbreakCounts.MEDIUM++;
    else outbreakCounts.LOW++;
  });

  // ── Average weather by outbreak level ─────────────────────────────────────
  const weatherByOutbreak = ["HIGH", "MEDIUM", "LOW"].map(level => {
    const rows = districtData.filter(d => (d.outbreak || "").toUpperCase() === level);
    const avgTemp = rows.length
      ? Number((rows.reduce((s, r) => s + r.temperature, 0) / rows.length).toFixed(1))
      : 0;
    const avgHumid = rows.length
      ? Number((rows.reduce((s, r) => s + r.humidity, 0) / rows.length).toFixed(1))
      : 0;
    return { level, avgTemp, avgHumid, count: rows.length };
  });

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics</h1>
      <p className="text-sm text-gray-500 mb-8">
        Data source: Karnataka district pest dataset · {districtData.length} district records
      </p>

      <div className="grid grid-cols-2 gap-6">
        {/* Pest Distribution */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-1">Pest Distribution</h3>
          <p className="text-xs text-gray-400 mb-4">Most common pests across all districts</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={pestDistribution} margin={{ bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Weather Conditions by Outbreak Level */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-1">Avg Weather by Outbreak Level</h3>
          <p className="text-xs text-gray-400 mb-4">Temperature and humidity at each risk level</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={weatherByOutbreak}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="level" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="avgTemp" stroke="#ef4444" strokeWidth={2} name="Avg Temp (°C)" dot={{ r: 5 }} />
              <Line type="monotone" dataKey="avgHumid" stroke="#3b82f6" strokeWidth={2} name="Avg Humidity (%)" dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6">
        <div className="bg-red-50 rounded-lg p-6 border border-red-100">
          <p className="text-sm text-gray-600 mb-2">High Risk Districts</p>
          <p className="text-3xl font-bold text-red-600">{outbreakCounts.HIGH}</p>
          <p className="text-xs text-gray-500 mt-1">Require immediate attention</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-100">
          <p className="text-sm text-gray-600 mb-2">Medium Risk Districts</p>
          <p className="text-3xl font-bold text-yellow-600">{outbreakCounts.MEDIUM}</p>
          <p className="text-xs text-gray-500 mt-1">Monitor closely</p>
        </div>
        <div className="bg-green-50 rounded-lg p-6 border border-green-100">
          <p className="text-sm text-gray-600 mb-2">Low Risk Districts</p>
          <p className="text-3xl font-bold text-green-600">{outbreakCounts.LOW}</p>
          <p className="text-xs text-gray-500 mt-1">Routine monitoring</p>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
