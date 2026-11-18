import io
import subprocess
import wave
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi.testclient import TestClient

from api.main import SAMPLE_RATE, Segment, app, get_engine


@pytest.fixture
def client():
    def fake_engine(audio):
        assert audio.size > 0
        return [Segment(start=0.2, end=1.4, text="Una nota en español.")]

    app.dependency_overrides[get_engine] = lambda: fake_engine
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def test_demo_note(client):
    path = Path(__file__).resolve().parents[1] / "public" / "ejemplo.mp3"
    response = client.post("/api/transcribir", files={"audio": (path.name, path.read_bytes())})
    assert response.status_code == 200
    assert response.json() == {
        "segments": [{"start": 0.2, "end": 1.4, "text": "Una nota en español."}]
    }


def test_m4a_with_metadata_after_audio(client):
    source = Path(__file__).resolve().parents[1] / "public" / "ejemplo.mp3"
    with TemporaryDirectory() as directory:
        m4a = Path(directory) / "nota.m4a"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(source), "-c:a", "aac", str(m4a)],
            check=True,
        )
        response = client.post("/api/transcribir", files={"audio": (m4a.name, m4a.read_bytes())})
    assert response.status_code == 200


@pytest.mark.parametrize("content", [b"archivo invalido", b""])
def test_invalid_audio(client, content):
    response = client.post("/api/transcribir", files={"audio": ("invalid.mp3", content)})
    assert response.status_code == 422
    assert "audio" in response.json()["detail"]


def test_audio_longer_than_three_minutes(client):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setparams((1, 1, SAMPLE_RATE, 0, "NONE", ""))
        audio.writeframes(bytes([128]) * (180 * SAMPLE_RATE + 1000))
    response = client.post("/api/transcribir", files={"audio": ("long.wav", buffer.getvalue())})
    assert response.status_code == 422
    assert "3 minutos" in response.json()["detail"]


def test_engine_failure(client):
    def failure(_audio):
        raise RuntimeError("test")

    app.dependency_overrides[get_engine] = lambda: failure
    path = Path(__file__).resolve().parents[1] / "public" / "ejemplo.mp3"
    response = client.post("/api/transcribir", files={"audio": (path.name, path.read_bytes())})
    assert response.status_code == 503
    assert "Whisper" in response.json()["detail"]
