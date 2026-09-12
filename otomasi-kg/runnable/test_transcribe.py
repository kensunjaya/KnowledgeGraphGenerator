import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from transcribe import (
    TranscriptInfo,
    TranscriptSegment,
    build_parser,
    format_timestamp,
    group_segments,
    render_markdown,
    render_plain_text,
    transcribe_audio,
)


class TranscriptionDeviceTests(unittest.TestCase):
    def run_transcription(self, cuda_count, options=(), cpu_count=8):
        args = build_parser().parse_args(["meeting.wav", *options])
        backend = Mock()
        backend.get_cuda_device_count.return_value = cuda_count
        whisper = Mock()
        whisper.WhisperModel.return_value.transcribe.return_value = (
            iter([
                SimpleNamespace(start=0, end=2, text=" Hello.  world! "),
                SimpleNamespace(start=2, end=3, text="   "),
            ]),
            SimpleNamespace(language="en", language_probability=0.99, duration=3),
        )
        with patch.dict("sys.modules", {"ctranslate2": backend, "faster_whisper": whisper}), \
             patch("transcribe.os.cpu_count", return_value=cpu_count), \
             redirect_stderr(StringIO()):
            result = transcribe_audio(args)
        return whisper.WhisperModel, backend, result

    def test_auto_cuda_uses_large_v3_float16(self):
        model, backend, _ = self.run_transcription(1)
        backend.get_cuda_device_count.assert_called_once_with()
        model.assert_called_once_with("large-v3", device="cuda", compute_type="float16")

    def test_auto_cpu_uses_large_v3_float32_and_cpu_threads(self):
        model, _, _ = self.run_transcription(0)
        model.assert_called_once_with(
            "large-v3", device="cpu", compute_type="float32", cpu_threads=8
        )

    def test_unknown_cpu_count_uses_one_thread(self):
        model, _, _ = self.run_transcription(0, cpu_count=None)
        self.assertEqual(model.call_args.kwargs["cpu_threads"], 1)

    def test_explicit_devices_skip_detection_and_choose_matching_precision(self):
        for device, precision in (("cpu", "float32"), ("cuda", "float16")):
            with self.subTest(device=device):
                model, backend, _ = self.run_transcription(0, ["--device", device])
                backend.get_cuda_device_count.assert_not_called()
                self.assertEqual(model.call_args.kwargs["device"], device)
                self.assertEqual(model.call_args.kwargs["compute_type"], precision)

    def test_explicit_model_and_compute_type_remain_supported(self):
        model, _, _ = self.run_transcription(
            1, ["--model", "local-model", "--compute-type", "float32"]
        )
        model.assert_called_once_with("local-model", device="cuda", compute_type="float32")

    def test_transcription_options_and_segment_conversion_are_unchanged(self):
        model, _, result = self.run_transcription(0)
        model.return_value.transcribe.assert_called_once_with(
            "meeting.wav", language=None, beam_size=5, task="transcribe",
            vad_filter=True, vad_parameters={"min_silence_duration_ms": 500},
        )
        self.assertEqual(result, (
            [TranscriptSegment(0.0, 2.0, "Hello. world!")],
            TranscriptInfo("en", 0.99, 3.0),
        ))

    def test_transcription_overrides_are_unchanged(self):
        model, _, _ = self.run_transcription(
            0, ["--language", "id", "--beam-size", "10", "--no-vad"]
        )
        model.return_value.transcribe.assert_called_once_with(
            "meeting.wav", language="id", beam_size=10, task="transcribe",
            vad_filter=False, vad_parameters={"min_silence_duration_ms": 500},
        )


class TranscriptionFormattingTests(unittest.TestCase):
    def test_timestamp_formats_short_and_long_durations(self):
        self.assertEqual(format_timestamp(65), "01:05")
        self.assertEqual(format_timestamp(3661), "01:01:01")

    def test_groups_on_large_silence(self):
        segments = [
            TranscriptSegment(0, 2, "Hello."),
            TranscriptSegment(2.2, 4, "How are you?"),
            TranscriptSegment(8, 10, "New paragraph."),
        ]
        groups = group_segments(segments)
        self.assertEqual([len(group) for group in groups], [2, 1])

    def test_renders_text_and_markdown(self):
        segments = [
            TranscriptSegment(0, 2, "Hello."),
            TranscriptSegment(2, 4, "This is a test."),
        ]
        info = TranscriptInfo("en", 0.99, 4)

        self.assertEqual(render_plain_text(segments), "Hello. This is a test.\n")
        markdown = render_markdown(Path("meeting.wav"), "large-v3", info, segments)
        self.assertIn("# Transcript: meeting", markdown)
        self.assertIn("**[00:00–00:04]**", markdown)
        self.assertIn("Hello. This is a test.", markdown)


if __name__ == "__main__":
    unittest.main()
