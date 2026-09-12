import unittest
import importlib.util
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from transcribe_web import validate_audio


class MediaValidationTests(unittest.TestCase):
    def setUp(self):
        self.container = MagicMock()
        self.container.streams.audio = [object()]
        self.container.decode.return_value = iter([object()])
        self.av = MagicMock()
        self.av.open.return_value.__enter__.return_value = self.container
        self.av.error = SimpleNamespace(FFmpegError=OSError)

    def test_audio_track_in_video_is_accepted(self):
        with patch.dict('sys.modules', {'av': self.av}):
            validate_audio(Path('meeting.mp4'))
        self.container.decode.assert_called_once_with(audio=0)

    def test_video_without_audio_is_rejected(self):
        self.container.streams.audio = []
        with patch.dict('sys.modules', {'av': self.av}), self.assertRaisesRegex(ValueError, 'no audio track'):
            validate_audio(Path('silent.mp4'))

    def test_empty_audio_is_rejected(self):
        self.container.decode.return_value = iter([])
        with patch.dict('sys.modules', {'av': self.av}), self.assertRaisesRegex(ValueError, 'empty'):
            validate_audio(Path('empty.wav'))

    def test_corrupt_file_is_rejected(self):
        self.av.open.side_effect = OSError('invalid data')
        with patch.dict('sys.modules', {'av': self.av}), self.assertRaisesRegex(ValueError, 'Cannot read'):
            validate_audio(Path('fake.mp3'))


@unittest.skipUnless(importlib.util.find_spec('av'), 'PyAV is not installed')
class RealVideoValidationTests(unittest.TestCase):
    def make_video(self, path, with_audio):
        import av
        import numpy as np

        with av.open(str(path), 'w') as output:
            video = output.add_stream('mpeg4', rate=24)
            video.width = 64
            video.height = 64
            video.pix_fmt = 'yuv420p'
            if with_audio:
                audio = output.add_stream('aac', rate=16000)
                audio.layout = 'mono'
            frame = av.VideoFrame.from_ndarray(np.zeros((64, 64, 3), dtype=np.uint8), format='rgb24')
            for packet in video.encode(frame):
                output.mux(packet)
            for packet in video.encode():
                output.mux(packet)
            if with_audio:
                frame = av.AudioFrame.from_ndarray(np.zeros((1, 16000), dtype=np.float32), format='fltp', layout='mono')
                frame.sample_rate = 16000
                for packet in audio.encode(frame):
                    output.mux(packet)
                for packet in audio.encode():
                    output.mux(packet)

    def test_real_mp4_audio_track_is_decodable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'meeting.mp4'
            self.make_video(path, True)
            validate_audio(path)

    def test_real_video_without_audio_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'silent.mp4'
            self.make_video(path, False)
            with self.assertRaisesRegex(ValueError, 'no audio track'):
                validate_audio(path)


if __name__ == '__main__':
    unittest.main()
