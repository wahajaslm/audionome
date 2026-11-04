#!/usr/bin/env python3
"""
Master Broadcast Render: Opta Smooth Luminous Sketch Spectrum
Song: Coke Studio Season 10 | Naina Moray (02:09 - 03:25)
Artists: Javed Bashir & Akbar Ali feat. Aamir Zaki

Layout Architecture (1080x1920 Mobile Portrait):
  - y = 0..608:      Concert Video Clip (1080x608, 16:9)
  - y = 608..728:    Top Dual Axis (H = 120px)
                     Row 1 (y=4..34):   Frequency Scale (Hz/kHz) & Octave Badges (C2..C9) - ABOVE
                     Row 2 (y=38..66):  Instrument Stem Frequency Brackets - ABOVE
                     Row 3 (y=68..119): Piano Keyboard Keys touching spectrum directly
  - y = 728..1852:   Smooth Luminous Sketch Spectrum (H = 1124px)
                     Instantaneous reactive harmonic curve at top under keys
                     Smooth platinum/white waterfall cascading DOWNWARDS (un-reversed)
                     Subtle Opta coordinate grid (Octave pillars & -1s..-4s time lines)
  - y = 1852..1920:  Opta Minimalist Footer Bar (H = 68px)
                     Metadata + Live Tonal Key + Live Chords + 144 BPM Pulsing Dot + Vocal/Drum Meters
"""

import os
import sys
import time
import math
import subprocess
from pathlib import Path
import numpy as np
import scipy.ndimage
from scipy.interpolate import interp1d
from scipy.ndimage import zoom
import librosa
from PIL import Image, ImageDraw, ImageFont

WORKSPACE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(WORKSPACE_DIR))

from services.intelligence.acoustic_features import AcousticFeatureExtractor
from research.dynamic_emotion import DynamicEmotionModel
from services.intelligence.stem_separation import CHORD_TEMPLATES

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCES_DIR = BASE_DIR / "sources"
RENDERS_DIR = BASE_DIR / "renders" / "final"
RENDERS_DIR.mkdir(parents=True, exist_ok=True)

CLIP_VIDEO_PATH = SOURCES_DIR / "naina_moray_clip_129_205.mp4"
CLIP_AUDIO_PATH = SOURCES_DIR / "naina_moray_clip_audio.wav"
OUTPUT_VIDEO_PATH = RENDERS_DIR / "naina_moray_smooth_sketch_spectrum.mp4"

WIDTH = 1080
HEIGHT = 1920
VID_H = 608
SPEC_H = HEIGHT - VID_H # 1312 px

AXIS_H = 120
FOOTER_H = 68
SONO_H = SPEC_H - AXIS_H - FOOTER_H # 1124 px

FPS = 25
DURATION = 76.0
TOTAL_FRAMES = int(round(FPS * DURATION)) # 1900 frames

# Load fonts
f_bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
f_reg = "/System/Library/Fonts/Supplemental/Arial.ttf"
if not os.path.exists(f_bold):
    f_bold = "/System/Library/Fonts/HelveticaNeue.ttc"
    f_reg = "/System/Library/Fonts/HelveticaNeue.ttc"

font_title = ImageFont.truetype(f_bold, 14)
font_sub = ImageFont.truetype(f_reg, 10)
font_note = ImageFont.truetype(f_bold, 12)
font_freq = ImageFont.truetype(f_reg, 10)
font_hud_val = ImageFont.truetype(f_bold, 14)
font_hud_lbl = ImageFont.truetype(f_reg, 10)
font_hud_title = ImageFont.truetype(f_bold, 10)

def extract_music_dna():
    print(">>> [MUSIC DNA] Extracting Native Intelligence for Naina Moray...")
    y_clip, sr_dna = librosa.load(str(CLIP_AUDIO_PATH), sr=22050, mono=True)
    extractor = AcousticFeatureExtractor()
    dna = extractor.extract_from_waveform(y_clip, sample_rate=sr_dna, start_offset=129.0, separate_stems_flag=True)

    key_name = dna['musicalDimensions']['melodyHarmony']['key']
    key_conf = dna['musicalDimensions']['melodyHarmony']['keyConfidence']
    bpm = dna['musicalDimensions']['rhythmGroove']['tempoBpm']

    hop_cqt = int(round(sr_dna / FPS))
    chroma = librosa.feature.chroma_cqt(y=y_clip, sr=sr_dna, hop_length=hop_cqt)
    frame_chords = []
    for f_i in range(chroma.shape[1]):
        c_vec = chroma[:, f_i]
        norm = np.linalg.norm(c_vec)
        if norm < 1e-4:
            frame_chords.append("D#m")
            continue
        c_norm = c_vec / norm
        best_chord = "D#m"
        best_sim = -1.0
        for name, template in CHORD_TEMPLATES.items():
            sim = float(np.dot(c_norm, template))
            if sim > best_sim:
                best_sim = sim
                best_chord = name
        frame_chords.append(best_chord)

    # HPSS for Vocal / Drum meters
    h_comp, p_comp = librosa.effects.hpss(y_clip, margin=1.2)
    stft = librosa.stft(h_comp, n_fft=2048, hop_length=512)
    freqs = librosa.fft_frequencies(sr=sr_dna, n_fft=2048)
    vocal_mask = ((freqs >= 280.0) & (freqs <= 3600.0)).astype(np.float64)[:, np.newaxis]
    st_vocals = librosa.istft(stft * vocal_mask, hop_length=512, length=len(y_clip))
    st_drums = p_comp

    samples_per_frame = int(round(sr_dna / FPS))
    vocal_levels = np.zeros(TOTAL_FRAMES, dtype=np.float32)
    drum_levels = np.zeros(TOTAL_FRAMES, dtype=np.float32)

    for i in range(TOTAL_FRAMES):
        s_start = i * samples_per_frame
        s_end = min(s_start + samples_per_frame, len(y_clip))
        chunk_v = st_vocals[s_start:s_end]
        chunk_d = st_drums[s_start:s_end]
        vocal_levels[i] = np.sqrt(np.mean(chunk_v**2)) if len(chunk_v) > 0 else 0
        drum_levels[i] = np.sqrt(np.mean(chunk_d**2)) if len(chunk_d) > 0 else 0

    def smooth(raw, attack=0.85, decay=0.88):
        sm = np.zeros_like(raw)
        p = np.percentile(raw, 98) if np.percentile(raw, 98) > 0 else 1.0
        norm = np.clip((raw / p) * 1.3, 0.0, 1.0)
        curr = 0.0
        for i in range(len(norm)):
            if norm[i] > curr:
                curr = curr * (1 - attack) + norm[i] * attack
            else:
                curr = curr * decay
            sm[i] = curr
        return sm

    return {
        "key_str": f"{key_name.upper()} ({key_conf*100:.0f}%)",
        "bpm": bpm,
        "frame_chords": frame_chords,
        "vocal_norm": smooth(vocal_levels),
        "drum_norm": smooth(drum_levels)
    }

def create_top_axis_image():
    """
    Creates the Axis Bar with LABELS AND NOTES ABOVE THE PIANO KEYS:
    y = 0..36: Frequency scale labels (Hz/kHz) and Octave Markers (C2..C9)
    y = 36..68: Stem frequency brackets ([BASS], [GUITAR], [VOCALS], [AIR])
    y = 68..120: Piano keyboard keys (White and black keys)
    Bottom of keys touches the top of the spectrum directly at y = 120!
    """
    img = Image.new("RGBA", (WIDTH, AXIS_H), color=(14, 15, 19, 255))
    draw = ImageDraw.Draw(img)

    n_octaves = 7
    oct_w = WIDTH / float(n_octaves)
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    draw.line([(0, 0), (WIDTH, 0)], fill=(45, 48, 58), width=1)

    # 1. Row 1: Frequency scale labels & Note Octaves (y = 4..34) - PLACED ABOVE!
    freq_data = [
        (0, "65.4 Hz", "C2"),
        (1, "131 Hz", "C3"),
        (2, "262 Hz", "C4"),
        (3, "523 Hz", "C5"),
        (4, "1.05 kHz", "C6"),
        (5, "2.09 kHz", "C7"),
        (6, "4.19 kHz", "C8"),
        (7, "8.37 kHz", "C9")
    ]
    for oct_idx, f_str, c_str in freq_data:
        x_pos = int(round(oct_idx * oct_w))
        if oct_idx == 7:
            x_pos = WIDTH - 1
        draw.line([(x_pos, 2), (x_pos, 34)], fill=(65, 70, 85), width=1)
        align_x = x_pos + 4 if oct_idx < 7 else x_pos - 52
        draw.text((align_x, 3), c_str, fill=(255, 255, 255), font=font_note)
        draw.text((align_x, 18), f_str, fill=(160, 165, 180), font=font_freq)

    draw.line([(0, 36), (WIDTH, 36)], fill=(32, 35, 44), width=1)

    # 2. Row 2: Stem frequency brackets (y = 38..66) - PLACED ABOVE!
    bands = [
        (0, int(round(oct_w * 1.93)), "DRUMS & BASS [65 - 250 Hz]", (160, 175, 205)),
        (int(round(oct_w * 1.93)), int(round(oct_w * 2.93)), "GUITAR & REED [250 - 500 Hz]", (215, 195, 160)),
        (int(round(oct_w * 2.93)), int(round(oct_w * 4.93)), "LEAD VOCALS [500 - 2000 Hz]", (255, 225, 170)),
        (int(round(oct_w * 4.93)), WIDTH, "AIR & HARMONICS [2 - 8.37 kHz]", (180, 210, 235))
    ]
    for bx1, bx2, bname, bcolor in bands:
        draw.rounded_rectangle([bx1 + 3, 39, bx2 - 3, 64], radius=3, fill=(20, 22, 28), outline=(48, 52, 64))
        bbox = draw.textbbox((0, 0), bname, font=font_sub)
        bw = bbox[2] - bbox[0]
        bcx = (bx1 + bx2) // 2 - bw // 2
        draw.text((max(bx1 + 6, bcx), 44), bname, fill=bcolor, font=font_sub)

    draw.line([(0, 67), (WIDTH, 67)], fill=(32, 35, 44), width=1)

    # 3. Row 3: Piano keyboard keys (y = 68..119) - Touching spectrum directly!
    key_top = 68
    key_bot = 119
    black_h = 32

    draw.rectangle([(0, key_top), (WIDTH, key_bot)], fill=(242, 244, 248))
    for oct_i in range(n_octaves):
        oct_x = oct_i * oct_w
        for semi_i in range(12):
            semi_x = oct_x + (semi_i / 12.0) * oct_w
            name = note_names[semi_i]
            if '#' not in name:
                draw.line([(semi_x, key_top), (semi_x, key_bot)], fill=(185, 188, 198), width=1)

    for oct_i in range(n_octaves):
        oct_x = oct_i * oct_w
        for semi_i in range(12):
            semi_x = oct_x + (semi_i / 12.0) * oct_w
            w_semi = oct_w / 12.0
            name = note_names[semi_i]
            if '#' in name:
                draw.rectangle([(semi_x + 1, key_top), (semi_x + w_semi - 1, key_top + black_h)], fill=(22, 23, 28), outline=(10, 11, 14))
                draw.line([(semi_x + 2, key_top + 1), (semi_x + w_semi - 2, key_top + 1)], fill=(60, 64, 76))

    draw.line([(0, 119), (WIDTH, 119)], fill=(55, 60, 75), width=1)
    return img

def render_master_video():
    print(f"\n=======================================================")
    print(f">>> [MASTER RENDER] Opta Smooth Luminous Sketch Spectrum")
    print(f"    Target:   {OUTPUT_VIDEO_PATH}")
    print(f"    Duration: {DURATION}s ({TOTAL_FRAMES} frames @ {FPS} fps)")
    print(f"=======================================================")

    t_start_total = time.time()

    dna_data = extract_music_dna()
    bpm = dna_data["bpm"]
    sec_per_beat = 60.0 / bpm
    key_str = dna_data["key_str"]
    frame_chords = dna_data["frame_chords"]
    vocal_norm = dna_data["vocal_norm"]
    drum_norm = dna_data["drum_norm"]

    axis_img = create_top_axis_image()

    print(">>> [AUDIO] Loading and extracting high-definition CQT...")
    sr = 44100
    y_full, _ = librosa.load(str(CLIP_AUDIO_PATH), sr=sr, mono=True)

    fmin = 65.406
    n_bins = 7 * 36 # 252 bins
    hop_len = int(round(sr / FPS)) # Exactly 1 hop per frame!

    C_full = np.abs(librosa.cqt(y_full, sr=sr, fmin=fmin, n_bins=n_bins, bins_per_octave=36, hop_length=hop_len))
    C_db = librosa.amplitude_to_db(C_full, ref=np.max)
    C_norm = np.clip((C_db + 60.0) / 60.0, 0.0, 1.0) # [0, 1]
    C_smooth = scipy.ndimage.gaussian_filter(C_norm, sigma=(1.0, 0.8))

    # Resample frequency axis from 252 bins to 1080 pixels
    print(">>> Resampling CQT matrix to 1080 horizontal pixels...")
    # C_smooth shape is (252, n_frames). We resample axis 0 to 1080.
    C_1080 = zoom(C_smooth, (WIDTH / float(C_smooth.shape[0]), 1.0), order=1)
    C_1080 = np.clip(C_1080, 0.0, 1.0)
    # Shape is (1080, n_frames). Transpose to (n_frames, 1080) for easy slicing
    C_frames = C_1080.T # shape: (n_frames, 1080)
    n_frames_cqt = C_frames.shape[0]

    # Pre-map full CQT to RGBA using Opta Luminous Monochrome Ramp
    print(">>> Pre-mapping full CQT to Opta Luminous Monochrome RGBA...")
    lut_r = np.zeros(256, dtype=np.uint8)
    lut_g = np.zeros(256, dtype=np.uint8)
    lut_b = np.zeros(256, dtype=np.uint8)
    lut_a = np.zeros(256, dtype=np.uint8)

    for i in range(256):
        v = i / 255.0
        if v < 0.15:
            lut_a[i] = 0
        elif v < 0.50:
            p = (v - 0.15) / 0.35
            lut_r[i] = int(25 + p * 60)
            lut_g[i] = int(28 + p * 70)
            lut_b[i] = int(38 + p * 95)
            lut_a[i] = int(p * 180)
        elif v < 0.80:
            p = (v - 0.50) / 0.30
            lut_r[i] = int(85 + p * 135)
            lut_g[i] = int(98 + p * 125)
            lut_b[i] = int(133 + p * 105)
            lut_a[i] = int(180 + p * 65)
        else:
            p = (v - 0.80) / 0.20
            lut_r[i] = int(220 + p * 35)
            lut_g[i] = int(223 + p * 32)
            lut_b[i] = int(238 + p * 17)
            lut_a[i] = 255

    c_uint = (C_frames * 255).astype(np.uint8)
    full_rgba = np.zeros((n_frames_cqt, WIDTH, 4), dtype=np.uint8)
    full_rgba[:, :, 0] = lut_r[c_uint]
    full_rgba[:, :, 1] = lut_g[c_uint]
    full_rgba[:, :, 2] = lut_b[c_uint]
    full_rgba[:, :, 3] = lut_a[c_uint]

    # Pre-render static Grid Background
    grid_bg = Image.new("RGBA", (WIDTH, SPEC_H), color=(15, 16, 20, 255))
    grid_draw = ImageDraw.Draw(grid_bg)

    # Octave lines
    oct_w = WIDTH / 7.0
    for oct_i in range(8):
        ox = int(round(oct_i * oct_w))
        grid_draw.line([(ox, AXIS_H), (ox, AXIS_H + SONO_H)], fill=(28, 30, 38), width=1)

    # Horizontal Time lines (every 1s = 25 frames)
    # Waterfall history window = 4.0s (100 frames)
    history_frames = int(round(4.0 * FPS)) # 100 frames
    for sec_i in range(1, 5):
        sy = AXIS_H + int(round(sec_i * (SONO_H / 4.0)))
        grid_draw.line([(0, sy), (WIDTH, sy)], fill=(24, 26, 34), width=1)
        grid_draw.text((12, sy - 14), f"-{sec_i}.0s", fill=(90, 95, 110), font=font_freq)

    # Static Axis placed on top
    grid_bg.paste(axis_img, (0, 0))

    # FFmpeg Subprocess
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", str(CLIP_VIDEO_PATH),
        "-f", "rawvideo",
        "-pix_fmt", "rgba",
        "-s", f"{WIDTH}x{SPEC_H}",
        "-r", str(FPS),
        "-i", "-",
        "-filter_complex",
        f"[0:v]scale={WIDTH}:{VID_H},setsar=1[top_vid]; "
        f"[1:v]format=yuv420p,setsar=1[spec]; "
        f"[top_vid][spec]vstack,setsar=1[outv]",
        "-map", "[outv]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "17",
        "-c:a", "aac",
        "-b:a", "192k",
        str(OUTPUT_VIDEO_PATH)
    ]
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

    print(">>> [RENDER] Streaming 1900 composited frames into FFmpeg...")
    t_start_render = time.time()
    x_dense = np.linspace(0, WIDTH - 1, WIDTH)

    for f_idx in range(TOTAL_FRAMES):
        t = f_idx / float(FPS)
        chord_now = frame_chords[min(f_idx, len(frame_chords) - 1)]
        v_lvl = vocal_norm[f_idx]
        d_lvl = drum_norm[f_idx]

        # Beat phase for BPM dot
        beat_phase = (t / sec_per_beat) % 1.0
        pulse = math.exp(-beat_phase * 4.5)

        # Base frame is copy of grid_bg
        frame_img = grid_bg.copy()

        # 1. Waterfall Sonogram (Descending from top of spectrum y = 120 downwards)
        c_end = min(f_idx + 1, n_frames_cqt)
        c_start = max(0, c_end - history_frames)
        slice_data = full_rgba[c_start:c_end, :, :]

        if slice_data.shape[0] > 1:
            # Latest frame at top (row 0), older descending down
            slice_desc = slice_data[::-1, :, :]
            sono_slice_img = Image.fromarray(slice_desc, mode="RGBA").resize((WIDTH, SONO_H), Image.Resampling.BILINEAR)
            frame_img.paste(sono_slice_img, (0, AXIS_H), sono_slice_img)

        # 2. Reactive Harmonic Curve at the top (directly beneath piano keys y = 120)
        inst_vals = C_1080[:, min(f_idx, C_1080.shape[1] - 1)]
        inst_sm = scipy.ndimage.gaussian_filter1d(inst_vals, sigma=1.8)
        f_int = interp1d(np.linspace(0, WIDTH, len(inst_sm)), inst_sm, kind='cubic')
        y_d = f_int(x_dense)

        pts = [(0, AXIS_H)]
        curve_h = 110
        for x in range(WIDTH):
            y_val = AXIS_H + int(round(y_d[x] * curve_h))
            pts.append((x, y_val))
        pts.append((WIDTH - 1, AXIS_H))

        curve_overlay = Image.new("RGBA", (WIDTH, SPEC_H), (0, 0, 0, 0))
        d_ov = ImageDraw.Draw(curve_overlay)
        d_ov.polygon(pts, fill=(255, 255, 255, 45))
        for i in range(len(pts) - 3):
            p1 = pts[i + 1]
            p2 = pts[i + 2]
            d_ov.line([p1, p2], fill=(255, 255, 255, 240), width=2)
            d_ov.line([(p1[0], p1[1] + 1), (p2[0], p2[1] + 1)], fill=(200, 215, 255, 120), width=1)
        frame_img.paste(curve_overlay, (0, 0), curve_overlay)

        # 3. Opta Minimalist Footer Bar (y = AXIS_H + SONO_H .. SPEC_H)
        footer_y = AXIS_H + SONO_H
        draw = ImageDraw.Draw(frame_img)
        draw.rectangle([(0, footer_y), (WIDTH, SPEC_H)], fill=(12, 13, 17))
        draw.line([(0, footer_y), (WIDTH, footer_y)], fill=(35, 38, 48), width=1)

        # Left: Metadata
        draw.text((25, footer_y + 12), "Continuous Harmonic Spectrum • Naina Moray (02:09 - 03:25)", fill=(225, 228, 238), font=font_title)
        draw.text((25, footer_y + 34), "Smooth vector contour density • Instantaneous keys to downward waterfall", fill=(135, 140, 155), font=font_sub)

        # Right: Telemetry Badges
        # Badge 1: Tonal Key
        b1_x = WIDTH - 475
        draw.rounded_rectangle([b1_x, footer_y + 12, b1_x + 115, footer_y + 54], radius=4, fill=(20, 22, 28), outline=(48, 52, 64))
        draw.text((b1_x + 10, footer_y + 16), "TONAL KEY", fill=(145, 150, 165), font=font_hud_title)
        draw.text((b1_x + 10, footer_y + 30), key_str, fill=(255, 255, 255), font=font_hud_val)

        # Badge 2: Live Chord
        b2_x = WIDTH - 345
        draw.rounded_rectangle([b2_x, footer_y + 12, b2_x + 105, footer_y + 54], radius=4, fill=(20, 22, 28), outline=(48, 52, 64))
        draw.text((b2_x + 10, footer_y + 16), "LIVE CHORD", fill=(145, 150, 165), font=font_hud_title)
        draw.text((b2_x + 10, footer_y + 30), chord_now, fill=(255, 215, 140), font=font_hud_val)

        # Badge 3: Tempo with Pulsing Beat Dot
        b3_x = WIDTH - 225
        draw.rounded_rectangle([b3_x, footer_y + 12, b3_x + 105, footer_y + 54], radius=4, fill=(20, 22, 28), outline=(48, 52, 64))
        dot_r = 4 + int(round(pulse * 2.5))
        draw.ellipse([b3_x + 16 - dot_r, footer_y + 34 - dot_r, b3_x + 16 + dot_r, footer_y + 34 + dot_r], fill=(255, 255, 255))
        draw.text((b3_x + 10, footer_y + 16), "TEMPO", fill=(145, 150, 165), font=font_hud_title)
        draw.text((b3_x + 28, footer_y + 28), f"{bpm:.0f} BPM", fill=(255, 255, 255), font=font_hud_val)

        # Badge 4: Vocal & Drum Reactive Meters
        b4_x = WIDTH - 105
        draw.rounded_rectangle([b4_x, footer_y + 12, WIDTH - 15, footer_y + 54], radius=4, fill=(20, 22, 28), outline=(48, 52, 64))
        draw.text((b4_x + 8, footer_y + 16), "VOC", fill=(255, 170, 180), font=font_hud_title)
        draw.rectangle([b4_x + 38, footer_y + 18, b4_x + 38 + int(45 * v_lvl), footer_y + 24], fill=(255, 110, 130))
        draw.text((b4_x + 8, footer_y + 34), "DRM", fill=(255, 205, 140), font=font_hud_title)
        draw.rectangle([b4_x + 38, footer_y + 36, b4_x + 38 + int(45 * d_lvl), footer_y + 42], fill=(255, 175, 80))

        proc.stdin.write(frame_img.tobytes())

        if (f_idx + 1) % 250 == 0 or (f_idx + 1) == TOTAL_FRAMES:
            elapsed = time.time() - t_start_render
            fps_act = (f_idx + 1) / elapsed
            print(f"  Frame {f_idx+1:04d} / {TOTAL_FRAMES} ({fps_act:.1f} fps, {elapsed:.1f}s elapsed)")

    proc.stdin.close()
    proc.wait()

    print(f"\n✓ BROADCAST RENDER COMPLETED IN {time.time()-t_start_total:.1f}s!")
    print(f"✓ Output Video: {OUTPUT_VIDEO_PATH}")

    # Symlink to public/videos/ for web player
    pub_link = WORKSPACE_DIR / "public" / "videos" / "naina_moray_smooth_sketch_spectrum.mp4"
    subprocess.run(["ln", "-sf", str(OUTPUT_VIDEO_PATH), str(pub_link)], check=True)
    print(f"✓ Symlinked to: {pub_link}")

if __name__ == "__main__":
    render_master_video()

