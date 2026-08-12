import React, { useState, useEffect } from "react";
import { Loader2, MapPin, Sprout } from "lucide-react";
import { getLiveWeather, PredictionResult } from "../api/service";
import { fetchCSV } from "../utils/csvParser";

const REGIONS = [
  { name: "Bangalore", lat: 12.9716, lng: 77.5946 },
  { name: "Chikmangaluru", lat: 13.3161, lng: 75.7720 },
  { name: "Davangere", lat: 14.4644, lng: 75.9218 },
  { name: "Gulbarga", lat: 17.3297, lng: 76.8343 },
  { name: "Hassan", lat: 13.0068, lng: 76.1004 },
  { name: "Kasaragodu", lat: 12.4965, lng: 74.9897 },
  { name: "Kodagu", lat: 12.3375, lng: 75.8069 },
  { name: "Madikeri", lat: 12.4244, lng: 75.7382 },
  { name: "Mangalore", lat: 12.9141, lng: 74.8560 },
  { name: "Mysuru", lat: 12.2958, lng: 76.6394 },
  { name: "Raichur", lat: 16.2120, lng: 77.3439 }
];

const CROPS = [
  "Arecanut",
  "Blackgram",
  "Cashew",
  "Cocoa",
  "Coconut",
  "Cotton",
  "Ginger",
  "Groundnut",
  "Paddy",
  "Pepper",
  "Tea"
];

const getRiskColor = (risk: string) => {
  if (!risk) return "bg-gray-100 text-gray-800";
  const r = risk.toUpperCase();
  if (r === "HIGH") return "bg-red-100 text-red-600";
  if (r === "MEDIUM") return "bg-orange-100 text-orange-600";
  return "bg-green-100 text-green-600";
};

const getRiskColorBar = (risk: string) => {
  if (!risk) return "bg-gray-200";
  const r = risk.toUpperCase();
  if (r === "HIGH") return "bg-red-500 w-4/5";
  if (r === "MEDIUM") return "bg-orange-400 w-1/2";
  return "bg-green-500 w-1/4";
};

// Mapping of dataset pest names to real insect images.
// Beetles and hard-bodied insects → pest_beetle.png
// Worms and larva → pest_worm.png
// Flies, hoppers, and soft-bodied insects → pest_fly.png
// Fallback → no-pest.svg (placeholder for "no pest" category)
const pestImages: Record<string, string> = {
  "Rhinoceros Beetle": "https://upload.wikimedia.org/wikipedia/commons/e/ea/Dynastinae.jpg",
  "Red Palm Weevil": "https://upload.wikimedia.org/wikipedia/commons/0/0d/Rhynchophorus_ferrugineus_MHNT.jpg",
  "Coffee Berry Borer": "https://upload.wikimedia.org/wikipedia/commons/1/14/Hypothenemus.jpg",
  "Cocoa Pod Borer": "https://upload.wikimedia.org/wikipedia/commons/b/b6/Conogethes_punctiferalis.jpg",
  "Pollu Beetle": "https://upload.wikimedia.org/wikipedia/commons/2/2d/Phyllotreta.vittula.jpg",
  "Thrips": "https://upload.wikimedia.org/wikipedia/commons/2/2f/Thysanoptera.jpg",
  "Spindle Bug": "https://upload.wikimedia.org/wikipedia/commons/2/2f/Thysanoptera.jpg",
  "Shoot Borer": "https://upload.wikimedia.org/wikipedia/commons/5/52/Autographa_gamma_en_Trachelospermum_jasminoides_-_02.jpg",
  "Tea Mosquito Bug": "https://upload.wikimedia.org/wikipedia/commons/2/2d/Phyllotreta.vittula.jpg",
  "Brown Planthopper": "https://upload.wikimedia.org/wikipedia/commons/d/d1/Nilaparvata_lugens_439632934.jpg",
  "Stem Borer": "https://upload.wikimedia.org/wikipedia/commons/b/b0/Scirpophaga_incertulas_female_moth.png",
  "Leaf Miner": "https://upload.wikimedia.org/wikipedia/commons/3/33/Cameraria_ohridella_150893811.jpg",
  "Pod Borer": "https://upload.wikimedia.org/wikipedia/commons/f/f3/Chenille_de_Grand_porte_queue_%28macaon%29.jpg",
  "Bollworm": "https://upload.wikimedia.org/wikipedia/commons/f/f3/Chenille_de_Grand_porte_queue_%28macaon%29.jpg",
  "No Major Pest": "/images/no-pest.svg",
};

const renderPestImage = (pestName: string) => {
  const src = pestImages[pestName] || "/images/no-pest.svg";
  return (
    <img
      src={src}
      alt={pestName}
      className="w-56 h-56 object-contain drop-shadow-2xl hover:scale-110 transition-transform duration-500 ease-in-out"
    />
  );
};

export const Prediction: React.FC = () => {
  const [selectedRegionName, setSelectedRegionName] = useState(REGIONS[1].name); // Default Chikmangaluru
  const [selectedCrop, setSelectedCrop] = useState(CROPS[7]); // Default Groundnut
  
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [availableRegions, setAvailableRegions] = useState<string[]>(REGIONS.map(r => r.name));
  const [availableCrops, setAvailableCrops] = useState<string[]>(CROPS);

  useEffect(() => {
    const fetchPrediction = async () => {
      setLoading(true);
      setError(null);
      try {
        const region = REGIONS.find(r => r.name === selectedRegionName);
        if (region) {
          const response = await getLiveWeather(region.lat, region.lng, selectedCrop);
          setPrediction(response.pest_prediction);
        }
      } catch (err) {
        console.error("Prediction error:", err);
        setError("Failed to load prediction data.");
      } finally {
        setLoading(false);
      }
    };
    fetchPrediction();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegionName, selectedCrop]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const rows = await fetchCSV('/final_pest_dataset.csv');
        setCsvData(rows);
        
        const dsRegions = new Set(rows.map(r => (r['location'] || '').trim().toLowerCase()));
        const validRegions = REGIONS.filter(r => dsRegions.has(r.name.toLowerCase())).map(r => r.name);
        if (validRegions.length > 0) {
           setAvailableRegions(validRegions);
           if (!validRegions.includes(selectedRegionName)) {
               setSelectedRegionName(validRegions[0]);
           }
        }
      } catch (err) {
        console.warn('Failed to load pests CSV', err);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (csvData.length > 0) {
        const cropsForRegion = new Set(
            csvData
                .filter(r => (r['location'] || '').trim().toLowerCase() === selectedRegionName.toLowerCase())
                .map(r => {
                    const c = (r['crops'] || '').trim();
                    return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
                })
                .filter(Boolean)
        );
        const validCrops = Array.from(cropsForRegion).sort();
        if (validCrops.length > 0) {
            setAvailableCrops(validCrops);
            if (!validCrops.includes(selectedCrop)) {
                setSelectedCrop(validCrops[0]);
            }
        } else {
            setAvailableCrops(CROPS);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegionName, csvData]);

  return (
    <div className="min-h-screen p-8 bg-[#F8FAED]">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-green-700 text-xs font-semibold mb-3 tracking-widest">
          <span className="w-2 h-2 bg-green-500 rounded-sm"></span>
          DATA SOURCE: FINAL_PEST_DATASET.CSV
        </div>
        <h1 className="text-4xl font-extrabold text-gray-900 mb-2 tracking-tight">Pest Outbreak Prediction</h1>
        <p className="text-gray-600 max-w-3xl">
          Real-time insights derived from historical pest outbreak data. Select your region and crop to view
          potential pest risks.
        </p>
      </div>

      {/* Selectors */}
      <div className="flex gap-6 mb-8 w-full max-w-4xl">
        <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-green-100">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-3 tracking-widest uppercase">
            <MapPin className="w-4 h-4 text-green-600" /> SELECT REGION
          </label>
          <select
            value={selectedRegionName}
            onChange={(e) => setSelectedRegionName(e.target.value)}
            className="w-full bg-transparent text-gray-800 text-lg font-medium focus:outline-none appearance-none cursor-pointer pb-2 border-b border-gray-100"
          >
            {availableRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-green-100">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-3 tracking-widest uppercase">
            <Sprout className="w-4 h-4 text-green-600" /> SELECT CROP
          </label>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            className="w-full bg-transparent text-gray-800 text-lg font-medium focus:outline-none appearance-none cursor-pointer pb-2 border-b border-gray-100"
          >
            {availableCrops.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Result Area */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        </div>
      ) : error ? (
        <div className="text-red-500 bg-red-50 p-4 rounded-xl">{error}</div>
      ) : prediction ? (
        <div className="bg-gradient-to-br from-[#fdfdfd] to-[#f4f7eb] rounded-[32px] p-8 max-w-4xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-green-50/50">
          
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-2">Detected Pest Outbreak</p>
              <h2 className="text-4xl font-extrabold text-gray-900 mb-1">{prediction.pest}</h2>
              <p className="text-green-800 font-medium">Impacts {selectedCrop} in {selectedRegionName}</p>
            </div>
            
            <div className={`px-4 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold tracking-wider ${getRiskColor(prediction.risk)}`}>
              <span className={`w-2 h-2 rounded-full ${prediction.risk.toUpperCase() === 'HIGH' ? 'bg-red-500' : prediction.risk.toUpperCase() === 'MEDIUM' ? 'bg-orange-500' : 'bg-green-500'}`}></span>
              {prediction.risk.toUpperCase()}
            </div>
          </div>

          <div className="flex items-end justify-between mt-12 relative">
              <div className="w-48 h-48 flex items-center justify-center -ml-4">
                <div className="relative">
                  {renderPestImage(prediction.pest)}
                </div>
              </div>

            <div className="flex-1 max-w-md pb-4">
              <div className="mb-6">
                <div className="flex justify-between text-sm font-semibold text-gray-600 mb-2">
                  <span>Outbreak Level</span>
                  <span>{prediction.risk.charAt(0).toUpperCase() + prediction.risk.slice(1).toLowerCase()}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${getRiskColorBar(prediction.risk)}`}></div>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t border-gray-200/50">
                <span className="text-sm font-semibold text-gray-500">Season</span>
                <span className="text-base font-bold text-gray-900">Zaid</span>
              </div>
            </div>
          </div>
          

        </div>
      ) : null}

    </div>
  );
};

export default Prediction;
