"""
AgriPredict Backend — FastAPI Application
==========================================
Serves pest prediction, live weather, AI brain, and district data APIs.

Prediction strategy (predict_pest_logic):
  1. [MODEL]     XGBRegressor predicts a pest-pressure index (continuous score)
                 from weather features + optional lag/location features.
                 The model output is mapped to a 0–100 confidence scale.
  2. [HEURISTIC] CSV lookup (final_pest_dataset.csv) selects the most likely
                 pest name for the given crop/location based on historical records
                 and provides a historical outbreak confidence.
  3. [BLEND]     final_confidence = 0.70 × model_score + 0.30 × historical_score
                 If model features are unavailable, falls back to CSV-only.
"""

import csv
import datetime
import logging
import os
import base64

import joblib
import numpy as np
import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from typing import Any, Dict, List, Optional
import warnings

# Leaf disease inference (EfficientNet-B0) — optional; gracefully degrades if torch not installed
try:
    from app.leaf_inference import predict_leaf_disease, is_model_available
    LEAF_MODEL_AVAILABLE = is_model_available()
except ImportError:
    LEAF_MODEL_AVAILABLE = False
    predict_leaf_disease = None  # type: ignore
    logger_bootstrap = logging.getLogger("agripredict")
    logger_bootstrap.warning("PyTorch not installed — /predict-leaf will return 503 until torch is installed")

warnings.filterwarnings("ignore", category=UserWarning, module="pickle")
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")
warnings.filterwarnings("ignore", category=UserWarning, module="xgboost")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("agripredict")

# ── Environment ───────────────────────────────────────────────────────────────
load_dotenv()
SUPABASE_URL = os.getenv("PROJECT_URL")
SUPABASE_KEY = os.getenv("API_KEY")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")
KARNATAKA_LAT = float(os.getenv("KARNATAKA_LAT", "15.3173"))
KARNATAKA_LNG = float(os.getenv("KARNATAKA_LNG", "75.7139"))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
# Comma-separated list of allowed frontend origins
FRONTEND_ORIGINS = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",")
    if o.strip()
]

openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# ── Rate Limiter ───────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title="AgriPredict Pest Prediction API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load ML model and label encoders ─────────────────────────────────────────
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
MODEL_PATH = os.path.join(ROOT, "rice_pest_model.pkl")
ENCODER_PATH = os.path.join(ROOT, "label_encoders.pkl")

try:
    model = joblib.load(MODEL_PATH)
    logger.info("ML model loaded: %s", model.__class__.__name__)
except Exception as exc:
    raise RuntimeError(f"Failed to load model from {MODEL_PATH}: {exc}") from exc

try:
    label_encoders: Dict[str, Any] = joblib.load(ENCODER_PATH)
    logger.info("Label encoders loaded. Keys: %s", list(label_encoders.keys()))
except Exception as exc:
    raise RuntimeError(f"Failed to load label encoders from {ENCODER_PATH}: {exc}") from exc

# ── Model feature metadata (discovered via scripts/inspect_model.py) ──────────
# Model: XGBRegressor — predicts a pest-pressure index (continuous regression)
# Features (16 total):
#   Numeric: MaxT, MinT, RH1(%), RH2(%), RF(mm), WS(kmph), SSH(hrs), EVP(mm)
#   Lag:     MaxT_Lag1, MaxT_Lag2, RH1_Lag1
#   One-hot: Location_Cuttack, Location_Ludhiana, Location_Maruteru,
#            Location_Raipur, Location_Rajendranagar
# Output: Raw regression score → mapped to 0–100 pest pressure index
MODEL_FEATURE_NAMES = [
    "MaxT", "MinT", "RH1(%)", "RH2(%)", "RF(mm)", "WS(kmph)",
    "SSH(hrs)", "EVP(mm)", "MaxT_Lag1", "MaxT_Lag2", "RH1_Lag1",
    "Location_Cuttack", "Location_Ludhiana", "Location_Maruteru",
    "Location_Raipur", "Location_Rajendranagar",
]

# Calibration: model raw scores — empirically map to 0–100 range
# XGBRegressor output was unbounded; we clip to [0, 100] after scaling.
# These bounds were determined from a quick scan of training data range.
MODEL_RAW_MIN = -2.0
MODEL_RAW_MAX = 10.0


def model_score_to_confidence(raw_score: float) -> float:
    """
    [MODEL] Map the XGBRegressor raw pest-pressure score to a 0–100 confidence.
    The model output represents pest pressure intensity (higher = more risk).
    """
    clamped = max(MODEL_RAW_MIN, min(MODEL_RAW_MAX, raw_score))
    normalized = (clamped - MODEL_RAW_MIN) / (MODEL_RAW_MAX - MODEL_RAW_MIN)
    return round(normalized * 100, 2)


def build_model_features(
    max_temp: float,
    min_temp: float,
    rh1: float,
    rh2: float,
    rainfall: float,
    wind: float,
) -> np.ndarray:
    """
    [MODEL] Build the 16-feature input vector for the XGBRegressor.
    Lag features (MaxT_Lag1, MaxT_Lag2, RH1_Lag1) and location one-hots
    are not available from a single real-time request, so we use the
    current-cycle values as reasonable proxies for lag features, and
    zero out the location one-hots (the model was trained on non-Karnataka
    locations — all location columns = 0 means 'none of those sites').
    """
    # Estimate sunshine hours from time of year / humidity (simple proxy)
    # No actual SSH data available; use 8 hrs as Karnataka average
    ssh_estimate = 8.0
    # Evaporation proxy: rough function of temperature and humidity
    evp_estimate = max(0.0, (max_temp - 20) * 0.3 + (100 - rh1) * 0.05)

    features = [
        max_temp,       # MaxT
        min_temp,       # MinT
        rh1,            # RH1(%)  — morning humidity
        rh2,            # RH2(%)  — afternoon (proxy: rh1 * 0.85)
        rainfall,       # RF(mm)
        wind,           # WS(kmph)
        ssh_estimate,   # SSH(hrs) — sunshine hours (proxy)
        evp_estimate,   # EVP(mm)  — evaporation (proxy)
        max_temp,       # MaxT_Lag1 (no lag available; use current)
        max_temp,       # MaxT_Lag2 (no lag available; use current)
        rh1,            # RH1_Lag1  (no lag available; use current)
        0,              # Location_Cuttack  (not Karnataka)
        0,              # Location_Ludhiana (not Karnataka)
        0,              # Location_Maruteru (not Karnataka)
        0,              # Location_Raipur   (not Karnataka)
        0,              # Location_Rajendranagar (not Karnataka)
    ]
    return np.array([features], dtype=np.float32)


def run_model(max_temp: float, min_temp: float, humidity: float, rainfall: float, wind: float) -> Optional[float]:
    """
    [MODEL] Call the XGBRegressor and return confidence score (0–100).
    Returns None if the model call fails, so callers can fall back gracefully.
    """
    try:
        rh2 = humidity * 0.85  # afternoon humidity proxy
        feature_vector = build_model_features(max_temp, min_temp, humidity, rh2, rainfall, wind)
        raw_score = float(model.predict(feature_vector)[0])
        confidence = model_score_to_confidence(raw_score)
        logger.info("Model raw score=%.4f → confidence=%.1f%%", raw_score, confidence)
        return confidence
    except Exception as exc:
        logger.error("Model prediction failed: %s", exc)
        return None


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class WeatherInput(BaseModel):
    temperature: float = Field(..., description="Temperature in °C")
    humidity: float = Field(..., description="Relative humidity %")
    rainfall: float = Field(..., description="Rainfall mm in last hour")
    wind: float = Field(..., description="Wind speed km/h")
    location: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    crop: Optional[str] = None

    @field_validator("humidity")
    @classmethod
    def validate_humidity(cls, v):
        if not 0 <= v <= 100:
            raise ValueError("humidity must be between 0 and 100")
        return v

    @field_validator("temperature")
    @classmethod
    def validate_temperature(cls, v):
        if not -10 <= v <= 60:
            raise ValueError("temperature must be between -10\u00b0C and 60\u00b0C")
        return v

    @field_validator("rainfall")
    @classmethod
    def validate_rainfall(cls, v):
        if v < 0:
            raise ValueError("rainfall cannot be negative")
        return v

    @field_validator("wind")
    @classmethod
    def validate_wind(cls, v):
        if v < 0:
            raise ValueError("wind speed cannot be negative")
        return v


class PredictionResult(BaseModel):
    pest: str
    scientific: str
    pest_key: str
    risk: str
    confidence: float
    recommendation: str
    timestamp: datetime.datetime
    source: str = "model+heuristic"  # documents which path was taken


class CropRecommendation(BaseModel):
    crop: str
    suitability: str
    temperature_range: str
    humidity_range: str
    pest_risk: str
    management: str


class LiveWeatherResponse(BaseModel):
    location: str
    temperature: float
    humidity: float
    rainfall: float
    wind: float
    description: str
    crops_suggested: List[CropRecommendation]
    pest_prediction: PredictionResult


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)


class ChatResponse(BaseModel):
    response: str


class LeafAnalysisResponse(BaseModel):
    pathology: str
    chlorophyll: str
    probability: str
    confidence: str
    message: str
    demo_mode: bool = False


# ── Crop database (Karnataka climate) ────────────────────────────────────────
CROP_DATABASE = {
    "rice":      {"temp": (18, 32), "humidity": (60, 100), "pests": ["armyworm", "whitefly", "locust"], "season": "June-Dec"},
    "sugarcane": {"temp": (20, 30), "humidity": (50, 80),  "pests": ["aphid", "armyworm"], "season": "Jan-Dec"},
    "maize":     {"temp": (18, 27), "humidity": (50, 70),  "pests": ["armyworm", "locust"], "season": "Jun-Sep"},
    "cotton":    {"temp": (24, 30), "humidity": (40, 70),  "pests": ["whitefly", "aphid"], "season": "Jun-Oct"},
    "groundnut": {"temp": (25, 30), "humidity": (50, 70),  "pests": ["aphid", "armyworm"], "season": "May-Sep"},
    "coffee":    {"temp": (15, 24), "humidity": (60, 90),  "pests": ["whitefly", "aphid"], "season": "Oct-Mar"},
}

# ── Pest info lookup ─────────────────────────────────────────────────────────
PEST_INFO = {
    "leaf miner":       {"scientific": "Aproaerema modicella",    "recommendation": "Install light traps and monitor damage on groundnut leaves. Use safe insecticides if damage > 10%."},
    "spindle bug":      {"scientific": "Carvalhoia arecae",       "recommendation": "Apply phorate granules to leaf axils and ensure proper drainage."},
    "stem borer":       {"scientific": "Scirpophaga incertulas",  "recommendation": "Remove affected tillers and use trichogramma egg parasitoids."},
    "pollu beetle":     {"scientific": "Lanka ramakrishnai",      "recommendation": "Regulate shade and spray neem extract during early berry formation."},
    "pink bollworm":    {"scientific": "Pectinophora gossypiella","recommendation": "Use pheromone traps and spray recommended insecticides at squaring stage."},
    "whitefly":         {"scientific": "Bemisia tabaci",          "recommendation": "Maintain routine scouting; use yellow sticky traps and neem oil spray."},
    "tea mosquito bug": {"scientific": "Helopeltis antonii",      "recommendation": "Monitor tender shoots and apply systemic insecticides if damage is visible."},
    "mealybug":         {"scientific": "Planococcus citri",       "recommendation": "Introduce predatory ladybirds and spray soap water or neem oil."},
    "rhinoceros beetle":{"scientific": "Oryctes rhinoceros",      "recommendation": "Use pheromone traps and apply Metarhizium anisopliae fungal treatment."},
    "shoot borer":      {"scientific": "Conogethes punctiferalis","recommendation": "Prune affected shoots and apply targeted biopesticides."},
    "red spider mite":  {"scientific": "Oligonychus coffeae",     "recommendation": "Ensure adequate shade and spray specific acaricides if population crosses threshold."},
    "aphid":            {"scientific": "Aphidoidea spp.",         "recommendation": "Inspect leaf undersides and consider neem-based foliar spray."},
    "locust":           {"scientific": "Schistocerca gregaria",   "recommendation": "Monitor neighboring sectors and prepare biopesticide reserves."},
    "armyworm":         {"scientific": "Spodoptera frugiperda",   "recommendation": "Set pheromone traps in maize sectors tonight."},
}


def map_risk(confidence: float) -> str:
    if confidence >= 80:
        return "HIGH"
    if confidence >= 55:
        return "MEDIUM"
    return "LOW"


# ── Weather helpers ───────────────────────────────────────────────────────────

SAMPLE_WEATHER = {
    "temperature": 28.5,
    "humidity": 65,
    "rainfall": 0.2,
    "wind": 8.2,
    "description": "Partly cloudy",
    "location": "Karnataka (Demo — add OPENWEATHER_API_KEY for live data)",
    "is_sample": True,
}


def _is_placeholder_key(key: str) -> bool:
    """True when the env var still holds the .env.example placeholder text."""
    return not key or key.startswith("<") or "your" in key.lower()


def get_live_weather_data(lat: float, lng: float) -> Optional[Dict]:
    """[EXTERNAL] Fetch live weather from OpenWeatherMap API.

    Falls back to realistic Karnataka sample data when:
      - OPENWEATHER_API_KEY is not set or is still the placeholder value
      - The API returns 401/403 (invalid key)
      - Any network/timeout error
    The Dashboard always gets a usable response.
    """
    if _is_placeholder_key(OPENWEATHER_API_KEY or ""):
        logger.info("OPENWEATHER_API_KEY not configured — using sample weather data")
        return SAMPLE_WEATHER.copy()
    try:
        url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?lat={lat}&lon={lng}&appid={OPENWEATHER_API_KEY}&units=metric"
        )
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        location_name = data.get("name") or f"{lat:.2f}, {lng:.2f}"
        return {
            "temperature": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
            "rainfall": data.get("rain", {}).get("1h", 0),
            "wind": data["wind"]["speed"],
            "description": data["weather"][0]["description"],
            "location": location_name,
            "is_sample": False,
        }
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else 0
        if status in (401, 403):
            logger.warning(
                "OpenWeatherMap key rejected (%s) — using sample weather data. "
                "Set a valid OPENWEATHER_API_KEY in backend/.env",
                status,
            )
            return SAMPLE_WEATHER.copy()
        logger.error("Weather fetch HTTP error for lat=%s lng=%s: %s", lat, lng, exc)
        return SAMPLE_WEATHER.copy()
    except requests.RequestException as exc:
        logger.error("Weather fetch error for lat=%s lng=%s: %s", lat, lng, exc)
        return SAMPLE_WEATHER.copy()


def get_suitable_crops(temperature: float, humidity: float) -> List[CropRecommendation]:
    """Return crop recommendations based on current weather conditions."""
    suitable = []
    for crop, info in CROP_DATABASE.items():
        t_min, t_max = info["temp"]
        h_min, h_max = info["humidity"]
        if t_min <= temperature <= t_max and h_min <= humidity <= h_max:
            suitability = "Excellent"
            pest_risk = "High" if humidity > 75 else "Medium"
        elif (t_min - 2 <= temperature <= t_max + 2) or (h_min - 5 <= humidity <= h_max + 5):
            suitability = "Good"
            pest_risk = "Medium"
        else:
            continue
        suitable.append(CropRecommendation(
            crop=crop.capitalize(),
            suitability=suitability,
            temperature_range=f"{t_min}°C - {t_max}°C",
            humidity_range=f"{h_min}% - {h_max}%",
            pest_risk=pest_risk,
            management=f"Monitor for {', '.join(info['pests'])} pests" if pest_risk == "High" else "Routine monitoring recommended",
        ))
    return suitable


# ── Supabase client ───────────────────────────────────────────────────────────

def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=503, detail="Database not configured — set PROJECT_URL and API_KEY in .env")
    try:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception:
        class SimpleSupabase:
            def __init__(self, url, key):
                self.base_url = f"{url}/rest/v1"
                self.headers = {
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                }
            def insert(self, table: str, data: dict):
                resp = requests.post(f"{self.base_url}/{table}", json=data, headers=self.headers, timeout=5)
                resp.raise_for_status()
                return resp.json()
            def select(self, table: str, params: dict = None):
                resp = requests.get(f"{self.base_url}/{table}", headers=self.headers, params=params, timeout=5)
                resp.raise_for_status()
                return resp.json()
        return SimpleSupabase(SUPABASE_URL, SUPABASE_KEY)


# ── Core prediction logic ─────────────────────────────────────────────────────

def _csv_lookup(crop: str, location: str) -> Optional[Dict]:
    """
    [HEURISTIC] Look up historical outbreak data from the CSV dataset.
    Returns a dict with 'pest_name' and 'historical_confidence' (0–100),
    or None if no matching records are found.
    """
    csv_path = os.path.join(ROOT, "final_pest_dataset.csv")
    if not os.path.exists(csv_path):
        logger.warning("Dataset CSV not found at %s", csv_path)
        return None

    try:
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # First try: exact location + crop match
        matches = [
            r for r in rows
            if r["location"].lower() == location.lower()
            and r["crops"].lower() == crop.lower()
        ]

        # Fallback: just crop match
        if not matches:
            matches = [r for r in rows if r["crops"].lower() == crop.lower()]

        if not matches:
            return None

        outbreaks = [m["outbreak"].upper() for m in matches]
        high_count = outbreaks.count("HIGH")
        med_count  = outbreaks.count("MEDIUM")
        low_count  = outbreaks.count("LOW")

        if high_count >= med_count and high_count >= low_count:
            historical_confidence = 85.0
        elif med_count >= low_count:
            historical_confidence = 60.0
        else:
            historical_confidence = 35.0

        pest_name = matches[0]["pest"].lower()
        return {"pest_name": pest_name, "historical_confidence": historical_confidence}

    except Exception as exc:
        logger.error("CSV lookup error: %s", exc)
        return None


def _crop_fallback_pest(crop: str, weather: "WeatherInput") -> str:
    """
    [HEURISTIC] Rule-based pest selection when CSV has no matching data.
    Based on domain knowledge of Karnataka crop-pest associations.
    """
    crop_map = {
        "groundnut": "leaf miner",
        "arecanut":  "spindle bug",
        "paddy":     "stem borer",
        "rice":      "stem borer",
        "pepper":    "pollu beetle",
        "cotton":    "pink bollworm",
        "blackgram": "whitefly",
        "cashew":    "tea mosquito bug",
        "cocoa":     "mealybug",
        "coconut":   "rhinoceros beetle",
        "ginger":    "shoot borer",
        "tea":       "red spider mite",
    }
    if crop in crop_map:
        return crop_map[crop]
    # Weather-based fallback
    if weather.humidity > 80:
        return "aphid"
    if weather.temperature > 30:
        return "whitefly"
    if weather.rainfall > 5:
        return "armyworm"
    return "locust"


def predict_pest_logic(weather: WeatherInput) -> PredictionResult:
    """
    Core pest prediction engine.

    Strategy:
      1. [MODEL]     Run XGBRegressor → pest pressure score (0–100 confidence)
      2. [HEURISTIC] CSV lookup → pest name + historical outbreak confidence
      3. [BLEND]     final_confidence = 70% model + 30% historical (if both available)
                     Falls back to CSV-only or rule-only if components are missing.
    """
    crop = (weather.crop or "unknown").lower()

    # Resolve location name from lat/lng for CSV lookup
    location = "unknown"
    if weather.lat and weather.lng:
        region_coords = {
            "Bangalore":    (12.9716, 77.5946),
            "Chikmangaluru":(13.3161, 75.7720),
            "Davangere":    (14.4644, 75.9218),
            "Gulbarga":     (17.3297, 76.8343),
            "Hassan":       (13.0068, 76.1004),
            "Kasaragodu":   (12.4965, 74.9897),
            "Kodagu":       (12.3375, 75.8069),
            "Madikeri":     (12.4244, 75.7382),
            "Mangalore":    (12.9141, 74.8560),
            "Mysuru":       (12.2958, 76.6394),
            "Raichur":      (16.2120, 77.3439),
        }
        for name, (rlat, rlng) in region_coords.items():
            if abs(weather.lat - rlat) < 0.1 and abs(weather.lng - rlng) < 0.1:
                location = name
                break

    # ── 1. MODEL: XGBRegressor pest-pressure score ───────────────────────────
    # Estimate min temp as max temp - 8°C (typical Karnataka diurnal range)
    min_temp_estimate = weather.temperature - 8.0
    model_confidence = run_model(
        max_temp=weather.temperature,
        min_temp=min_temp_estimate,
        humidity=weather.humidity,
        rainfall=weather.rainfall,
        wind=weather.wind,
    )

    # ── 2. HEURISTIC: CSV + rule-based pest name selection ────────────────────
    csv_result = _csv_lookup(crop, location)
    if csv_result:
        pest_name = csv_result["pest_name"]
        historical_confidence = csv_result["historical_confidence"]
        source = "model+csv"
    else:
        # Rule-based fallback for pest name
        pest_name = _crop_fallback_pest(crop, weather)
        historical_confidence = 45.0  # neutral default
        source = "model+rules" if model_confidence is not None else "rules-only"

    # ── 3. BLEND: combine model score and historical confidence ───────────────
    if model_confidence is not None:
        final_confidence = round(0.70 * model_confidence + 0.30 * historical_confidence, 2)
        logger.info(
            "Prediction blend: model=%.1f%% hist=%.1f%% → final=%.1f%% (pest=%s)",
            model_confidence, historical_confidence, final_confidence, pest_name,
        )
    else:
        # Model unavailable — use CSV/rule confidence only
        final_confidence = historical_confidence
        source = "csv-only" if csv_result else "rules-only"
        logger.warning("Model unavailable, using heuristic confidence=%.1f%%", final_confidence)

    info = PEST_INFO.get(pest_name, {"scientific": "Unknown species", "recommendation": "Consult local agricultural extension office."})

    return PredictionResult(
        pest=pest_name.title(),
        scientific=info["scientific"],
        pest_key=pest_name,
        risk=map_risk(final_confidence),
        confidence=final_confidence,
        recommendation=info["recommendation"],
        timestamp=datetime.datetime.utcnow(),
        source=source,
    )


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
def health_check():
    """Uptime check — returns model load status and current timestamp."""
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "openai_configured": openai_client is not None,
        "weather_configured": bool(OPENWEATHER_API_KEY),
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }


@app.post("/predict", response_model=PredictionResult, tags=["Prediction"])
def predict_pest(weather: WeatherInput, supabase=Depends(get_supabase_client)):
    """
    Predict pest outbreak from weather + crop input.
    Result is persisted to Supabase for analytics.
    """
    result = predict_pest_logic(weather)
    try:
        supabase.insert(
            "pest_predictions_history",
            {
                "user_id": "public",
                "weather": weather.dict(),
                "prediction": result.dict(mode="json"),
                "created_at": result.timestamp.isoformat(),
            },
        )
    except Exception as exc:
        # Non-fatal: log and continue — the prediction itself succeeded
        logger.warning("Supabase insert failed (non-fatal): %s", exc)
    return result


@app.get("/history", response_model=List[PredictionResult], tags=["Prediction"])
def get_history(limit: int = 10, supabase=Depends(get_supabase_client)):
    """Retrieve recent prediction history."""
    try:
        rows = supabase.select(
            "pest_predictions_history",
            params={"user_id": "public", "order": "created_at.desc", "limit": limit},
        )
        return [row["prediction"] for row in rows]
    except Exception as exc:
        logger.error("History fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail="Failed to fetch prediction history")


@app.get("/live-weather", response_model=LiveWeatherResponse, tags=["Weather"])
def get_live_weather(lat: Optional[float] = None, lng: Optional[float] = None, crop: Optional[str] = None):
    """Fetch live weather for coordinates and return pest prediction + crop suggestions."""
    fetch_lat = lat if lat is not None else KARNATAKA_LAT
    fetch_lng = lng if lng is not None else KARNATAKA_LNG

    weather_data = get_live_weather_data(fetch_lat, fetch_lng)
    # get_live_weather_data always returns sample data on failure — never None
    if not weather_data:
        weather_data = SAMPLE_WEATHER.copy()

    location_name = weather_data.get("location", "Unknown Location")
    crops_suggested = get_suitable_crops(weather_data["temperature"], weather_data["humidity"])

    weather_input = WeatherInput(
        temperature=weather_data["temperature"],
        humidity=weather_data["humidity"],
        rainfall=weather_data["rainfall"],
        wind=weather_data["wind"],
        location=location_name,
        lat=fetch_lat,
        lng=fetch_lng,
        crop=crop,
    )
    pest_prediction = predict_pest_logic(weather_input)

    return LiveWeatherResponse(
        location=location_name,
        temperature=weather_data["temperature"],
        humidity=weather_data["humidity"],
        rainfall=weather_data["rainfall"],
        wind=weather_data["wind"],
        description=weather_data.get("description", ""),
        crops_suggested=crops_suggested,
        pest_prediction=pest_prediction,
    )


@app.get("/district-data", tags=["Data"])
def get_district_data():
    """Return latest pest outbreak data per Karnataka district for map display."""
    csv_path = os.path.join(ROOT, "final_pest_dataset.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=503, detail="Dataset not found on server")

    district_coords = {
        "Bangalore":        (12.9716, 77.5946),
        "Mangalore":        (12.9141, 74.8560),
        "Mysuru":           (12.2958, 76.6394),
        "Gulbarga":         (17.3297, 76.8343),
        "Hassan":           (13.0068, 76.1004),
        "Kasaragodu":       (12.4965, 74.9897),
        "Kodagu":           (12.3375, 75.8069),
        "Madikeri":         (12.4244, 75.7382),
        "Raichur":          (16.2120, 77.3439),
        "Davanagere":       (14.4644, 75.9218),
        "Bagalkot":         (16.1825, 75.6981),
        "Bidar":            (17.9133, 77.5341),
        "Bellary":          (15.1420, 76.9245),
        "Udupi":            (13.3409, 74.7500),
        "Chikkamagaluru":   (13.3285, 75.7740),
        "Yadgir":           (16.7546, 77.1465),
        "Mandya":           (12.5210, 76.8960),
        "Tumakuru":         (13.3409, 77.1144),
        "Haveri":           (14.7950, 75.4000),
        "Gadag":            (15.4284, 75.6205),
        "Koppal":           (15.3587, 76.1549),
        "Chitradurga":      (14.2199, 76.3996),
        "Ramanagara":       (12.7247, 77.3311),
        "Kolar":            (13.1369, 78.1260),
        "Chamarajanagar":   (11.9395, 77.3010),
        "Uttara Kannada":   (14.6266, 74.2266),
        "Vijayapura":       (16.8245, 75.7155),
        "Kalaburagi":       (17.3297, 76.8343),
    }

    try:
        latest_by_location: Dict[str, Any] = {}
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                loc = row["location"]
                year = int(row.get("year", 0))
                if loc not in latest_by_location or year > int(latest_by_location[loc].get("year", 0)):
                    latest_by_location[loc] = row
    except Exception as exc:
        logger.error("District data CSV read error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Error reading dataset: {exc}")

    result = []
    for loc, row in latest_by_location.items():
        coords = district_coords.get(loc)
        if not coords:
            continue
        result.append({
            "district":    loc,
            "lat":         coords[0],
            "lng":         coords[1],
            "crop":        row.get("crops"),
            "pest":        row.get("pest"),
            "outbreak":    row.get("outbreak"),
            "temperature": float(row.get("temperature", 0) or 0),
            "humidity":    float(row.get("humidity", 0) or 0),
            "rainfall":    float(row.get("rainfall", 0) or 0),
        })
    return result


@app.post("/chat", response_model=ChatResponse, tags=["AI"])
@limiter.limit("10/minute")
def chat_with_ai(req: ChatRequest, request: Request):
    """
    AI assistant chat endpoint.
    Powered by GPT-3.5-turbo when OPENAI_API_KEY is configured.
    Returns a clearly labeled demo response when running without a key.
    """
    if not openai_client:
        return ChatResponse(
            response=(
                "ℹ️ [Demo Mode] The AI assistant is running without an OpenAI API key. "
                "In a live deployment, this would respond with real agricultural advice. "
                "General tip: Rotate crops annually and scout fields weekly for early pest detection."
            )
        )
    try:
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are AgriPredict Assistant, an expert in agricultural pest management for Karnataka, India. "
                        "Provide concise, actionable advice about farming, pest control, and crops. "
                        "Keep responses under 150 words."
                    ),
                },
                {"role": "user", "content": req.message},
            ],
            max_tokens=200,
            temperature=0.7,
        )
        return ChatResponse(response=response.choices[0].message.content)
    except Exception as exc:
        logger.error("OpenAI chat error: %s", exc)
        return ChatResponse(
            response=(
                "ℹ️ [AI Unavailable] The AI assistant is temporarily unavailable. "
                "For pest management: ensure adequate drainage, use resistant seed varieties, "
                "and scout regularly for early signs of infestation."
            )
        )


@app.post("/analyze-leaf", response_model=LeafAnalysisResponse, tags=["AI"])
@limiter.limit("5/minute")
async def analyze_leaf(request: Request, file: UploadFile = File(...)):
    """
    Leaf image analysis endpoint.
    Uses GPT-4o Vision when OPENAI_API_KEY is configured.
    Returns clearly labeled demo results when running without a key.
    """
    # Demo fallback pool — clearly labeled as demo
    demo_scenarios = [
        {
            "pathology":   "CRITICAL",
            "chlorophyll": "LOW",
            "probability": "94%",
            "confidence":  "89%",
            "message":     "Significant tissue damage detected consistent with **Armyworm** infestation.\n\n**Organic Control:** Use Neem oil sprays (1500 ppm) or *Bacillus thuringiensis* (Bt) biopesticide.\n**Inorganic Control:** Apply Chlorantraniliprole 18.5% SC or Emamectin benzoate 5% SG for rapid knockdown.",
            "demo_mode":   True,
        },
        {
            "pathology":   "WARNING",
            "chlorophyll": "NORMAL",
            "probability": "65%",
            "confidence":  "82%",
            "message":     "Yellowing patterns suggest an early **Aphid** attack or mosaic virus vector.\n\n**Organic Control:** Use insecticidal soap spray or garlic-chili extract. Release ladybugs as natural predators.\n**Inorganic Control:** Spray Imidacloprid 17.8% SL or Thiamethoxam 25% WG at recommended dosages.",
            "demo_mode":   True,
        },
        {
            "pathology":   "CRITICAL",
            "chlorophyll": "LOW",
            "probability": "88%",
            "confidence":  "91%",
            "message":     "Deep necrosis and silvering indicate a severe **Thrips** or **Spider Mite** outbreak.\n\n**Organic Control:** Apply horticultural mineral oils or Spinosad-based organic sprays.\n**Inorganic Control:** Use Abamectin 1.8% EC or Fenazaquin 10% EC for effective mite management.",
            "demo_mode":   True,
        },
        {
            "pathology":   "WARNING",
            "chlorophyll": "LOW",
            "probability": "72%",
            "confidence":  "85%",
            "message":     "Leaf curling and stickiness detected, likely caused by **Whitefly** colonies.\n\n**Organic Control:** Install yellow sticky traps and spray with pongamia oil or neem seed kernel extract.\n**Inorganic Control:** Apply Acetamiprid 20% SP or Diafenthiuron 50% WP during early morning hours.",
            "demo_mode":   True,
        },
    ]

    if not openai_client:
        idx = len(file.filename) % len(demo_scenarios)
        return LeafAnalysisResponse(**demo_scenarios[idx])

    try:
        contents = await file.read()
        base64_image = base64.b64encode(contents).decode("utf-8")

        prompt = (
            "Analyze this crop leaf image. Identify any potential pest attacks, diseases, or deficiencies. "
            "Provide a response strictly in this exact JSON format:\n"
            "{\n"
            '  "pathology": "CRITICAL / WARNING / HEALTHY",\n'
            '  "chlorophyll": "LOW / NORMAL / HIGH",\n'
            '  "probability": "percentage as string, e.g., \'85%\'",\n'
            '  "confidence": "percentage as string, e.g., \'92%\'",\n'
            '  "message": "Detailed explanation of likely pest. Include sections: '
            '1) Organic Pesticide Suggestion and 2) Inorganic Pesticide Suggestion."\n'
            "}"
        )

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{file.content_type};base64,{base64_image}", "detail": "low"}},
                ],
            }],
            max_tokens=400,
        )
        import json
        data = json.loads(response.choices[0].message.content)
        return LeafAnalysisResponse(
            pathology=data.get("pathology", "UNKNOWN"),
            chlorophyll=data.get("chlorophyll", "UNKNOWN"),
            probability=data.get("probability", "0%"),
            confidence=data.get("confidence", "0%"),
            message=data.get("message", "Analysis failed to provide a description."),
            demo_mode=False,
        )
    except Exception as exc:
        logger.error("OpenAI vision error: %s", exc)
        import random
        fallback = random.choice(demo_scenarios)
        return LeafAnalysisResponse(**fallback)


# ══════════════════════════════════════════════════════════════════════════════
# /predict-leaf  — EfficientNet-B0 crop disease classifier
# ══════════════════════════════════════════════════════════════════════════════

class LeafDiseaseResponse(BaseModel):
    disease: str
    confidence: float
    severity: str
    treatment: List[str]
    prevention: List[str]
    is_healthy: bool
    model: str = "EfficientNet-B0 (90.82% val accuracy)"


ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}


@app.post("/predict-leaf", response_model=LeafDiseaseResponse, tags=["Leaf Disease"])
async def predict_leaf(file: UploadFile = File(...)):
    """
    Detect crop disease from a leaf image using EfficientNet-B0.

    - Accepts JPG, JPEG, PNG images
    - Returns disease name, confidence score, treatment and prevention advice
    - Model: EfficientNet-B0 trained on 25,170 images, 22 disease classes
    - Validation accuracy: 90.82%
    """
    # Guard: torch / model not installed yet
    if not LEAF_MODEL_AVAILABLE or predict_leaf_disease is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Leaf disease model not available. "
                "Place leaf_model.pth in the project root directory and restart the server."
            ),
        )

    # Validate file type
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{content_type}'. Upload a JPG, JPEG, or PNG image.",
        )

    # Validate file size (max 10 MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Image too large. Maximum file size is 10 MB.",
        )

    try:
        result = predict_leaf_disease(contents, file.filename)
        return LeafDiseaseResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except FileNotFoundError as exc:
        logger.error("Leaf model file missing: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("Leaf inference failed: %s", exc)
        raise HTTPException(status_code=500, detail="Leaf disease inference failed. Please try again.")
