import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface WeatherInput {
  temperature: number;
  humidity: number;
  rainfall: number;
  wind: number;
  location?: string;
  lat?: number;
  lng?: number;
  crop?: string;
}

export interface PredictionResult {
  pest: string;
  scientific: string;
  pest_key: string;
  risk: string;
  confidence: number;
  recommendation: string;
  timestamp: string;
}

export interface CropRecommendation {
  crop: string;
  suitability: string;
  temperature_range: string;
  humidity_range: string;
  pest_risk: string;
  management: string;
}

export interface LiveWeatherResponse {
  location: string;
  temperature: number;
  humidity: number;
  rainfall: number;
  wind: number;
  description: string;
  crops_suggested: CropRecommendation[];
  pest_prediction: PredictionResult;
}

export const predictPest = async (weather: WeatherInput): Promise<PredictionResult> => {
  const response = await api.post("/predict", weather);
  return response.data;
};

export const getHistory = async (limit: number = 10): Promise<PredictionResult[]> => {
  const response = await api.get("/history", { params: { limit } });
  return response.data;
};

export const getLiveWeather = async (lat?: number, lng?: number, crop?: string): Promise<LiveWeatherResponse> => {
  const params: Record<string, any> = {};
  if (lat !== undefined && lng !== undefined) {
    params.lat = lat;
    params.lng = lng;
  }
  if (crop !== undefined) {
    params.crop = crop;
  }
  const response = await api.get("/live-weather", { params });
  return response.data;
};

export interface ChatResponse {
  response: string;
}

export interface LeafAnalysisResponse {
  pathology: string;
  chlorophyll: string;
  probability: string;
  confidence: string;
  message: string;
  demo_mode: boolean;
}

export const sendChatMessage = async (message: string): Promise<ChatResponse> => {
  const response = await api.post("/chat", { message });
  return response.data;
};

export const analyzeLeafImage = async (file: File): Promise<LeafAnalysisResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/analyze-leaf", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

// ── EfficientNet-B0 Leaf Disease Prediction ───────────────────────────────────

export interface LeafDiseaseResult {
  disease: string;
  confidence: number;
  severity: "NONE" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";
  treatment: string[];
  prevention: string[];
  is_healthy: boolean;
  model: string;
}

export const predictLeafDisease = async (file: File): Promise<LeafDiseaseResult> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/predict-leaf", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export default api;
