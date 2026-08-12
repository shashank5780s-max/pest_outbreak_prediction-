import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";

import DISTRICTS, { DistrictPoint, resolveDistrictName } from "../data/karnatakaDistricts";
import { fetchCSV } from "../utils/csvParser";
import { Search, Filter, Loader2 } from "lucide-react";

type DistrictData = DistrictPoint & {
  pest: string;
  crop: string;
  outbreak: string;
  rainfall: number;
  temperature: number;
  humidity: number;
  recommendation: string;
  reportCount: number;
};

const normalizeValue = (value: unknown) => String(value ?? "").trim();

const outbreakPriority = (rows: any[]) => {
  const hasHigh = rows.some(row => /high/i.test(row.outbreak || ""));
  if (hasHigh) return "High";
  const hasMedium = rows.some(row => /med/i.test(row.outbreak || ""));
  if (hasMedium) return "Medium";
  return "Low";
};

function mostCommon(values: string[]) {
  const frequency: Record<string, number> = {};
  values.forEach(value => {
    const trimmed = value.trim();
    if (!trimmed) return;
    frequency[trimmed] = (frequency[trimmed] || 0) + 1;
  });
  return Object.keys(frequency).sort((a, b) => frequency[b] - frequency[a])[0] || "Unknown";
}

function recommendationFor(outbreak: string) {
  if (/high/i.test(outbreak)) return "Immediate intervention required. Apply targeted controls.";
  if (/med|medium/i.test(outbreak)) return "Monitor closely and apply targeted interventions.";
  return "Maintain routine monitoring.";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function colorForOutbreak(outbreak: string) {
  if (/critical/i.test(outbreak)) return "#dc2626"; // red-600
  if (/high/i.test(outbreak)) return "#ea580c"; // orange-600
  if (/med|medium/i.test(outbreak)) return "#eab308"; // yellow-500
  return "#10b981"; // emerald-500
}

const getRiskColorText = (outbreak: string) => {
  if (/critical/i.test(outbreak)) return "text-red-600";
  if (/high/i.test(outbreak)) return "text-orange-600";
  if (/med|medium/i.test(outbreak)) return "text-yellow-600";
  return "text-emerald-600";
};

function popupHtml(item: DistrictData) {
  const isHighRisk = /high|critical/i.test(item.outbreak);
  return `
    <div class="font-sans min-w-[280px] p-1">
      <div class="mb-3">
        <h3 class="text-lg font-bold text-gray-900">${escapeHtml(item.name)}</h3>
        <p class="text-xs font-semibold uppercase tracking-wider ${getRiskColorText(item.outbreak)} flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: ${colorForOutbreak(item.outbreak)}"></span>
          ${escapeHtml(item.outbreak)} RISK
        </p>
      </div>
      
      <div class="bg-gray-50 rounded-xl p-3 mb-3 border border-gray-100">
        <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Primary Threat</p>
        <p class="text-sm font-semibold text-gray-900 leading-tight">${item.pest === 'Unknown' || item.pest === 'No Major Pest' ? 'Stable' : escapeHtml(item.pest)}</p>
        <p class="text-xs text-emerald-600 font-medium">on ${item.crop === 'Unknown' ? 'Multiple Crops' : escapeHtml(item.crop)}</p>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-4">
        <div class="border border-gray-100 rounded-lg p-2 text-center bg-white">
          <p class="text-[10px] text-gray-400 font-medium mb-0.5">Temp</p>
          <p class="text-xs font-semibold text-gray-800">${item.temperature.toFixed(1)}°C</p>
        </div>
        <div class="border border-gray-100 rounded-lg p-2 text-center bg-white">
          <p class="text-[10px] text-gray-400 font-medium mb-0.5">Humid</p>
          <p class="text-xs font-semibold text-gray-800">${item.humidity.toFixed(1)}%</p>
        </div>
        <div class="border border-gray-100 rounded-lg p-2 text-center bg-white">
          <p class="text-[10px] text-gray-400 font-medium mb-0.5">Rain</p>
          <p class="text-xs font-semibold text-gray-800">${item.rainfall.toFixed(1)}mm</p>
        </div>
      </div>

      <div>
        <p class="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Recommendation</p>
        <p class="text-xs text-gray-700 leading-snug">${escapeHtml(item.recommendation)}</p>
      </div>
    </div>
  `;
}

const ClusterLayer: React.FC<{ items: DistrictData[] }> = ({ items }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !L || !(L as any).markerClusterGroup) return;

    const group = (L as any).markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });

    items.forEach(item => {
      const icon = L.divIcon({
        className: "custom-div-icon",
        html: `<div class="w-4 h-4 rounded-full border-2 border-white shadow-md" style="background-color: ${colorForOutbreak(item.outbreak)}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([item.lat, item.lng], {
        icon,
        title: item.name,
      });

      marker.bindPopup(popupHtml(item), { className: 'custom-popup rounded-2xl' });
      group.addLayer(marker);
    });

    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [items, map]);

  return null;
};

const MapFocus: React.FC<{ items: DistrictData[] }> = ({ items }) => {
  const map = useMap();

  useEffect(() => {
    if (!items.length) {
      map.setView([14.0, 76.0], 6);
      return;
    }

    if (items.length === 1) {
      map.setView([items[0].lat, items[0].lng], 9);
      return;
    }

    const bounds = L.latLngBounds(items.map(item => [item.lat, item.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [items, map]);

  return null;
};

export const FieldMap: React.FC = () => {
  const [dataRows, setDataRows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const csvPromise = fetchCSV("/final_pest_dataset.csv")
      .then(rows => setDataRows(rows))
      .catch(() => setDataRows([]));

    const geoPromise = fetch("https://raw.githubusercontent.com/adarshbiradar/maps-geojson/master/states/karnataka.json")
      .then(res => res.json())
      .then(data => setGeoJsonData(data))
      .catch(console.error);

    Promise.allSettled([csvPromise, geoPromise]).then(() => setDataLoading(false));
  }, []);

  const districtSummaries = useMemo(() => {
    const groupedRows = new Map<string, any[]>();

    dataRows.forEach(row => {
      const location = normalizeValue(row.location || row.Location || row.district || row.District);
      if (!location) return;

      const districtName = resolveDistrictName(location);
      if (!districtName) return;

      const existingRows = groupedRows.get(districtName) || [];
      existingRows.push(row);
      groupedRows.set(districtName, existingRows);
    });

    return DISTRICTS.map(district => {
      const matches = groupedRows.get(district.name) || [];
      const pest = mostCommon(matches.map(match => normalizeValue(match.pest || match.Pest || match.pest_name || "")));
      const crop = mostCommon(matches.map(match => normalizeValue(match.crops || match.crop || match.Crops || "")));
      const outbreak = matches.length ? outbreakPriority(matches) : "Low";
      const rainfall = matches.length
        ? Number((matches.reduce((sum, row) => sum + (Number(row.rainfall) || 0), 0) / matches.length).toFixed(1))
        : 0;
      const temperature = matches.length
        ? Number((matches.reduce((sum, row) => sum + (Number(row.temperature) || 0), 0) / matches.length).toFixed(1))
        : 0;
      const humidity = matches.length
        ? Number((matches.reduce((sum, row) => sum + (Number(row.humidity) || 0), 0) / matches.length).toFixed(1))
        : 0;

      return {
        ...district,
        pest,
        crop,
        outbreak,
        rainfall,
        temperature,
        humidity,
        recommendation: recommendationFor(outbreak),
        reportCount: matches.length,
      };
    });
  }, [dataRows]);

  const stats = useMemo(() => {
    return {
      low: districtSummaries.filter(d => /low/i.test(d.outbreak)).length,
      medium: districtSummaries.filter(d => /med/i.test(d.outbreak)).length,
      high: districtSummaries.filter(d => /high/i.test(d.outbreak)).length,
      critical: districtSummaries.filter(d => /critical/i.test(d.outbreak)).length,
    };
  }, [districtSummaries]);

  const visibleDistricts = useMemo(
    () => districtSummaries.filter(district => district.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [districtSummaries, searchQuery],
  );

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-green-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading district pest data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAED] p-8 font-sans">
      
      {/* Header Card */}
      <div className="bg-white rounded-[32px] p-8 shadow-sm border border-emerald-50 mb-8 flex flex-col xl:flex-row xl:items-center justify-between gap-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full mb-4">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
            <span className="text-[10px] font-bold text-emerald-700 tracking-widest uppercase">Karnataka Live District Monitoring</span>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">Field Monitoring Network</h1>
          <p className="text-gray-500 font-medium">Real-time dataset-driven outbreak analysis across all 31 Karnataka districts.<br/>Visualizing pest pressure, crop vulnerability, and atmospheric conditions.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 min-w-[120px] flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.low}</div>
              <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Low Risk</div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 min-w-[120px] flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></span>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.medium}</div>
              <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Medium Risk</div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 min-w-[120px] flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-orange-500 rounded-full"></span>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.high}</div>
              <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">High Risk</div>
            </div>
          </div>
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 min-w-[120px] flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span>
            <div>
              <div className="text-2xl font-bold text-gray-900">{stats.critical}</div>
              <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Critical</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Main Map Area */}
        <div className="lg:col-span-3 bg-white rounded-[32px] shadow-sm border border-emerald-50 overflow-hidden flex flex-col">
          <div className="px-8 py-6 flex items-center justify-between border-b border-gray-50">
            <div>
              <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-1">Regional Outbreak Map</p>
              <h2 className="text-2xl font-bold text-gray-900">Dynamic District Hotspots</h2>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Find district..." 
                  className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="px-4 py-2 border border-gray-200 rounded-full text-xs font-bold text-gray-600 tracking-wider uppercase">
                Live Data
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-h-[600px] relative">
            <MapContainer 
              center={[14.8, 76.0]} 
              zoom={6.5} 
              minZoom={6}
              maxZoom={9} 
              maxBounds={[
                [11.0, 73.5], // South-West
                [19.0, 79.0]  // North-East
              ]}
              maxBoundsViscosity={1.0}
              style={{ height: "100%", width: "100%", zIndex: 1, backgroundColor: "#f8fafc" }}
              zoomControl={false}
            >
              {geoJsonData && (
                <GeoJSON 
                  data={geoJsonData} 
                  style={{
                    fillColor: "#e2e8f0", // Light greyish background for the state
                    weight: 2,
                    opacity: 1,
                    color: "#10b981", // Emerald border
                    fillOpacity: 0.8
                  }} 
                />
              )}
              <MapFocus items={visibleDistricts} />
              <ClusterLayer items={visibleDistricts} />
            </MapContainer>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Legend */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-emerald-50">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-1">Risk Legend</p>
                <h3 className="text-lg font-bold text-gray-900">Severity Scale</h3>
              </div>
              <div className="text-emerald-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M3 12h18"/><path d="m18 6-6 6"/><path d="m6 6 6 6"/></svg>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between px-4 py-3 bg-emerald-50/50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                  <span className="text-sm font-semibold text-gray-900">Low Risk</span>
                </div>
                <span className="text-xs font-bold text-emerald-600">{stats.low}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-yellow-50/50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></span>
                  <span className="text-sm font-semibold text-gray-900">Medium Risk</span>
                </div>
                <span className="text-xs font-bold text-yellow-600">{stats.medium}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-orange-50/50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-orange-500 rounded-full"></span>
                  <span className="text-sm font-semibold text-gray-900">High Risk</span>
                </div>
                <span className="text-xs font-bold text-orange-600">{stats.high}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-red-50/50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 bg-red-600 rounded-full"></span>
                  <span className="text-sm font-semibold text-gray-900">Critical Risk</span>
                </div>
                <span className="text-xs font-bold text-red-600">{stats.critical}</span>
              </div>
            </div>
          </div>

          {/* Watchlist */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-emerald-50 flex-1 h-[calc(100%-350px)] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-1">Region Watchlist</p>
                <h3 className="text-lg font-bold text-gray-900">District Alerts</h3>
              </div>
              <button className="p-2 text-gray-400 hover:text-emerald-600 transition-colors">
                <Filter className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {visibleDistricts.map(district => {
                const isHighRisk = /high|critical/i.test(district.outbreak);
                return (
                  <div 
                    key={district.name} 
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isHighRisk 
                        ? 'bg-orange-50/30 border-orange-100 hover:border-orange-300' 
                        : 'bg-white border-gray-100 hover:border-emerald-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm mb-0.5">{district.name}</h4>
                        <p className="text-xs text-gray-500 font-medium">{district.pest === 'Unknown' || district.pest === 'No Major Pest' ? 'Stable' : district.pest}</p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${getRiskColorText(district.outbreak)}`}>
                        {district.outbreak}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
      
      {/* Global styles for leaflet popup */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 1rem;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          padding: 0;
          overflow: hidden;
        }
        .custom-popup .leaflet-popup-content {
          margin: 12px;
        }
        .custom-popup .leaflet-popup-tip {
          background: white;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      ` }} />
    </div>
  );
};

export default FieldMap;
