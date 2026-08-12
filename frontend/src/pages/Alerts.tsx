import React, { useEffect, useState } from "react";
import { AlertTriangle, Cloud, Zap, Loader2, AlertCircle, RefreshCw } from "lucide-react";

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

function severityForOutbreak(outbreak: string): "high" | "medium" | "low" {
  const o = (outbreak || "").toUpperCase();
  if (o === "HIGH" || o === "CRITICAL") return "high";
  if (o === "MEDIUM") return "medium";
  return "low";
}

export const Alerts: React.FC = () => {
  const [districtData, setDistrictData] = useState<DistrictRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`${API_BASE}/district-data`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data: DistrictRecord[] = await res.json();
      setDistrictData(data);
      setError(null);
    } catch (err) {
      setError("Failed to load alert data. Make sure the backend is running.");
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Build alerts from district data — high risk first, then medium, then low
  const alerts = districtData
    .filter(d => d.pest && d.outbreak)
    .map(d => {
      const severity = severityForOutbreak(d.outbreak);
      let type = "Pest Alert";
      let icon = AlertTriangle;
      let title = `${d.pest} detected in ${d.district}`;

      if (d.rainfall > 10) {
        type = "Weather Alert";
        icon = Cloud;
        title = `High rainfall (${d.rainfall.toFixed(1)}mm) in ${d.district} — increased pest risk`;
      }

      return {
        type,
        title,
        severity,
        location: `${d.district}${d.crop ? ` · ${d.crop}` : ""}`,
        icon,
        outbreak: d.outbreak,
        pest: d.pest,
      };
    })
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });

  const severityColor = {
    high:   "bg-red-50 border-red-200",
    medium: "bg-yellow-50 border-yellow-200",
    low:    "bg-blue-50 border-blue-200",
  };

  const severityBadge = {
    high:   "bg-red-100 text-red-700",
    medium: "bg-yellow-100 text-yellow-700",
    low:    "bg-blue-100 text-blue-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time pest outbreak alerts derived from district data
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          disabled={refreshing}
          className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition disabled:opacity-50 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-green-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Loading alerts...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-700 mb-1">Error Loading Alerts</h3>
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchAlerts}
              className="mt-3 text-sm text-red-600 underline hover:text-red-800"
            >
              Try again
            </button>
          </div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <Zap className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h3 className="font-semibold text-green-700 mb-1">No Active Alerts</h3>
          <p className="text-sm text-green-600">All districts are reporting low risk conditions.</p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {(["high", "medium", "low"] as const).map(level => (
              <div key={level} className={`rounded-lg p-4 border ${severityColor[level]}`}>
                <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${level === "high" ? "text-red-600" : level === "medium" ? "text-yellow-600" : "text-blue-600"}`}>
                  {level} risk
                </p>
                <p className={`text-2xl font-bold ${level === "high" ? "text-red-700" : level === "medium" ? "text-yellow-700" : "text-blue-700"}`}>
                  {alerts.filter(a => a.severity === level).length}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">district(s)</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {alerts.map((alert, idx) => {
              const Icon = alert.icon;
              return (
                <div
                  key={idx}
                  className={`${severityColor[alert.severity]} border rounded-lg p-4 flex items-start gap-4`}
                >
                  <Icon className="w-5 h-5 mt-1 flex-shrink-0 text-gray-600" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-gray-500">{alert.type}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${severityBadge[alert.severity]}`}>
                        {alert.outbreak}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{alert.title}</h3>
                    <p className="text-sm text-gray-600 mt-0.5">{alert.location}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Alerts;
