import logging
import os
import subprocess
from collections.abc import Callable
from functools import lru_cache
from threading import Lock
from typing import Annotated, BinaryIO

import numpy as np
from fastapi import Depends, FastAPI, HTTPException, UploadFile
from pydantic import BaseModel

MAX_BYTES = 32 * 1024 * 1024
SAMPLE_RATE = 16_000
MAX_SECONDS = 180
inference_lock = Lock()
logger = logging.getLogger(__name__)
app = FastAPI(title="Notas de voz")


class Segment(BaseModel):
    start: float
    end: float
    text: str


class Transcript(BaseModel):
    segments: list[Segment]


@lru_cache(maxsize=1)
def model():
    from faster_whisper import WhisperModel

    return WhisperModel(os.getenv("WHISPER_MODEL", "base"), device="cpu", compute_type="int8")


def transcribe(audio: np.ndarray) -> list[Segment]:
    with inference_lock:
        segments, _ = model().transcribe(audio, language="es", vad_filter=True)
        duration = len(audio) / SAMPLE_RATE
        return [
            Segment(
                start=min(duration, max(0, segment.start)),
                end=min(duration, max(0, segment.end)),
                text=segment.text.strip(),
            )
            for segment in segments
            if segment.text.strip()
        ]


def get_engine():
    return transcribe


def decode(content: BinaryIO) -> np.ndarray:
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
                "-protocol_whitelist", "fd,pipe", "-i", "fd:",
                "-map", "0:a:0", "-t", str(MAX_SECONDS + 1),
                "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1",
            ],
            stdin=content,
            capture_output=True,
            timeout=30,
            check=False,
        )
    except FileNotFoundError as exc:
        raise HTTPException(503, "FFmpeg no está disponible en el servidor local.") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(422, "La lectura del audio tardó demasiado. Prueba con MP3 o WAV.") from exc

    if result.returncode or not result.stdout:
        raise HTTPException(422, "No se pudo leer el audio. Prueba con un MP3 o WAV válido.")
    audio = np.frombuffer(result.stdout, dtype="<f4").copy()
    if len(audio) > MAX_SECONDS * SAMPLE_RATE:
        raise HTTPException(422, "La nota supera el límite de 3 minutos.")
    return audio


@app.post("/api/transcribir")
def transcription(audio: UploadFile, engine: Annotated[Callable[[np.ndarray], list[Segment]], Depends(get_engine)]) -> Transcript:
    with audio.file as content:
        size = content.seek(0, os.SEEK_END)
        if size > MAX_BYTES:
            raise HTTPException(413, "El archivo supera el límite de 32 MB.")
        if not size:
            raise HTTPException(422, "El archivo de audio está vacío.")
        content.seek(0)
        decoded = decode(content)
    try:
        segments = engine(decoded)
    except Exception as exc:
        logger.exception("Error del motor de transcripción")
        raise HTTPException(503, "Whisper no pudo procesar la nota. Revisa la consola de la API e inténtalo de nuevo.") from exc
    if not segments:
        raise HTTPException(422, "No se detectó voz en la nota.")
    return Transcript(segments=segments)
