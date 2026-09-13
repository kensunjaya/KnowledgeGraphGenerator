#!/usr/bin/env python3
"""Transcribe an audio file locally with faster-whisper.

Uses large-v3 with float16 on CUDA when available, otherwise float32 on CPU.
Writes both a plain-text transcript and readable Markdown.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable, Optional, Sequence


@dataclass(frozen=True)
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class TranscriptInfo:
    language: str
    language_probability: float
    duration: float


def clean_text(text: str) -> str:
    """Normalize whitespace without changing the transcript's wording."""
    return re.sub(r"\s+", " ", text).strip()


def format_timestamp(seconds: float) -> str:
    """Format seconds as MM:SS, or HH:MM:SS for long recordings."""
    total_seconds = max(0, int(round(seconds)))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def group_segments(
    segments: Sequence[TranscriptSegment],
    max_seconds: float = 45.0,
    max_chars: int = 700,
    max_gap: float = 2.5,
) -> list[list[TranscriptSegment]]:
    """Group nearby Whisper segments into readable paragraphs."""
    groups: list[list[TranscriptSegment]] = []
    current: list[TranscriptSegment] = []
    current_chars = 0

    for segment in segments:
        if not segment.text:
            continue

        should_split = bool(current) and (
            segment.start - current[-1].end > max_gap
            or segment.end - current[0].start > max_seconds
            or current_chars + len(segment.text) + 1 > max_chars
        )
        if should_split:
            groups.append(current)
            current = []
            current_chars = 0

        current.append(segment)
        current_chars += len(segment.text) + (1 if current_chars else 0)

    if current:
        groups.append(current)
    return groups


def render_plain_text(segments: Iterable[TranscriptSegment]) -> str:
    return " ".join(segment.text for segment in segments if segment.text).strip() + "\n"


def render_markdown(
    source: Path,
    model_name: str,
    info: TranscriptInfo,
    segments: Sequence[TranscriptSegment],
) -> str:
    """Render metadata and timestamped transcript paragraphs as Markdown."""
    title = source.stem.replace("#", "\\#")
    lines = [
        f"# Transcript: {title}",
        "",
        f"- **Source:** `{source.name.replace('`', '')}`",
        f"- **Model:** `{model_name.replace('`', '')}`",
        f"- **Language:** `{info.language}` ({info.language_probability:.1%} confidence)",
        f"- **Audio duration:** {format_timestamp(info.duration)}",
        f"- **Generated:** {datetime.now().astimezone().isoformat(timespec='seconds')}",
        "",
        "## Transcript",
        "",
    ]

    for group in group_segments(segments):
        start = format_timestamp(group[0].start)
        end = format_timestamp(group[-1].end)
        paragraph = " ".join(segment.text for segment in group)
        lines.extend((f"**[{start}–{end}]**", "", paragraph, ""))

    return "\n".join(lines).rstrip() + "\n"


def transcribe_audio(
    args: argparse.Namespace,
    on_progress: Optional[Callable[[str, float], None]] = None,
) -> tuple[list[TranscriptSegment], TranscriptInfo]:
    if on_progress:
        on_progress('LOADING_MODEL', 0)
    try:
        import ctranslate2
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(
            "faster-whisper is not installed. Run: "
            "python -m pip install -r requirements-whisper.txt"
        ) from exc

    device = args.device
    if device == "auto":
        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    compute_type = args.compute_type or ("float16" if device == "cuda" else "float32")
    model_options = {}
    if device == "cpu":
        model_options["cpu_threads"] = os.cpu_count() or 1

    print(
        f"Loading {args.model} on {device} ({compute_type})...",
        file=sys.stderr,
    )
    model = WhisperModel(
        args.model,
        device=device,
        compute_type=compute_type,
        **model_options,
    )

    if on_progress:
        on_progress('TRANSCRIBING', 0)
    raw_segments, raw_info = model.transcribe(
        str(args.input),
        language=args.language,
        beam_size=args.beam_size,
        task="transcribe",
        vad_filter=not args.no_vad,
        vad_parameters={"min_silence_duration_ms": 500},
    )

    duration = float(raw_info.duration)
    segments: list[TranscriptSegment] = []
    for raw_segment in raw_segments:
        if on_progress:
            percent = float(raw_segment.end) / duration * 100 if duration > 0 else 0
            on_progress('TRANSCRIBING', min(99, max(0, percent)))
        text = clean_text(raw_segment.text)
        if text:
            segment = TranscriptSegment(
                start=float(raw_segment.start),
                end=float(raw_segment.end),
                text=text,
            )
            segments.append(segment)
            print(
                f"\rTranscribing: {format_timestamp(segment.end)} / "
                f"{format_timestamp(duration)}",
                end="",
                file=sys.stderr,
                flush=True,
            )
    print(file=sys.stderr)

    info = TranscriptInfo(
        language=str(raw_info.language),
        language_probability=float(raw_info.language_probability),
        duration=duration,
    )
    return segments, info


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Transcribe audio locally with faster-whisper and create TXT and "
            "readable Markdown outputs."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("input", type=Path, help="Path to the input audio file")
    parser.add_argument("--model", default="large-v3", help="Whisper model name")
    parser.add_argument(
        "--device",
        choices=("auto", "cuda", "cpu"),
        default="auto",
        help="Inference device; auto selects CUDA when available, otherwise CPU",
    )
    parser.add_argument(
        "--compute-type",
        default=None,
        help="Override compute type; defaults to float16 on CUDA, float32 on CPU",
    )
    parser.add_argument(
        "--language",
        default=None,
        help="ISO language code such as en or id; omit for auto-detection",
    )
    parser.add_argument("--beam-size", type=int, default=5, help="Decoding beam size")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Output directory; defaults to the input file's directory",
    )
    parser.add_argument(
        "--no-vad",
        action="store_true",
        help="Disable silence filtering",
    )
    return parser


def main(
    argv: Optional[Sequence[str]] = None,
    on_progress: Optional[Callable[[str, float], None]] = None,
) -> int:
    args = build_parser().parse_args(argv)
    args.input = args.input.expanduser().resolve()

    if not args.input.is_file():
        print(f"Error: input file not found: {args.input}", file=sys.stderr)
        return 2
    if args.beam_size < 1:
        print("Error: --beam-size must be at least 1", file=sys.stderr)
        return 2
    output_dir = (
        args.output_dir.expanduser().resolve()
        if args.output_dir is not None
        else args.input.parent
    )

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        segments, info = transcribe_audio(args, on_progress=on_progress)
        if not segments:
            print("Error: no speech was detected in the audio.", file=sys.stderr)
            return 1

        if on_progress:
            on_progress('SAVING', 99)
        txt_path = output_dir / f"{args.input.stem}.txt"
        md_path = output_dir / f"{args.input.stem}.md"
        txt_path.write_text(render_plain_text(segments), encoding="utf-8")
        md_path.write_text(
            render_markdown(args.input, args.model, info, segments),
            encoding="utf-8",
        )
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        if args.device in ("auto", "cuda"):
            print(
                "If this is a CUDA error, verify your NVIDIA driver and the "
                "CUDA/cuDNN libraries required by CTranslate2.",
                file=sys.stderr,
            )
        return 1

    print(f"Language: {info.language} ({info.language_probability:.1%})")
    print(f"Text:     {txt_path}")
    print(f"Markdown: {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
