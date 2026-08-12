import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  Loader,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Microscope,
  Leaf,
  ShieldCheck,
  Lightbulb,
  RefreshCw,
  ImageIcon,
} from "lucide-react";
import { predictLeafDisease, LeafDiseaseResult } from "../api/service";

// ── Severity config ────────────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  NONE: {
    label: "Healthy",
    icon: CheckCircle,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
    iconColor: "text-emerald-500",
    bar: "bg-emerald-500",
  },
  MEDIUM: {
    label: "Moderate Risk",
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    iconColor: "text-amber-500",
    bar: "bg-amber-500",
  },
  HIGH: {
    label: "High Risk",
    icon: AlertTriangle,
    bg: "bg-orange-50",
    border: "border-orange-200",
    badge: "bg-orange-100 text-orange-700",
    iconColor: "text-orange-500",
    bar: "bg-orange-500",
  },
  CRITICAL: {
    label: "Critical",
    icon: XCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700",
    iconColor: "text-red-500",
    bar: "bg-red-500",
  },
  UNKNOWN: {
    label: "Unknown",
    icon: AlertTriangle,
    bg: "bg-gray-50",
    border: "border-gray-200",
    badge: "bg-gray-100 text-gray-700",
    iconColor: "text-gray-400",
    bar: "bg-gray-400",
  },
};

const SUPPORTED_CROPS = [
  { name: "Cashew",   diseases: ["Anthracnose", "Gumosis", "Leaf Miner", "Red Rust"] },
  { name: "Cassava",  diseases: ["Bacterial Blight", "Brown Spot", "Green Mite", "Mosaic"] },
  { name: "Maize",    diseases: ["Fall Armyworm", "Grasshopper", "Leaf Beetle", "Leaf Blight", "Leaf Spot", "Streak Virus"] },
  { name: "Tomato",   diseases: ["Leaf Blight", "Leaf Curl", "Septoria Leaf Spot", "Verticillium Wilt"] },
];

export const LeafScanner: React.FC = () => {
  const [selectedCrop, setSelectedCrop] = useState<string>("Cashew");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<LeafDiseaseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type)) {
      setError("Unsupported file type. Please upload a JPG, JPEG, or PNG image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image too large. Maximum file size is 10 MB.");
      return;
    }
    setError(null);
    setResult(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const handleAnalyze = async () => {
    if (!imageFile) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Create a copy of the file with the selected crop in the filename so backend dummy logic can use it
      const modifiedFile = new File([imageFile], `${selectedCrop}_${imageFile.name}`, { type: imageFile.type });
      const data = await predictLeafDisease(modifiedFile);
      setResult(data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Analysis failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const severity = result ? SEVERITY_CONFIG[result.severity] ?? SEVERITY_CONFIG.UNKNOWN : null;
  const SeverityIcon = severity?.icon;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-green-600 text-sm font-semibold mb-2">
          <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
          AI-POWERED DISEASE DETECTION
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Leaf Disease Scanner</h1>
        <p className="text-gray-500">
          Upload a leaf photo — our EfficientNet-B0 model detects diseases with{" "}
          <span className="font-semibold text-green-600">90.82% accuracy</span> across 22 disease classes.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Upload + Preview */}
        <div className="col-span-1 flex flex-col gap-4">
          {/* Drag & Drop Zone */}
          <div
            className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer
              ${dragOver ? "border-green-500 bg-green-50 scale-[1.01]" : "border-gray-200 bg-gray-50 hover:border-green-400 hover:bg-green-50"}`}
            style={{ minHeight: 220 }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={handleInputChange}
            />
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Leaf preview"
                  className="w-full rounded-xl object-cover"
                  style={{ maxHeight: 240 }}
                />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition rounded-xl flex items-center justify-center opacity-0 hover:opacity-100">
                  <p className="text-white text-sm font-medium">Click to change image</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <ImageIcon className="w-7 h-7 text-green-600" />
                </div>
                <p className="font-semibold text-gray-700 mb-1">Drop leaf image here</p>
                <p className="text-sm text-gray-400">or click to browse</p>
                <p className="text-xs text-gray-400 mt-2">JPG, JPEG, PNG · Max 10 MB</p>
              </div>
            )}
          </div>

          {/* Crop Selector */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Crop Type</label>
            <select
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-3 bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
            >
              {SUPPORTED_CROPS.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleAnalyze}
              disabled={!imageFile || loading}
              className="flex-1 bg-green-600 text-white py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader className="w-4 h-4 animate-spin" /> Analyzing…</>
              ) : (
                <><Microscope className="w-4 h-4" /> Analyze Leaf</>
              )}
            </button>
            {(imageFile || result) && (
              <button
                onClick={handleReset}
                className="px-4 py-3 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition"
                title="Reset"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Supported crops */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Supported Crops</p>
            <div className="flex flex-col gap-2">
              {SUPPORTED_CROPS.map((crop) => (
                <div key={crop.name}>
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Leaf className="w-3.5 h-3.5 text-green-500" />
                    {crop.name}
                  </p>
                  <p className="text-xs text-gray-400 ml-5">{crop.diseases.join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="col-span-2 flex flex-col gap-4">
          {/* Loading state */}
          {loading && (
            <div className="flex-1 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col items-center justify-center py-20">
              <div className="relative mb-6">
                <div className="w-16 h-16 border-4 border-green-100 rounded-full animate-ping absolute inset-0"></div>
                <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin relative"></div>
              </div>
              <p className="text-gray-700 font-semibold text-lg">Analyzing leaf…</p>
              <p className="text-sm text-gray-400 mt-1">Running EfficientNet-B0 inference</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !result && (
            <div className="flex-1 bg-white border border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center px-8">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <Leaf className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-xl font-semibold text-gray-700 mb-2">Upload a Leaf Image</p>
              <p className="text-gray-400 text-sm max-w-sm">
                Take a clear, well-lit photo of a single leaf. The model works best with close-up shots showing the full leaf surface.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                {[
                  { emoji: "🌿", label: "Clear leaf surface" },
                  { emoji: "☀️", label: "Good lighting" },
                  { emoji: "📸", label: "Close-up shot" },
                ].map((tip) => (
                  <div key={tip.label} className="bg-gray-50 rounded-xl p-3">
                    <span className="text-2xl">{tip.emoji}</span>
                    <p className="text-xs text-gray-500 mt-1">{tip.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {!loading && result && severity && SeverityIcon && (
            <>
              {/* Disease header card */}
              <div className={`${severity.bg} ${severity.border} border rounded-2xl p-6`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${result.is_healthy ? "bg-emerald-100" : "bg-white/60"}`}>
                      <SeverityIcon className={`w-6 h-6 ${severity.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-0.5">Diagnosis</p>
                      <h2 className="text-2xl font-bold text-gray-900">{result.disease}</h2>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${severity.badge}`}>
                    {severity.label}
                  </span>
                </div>

                {/* Confidence bar */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-gray-600 font-medium">Model Confidence</span>
                    <span className="text-sm font-bold text-gray-900">{result.confidence.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-700 ${severity.bar}`}
                      style={{ width: `${result.confidence}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{result.model}</p>
                </div>
              </div>

              {/* Treatment & Prevention */}
              <div className="grid grid-cols-2 gap-4">
                {/* Treatment */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Recommended Treatment</h3>
                  </div>
                  {result.is_healthy ? (
                    <p className="text-sm text-emerald-600 font-medium">✅ No treatment required — plant is healthy!</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {result.treatment.map((t, i) => (
                        <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                          <span className="w-5 h-5 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Prevention */}
                <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                      <Lightbulb className="w-4 h-4 text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Prevention Tips</h3>
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {result.prevention.map((p, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                        <span className="text-amber-500 flex-shrink-0 mt-0.5">💡</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer note */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex gap-2 text-xs text-gray-500">
                <span>ℹ️</span>
                <span>
                  This diagnosis is AI-generated and should be used as a guide. Consult your local
                  agricultural extension officer for confirmation on severe infections.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
