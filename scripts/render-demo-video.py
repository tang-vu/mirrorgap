"""Render the MirrorGap fixture demo around a local VoiceTake WAV.

Usage: python scripts/render-demo-video.py path/to/narration.wav
The WAV and rendered MP4 stay in ignored data/video-demo/ by default.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "video-demo"
WIDTH, HEIGHT = 1920, 1080
PAPER = "#f3f8f9"
INK = "#10232c"
TEAL = "#126c70"
MUTED = "#6c8188"
FONT = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/segoeuib.ttf")

SCENES = [
    ("01 / THE QUESTION", "Where is\nthe gap?", "One asset. Several tokenized\nrepresentations.", "overview-1440.png", 0.16),
    ("02 / OBSERVE", "See the\ndisagreement.", "Compare wrappers against the\ntokenized aggregate.", "investigation-1440.png", 0.18),
    ("03 / INVESTIGATE", "Know the\nlimits.", "Freshness, market hours, and\nsource limits stay visible.", "manual-comparison-1440.png", 0.20),
    ("04 / FOLLOW", "Replay the\nincident.", "Inspect the recorded sequence,\nnot only its latest state.", "replay-1440.png", 0.16),
    ("05 / PROVE", "Audit the\nevidence.", "Check the receipt, arithmetic,\nand source attribution.", "capsule-1440.png", 0.19),
    ("06 / MIRRORGAP", "Inspect the\ndifference.", "Observe  /  Detect\nInvestigate  /  Prove", "overview-1440.png", 0.11),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT), size)


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def scene_durations(voice: Path, total: float) -> list[float]:
    captions = voice.with_name("captions.srt")
    if captions.is_file():
        matches = re.findall(r"(?m)^(\d\d):(\d\d):(\d\d),(\d\d\d) -->", captions.read_text(encoding="utf-8-sig"))
        if len(matches) >= 7:
            starts = [int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000 for h, m, s, ms in matches]
            cuts = [0, starts[1], starts[2], starts[3], starts[4], starts[6], total]
            if all(b > a for a, b in zip(cuts, cuts[1:])):
                return [b - a for a, b in zip(cuts, cuts[1:])]
    return [total * scene[4] for scene in SCENES]


def card(index: int, scene: tuple[str, str, str, str, float]) -> Path:
    kicker, title, description, screenshot, _ = scene
    canvas = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(canvas)
    d.rectangle((0, 0, WIDTH, 18), fill=TEAL)
    d.rectangle((110, 91, 139, 120), outline=TEAL, width=4)
    d.rectangle((122, 82, 151, 111), outline=TEAL, width=3)
    d.text((172, 74), "MirrorGap", font=font(38, True), fill=INK)
    d.text((1615, 85), "FIXTURE DEMO", font=font(24, True), fill=TEAL)
    d.line((110, 152, 1810, 152), fill="#c8dadd", width=2)
    d.text((110, 255), kicker, font=font(26, True), fill=TEAL)
    d.multiline_text((110, 320), title, font=font(68, True), fill=INK, spacing=8)
    d.multiline_text((115, 590), description, font=font(31), fill=MUTED, spacing=10)
    d.rounded_rectangle((110, 905, 670, 975), radius=12, fill=INK)
    d.text((140, 922), "SYNTHETIC OBSERVATIONS", font=font(25, True), fill="#c5f4eb")
    d.text((115, 1010), "mirrorgap.tangvu.dev", font=font(23), fill=MUTED)

    source = Image.open(ROOT / "docs" / "ui" / screenshot).convert("RGB")
    # Preserve real UI pixels and crop to the relevant chapter of long captures.
    anchors = [0.02, 0.03, 0.12, 0.0, 0.0, 0.02]
    crop_h = min(source.height, int(source.width * 0.68))
    top = min(int(source.height * anchors[index]), source.height - crop_h)
    source = source.crop((0, top, source.width, top + crop_h))
    frame = ImageOps.fit(source, (1000, 640), method=Image.Resampling.LANCZOS)
    d.rounded_rectangle((760, 232, 1810, 922), radius=25, fill="#d8e8e9")
    canvas.paste(frame, (785, 257))
    d.rectangle((785, 257, 1785, 897), outline="#9dbabd", width=2)
    path = OUT / f"scene-{index + 1:02d}.png"
    canvas.save(path, optimize=True)
    return path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/render-demo-video.py narration.wav")
    voice = Path(sys.argv[1]).resolve()
    if not voice.is_file():
        raise SystemExit(f"Narration WAV missing: {voice}")
    OUT.mkdir(parents=True, exist_ok=True)
    total = duration(voice) + 1.0
    timings = scene_durations(voice, total)
    paths = [card(i, scene) for i, scene in enumerate(SCENES)]
    segment_paths = []
    for i, (path, seconds) in enumerate(zip(paths, timings)):
        segment = OUT / f"segment-{i + 1:02d}.mp4"
        fade_out = max(0.0, seconds - 0.35)
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-framerate", "30",
            "-i", str(path), "-t", f"{seconds:.3f}", "-vf",
            f"zoompan=z='min(zoom+0.0002,1.04)':x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':d=1:s={WIDTH}x{HEIGHT}:fps=30,"
            f"fade=t=in:st=0:d=0.25,fade=t=out:st={fade_out:.3f}:d=0.35,format=yuv420p",
            "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", "30", str(segment),
        ], check=True)
        segment_paths.append(segment)
    listing = OUT / "segments.txt"
    listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in segment_paths), encoding="utf-8")
    silent = OUT / "silent.mp4"
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(silent)], check=True)
    final = OUT / "mirrorgap-demo.mp4"
    captions = voice.with_name("captions.srt")
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(silent), "-i", str(voice)]
    if captions.is_file():
        command += ["-i", str(captions)]
    command += ["-map", "0:v:0", "-map", "1:a:0"]
    if captions.is_file():
        command += ["-map", "2:0", "-c:s", "mov_text"]
    command += [
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=1",
        "-t", f"{total:.3f}", "-movflags", "+faststart", str(final),
    ]
    subprocess.run(command, check=True)
    print(final)


if __name__ == "__main__":
    main()
