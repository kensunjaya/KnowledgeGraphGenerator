"""Validate uploaded media, then run the existing transcription CLI unchanged."""
import sys
import json
from pathlib import Path

from transcribe import main


def report_progress(stage: str, percent: float) -> None:
    print(json.dumps({'stage': stage, 'percent': percent}), flush=True)


def validate_audio(path: Path) -> None:
    import av

    try:
        with av.open(str(path)) as container:
            if not container.streams.audio:
                raise ValueError("This video has no audio track. Upload a file containing speech.")
            if next(container.decode(audio=0), None) is None:
                raise ValueError("The audio track is empty or unreadable.")
    except av.error.FFmpegError as exc:
        raise ValueError("Cannot read this media file. It may be corrupt or use an unsupported codec.") from exc


if __name__ == '__main__':
    try:
        report_progress('VALIDATING', 0)
        validate_audio(Path(sys.argv[1]))
    except (ValueError, ImportError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
    raise SystemExit(main(sys.argv[1:], on_progress=report_progress))
