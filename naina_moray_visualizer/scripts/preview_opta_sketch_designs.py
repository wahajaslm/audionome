#!/usr/bin/env python3
"""
Generate Opta-Style "Smooth Sketch" Spectrum Prototypes for Naina Moray
Song: Coke Studio Season 10 | Naina Moray (02:09 - 03:25)
"""

import os
import sys
from pathlib import Path
import numpy as np
import scipy.ndimage
from scipy.interpolate import interp1d
import librosa
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path("naina_moray_visualizer")
SOURCES_DIR = BASE_DIR / "sources"
PREVIEWS_DIR = BASE_DIR / "previews"
PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACTS_DIR = Path("/Users/wahajaslam/.gemini/antigravity/brain/c4de5157-b2b8-42b1-a175-f735ec9179c2")

CLIP_VIDEO_PATH = SOURCES_DIR / "naina_moray_clip_129_205.mp4"
CLIP_AUDIO_PATH = SOURCES_DIR / "naina_moray_clip_audio.wav"

WIDTH = 1080
HEIGHT = 1920
VID_H = 608
AXIS_H = 120
CQT_H = HEIGHT - VID_H - AXIS_H # 1192 px

# Extract video frame at t=35.0s
video_frame_path = PREVIEWS_DIR / "vid_frame_t35.png"
if not video_frame_path.exists():
    import subprocess
    cmd = ["ffmpeg", "-y", "-ss", "35.0", "-i", str(CLIP_VIDEO_PATH), "-frames:v", "1", "-s", f"{WIDTH}x{VID_H}", str(video_frame_path)]
    subprocess.run(cmd, check=True, stderr=subprocess.DEVNULL)

vid_img = Image.open(video_frame_path).convert("RGBA")

# Load fonts
f_bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
f_reg = "/System/Library/Fonts/Supplemental/Arial.ttf"
if not os.path.exists(f_bold):
    f_bold = "/System/Library/Fonts/HelveticaNeue.ttc"
    f_reg = "/System/Library/Fonts/HelveticaNeue.ttc"

font_title = ImageFont.truetype(f_bold, 15)
font_sub = ImageFont.truetype(f_reg, 11)
font_axis_lbl = ImageFont.truetype(f_reg, 11)
font_note = ImageFont.truetype(f_bold, 12)
font_freq = ImageFont.truetype(f_reg, 10)
font_hud_val = ImageFont.truetype(f_bold, 14)
font_hud_lbl = ImageFont.truetype(f_reg, 10)

def create_top_labels_above_axis():
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

    # Top border line
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
        
        # Vertical guide tick
        draw.line([(x_pos, 2), (x_pos, 34)], fill=(65, 70, 85), width=1)
        
        align_x = x_pos + 4 if oct_idx < 7 else x_pos - 52
        draw.text((align_x, 3), c_str, fill=(255, 255, 255), font=font_note)
        draw.text((align_x, 18), f_str, fill=(160, 165, 180), font=font_freq)

    # Subtle horizontal divider
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

    # Subtle horizontal divider
    draw.line([(0, 67), (WIDTH, 67)], fill=(32, 35, 44), width=1)

    # 3. Row 3: Piano keyboard keys (y = 68..119) - Touching spectrum below!
    key_top = 68
    key_bot = 119
    black_h = 32

    # White keys
    draw.rectangle([(0, key_top), (WIDTH, key_bot)], fill=(242, 244, 248))
    for oct_i in range(n_octaves):
        oct_x = oct_i * oct_w
        for semi_i in range(12):
            semi_x = oct_x + (semi_i / 12.0) * oct_w
            name = note_names[semi_i]
            if '#' not in name:
                draw.line([(semi_x, key_top), (semi_x, key_bot)], fill=(185, 188, 198), width=1)

    # Black keys
    for oct_i in range(n_octaves):
        oct_x = oct_i * oct_w
        for semi_i in range(12):
            semi_x = oct_x + (semi_i / 12.0) * oct_w
            w_semi = oct_w / 12.0
            name = note_names[semi_i]
            if '#' in name:
                draw.rectangle([(semi_x + 1, key_top), (semi_x + w_semi - 1, key_top + black_h)], fill=(22, 23, 28), outline=(10, 11, 14))
                draw.line([(semi_x + 2, key_top + 1), (semi_x + w_semi - 2, key_top + 1)], fill=(60, 64, 76))

    # Bottom border touching spectrum
    draw.line([(0, 119), (WIDTH, 119)], fill=(55, 60, 75), width=1)

    return img

print("Loading audio and extracting high-precision CQT...")
sr = 44100
t_center = 35.0
dur_hist = 5.0 # 5.0 seconds of waterfall history
y_full, _ = librosa.load(str(CLIP_AUDIO_PATH), sr=sr, mono=True)

s_start = max(0, int((t_center - dur_hist) * sr))
s_end = int(t_center * sr)
y_hist = y_full[s_start:s_end]

# High-resolution CQT: 7 octaves, 36 bins per octave = 252 bins
fmin = 65.406
n_bins = 7 * 36
hop_len = int(sr / 50) # 50 frames per second
C_hist = np.abs(librosa.cqt(y_hist, sr=sr, fmin=fmin, n_bins=n_bins, bins_per_octave=36, hop_length=hop_len))

# Convert to dB
C_db = librosa.amplitude_to_db(C_hist, ref=np.max)
C_norm = np.clip((C_db + 60.0) / 60.0, 0.0, 1.0) # [0, 1] normalized power

# Resample to CQT canvas dimensions: width=1080, height=CQT_H-80 (leaving room for Opta bottom metadata)
# Time runs from top (instantaneous t=0) to bottom (history t=-5s)
# Note: In CQT matrix, axis 0 is frequency (0..251), axis 1 is time (0..n_frames).
# Latest frame is at the end of axis 1!
# We want latest frame at TOP (row 0) and older frames descending down (waterfall)!
sono_h = CQT_H - 120 # 1072 px
bar_h = 100 # reactive bars/curves at top

# Smooth the sonogram using scipy to eliminate grain
C_smooth = scipy.ndimage.gaussian_filter(C_norm, sigma=(1.2, 1.0))

# Interpolate to (WIDTH, sono_h)
from scipy.ndimage import zoom
zoom_f = (WIDTH / float(C_smooth.shape[0]), sono_h / float(C_smooth.shape[1]))
# C_smooth is (freq, time). We want (time, freq) where time=0 is row 0.
# Transpose and flip time so latest time (end) is at index 0:
C_time_down = C_smooth[:, ::-1].T # shape: (time, freq), time=0 is index 0
grid_img_data = zoom(C_time_down, (sono_h / float(C_time_down.shape[0]), WIDTH / float(C_time_down.shape[1])), order=1)
grid_img_data = np.clip(grid_img_data, 0.0, 1.0)

# Instantaneous curve (t=0, top)
inst_profile = C_norm[:, -1]
x_inst = np.linspace(0, WIDTH, len(inst_profile))
inst_smooth = scipy.ndimage.gaussian_filter1d(inst_profile, sigma=2.0)
f_interp = interp1d(x_inst, inst_smooth, kind='cubic')
x_dense = np.linspace(0, WIDTH - 1, WIDTH)
y_dense = f_interp(x_dense)

# -------------------------------------------------------------
# DESIGN 1: OPTA SMOOTH LUMINOUS SKETCH (Monochrome Platinum / Warm Core)
# -------------------------------------------------------------
def render_opta_luminous_sketch():
    img = Image.new("RGBA", (WIDTH, HEIGHT), color=(14, 15, 19, 255))
    draw = ImageDraw.Draw(img)

    # 1. Video
    img.paste(vid_img, (0, 0))

    # 2. Axis with labels above
    axis_img = create_top_labels_above_axis()
    img.paste(axis_img, (0, VID_H))

    # 3. Spectrum Area: y = 728 .. 1920 (CQT_H = 1192)
    spec_y0 = VID_H + AXIS_H # 728
    spec_w = WIDTH
    spec_h = CQT_H

    # Background canvas: Deep matte charcoal (#101115)
    draw.rectangle([(0, spec_y0), (WIDTH, HEIGHT)], fill=(15, 16, 20))

    # Draw Opta Engineering Grid:
    # Vertical Octave lines (C2..C9)
    oct_w = WIDTH / 7.0
    for oct_i in range(8):
        ox = int(round(oct_i * oct_w))
        draw.line([(ox, spec_y0), (ox, HEIGHT - 70)], fill=(28, 30, 38), width=1)

    # Horizontal Time lines (every 1 second)
    for sec_i in range(1, 6):
        sy = spec_y0 + int(round(sec_i * (sono_h / 5.0)))
        draw.line([(0, sy), (WIDTH, sy)], fill=(24, 26, 34), width=1)
        draw.text((12, sy - 14), f"-{sec_i}.0s", fill=(90, 95, 110), font=font_freq)

    # Render Smooth Spectrogram using Opta Luminous Monochrome Ramp
    # High energy: Brilliant white (#ffffff) with soft golden luminescence
    # Mid energy: Smooth platinum/silver (#c0c5d5)
    # Low energy: Cool translucent dark slate (#252834)
    # Background: Transparent/canvas
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
            # Intense glowing white-hot core with subtle warm luster
            lut_r[i] = int(220 + p * 35)
            lut_g[i] = int(223 + p * 32)
            lut_b[i] = int(238 + p * 17)
            lut_a[i] = 255

    # Map grid_img_data through LUT
    idx = (grid_img_data * 255).astype(np.uint8)
    rgba_arr = np.zeros((sono_h, WIDTH, 4), dtype=np.uint8)
    rgba_arr[:, :, 0] = lut_r[idx]
    rgba_arr[:, :, 1] = lut_g[idx]
    rgba_arr[:, :, 2] = lut_b[idx]
    rgba_arr[:, :, 3] = lut_a[idx]

    sono_layer = Image.fromarray(rgba_arr, mode="RGBA")
    img.paste(sono_layer, (0, spec_y0), sono_layer)

    # Reactive Harmonic Curve at the top (directly touching piano keys!)
    # Drawn as a smooth, crisp sketch line with glowing translucent fill
    pts = [(0, spec_y0)]
    curve_h = 110 # max bar height downwards
    for x in range(WIDTH):
        val = y_dense[x]
        y_val = spec_y0 + int(round(val * curve_h))
        pts.append((x, y_val))
    pts.append((WIDTH - 1, spec_y0))

    # Fill under curve
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    d_ov = ImageDraw.Draw(overlay)
    d_ov.polygon(pts, fill=(255, 255, 255, 45))
    # Line stroke
    for i in range(len(pts) - 3):
        p1 = pts[i + 1]
        p2 = pts[i + 2]
        d_ov.line([p1, p2], fill=(255, 255, 255, 240), width=2)
        # Glow edge
        d_ov.line([(p1[0], p1[1] + 1), (p2[0], p2[1] + 1)], fill=(200, 215, 255, 120), width=1)

    img.paste(overlay, (0, 0), overlay)

    # Opta Technical Footer (like the reference graphic!)
    footer_y = HEIGHT - 68
    draw.line([(0, footer_y), (WIDTH, footer_y)], fill=(35, 38, 48), width=1)
    draw.text((25, footer_y + 12), "Continuous Harmonic Spectrum • Naina Moray (02:09 - 03:25)", fill=(220, 224, 235), font=font_title)
    draw.text((25, footer_y + 34), "Smooth vector contour density • Instantaneous keys to downward waterfall", fill=(140, 145, 160), font=font_sub)

    # Telemetry Badges on bottom right
    draw.rounded_rectangle([WIDTH - 380, footer_y + 12, WIDTH - 260, footer_y + 54], radius=4, fill=(22, 24, 30), outline=(50, 54, 66))
    draw.text((WIDTH - 370, footer_y + 16), "TONAL KEY", fill=(150, 155, 170), font=font_hud_lbl)
    draw.text((WIDTH - 370, footer_y + 30), "D#m (92%)", fill=(255, 255, 255), font=font_hud_val)

    draw.rounded_rectangle([WIDTH - 245, footer_y + 12, WIDTH - 125, footer_y + 54], radius=4, fill=(22, 24, 30), outline=(50, 54, 66))
    draw.text((WIDTH - 235, footer_y + 16), "LIVE CHORD", fill=(150, 155, 170), font=font_hud_lbl)
    draw.text((WIDTH - 235, footer_y + 30), "D#7 / F#", fill=(255, 210, 140), font=font_hud_val)

    draw.rounded_rectangle([WIDTH - 110, footer_y + 12, WIDTH - 25, footer_y + 54], radius=4, fill=(22, 24, 30), outline=(50, 54, 66))
    draw.text((WIDTH - 100, footer_y + 16), "TEMPO", fill=(150, 155, 170), font=font_hud_lbl)
    draw.text((WIDTH - 100, footer_y + 30), "144 BPM", fill=(255, 255, 255), font=font_hud_val)

    return img

# -------------------------------------------------------------
# DESIGN 2: OPTA PARTICLE DENSITY SCATTER ("Like Opta Reference")
# -------------------------------------------------------------
def render_opta_particle_scatter():
    img = Image.new("RGBA", (WIDTH, HEIGHT), color=(14, 15, 19, 255))
    draw = ImageDraw.Draw(img)

    # 1. Video
    img.paste(vid_img, (0, 0))

    # 2. Axis with labels above
    axis_img = create_top_labels_above_axis()
    img.paste(axis_img, (0, VID_H))

    # 3. Spectrum Area: y = 728 .. 1920
    spec_y0 = VID_H + AXIS_H
    draw.rectangle([(0, spec_y0), (WIDTH, HEIGHT)], fill=(15, 16, 20))

    # Draw Opta Coordinate Grid
    oct_w = WIDTH / 7.0
    for oct_i in range(8):
        ox = int(round(oct_i * oct_w))
        draw.line([(ox, spec_y0), (ox, HEIGHT - 70)], fill=(28, 30, 38), width=1)

    for sec_i in range(1, 6):
        sy = spec_y0 + int(round(sec_i * (sono_h / 5.0)))
        draw.line([(0, sy), (WIDTH, sy)], fill=(24, 26, 34), width=1)
        draw.text((12, sy - 14), f"-{sec_i}.0s", fill=(90, 95, 110), font=font_freq)

    # Subtle diagonal reference line (like Opta y = x reference line)
    # Marking the harmonic overtone trajectory
    draw.line([(0, spec_y0), (WIDTH, spec_y0 + sono_h)], fill=(45, 50, 65, 100), width=1)

    # Render Audio as Thousands of Smooth Glowing Particles (Opta Style)
    # Higher energy = larger radius, more opaque, pure white core
    # "Each point represents an acoustic harmonic. Larger, more opaque points = more energy"
    scatter_ov = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(scatter_ov)

    # Sample grid_img_data down to particle resolution
    step_x = 4 # every 4 px
    step_y = 6 # every 6 px

    for py in range(0, sono_h, step_y):
        y_coord = spec_y0 + py
        for px in range(0, WIDTH, step_x):
            val = grid_img_data[py, px]
            if val < 0.22:
                continue # silence threshold
            
            # Particle size and alpha proportional to energy
            rad = int(round(1.0 + (val - 0.22) * 4.5))
            alpha = int(round(40 + (val - 0.22) * 275))
            alpha = min(255, max(0, alpha))
            
            if val > 0.75:
                # Brilliant white glowing core
                s_draw.ellipse([px - rad, y_coord - rad, px + rad, y_coord + rad], fill=(255, 255, 255, alpha))
            elif val > 0.50:
                # Luminous platinum
                s_draw.ellipse([px - rad, y_coord - rad, px + rad, y_coord + rad], fill=(210, 220, 240, alpha))
            else:
                # Slate particle
                s_draw.ellipse([px - rad, y_coord - rad, px + rad, y_coord + rad], fill=(130, 145, 175, alpha))

    # Paste particles
    img.paste(scatter_ov, (0, 0), scatter_ov)

    # Reactive Harmonic Curve at the top (directly touching piano keys!)
    pts = [(0, spec_y0)]
    curve_h = 100
    for x in range(WIDTH):
        val = y_dense[x]
        y_val = spec_y0 + int(round(val * curve_h))
        pts.append((x, y_val))
    pts.append((WIDTH - 1, spec_y0))

    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    d_ov = ImageDraw.Draw(overlay)
    d_ov.polygon(pts, fill=(255, 255, 255, 30))
    for i in range(len(pts) - 3):
        p1 = pts[i + 1]
        p2 = pts[i + 2]
        d_ov.line([p1, p2], fill=(255, 255, 255, 240), width=2)
    img.paste(overlay, (0, 0), overlay)

    # Opta Exact Style Footer
    footer_y = HEIGHT - 68
    draw.line([(0, footer_y), (WIDTH, footer_y)], fill=(35, 38, 48), width=1)
    draw.text((25, footer_y + 12), "Harmonic Density Distribution • Naina Moray", fill=(220, 224, 235), font=font_title)
    draw.text((25, footer_y + 34), "Each point represents an acoustic harmonic. Larger, more opaque points = more energy.", fill=(140, 145, 160), font=font_sub)

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

    return img

print("Rendering Design 1: Opta Smooth Luminous Sketch...")
img1 = render_opta_luminous_sketch()
out1 = PREVIEWS_DIR / "preview_opta_luminous_sketch_t35.png"
img1.save(out1)
print(f"Saved: {out1}")

print("Rendering Design 2: Opta Particle Density Scatter...")
img2 = render_opta_particle_scatter()
out2 = PREVIEWS_DIR / "preview_opta_particle_scatter_t35.png"
img2.save(out2)
print(f"Saved: {out2}")

# Copy to artifacts directory
import shutil
shutil.copy(out1, ARTIFACTS_DIR / "opta_luminous_sketch_t35.png")
shutil.copy(out2, ARTIFACTS_DIR / "opta_particle_scatter_t35.png")
print("Copied snapshots to artifacts.")
