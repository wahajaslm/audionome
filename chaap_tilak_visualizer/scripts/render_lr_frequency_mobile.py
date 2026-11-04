#!/usr/bin/env python3
"""
Render Option 1: Left-to-Right Frequency Spectrum Visualizer (1080x1920 Mobile)
Features:
  - 100% full-resolution Left-to-Right Harmonic Spectrum (bar_h=750, basefreq=65.406, endfreq=8372)
  - Frequency X-axis spans from Left (65.4 Hz, C2) to Right (8372 Hz, C9) in Inferno colormap
  - Horizon Piano Note Axis at y=1410 (ivory/ebony keys, C2-C9, 65Hz - 8.37kHz)
  - 4 Direct Frequency Stem Annotation Badges at y=1495 (Tabla, Harmonium, Vocals, Clapping & Air)
  - 365px LinkedIn Mobile Safe Area at bottom (y=1555..1920)
  - Minimalist glassmorphic telemetry HUD pill (123 BPM beat-pulsing dot, C# Minor Key 89%, Devotional Ecstasy Affect, Live Vocal & Tabla meters)
"""

import os
import sys
import time
import math
import subprocess
from pathlib import Path
import numpy as np
import librosa
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCES_DIR = BASE_DIR / "sources"
ASSETS_DIR = BASE_DIR / "assets"
RENDERS_DIR = BASE_DIR / "renders" / "final"
RENDERS_DIR.mkdir(parents=True, exist_ok=True)

CLIP_PATH = SOURCES_DIR / "chaap_tilak_clip_56_77.mp4"
PREBUFFERED_AUDIO_PATH = SOURCES_DIR / "chaap_tilak_prebuffered_56_77.wav"
CLUT_PATH = ASSETS_DIR / "inferno_clut.png"
AXIS_PATH = ASSETS_DIR / "axis_horizon_daw.png"
OUTPUT_VIDEO_PATH = RENDERS_DIR / "chaap_tilak_cqt_lr_frequency_mobile.mp4"

FPS = 25
DURATION = 21.0
TOTAL_FRAMES = int(round(FPS * DURATION))
WIDTH = 1080
HEIGHT = 1920

def extract_stem_telemetry(audio_path, duration=21.0, offset=16.0, fps=25):
    print(">>> Extracting stem dynamics from audio...")
    y_full, sr = librosa.load(str(audio_path), sr=22050)
    y_clip = y_full[int(offset * sr):int((offset + duration) * sr)]

    h_comp, p_comp = librosa.effects.hpss(y_clip, margin=1.2)
    stft = librosa.stft(h_comp, n_fft=2048, hop_length=512)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    vocal_mask = ((freqs >= 300.0) & (freqs <= 3400.0)).astype(np.float64)[:, np.newaxis]
    harmonium_mask = ((freqs >= 130.0) & (freqs < 300.0)).astype(np.float64)[:, np.newaxis]

    st_vocals = librosa.istft(stft * vocal_mask, hop_length=512, length=len(y_clip))
    st_harmonium = librosa.istft(stft * harmonium_mask, hop_length=512, length=len(y_clip))
    st_tabla = p_comp

    total_frames = int(round(fps * duration))
    samples_per_frame = int(round(sr / fps))

    vocal_levels = np.zeros(total_frames, dtype=np.float32)
    tabla_levels = np.zeros(total_frames, dtype=np.float32)
    harmonium_levels = np.zeros(total_frames, dtype=np.float32)

    for i in range(total_frames):
        s_start = i * samples_per_frame
        s_end = min(s_start + samples_per_frame, len(y_clip))
        chunk_v = st_vocals[s_start:s_end]
        chunk_t = st_tabla[s_start:s_end]
        chunk_h = st_harmonium[s_start:s_end]

        vocal_levels[i] = np.sqrt(np.mean(chunk_v**2)) if len(chunk_v) > 0 else 0
        tabla_levels[i] = np.sqrt(np.mean(chunk_t**2)) if len(chunk_t) > 0 else 0
        harmonium_levels[i] = np.sqrt(np.mean(chunk_h**2)) if len(chunk_h) > 0 else 0

    def smooth_meter(raw_levels, attack=0.85, decay=0.88, gain=1.3):
        smoothed = np.zeros_like(raw_levels)
        max_val = np.percentile(raw_levels, 98) if np.percentile(raw_levels, 98) > 0 else 1.0
        norm = np.clip((raw_levels / max_val) * gain, 0.0, 1.0)
        curr = 0.0
        for i in range(len(norm)):
            if norm[i] > curr:
                curr = curr * (1 - attack) + norm[i] * attack
            else:
                curr = curr * decay
            smoothed[i] = curr
        return smoothed

    vocal_norm = smooth_meter(vocal_levels, attack=0.85, decay=0.90, gain=1.2)
    tabla_norm = smooth_meter(tabla_levels, attack=0.95, decay=0.80, gain=1.3)
    harmonium_norm = smooth_meter(harmonium_levels, attack=0.6, decay=0.94, gain=1.1)

    return vocal_norm, tabla_norm, harmonium_norm

def render_telemetry_overlay_video(overlay_video_path, vocal_norm, tabla_norm, harmonium_norm):
    print(f">>> Generating Option 1 Telemetry Overlay: {overlay_video_path.name}")
    
    font_bold = None
    font_med = None
    font_small = None
    font_tiny = None
    for f in [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
    ]:
        if os.path.exists(f):
            try:
                if font_bold is None:
                    font_bold = ImageFont.truetype(f, 21)
                if font_med is None:
                    font_med = ImageFont.truetype(f, 16)
                if font_small is None:
                    font_small = ImageFont.truetype(f, 13)
            except Exception:
                pass
    if os.path.exists("/System/Library/Fonts/SFNSMono.ttf"):
        try:
            font_tiny = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 12)
        except Exception:
            font_tiny = font_small
    else:
        font_tiny = font_small

    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{WIDTH}x{HEIGHT}",
        "-pix_fmt", "rgba",
        "-r", str(FPS),
        "-i", "-",
        "-c:v", "png",
        "-pix_fmt", "rgba",
        str(overlay_video_path)
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    bpm = 123.0
    sec_per_beat = 60.0 / bpm

    for frame_idx in range(TOTAL_FRAMES):
        t = frame_idx / float(FPS)
        beat_phase = (t / sec_per_beat) % 1.0
        pulse = math.exp(-beat_phase * 4.5)
        
        v_lvl = vocal_norm[frame_idx]
        t_lvl = tabla_norm[frame_idx]
        h_lvl = harmonium_norm[frame_idx]

        img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # 1. Top Glass Telemetry HUD Pill (Centered at y = 614..658)
        pill_x1, pill_y1, pill_x2, pill_y2 = 35, 614, 1045, 658
        draw.rounded_rectangle(
            [pill_x1, pill_y1, pill_x2, pill_y2],
            radius=12,
            fill=(14, 12, 22, 225),
            outline=(255, 215, 80, 140),
            width=1
        )

        # Beat Pulse Dot
        dot_r = 7 + int(round(pulse * 3.5))
        dot_cx = pill_x1 + 25
        dot_cy = (pill_y1 + pill_y2) // 2
        if pulse > 0.15:
            halo_r = dot_r + int(round(pulse * 4.0))
            draw.ellipse(
                [dot_cx - halo_r, dot_cy - halo_r, dot_cx + halo_r, dot_cy + halo_r],
                fill=(255, 215, 60, int(round(pulse * 90)))
            )
        draw.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=(255, 220, 70, 255))
        draw.text((pill_x1 + 42, pill_y1 + 11), "123 BPM", fill=(255, 255, 255), font=font_med)

        # Divider 1
        draw.line([(pill_x1 + 130, pill_y1 + 10), (pill_x1 + 130, pill_y2 - 10)], fill=(255, 255, 255, 45), width=1)
        draw.text((pill_x1 + 146, pill_y1 + 11), "KEY: C# MINOR (89%)", fill=(255, 220, 100), font=font_med)

        # Divider 2
        draw.line([(pill_x1 + 360, pill_y1 + 10), (pill_x1 + 360, pill_y2 - 10)], fill=(255, 255, 255, 45), width=1)
        draw.text((pill_x1 + 376, pill_y1 + 11), "AFFECT: DEVOTIONAL ECSTASY", fill=(240, 180, 255), font=font_med)

        # Divider 3
        draw.line([(pill_x1 + 695, pill_y1 + 10), (pill_x1 + 695, pill_y2 - 10)], fill=(255, 255, 255, 45), width=1)

        # Real-time Stem Meters
        draw.text((pill_x1 + 710, pill_y1 + 11), "VOCAL", fill=(255, 120, 140), font=font_tiny)
        meter_w = 70
        draw.rounded_rectangle([pill_x1 + 760, pill_y1 + 16, pill_x1 + 760 + meter_w, pill_y1 + 24], radius=3, fill=(35, 25, 40), outline=(255, 120, 140, 90))
        v_bar_w = int(round(meter_w * v_lvl))
        if v_bar_w > 0:
            draw.rounded_rectangle([pill_x1 + 760, pill_y1 + 16, pill_x1 + 760 + v_bar_w, pill_y1 + 24], radius=3, fill=(255, 120, 140, 240))

        draw.text((pill_x1 + 848, pill_y1 + 11), "TABLA", fill=(255, 190, 80), font=font_tiny)
        draw.rounded_rectangle([pill_x1 + 898, pill_y1 + 16, pill_x1 + 898 + meter_w, pill_y1 + 24], radius=3, fill=(35, 30, 25), outline=(255, 190, 80, 90))
        t_bar_w = int(round(meter_w * t_lvl))
        if t_bar_w > 0:
            draw.rounded_rectangle([pill_x1 + 898, pill_y1 + 16, pill_x1 + 898 + t_bar_w, pill_y1 + 24], radius=3, fill=(255, 190, 80, 240))

        # 2. Direct Frequency Stem Badges (y = 1495..1555)
        def draw_stem_badge(x1, x2, label, subtext, base_col, energy=0.0):
            r = int(min(255, base_col[0] + energy * 40))
            g = int(min(255, base_col[1] + energy * 30))
            b = int(min(255, base_col[2] + energy * 30))
            col = (r, g, b)
            alpha_b = int(min(255, 160 + energy * 95))

            draw.rounded_rectangle(
                [x1, 1495, x2, 1555],
                radius=8,
                fill=(16, 14, 26, 235),
                outline=(*col, alpha_b),
                width=2
            )
            bbox_l = font_small.getbbox(label)
            w_l = bbox_l[2] - bbox_l[0]
            draw.text((x1 + (x2 - x1 - w_l) / 2, 1503), label, fill=col, font=font_small)
            bbox_s = font_tiny.getbbox(subtext)
            w_s = bbox_s[2] - bbox_s[0]
            draw.text((x1 + (x2 - x1 - w_s) / 2, 1530), subtext, fill=(185, 185, 215), font=font_tiny)

        # 4 Stems from Left to Right
        draw_stem_badge(20, 240, "TABLA", "65 - 160 Hz [BAYAN / DAYAN]", (255, 185, 90), energy=t_lvl)
        draw_stem_badge(255, 490, "HARMONIUM", "160 - 500 Hz [C#m REED]", (255, 225, 110), energy=h_lvl)
        draw_stem_badge(505, 810, "VOCALS (NUSRAT & RAHAT)", "500 - 2000 Hz [LEAD]", (255, 110, 140), energy=v_lvl)
        draw_stem_badge(825, 1060, "CLAPPING & AIR", "2 - 8.37 kHz [OVERTONES]", (190, 170, 255), energy=pulse * 0.4)

        proc.stdin.write(img.tobytes())

    proc.stdin.close()
    proc.wait()
    print(f"✓ Telemetry overlay complete: {overlay_video_path}")

def render_option1():
    print(f"\n=======================================================")
    print(f">>> Rendering Option 1: Left-to-Right Frequency Spectrum Mobile Visualizer")
    print(f"    Output: {OUTPUT_VIDEO_PATH.name}")
    print(f"=======================================================")

    vocal_norm, tabla_norm, harmonium_norm = extract_stem_telemetry(PREBUFFERED_AUDIO_PATH, DURATION, 16.0, FPS)
    overlay_path = BASE_DIR / "assets" / "telemetry_overlay_opt1.mov"
    render_telemetry_overlay_video(overlay_path, vocal_norm, tabla_norm, harmonium_norm)

    # Layout:
    # 0..608: Video (1080x608)
    # 608..660: Spacing (52px)
    # 660..1410: Harmonic Bars (1080x750)
    # 1410..1485: Piano Axis (1080x75)
    # 1485..1920: Bottom Safe Area (435px) containing stem badges (1495..1555)
    
    cmd = [
        "ffmpeg", "-y",
        "-i", str(CLIP_PATH),
        "-i", str(PREBUFFERED_AUDIO_PATH),
        "-i", str(CLUT_PATH),
        "-i", str(AXIS_PATH),
        "-i", str(overlay_path),
        "-filter_complex",
        "[0:v]scale=1080:608,setsar=1[top_vid]; "
        "[1:a]showcqt=s=1080x750:rate=25:basefreq=65.406:endfreq=8372:sono_h=0:bar_h=750:axis_h=0:bar_v=32:bar_g=1.4[cqt_raw]; "
        "[cqt_raw]trim=start=16:duration=21,setpts=PTS-STARTPTS[cqt_trim]; "
        "[cqt_trim][2:v]haldclut,format=yuv420p,setsar=1[cqt_inferno]; "
        "[3:v]scale=1080:75,format=yuv420p,setsar=1[axis]; "
        # Assemble canvas: black background 1080x1920, overlay top_vid at 0, cqt_inferno at 660, axis at 1410
        "color=c=0x0a0812:s=1080x1920:r=25:d=21[bg]; "
        "[bg][top_vid]overlay=0:0[b1]; "
        "[b1][cqt_inferno]overlay=0:660[b2]; "
        "[b2][axis]overlay=0:1410[b3]; "
        "[b3][4:v]overlay=0:0:format=auto,setsar=1[outv]",
        "-map", "[outv]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        str(OUTPUT_VIDEO_PATH)
    ]
    t0 = time.time()
    subprocess.run(cmd, check=True)
    print(f"✓ Option 1 render complete in {time.time()-t0:.1f}s: {OUTPUT_VIDEO_PATH}")
    if overlay_path.exists():
        overlay_path.unlink()

if __name__ == "__main__":
    render_option1()

