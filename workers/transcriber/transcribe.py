#!/usr/bin/env python3
"""Worker transkripsi faster-whisper.

Kontrak (lihat AGENT-GUIDE bagian 8):
  python transcribe.py --audio audio.wav --language en|id|auto --out transcript.json

Progres dicetak sebagai JSON per baris di stdout:
  {"type": "progress", "value": 0.42}
  {"type": "done", "words": 12, "language": "en"}
  {"type": "error", "message": "..."}   (exit code != 0)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback

MIN_WORD_DURATION = 0.02  # 20 ms


class Canceled(Exception):
    """Worker dihentikan oleh pengguna (file pembatalan muncul)."""


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def fail(message: str, code: int = 1) -> None:
    emit({"type": "error", "message": message})
    sys.exit(code)


def check_cancel(cancel_file: str | None) -> None:
    if cancel_file and os.path.exists(cancel_file):
        raise Canceled()


def prepare_cuda_dll_paths() -> None:
    """Tambahkan folder DLL NVIDIA ke jalur pencarian Windows.

    ctranslate2 memuat cuBLAS/cuDNN berdasarkan nama berkas, bukan path absolut.
    Wheel `nvidia-cublas-cu12` menaruh DLL-nya di site-packages/nvidia/*/bin,
    yang tidak ada di PATH secara default.
    """
    if os.name != "nt":
        return
    try:
        import ctranslate2

        cli_dir = os.path.dirname(ctranslate2.__file__)
        # ctranslate2 ada di <site-packages>/ctranslate2, jadi induknya = site-packages.
        site_packages = os.path.dirname(cli_dir)
    except Exception:  # noqa: BLE001 - jangan gagalkan worker hanya karena ini
        return

    candidates = [cli_dir]
    for package in ("cublas", "cudnn"):
        candidates.append(os.path.join(site_packages, "nvidia", package, "bin"))

    for folder in candidates:
        if not os.path.isdir(folder):
            continue
        os.environ["PATH"] = folder + os.pathsep + os.environ.get("PATH", "")
        try:
            os.add_dll_directory(folder)
        except OSError:
            pass


def looks_like_oom(error: Exception) -> bool:
    text = str(error).lower()
    return "out of memory" in text or "cuda_error_out_of_memory" in text or "insufficient memory" in text


def normalize_words(raw_words) -> list[dict]:
    """Rapikan kata: buang kosong, pastikan end > start (>=20 ms), waktu monoton naik."""
    words: list[dict] = []
    previous_end = 0.0
    for item in raw_words:
        text = (getattr(item, "word", "") or "").strip()
        if not text:
            continue
        start = float(item.start)
        end = float(item.end)
        if start < previous_end:
            start = previous_end
        if end <= start:
            end = start + MIN_WORD_DURATION
        words.append(
            {
                "id": f"w{len(words)}",
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
            }
        )
        previous_end = end
    return words


def looks_like_cuda_error(error: Exception) -> bool:
    message = str(error).lower()
    hints = (
        "cuda",
        "cudnn",
        "cublas",
        "out of memory",
        "no kernel image",
        "device",
        "gpu",
    )
    return any(hint in message for hint in hints)


class ProgressReporter:
    def __init__(self) -> None:
        self.last_value = -1.0
        self.last_time = 0.0

    def report(self, value: float) -> None:
        value = max(0.0, min(1.0, value))
        now = time.monotonic()
        if value < 1.0 and value - self.last_value < 0.005 and now - self.last_time < 0.4:
            return
        if now - self.last_time < 0.15 and value < 1.0:
            return
        self.last_value = value
        self.last_time = now
        emit({"type": "progress", "value": round(value, 4)})


def load_audio(path: str):
    """Baca WAV 16 kHz mono PCM yang dihasilkan FFmpeg menjadi float32 numpy.

    Dipakai agar tidak bergantung pada PyAV (beberapa versi PyAV tidak lagi
    menerima argumen yang dipakai faster-whisper saat membuka berkas).
    """
    import wave

    import numpy as np

    with wave.open(path, "rb") as handle:
        channels = handle.getnchannels()
        sample_rate = handle.getframerate()
        sample_width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())

    if sample_width != 2:
        raise ValueError(f"WAV harus PCM 16-bit, ditemukan {sample_width * 8}-bit")
    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    if sample_rate != 16000:
        raise ValueError(f"WAV harus 16 kHz, ditemukan {sample_rate} Hz")
    return audio


def transcribe_with(
    model, audio, language: str | None, reporter: ProgressReporter, cancel_file: str | None = None
):
    check_cancel(cancel_file)
    segments, info = model.transcribe(
        audio,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300),
        beam_size=5,
        condition_on_previous_text=False,
    )

    duration = float(getattr(info, "duration", 0.0) or 0.0)
    if duration <= 0:
        try:
            duration = float(len(audio)) / 16000.0
        except TypeError:
            duration = 0.0
    raw_words: list = []
    for segment in segments:
        check_cancel(cancel_file)
        raw_words.extend(getattr(segment, "words", None) or [])
        if duration > 0:
            reporter.report(min(1.0, float(segment.end) / duration))

    words = normalize_words(raw_words)
    reporter.report(1.0)
    return words, info


def main() -> None:
    parser = argparse.ArgumentParser(description="Transkripsi audio dengan timestamp per kata.")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--language", default="auto", choices=["en", "id", "auto"])
    parser.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "large-v3"))
    parser.add_argument("--device", default=os.environ.get("WHISPER_DEVICE", "cuda"))
    parser.add_argument("--compute", default=os.environ.get("WHISPER_COMPUTE", "float16"))
    parser.add_argument(
        "--cancel-file",
        default=None,
        help="Jika berkas ini muncul, worker berhenti secara kooperatif.",
    )
    args = parser.parse_args()

    audio = os.path.abspath(args.audio)
    if not os.path.isfile(audio):
        fail(f"Berkas audio tidak ditemukan: {audio}")

    if os.environ.get("HF_HOME"):
        # huggingface_hub membaca HF_HOME dari environment; diteruskan dari API.
        os.environ["HF_HOME"] = os.environ["HF_HOME"]

    language = None if args.language == "auto" else args.language
    reporter = ProgressReporter()

    prepare_cuda_dll_paths()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:  # noqa: BLE001 - pesan harus sampai ke UI
        fail(f"faster-whisper tidak tersedia: {exc}")

    device = args.device
    compute = args.compute
    if device != "cuda" and compute in ("float16", "bfloat16"):
        emit(
            {
                "type": "warning",
                "message": f"compute_type {compute} tidak didukung CPU; memakai int8.",
            }
        )
        compute = "int8"
    emit({"type": "status", "message": f"memuat model {args.model} ({device}/{compute})"})

    try:
        audio_data = load_audio(audio)
    except Exception as exc:  # noqa: BLE001
        fail(f"Gagal membaca audio: {exc}")

    # Urutan percobaan: GPU sesuai konfigurasi → GPU int8_float16 (bila VRAM kurang)
    # → CPU int8. Percobaan int8 hanya dilakukan bila error pertama adalah OOM.
    attempts: list[tuple[str, str]] = [(device, compute)]
    if device == "cuda" and compute != "int8_float16":
        attempts.append(("cuda", "int8_float16"))
    attempts.append(("cpu", "int8"))

    last_error: Exception | None = None
    for attempt_device, attempt_compute in attempts:
        if (
            attempt_device == "cuda"
            and attempt_compute == "int8_float16"
            and last_error is not None
            and not looks_like_oom(last_error)
        ):
            continue
        if last_error is not None:
            if attempt_device == "cuda":
                message = (
                    f"GPU gagal ({last_error}). Mencoba ulang dengan int8_float16 "
                    "(memori lebih kecil)."
                )
            else:
                message = (
                    f"GPU tidak dapat dipakai ({last_error}). "
                    "Melanjutkan di CPU (lebih lambat)."
                )
            emit({"type": "warning", "message": message})
            emit({"type": "progress", "value": 0.0})

        try:
            check_cancel(args.cancel_file)
            model = WhisperModel(args.model, device=attempt_device, compute_type=attempt_compute)
            check_cancel(args.cancel_file)
            words, info = transcribe_with(
                model, audio_data, language, reporter, args.cancel_file
            )
            break
        except Canceled:
            emit({"type": "canceled", "message": "Dibatalkan oleh pengguna."})
            sys.exit(3)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt_device == "cpu" or not looks_like_cuda_error(exc):
                traceback.print_exc()
                fail(f"Transkripsi gagal: {exc}")
    else:
        fail(f"Transkripsi gagal: {last_error}")

    if not words:
        fail("Tidak ada kata yang terdeteksi. Video mungkin tanpa suara yang jelas.")

    transcript_language = (
        language if language else str(getattr(info, "language", "unknown") or "unknown")
    )
    payload = {"language": transcript_language, "words": words}

    try:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
    except OSError as exc:
        fail(f"Gagal menulis transcript: {exc}")

    emit(
        {
            "type": "done",
            "words": len(words),
            "language": transcript_language,
            "duration": round(float(getattr(info, "duration", 0.0) or 0.0), 3),
        }
    )


if __name__ == "__main__":
    main()
