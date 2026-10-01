from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_json():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    assert "paths" in schema
    assert "/api/v1/translate/" in schema["paths"]
    assert "/api/v1/translate/stream" in schema["paths"]


def test_translate_json_endpoint():
    payload = {
        "source": {"source_lang": "en", "target_lang": "vi"},
        "text": "The engineer is designing a smart software architecture."
    }
    response = client.post("/api/v1/translate/", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    types_found = {item["type_response"] for item in data}
    assert "TRANSLATE" in types_found
    assert "ANALYSIS" in types_found
    assert "STATS" in types_found
    assert "VOCAB" in types_found


def test_translate_stream_endpoint():
    payload = {
        "source": {"source_lang": "en", "target_lang": "vi"},
        "text": "She studies artificial intelligence."
    }
    response = client.post("/api/v1/translate/stream", json=payload)
    assert response.status_code == 200
    lines = [line.strip() for line in response.text.split("\n") if line.strip()]
    assert len(lines) > 0
