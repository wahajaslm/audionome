#!/usr/bin/env python3
"""
Render a 3-second motion preview GIF of the Opta Smooth Luminous Sketch Visualizer
Song: Naina Moray (02:09 - 03:25), active window t = 34.0s to 37.0s
"""

import os
import sys
import subprocess
from pathlib import Path
import numpy as np
import scipy.ndimage
from scipy.interpolate import interp1d
import librosa
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path("naina_moray_visualizer")
SOURCES_DIR = BASE_DIR / "sources"
ARTIFACTS_DIR = Path("/Users/wahajaslam/.gemini/antigravity/brain/c4de5157-b2b8-42b1-a175-f735ec9179c2")

CLIP_VIDEO_PATH = SOURCES_DIR / "naina_moray_clip_129_205.mp4"
CLIP_AUDIO_PATH = SOURCES_DIR / "naina_moray_clip_audio.wav"

WIDTH = 1080
HEIGHT = 1920
VID_H = 608
AXIS_H = 120
CQT_H = HEIGHT - VID_H - AXIS_H # 1192 px
sono_h = CQT_H - 120

FPS = 20
T_START = 34.0
T_DUR = 3.0
N_FRAMES = int(round(FPS * T_DUR))

# Load fonts
f_bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
f_reg = "/System/Library/Fonts/Supplemental/Arial.ttf"
if not os.path.exists(f_bold):
    f_bold = "/System/Library/Fonts/HelveticaNeue.ttc"
    f_reg = "/System/Library/Fonts/HelveticaNeue.ttc"

font_title = ImageFont.truetype(f_bold, 15)
font_sub = ImageFont.truetype(f_reg, 11)
font_note = ImageFont.truetype(f_bold, 12)
font_freq = ImageFont.truetype(f_reg, 10)
font_hud_val = ImageFont.truetype(f_bold, 14)
font_hud_lbl = ImageFont.truetype(f_reg, 10)

def create_top_labels_above_axis():
    img = Image.new("RGBA", (WIDTH, AXIS_H), color=(14, 15, 19, 255))
    draw = ImageDraw.Draw(img)

    n_octaves = 7
    oct_w = WIDTH / float(n_octaves)
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    draw.line([(0, 0), (WIDTH, 0)], fill=(45, 48, 58), width=1)

    # Row 1: Frequency scale labels & Note Octaves (y = 4..34) - PLACED ABOVE!
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

    # Row 2: Stem frequency brackets (y = 38..66) - PLACED ABOVE!
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

    # Row 3: Piano keyboard keys (y = 68..119) - Touching spectrum directly!
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

axis_img = create_top_labels_above_axis()

# Precompute CQT for entire clip
print("Computing full high-res CQT for clip...")
sr = 44100
fmin = 65.406
n_bins = 7 * 36
hop_len = int(sr / 50) # 50 fps CQT
y_full, _ = librosa.load(str(CLIP_AUDIO_PATH), sr=sr, mono=True)
C_full = np.abs(librosa.cqt(y_full, sr=sr, fmin=fmin, n_bins=n_bins, bins_per_octave=36, hop_length=hop_len))
C_db = librosa.amplitude_to_db(C_full, ref=np.max)
C_norm = np.clip((C_db + 60.0) / 60.0, 0.0, 1.0)
C_smooth = scipy.ndimage.gaussian_filter(C_norm, sigma=(1.0, 0.8))

# Pre-extract video frames
print(f"Extracting {N_FRAMES} video frames at {FPS} fps...")
tmp_vid_dir = Path("/tmp/opta_vid_frames")
tmp_vid_dir.mkdir(parents=True, exist_ok=True)
cmd_ext = [
    "ffmpeg", "-y",
    "-ss", str(T_START),
    "-i", str(CLIP_VIDEO_PATH),
    "-t", str(T_DUR),
    "-r", str(FPS),
    "-s", f"{WIDTH}x{VID_H}",
    str(tmp_vid_dir / "frame_%03d.png")
]
subprocess.run(cmd_ext, check=True, stderr=subprocess.DEVNULL)

# LUT for Opta Smooth Luminous Monochrome
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

dur_hist = 4.5
hist_frames = int(round(dur_hist * 50)) # 225 cqt slices

tmp_out_dir = Path("/tmp/opta_out_frames")
tmp_out_dir.mkdir(parents=True, exist_ok=True)

print("Compositing frames...")
from scipy.ndimage import zoom

oct_w = WIDTH / 7.0
spec_y0 = VID_H + AXIS_H

for f_i in range(N_FRAMES):
    t_now = T_START + (f_i / float(FPS))
    cqt_idx_now = int(round(t_now * 50))

    # Video frame
    vid_f_path = tmp_vid_dir / f"frame_{f_i+1:03d}.png"
    if vid_f_path.exists():
        vf_img = Image.open(vid_f_path).convert("RGBA")
    else:
        vf_img = Image.new("RGBA", (WIDTH, VID_H), color=(0, 0, 0))

    frame_img = Image.new("RGBA", (WIDTH, HEIGHT), color=(15, 16, 20, 255))
    draw = ImageDraw.Draw(frame_img)

    # 1. Video
    frame_img.paste(vf_img, (0, 0))

    # 2. Axis
    frame_img.paste(axis_img, (0, VID_H))

    # 3. Grid
    for oct_i in range(8):
        ox = int(round(oct_i * oct_w))
        draw.line([(ox, spec_y0), (ox, HEIGHT - 70)], fill=(28, 30, 38), width=1)

    for sec_i in range(1, 5):
        sy = spec_y0 + int(round(sec_i * (sono_h / 4.5)))
        draw.line([(0, sy), (WIDTH, sy)], fill=(24, 26, 34), width=1)

    # Extract CQT history window [cqt_idx_now - hist_frames : cqt_idx_now]
    c_start = max(0, cqt_idx_now - hist_frames)
    c_slice = C_smooth[:, c_start:cqt_idx_now]

    if c_slice.shape[1] > 2:
        # Latest frame at top (row 0), older descending
        c_time_down = c_slice[:, ::-1].T
        z_y = sono_h / float(c_time_down.shape[0])
        z_x = WIDTH / float(c_time_down.shape[1])
        resampled = zoom(c_time_down, (z_y, z_x), order=1)
        resampled = np.clip(resampled, 0.0, 1.0)

        c_idx = (resampled * 255).astype(np.uint8)
        rgba_arr = np.zeros((sono_h, WIDTH, 4), dtype=np.uint8)
        rgba_arr[:, :, 0] = lut_r[c_idx]
        rgba_arr[:, :, 1] = lut_g[c_idx]
        rgba_arr[:, :, 2] = lut_b[c_idx]
        rgba_arr[:, :, 3] = lut_a[c_idx]

        sono_layer = Image.fromarray(rgba_arr, mode="RGBA")
        frame_img.paste(sono_layer, (0, spec_y0), sono_layer)

    # Instantaneous reactive curve at top
    inst_vec = C_norm[:, min(cqt_idx_now, C_norm.shape[1]-1)]
    inst_sm = scipy.ndimage.gaussian_filter1d(inst_vec, sigma=1.8)
    f_int = interp1d(np.linspace(0, WIDTH, len(inst_sm)), inst_sm, kind='cubic')
    y_d = f_int(np.linspace(0, WIDTH - 1, WIDTH))

    pts = [(0, spec_y0)]
    curve_h = 110
    for x in range(WIDTH):
        y_val = spec_y0 + int(round(y_d[x] * curve_h))
        pts.append((x, y_val))
    pts.append((WIDTH - 1, spec_y0))

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    d_ov = ImageDraw.Draw(overlay)
    d_ov.polygon(pts, fill=(255, 255, 255, 45))
    for i in range(len(pts) - 3):
        p1 = pts[i + 1]
        p2 = pts[i + 2]
        d_ov.line([p1, p2], fill=(255, 255, 255, 240), width=2)
    frame_img.paste(overlay, (0, 0), overlay)

    # Opta Footer
    footer_y = HEIGHT - 68
    draw.line([(0, footer_y), (WIDTH, footer_y)], fill=(35, 38, 48), width=1)
    draw.text((25, footer_y + 12), "Continuous Harmonic Spectrum • Naina Moray", fill=(220, 224, 235), font=font_title)
    draw.text((25, footer_y + 34), "Smooth vector contour density • Instantaneous keys to downward waterfall", fill=(140, 145, 160), font=font_sub)

    # Telemetry Badges
    draw.rounded_rectangle([WIDTH - 380, footer_y + 12, WIDTH - 260, footer_y + 54], radius=4, fill=(22, 24, 30), outline=(50, 54, 66))
    draw.text((WIDTH - 370, footer_y + 16), "TONAL KEY", fill=(150, 155, 170), font=font_hud_lbl)
    draw.text((WIDTH - 370, footer_y + 30), "D#m (92%)", fill=(255, 255, 255), font=font_hud_val)

    draw.rounded_rectangle([WIDTH - 245, footer_y + 12, WIDTH - 125, footer_y + 54], radius=4, fill=(22, 24, 30), outline=(50, 54, 66))
    draw.text((WIDTH - 235, footer_y + 16), "LIVE CHORD", fill=(150, 155, 170), font=font_hud_lbl)
    draw.text((WIDTH - 235, footer_y + 30), "D#7 / F#", fill=(255, 210, 140), font=font_hud_val)

    draw.rounded_rectangle([WIDTH - 110, footer_y + 12, WIDTH - 25, footer_y + 54], radius=4, fill=(22, 24, 30), outline=(50, 54, 66))
    draw.text((WIDTH - 100, footer_y + 16), "TEMPO", fill=(150, 155, 170), font=font_hud_lbl)
    draw.text((WIDTH - 100, footer_y + 30), "144 BPM", fill=(255, 255, 255), font=font_hud_val)

    # Save resized for preview GIF (scale to 360 width)
    small_img = frame_img.resize((360, 640), Image.Resampling.LANCZOS)
    small_img.save(tmp_out_dir / f"out_{f_i:03d}.png")

print(f"Rendered {N_FRAMES} frames. Generating animated GIF...")
gif_path = ARTIFACTS_DIR / "opta_smooth_sketch_motion.gif"
cmd_gif = [
    "ffmpeg", "-y",
    "-r", str(FPS),
    "-i", str(tmp_out_dir / "out_%03d.png"),
    "-vf", "split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer",
    str(gif_path)
]
subprocess.run(cmd_gif, check=True)
print(f"✓ Motion GIF saved: {gif_path}")
