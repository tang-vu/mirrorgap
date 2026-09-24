# MirrorGap short demo video

Watch: https://youtu.be/rqIeHMNVLhk

The render uses the repository's fixture UI captures and a VoiceTake personal-voice WAV. All shown observations are synthetic. The narration and video are local artifacts under ignored `data/video-demo/`; the speaker's voice is not checked into the public repository.

## Narration

> Tokenized assets promise to mirror reality. But when wrappers disagree, what can we actually prove? Meet MirrorGap.
>
> It observes tokenized representations side by side and detects differences against the tokenized aggregate. It keeps freshness and market hours visible, so a price difference never becomes an unsupported claim about the underlying asset.
>
> Follow an incident through its recorded history. Then open an evidence capsule: the measurements, claim limits, and provenance travel together. Its receipt can be rehashed and its calculations audited. Change the evidence, and the audit catches it.
>
> MirrorGap turns a suspicious price difference into an inspectable investigation. Observe. Detect. Investigate. Prove.

VoiceTake currently synthesizes English speech. This script is in English for the hackathon demo.

## Render

Requires Python with Pillow, plus `ffmpeg` and `ffprobe` on `PATH`.

Save the VoiceTake WAV to `data/video-demo/narration.wav`, then run:

```powershell
python scripts/render-demo-video.py data/video-demo/narration.wav
```

Output: `data/video-demo/mirrorgap-demo.mp4` (1920×1080, H.264/AAC). If VoiceTake's `captions.srt` is alongside the WAV, the MP4 also includes selectable captions. The frames use checked-in fixture screenshots in `docs/ui/`. The video does not imply live market data, authenticated underlying parity, or a signed receipt where no signing key was used.
