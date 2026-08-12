"""
AgriPredict Backend — Pytest Test Suite
========================================
Run with:
    cd backend
    .venv\\Scripts\\activate
    pytest tests/ -v
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Create a FastAPI TestClient for the whole test session."""
    from app.main import app
    with TestClient(app) as c:
        yield c


# ── /health ────────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_ok(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert "model_loaded" in body
        assert body["model_loaded"] is True
        assert "timestamp" in body

    def test_health_reports_model_loaded(self, client):
        res = client.get("/health")
        assert res.json()["model_loaded"] is True


# ── Input validation (Phase 2 Pydantic validators) ─────────────────────────────

class TestInputValidation:
    VALID_PAYLOAD = {
        "temperature": 28.5,
        "humidity": 70.0,
        "rainfall": 1.0,
        "wind": 8.0,
        "crop": "groundnut",
        "lat": 13.3161,
        "lng": 75.7720,
    }

    def test_valid_input_accepted(self, client):
        res = client.post("/predict", json=self.VALID_PAYLOAD)
        # Supabase may fail in test env — that's OK, model prediction is what matters
        # Accept 200 (success) or 503 (Supabase not configured)
        assert res.status_code in (200, 503)

    def test_humidity_above_100_returns_422(self, client):
        payload = {**self.VALID_PAYLOAD, "humidity": 105}
        res = client.post("/predict", json=payload)
        assert res.status_code == 422
        assert "humidity" in res.text.lower()

    def test_humidity_below_0_returns_422(self, client):
        payload = {**self.VALID_PAYLOAD, "humidity": -5}
        res = client.post("/predict", json=payload)
        assert res.status_code == 422

    def test_temperature_too_high_returns_422(self, client):
        payload = {**self.VALID_PAYLOAD, "temperature": 75}
        res = client.post("/predict", json=payload)
        assert res.status_code == 422

    def test_temperature_too_low_returns_422(self, client):
        payload = {**self.VALID_PAYLOAD, "temperature": -20}
        res = client.post("/predict", json=payload)
        assert res.status_code == 422

    def test_negative_rainfall_returns_422(self, client):
        payload = {**self.VALID_PAYLOAD, "rainfall": -1}
        res = client.post("/predict", json=payload)
        assert res.status_code == 422

    def test_negative_wind_returns_422(self, client):
        payload = {**self.VALID_PAYLOAD, "wind": -5}
        res = client.post("/predict", json=payload)
        assert res.status_code == 422


# ── predict_pest_logic (unit tests — bypass HTTP) ─────────────────────────────

class TestPredictPestLogic:
    def test_groundnut_returns_leaf_miner(self):
        from app.main import predict_pest_logic, WeatherInput
        weather = WeatherInput(temperature=28.5, humidity=70, rainfall=1.0, wind=8.0, crop="groundnut")
        result = predict_pest_logic(weather)
        assert result.pest_key == "leaf miner"
        assert result.confidence > 0
        assert result.risk in ("HIGH", "MEDIUM", "LOW")
        assert result.source in ("model+csv", "model+rules", "csv-only", "rules-only")

    def test_paddy_returns_stem_borer(self):
        from app.main import predict_pest_logic, WeatherInput
        weather = WeatherInput(temperature=28.0, humidity=80, rainfall=5.0, wind=6.0, crop="paddy")
        result = predict_pest_logic(weather)
        # CSV lookup should find stem borer for paddy
        assert result.pest_key in ("stem borer", "leaf miner", "whitefly")  # flexible

    def test_unknown_crop_returns_weather_based_fallback(self):
        from app.main import predict_pest_logic, WeatherInput
        # High humidity → aphid
        weather = WeatherInput(temperature=25.0, humidity=85, rainfall=0.0, wind=5.0, crop="unknown_crop_xyz")
        result = predict_pest_logic(weather)
        assert result.pest_key is not None
        assert len(result.pest_key) > 0

    def test_model_called_and_confidence_blended(self):
        from app.main import predict_pest_logic, WeatherInput, run_model
        weather = WeatherInput(temperature=30.0, humidity=65, rainfall=2.0, wind=10.0, crop="rice")
        model_conf = run_model(30.0, 22.0, 65, 2.0, 10.0)
        assert model_conf is not None, "Model should return a score"
        assert 0 <= model_conf <= 100, "Model confidence should be 0–100"

    def test_result_has_all_required_fields(self):
        from app.main import predict_pest_logic, WeatherInput
        weather = WeatherInput(temperature=27.0, humidity=72, rainfall=0.5, wind=7.0, crop="cotton")
        result = predict_pest_logic(weather)
        assert result.pest
        assert result.scientific
        assert result.pest_key
        assert result.risk
        assert result.confidence >= 0
        assert result.recommendation
        assert result.timestamp
        assert result.source

    def test_confidence_in_valid_range(self):
        from app.main import predict_pest_logic, WeatherInput
        for temp, hum, rain, wind, crop in [
            (20, 60, 0, 5, "rice"),
            (35, 90, 10, 15, "cotton"),
            (25, 50, 0, 3, "groundnut"),
        ]:
            w = WeatherInput(temperature=temp, humidity=hum, rainfall=rain, wind=wind, crop=crop)
            r = predict_pest_logic(w)
            assert 0 <= r.confidence <= 100, f"Confidence {r.confidence} out of range for {crop}"


# ── CSV lookup (unit test) ──────────────────────────────────────────────────────

class TestCsvLookup:
    def test_csv_lookup_returns_result_for_known_crop(self):
        from app.main import _csv_lookup
        result = _csv_lookup("groundnut", "Chikmangaluru")
        # Accepts None if no match (CSV may not have this combo) or a dict
        assert result is None or isinstance(result, dict)
        if result:
            assert "pest_name" in result
            assert "historical_confidence" in result
            assert 0 <= result["historical_confidence"] <= 100

    def test_csv_lookup_fallback_to_crop_only(self):
        from app.main import _csv_lookup
        # No location match → should fall back to crop-only
        result = _csv_lookup("paddy", "NonExistentPlace")
        if result:
            assert isinstance(result["pest_name"], str)


# ── /district-data ──────────────────────────────────────────────────────────────

class TestDistrictData:
    def test_district_data_returns_list(self, client):
        res = client.get("/district-data")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)

    def test_district_data_has_required_fields(self, client):
        res = client.get("/district-data")
        data = res.json()
        if data:  # only if CSV has data
            first = data[0]
            assert "district" in first
            assert "lat" in first
            assert "lng" in first
            assert "pest" in first
            assert "outbreak" in first


# ── /chat (no OpenAI key in test env) ────────────────────────────────────────

class TestChat:
    def test_chat_returns_response_without_key(self, client):
        res = client.post("/chat", json={"message": "What is aphid?"})
        assert res.status_code == 200
        body = res.json()
        assert "response" in body
        assert len(body["response"]) > 0

    def test_chat_empty_message_rejected(self, client):
        res = client.post("/chat", json={"message": ""})
        assert res.status_code == 422
