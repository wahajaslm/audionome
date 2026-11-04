#!/usr/bin/env python3
"""
Render Chaap Tilak Horizontal DAW-Style CQT Spectrogram Visualizer (Inferno Colormap)
Features:
  - Time flows horizontally along X-axis from a right-edge playhead needle to the left
  - Pitch mapped vertically on Y-axis from C2 (65.4 Hz) to C8 (4186 Hz) across 6 octaves
  - 48 bins/octave (288 bins total), hop_length=128 (344 fps temporal precision)
  - Calibrated -48.0 dB noise-floor cutoff with 1.35 gamma contrast curve (zero boosted noise)
  - Full rolling 7.0-second retention buffer, pre-buffered from 00:40 (zero start void)
  - High-contrast Note Ruler with bold gold octave markers (C2-C8) and semitone ticks
"""
import os
import sys
import time
import argparse
import subprocess
from pathlib import Path
import numpy as np
import matplotlib
from PIL import Image, ImageDraw, ImageFont
import librosa

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCES_DIR = BASE_DIR / "sources"
RENDERS_DIR = BASE_DIR / "renders" / "final"
RENDERS_DIR.mkdir(parents=True, exist_ok=True)

AUDIO_PATH = SOURCES_DIR / "chaap_tilak_prebuffered_56_77.wav"
CLIP_PATH = SOURCES_DIR / "chaap_tilak_clip_56_77.mp4"

# Settings
FPS = 25
DURATION = 21.0
TOTAL_FRAMES = int(round(FPS * DURATION))
T_OFFSET = 16.0  # 00:56 starts at 16.0s into prebuffered audio (00:40 start)
T_WINDOW = 7.0   # 7.0 seconds visible retention history

FMIN = librosa.note_to_hz('C2')
N_OCTAVES = 6
BINS_PER_OCTAVE = 48
N_BINS = N_OCTAVES * BINS_PER_OCTAVE
HOP_LENGTH = 128

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Fonts
def get_fonts():
    font_paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    font_semi_paths = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    fb = None
    fs = None
    for p in font_paths:
        if os.path.exists(p):
            fb = p
            break
    for p in font_semi_paths:
        if os.path.exists(p):
            fs = p
            break
            
    if fb and fs:
        try:
            return {
                "oct": ImageFont.truetype(fb, 14),
                "semi": ImageFont.truetype(fs, 10),
                "mob_oct": ImageFont.truetype(fb, 18),
                "mob_semi": ImageFont.truetype(fs, 12),
                "badge": ImageFont.truetype(fb, 11),
                "mob_badge": ImageFont.truetype(fb, 13),
            }
        except Exception:
            pass
            
    default_f = ImageFont.load_default()
    return {k: default_f for k in ["oct", "semi", "mob_oct", "mob_semi", "badge", "mob_badge"]}

FONTS = get_fonts()

def compute_cqt_matrix():
    print("=== Computing High-Resolution Denoised CQT Matrix ===")
    t0 = time.time()
    if not AUDIO_PATH.exists():
        raise FileNotFoundError(f"Missing prebuffered audio: {AUDIO_PATH}")
        
    y_full, sr = librosa.load(str(AUDIO_PATH), sr=44100)
    
    C = librosa.cqt(
        y=y_full, 
        sr=sr, 
        hop_length=HOP_LENGTH, 
        fmin=FMIN, 
        n_bins=N_BINS, 
        bins_per_octave=BINS_PER_OCTAVE
    )
    C_mag = np.abs(C)
    # Flip vertically so C2 is at bottom, C8 at top
    C_dB = np.flipud(librosa.amplitude_to_db(C_mag, ref=np.max))
    
    # Calibrated Noise Floor (-48.0 dB) & Soft Gamma Contrast (1.35)
    vmin, vmax = -48.0, 0.0
    norm = np.clip((C_dB - vmin) / (vmax - vmin), 0.0, 1.0)
    norm = np.power(norm, 1.35)
    
    cmap = matplotlib.colormaps["inferno"]
    colored_full = (cmap(norm)[:, :, :3] * 255).astype(np.uint8)
    print(f"CQT Matrix computed in {time.time()-t0:.2f}s! Shape: {colored_full.shape}")
    return colored_full, sr

def create_overlay(width, height, ruler_w, is_mobile=False):
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Dark ruler background
    draw.rectangle([(0, 0), (ruler_w, height)], fill=(12, 10, 22, 240))
    # Border separating ruler and spectrogram
    draw.line([(ruler_w, 0), (ruler_w, height)], fill=(110, 110, 160, 220), width=2)
    # Top border separating video from spectrogram
    draw.line([(0, 0), (width, 0)], fill=(160, 150, 200, 255), width=2)
    
    foct = FONTS["mob_oct"] if is_mobile else FONTS["oct"]
    fsemi = FONTS["mob_semi"] if is_mobile else FONTS["semi"]
    fbadge = FONTS["mob_badge"] if is_mobile else FONTS["badge"]
    
    oct_h = height / float(N_OCTAVES)
    semi_h = oct_h / 12.0
    
    for oct_i in range(N_OCTAVES):
        oct_num = oct_i + 2  # C2 to C7 base
        for semi_i, name in enumerate(NOTE_NAMES):
            y_pos = int(round(height - (oct_i * oct_h + semi_i * semi_h)))
            if y_pos < 0 or y_pos >= height:
                continue
            if name == "C":
                # Octave boundary line across the whole spectrum
                draw.line([(ruler_w, y_pos), (width, y_pos)], fill=(255, 255, 255, 45), width=1)
                # Gold tick
                draw.line([(ruler_w - 16, y_pos), (ruler_w, y_pos)], fill=(255, 215, 0, 255), width=2)
                # Gold label
                offset_y = 10 if not is_mobile else 12
                draw.text((10, y_pos - offset_y), f"C{oct_num}", fill=(255, 215, 0, 255), font=foct)
            elif name in ["D", "E", "F", "G", "A", "B"]:
                is_major = name in ["E", "G", "A"]
                line_alpha = 24 if is_major else 12
                draw.line([(ruler_w, y_pos), (width, y_pos)], fill=(200, 200, 255, line_alpha), width=1)
                draw.line([(ruler_w - (10 if is_major else 6), y_pos), (ruler_w, y_pos)], fill=(180, 180, 220, 180), width=1)
                if is_major or is_mobile:
                    text_x = ruler_w - (34 if not is_mobile else 40)
                    text_y = y_pos - (6 if not is_mobile else 8)
                    draw.text((text_x, text_y), f"{name}{oct_num}", fill=(185, 185, 225, 200), font=fsemi)
            else:
                # Sharps tick
                draw.line([(ruler_w - 4, y_pos), (ruler_w, y_pos)], fill=(130, 130, 160, 110), width=1)
                
    # Top C8 boundary
    draw.line([(ruler_w, 1), (width, 1)], fill=(255, 215, 0, 255), width=2)
    draw.text((10, 3), "C8", fill=(255, 215, 0, 255), font=foct)
    
    # Modern HUD Badge
    badge_text = "CHAAP TILAK (00:56 - 01:17)  |  CQT SPECTRUM (INFERNO)  |  C2 - C8"
    bw = 480 if not is_mobile else 470
    bh = 26 if not is_mobile else 30
    draw.rectangle([(ruler_w + 14, 10), (ruler_w + bw, 10 + bh)], fill=(10, 8, 20, 220), outline=(90, 85, 130, 180), width=1)
    draw.text((ruler_w + 24, 10 + (6 if not is_mobile else 7)), badge_text, fill=(255, 225, 160, 255), font=fbadge)
    
    return overlay

def render_horizontal_video(out_path, width, height, vid_w, vid_h, colored_full, sr, is_mobile=False):
    print(f"\nRendering {out_path.name} ({width}x{height}, {FPS} fps, {DURATION}s)...")
    t_start = time.time()
    
    spec_h = height - vid_h
    ruler_w = 100 if is_mobile else 95
    spec_w = width - ruler_w
    
    overlay = create_overlay(width, spec_h, ruler_w, is_mobile=is_mobile)
    
    if is_mobile:
        filter_complex = f"[0:v]scale={vid_w}:{vid_h},setsar=1[top_vid]; [1:v]format=yuv420p,setsar=1[spec]; [top_vid][spec]vstack,setsar=1[outv]"
    else:
        filter_complex = f"[0:v]scale=960:540,pad=1920:540:480:0:black,setsar=1[top_vid]; [1:v]format=yuv420p,setsar=1[spec]; [top_vid][spec]vstack,setsar=1[outv]"
        
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", str(CLIP_PATH),
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "-s", f"{width}x{spec_h}",
        "-r", str(FPS),
        "-i", "-",
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        str(out_path)
    ]
    
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    cursor_x = width - 2
    
    for f in range(TOTAL_FRAMES):
        t_curr = f / float(FPS)
        t_audio = T_OFFSET + t_curr
        t_win_start = t_audio - T_WINDOW
        
        col_start = int(t_win_start * sr / HOP_LENGTH)
        col_end = int(t_audio * sr / HOP_LENGTH)
        
        slice_cols = colored_full[:, col_start:col_end, :]
        slice_resized = Image.fromarray(slice_cols).resize((spec_w, spec_h), Image.Resampling.BILINEAR)
        
        canvas = np.zeros((spec_h, width, 3), dtype=np.uint8)
        canvas[:, ruler_w:, :] = np.array(slice_resized)
        
        frame_pil = Image.fromarray(canvas).convert("RGBA")
        frame_comp = Image.alpha_composite(frame_pil, overlay)
        draw_comp = ImageDraw.Draw(frame_comp)
        
        # Glowing vertical playhead needle
        draw_comp.line([(cursor_x, 0), (cursor_x, spec_h)], fill=(255, 240, 180, 240), width=2)
        draw_comp.polygon([(cursor_x - 6, 2), (cursor_x + 6, 2), (cursor_x, 14)], fill=(255, 215, 0, 255))
        draw_comp.polygon([(cursor_x - 6, spec_h - 2), (cursor_x + 6, spec_h - 2), (cursor_x, spec_h - 14)], fill=(255, 215, 0, 255))
        
        proc.stdin.write(frame_comp.convert("RGB").tobytes())
        
    proc.stdin.close()
    proc.wait()
    if proc.returncode != 0:
        stderr = proc.stderr.read().decode('utf-8')
        raise RuntimeError(f"FFmpeg failed: {stderr[-500:]}")
    print(f"✓ Render complete in {time.time()-t_start:.2f}s: {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Render Chaap Tilak Horizontal CQT Spectrogram Visualizer")
    parser.add_argument("--target", choices=["mobile", "desktop", "both"], default="both", help="Target output")
    args = parser.parse_args()
    
    colored_full, sr = compute_cqt_matrix()
    
    if args.target in ["desktop", "both"]:
        render_horizontal_video(
            out_path=RENDERS_DIR / "chaap_tilak_cqt_horizontal_desktop_56_77.mp4",
            width=1920,
            height=1080,
            vid_w=1920,
            vid_h=540,
            colored_full=colored_full,
            sr=sr,
            is_mobile=False
        )
    if args.target in ["mobile", "both"]:
        render_horizontal_video(
            out_path=RENDERS_DIR / "chaap_tilak_cqt_horizontal_mobile_56_77.mp4",
            width=1080,
            height=1920,
            vid_w=1080,
            vid_h=608,
            colored_full=colored_full,
            sr=sr,
            is_mobile=True
        )
    print("\nAll requested horizontal transforms completed successfully!")

