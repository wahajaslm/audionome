#!/usr/bin/env python3
"""
Render Chaap Tilak Visualizers (Inferno Colormap)
Supported Targets:
  - lr-frequency: Left-to-Right Frequency Spectrum Mobile (1080x1920) with direct frequency stem badges
  - lr-daw: Left-to-Right DAW Piano-Roll Spectrogram Mobile (1080x1920) with Y-axis stem brackets
  - annotated: Mobile Horizon CQT Waterfall with In-Spectrum Telemetry (1080x1920)
  - mobile: Clean Mobile CQT Waterfall (1080x1920)
  - desktop: Desktop CQT Waterfall (1920x1080)
"""
import os
import sys
import subprocess
from pathlib import Path
import argparse

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCES_DIR = BASE_DIR / "sources"
ASSETS_DIR = BASE_DIR / "assets"
RENDERS_DIR = BASE_DIR / "renders" / "final"
RENDERS_DIR.mkdir(parents=True, exist_ok=True)

CLIP_PATH = SOURCES_DIR / "chaap_tilak_clip_56_77.mp4"
PREBUFFERED_AUDIO_PATH = SOURCES_DIR / "chaap_tilak_prebuffered_56_77.wav"
CLUT_PATH = ASSETS_DIR / "inferno_clut.png"
AXIS_1080_PATH = ASSETS_DIR / "axis_1080_v2.png"
AXIS_HORIZON_PATH = ASSETS_DIR / "axis_horizon_daw.png"
AXIS_1920_PATH = ASSETS_DIR / "axis_1920_v2.png"

def check_dependencies():
    for p in [CLIP_PATH, PREBUFFERED_AUDIO_PATH, CLUT_PATH]:
        if not p.exists():
            raise FileNotFoundError(f"Missing required source file: {p}")

def render_lr_frequency():
    script = BASE_DIR / "scripts" / "render_lr_frequency_mobile.py"
    print("\n>>> Running Option 1: Left-to-Right Frequency Spectrum Mobile Render...")
    subprocess.run([sys.executable, str(script)], check=True)

def render_lr_daw():
    script = BASE_DIR / "scripts" / "render_lr_daw_mobile.py"
    print("\n>>> Running Option 2: Left-to-Right DAW Piano-Roll Mobile Render...")
    subprocess.run([sys.executable, str(script)], check=True)

def render_annotated():
    script = BASE_DIR / "scripts" / "render_annotated_cqt_mobile.py"
    print("\n>>> Running Mobile Horizon Annotated CQT Render...")
    subprocess.run([sys.executable, str(script)], check=True)

def render_mobile():
    out_path = RENDERS_DIR / "chaap_tilak_cqt_mobile_final.mp4"
    print(f"\n>>> Rendering Clean Mobile CQT Waterfall: {out_path.name}")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(CLIP_PATH),
        "-i", str(PREBUFFERED_AUDIO_PATH),
        "-i", str(CLUT_PATH),
        "-i", str(AXIS_1080_PATH),
        "-filter_complex",
        "[0:v]scale=1080:608,setsar=1[top_vid]; "
        "[1:a]showcqt=s=1080x1232:rate=25:basefreq=65.406:endfreq=8372:sono_h=750:bar_h=482:axis_h=0:sono_v=28:bar_v=32:sono_g=2.8:bar_g=1.4[cqt_raw]; "
        "[cqt_raw]trim=start=16:duration=21,setpts=PTS-STARTPTS[cqt_trim]; "
        "[cqt_trim][2:v]haldclut,format=yuv420p,setsar=1[cqt_inferno]; "
        "[3:v]format=yuv420p,setsar=1[axis]; "
        "[top_vid][cqt_inferno][axis]vstack=inputs=3,setsar=1[outv]",
        "-map", "[outv]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        str(out_path)
    ]
    subprocess.run(cmd, check=True)
    print(f"✓ Mobile render complete: {out_path}")

def render_desktop():
    out_path = RENDERS_DIR / "chaap_tilak_cqt_desktop_final.mp4"
    print(f"\n>>> Rendering Desktop CQT Waterfall: {out_path.name}")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(CLIP_PATH),
        "-i", str(PREBUFFERED_AUDIO_PATH),
        "-i", str(CLUT_PATH),
        "-i", str(AXIS_1920_PATH),
        "-filter_complex",
        "[0:v]scale=960:540,pad=1920:540:480:0:black,setsar=1[top_vid]; "
        "[1:a]showcqt=s=1920x480:rate=25:basefreq=65.406:endfreq=8372:sono_h=300:bar_h=180:axis_h=0:sono_v=28:bar_v=32:sono_g=2.8:bar_g=1.4[cqt_raw]; "
        "[cqt_raw]trim=start=16:duration=21,setpts=PTS-STARTPTS[cqt_trim]; "
        "[cqt_trim][2:v]haldclut,format=yuv420p,setsar=1[cqt_inferno]; "
        "[3:v]format=yuv420p,setsar=1[axis]; "
        "[top_vid][cqt_inferno][axis]vstack=inputs=3,setsar=1[outv]",
        "-map", "[outv]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        str(out_path)
    ]
    subprocess.run(cmd, check=True)
    print(f"✓ Desktop render complete: {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Render Chaap Tilak Visualizers")
    parser.add_argument(
        "--target",
        choices=["lr-frequency", "lr-daw", "annotated", "mobile", "desktop", "all"],
        default="lr-frequency",
        help="Target output"
    )
    args = parser.parse_args()

    check_dependencies()
    if args.target in ["lr-frequency", "all"]:
        render_lr_frequency()
    if args.target in ["lr-daw", "all"]:
        render_lr_daw()
    if args.target in ["annotated", "all"]:
        render_annotated()
    if args.target in ["mobile", "all"]:
        render_mobile()
    if args.target in ["desktop", "all"]:
        render_desktop()
    print("\nAll requested renders completed successfully!")
