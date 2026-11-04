import librosa
import numpy as np
import matplotlib
from PIL import Image, ImageDraw, ImageFont
import subprocess
import time
import os

print("=== 1. Computing High-Resolution Denoised CQT ===")
t0 = time.time()
y_full, sr = librosa.load("chaap_tilak_prebuffered.wav", sr=44100)

fmin = librosa.note_to_hz('C2')
n_octaves = 7
bins_per_octave = 48
n_bins = n_octaves * bins_per_octave
hop_length = 128

C = librosa.cqt(
    y=y_full, 
    sr=sr, 
    hop_length=hop_length, 
    fmin=fmin, 
    n_bins=n_bins, 
    bins_per_octave=bins_per_octave
)
C_mag = np.abs(C)
# Flip vertically so C2 is at bottom, C9 at top
C_dB = np.flipud(librosa.amplitude_to_db(C_mag, ref=np.max))

# Calibrated Noise Floor (-48 dB) & Contrast Gamma (1.35)
vmin, vmax = -48.0, 0.0
norm = np.clip((C_dB - vmin) / (vmax - vmin), 0.0, 1.0)
norm = np.power(norm, 1.35)

cmap = matplotlib.colormaps["inferno"]
colored_full = (cmap(norm)[:, :, :3] * 255).astype(np.uint8)
print(f"CQT computed in {time.time()-t0:.2f}s! Matrix shape: {colored_full.shape}")

fps = 25
duration = 15.0
total_frames = int(round(fps * duration))
t_offset = 25.0  # 1:00 starts at 25.0s in prebuffered audio
t_window = 7.0   # 7 seconds visible retention history

note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

try:
    font_bold = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 15)
    font_small = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 10)
    font_mob_bold = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 16)
    font_mob_small = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 11)
except:
    font_bold = ImageFont.load_default()
    font_small = ImageFont.load_default()
    font_mob_bold = ImageFont.load_default()
    font_mob_small = ImageFont.load_default()

def create_overlay(width, height, ruler_w, is_mobile=False):
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Dark ruler background
    draw.rectangle([(0, 0), (ruler_w, height)], fill=(12, 10, 22, 235))
    draw.line([(ruler_w, 0), (ruler_w, height)], fill=(90, 90, 130, 200), width=1)
    
    fb = font_mob_bold if is_mobile else font_bold
    fs = font_mob_small if is_mobile else font_small
    
    oct_h = height / 7.0
    semi_h = oct_h / 12.0
    
    for oct_i in range(7):
        oct_num = oct_i + 2  # C2 to C8
        for semi_i, name in enumerate(note_names):
            y_pos = int(round(height - (oct_i * oct_h + semi_i * semi_h)))
            if y_pos < 0 or y_pos >= height:
                continue
            if name == "C":
                # Prominent octave divider across entire width
                draw.line([(ruler_w, y_pos), (width, y_pos)], fill=(255, 255, 255, 45), width=1)
                draw.line([(ruler_w - 14, y_pos), (ruler_w, y_pos)], fill=(255, 215, 0, 255), width=2)
                draw.text((10, y_pos - 8), f"C{oct_num}", fill=(255, 215, 0, 255), font=fb)
            elif name in ["E", "G", "A"]:
                draw.line([(ruler_w, y_pos), (width, y_pos)], fill=(200, 200, 255, 18), width=1)
                draw.line([(ruler_w - 8, y_pos), (ruler_w, y_pos)], fill=(180, 180, 215, 180), width=1)
                draw.text((16, y_pos - 6), f"{name}{oct_num}", fill=(180, 180, 215, 200), font=fs)
            else:
                draw.line([(ruler_w - 4, y_pos), (ruler_w, y_pos)], fill=(130, 130, 150, 120), width=1)
                
    # Top boundary C9
    draw.line([(ruler_w, 1), (width, 1)], fill=(255, 215, 0, 255), width=2)
    draw.text((10, 2), "C9", fill=(255, 215, 0, 255), font=fb)
    
    # Badge
    badge_text = "CQT SPECTROGRAM  |  INFERNO  |  48 BINS/OCTAVE  |  C2-C9"
    badge_w = 480 if not is_mobile else 460
    draw.rectangle([(ruler_w + 14, 10), (ruler_w + badge_w, 32)], fill=(8, 8, 16, 200))
    draw.text((ruler_w + 22, 13), badge_text, fill=(255, 225, 160, 255), font=fs)
    
    return overlay

# Render function
def render_video(out_path, width, height, vid_w, vid_h, is_mobile=False):
    print(f"\n=== Rendering {out_path} ({width}x{height}) ===")
    t_start_render = time.time()
    
    spec_h = height - vid_h
    ruler_w = 90
    spec_w = width - ruler_w
    
    overlay = create_overlay(width, spec_h, ruler_w, is_mobile=is_mobile)
    
    # FFmpeg command
    if is_mobile:
        filter_complex = f"[0:v]scale={vid_w}:{vid_h},setsar=1[top_vid]; [1:v]format=yuv420p,setsar=1[spec]; [top_vid][spec]vstack,setsar=1[outv]"
    else:
        # Desktop: center 960x540 within 1920x540
        filter_complex = f"[0:v]scale=960:540,pad=1920:540:480:0:black,setsar=1[top_vid]; [1:v]format=yuv420p,setsar=1[spec]; [top_vid][spec]vstack,setsar=1[outv]"
        
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", "chaap_tilak_clip.mp4",
        "-f", "rawvideo",
        "-pix_fmt", "rgb24",
        "-s", f"{width}x{spec_h}",
        "-r", str(fps),
        "-i", "-",
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "aac",
        out_path
    ]
    
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    
    for f in range(total_frames):
        t_curr = f / fps
        t_audio = t_offset + t_curr
        t_win_start = t_audio - t_window
        
        col_start = int(t_win_start * sr / hop_length)
        col_end = int(t_audio * sr / hop_length)
        
        slice_cols = colored_full[:, col_start:col_end, :]
        slice_resized = Image.fromarray(slice_cols).resize((spec_w, spec_h), Image.Resampling.BILINEAR)
        
        canvas = np.zeros((spec_h, width, 3), dtype=np.uint8)
        canvas[:, ruler_w:, :] = np.array(slice_resized)
        
        frame_pil = Image.fromarray(canvas).convert("RGBA")
        frame_comp = Image.alpha_composite(frame_pil, overlay)
        draw_comp = ImageDraw.Draw(frame_comp)
        
        # Glowing vertical playhead at right edge
        cursor_x = width - 2
        draw_comp.line([(cursor_x, 0), (cursor_x, spec_h)], fill=(255, 235, 170, 230), width=2)
        draw_comp.polygon([(cursor_x - 6, spec_h - 2), (cursor_x + 6, spec_h - 2), (cursor_x, spec_h - 14)], fill=(255, 215, 0, 255))
        
        proc.stdin.write(frame_comp.convert("RGB").tobytes())
        
    proc.stdin.close()
    stderr = proc.stderr.read().decode('utf-8')
    proc.wait()
    print(f"Rendered in {time.time()-t_start_render:.2f}s! Exit code: {proc.returncode}")
    if proc.returncode != 0:
        print("FFmpeg error:", stderr[-800:])

# Render Desktop
render_video(
    out_path="chaap_tilak_cqt_horizontal_desktop.mp4",
    width=1920,
    height=1080,
    vid_w=1920,
    vid_h=540,
    is_mobile=False
)

# Render Mobile
render_video(
    out_path="chaap_tilak_cqt_horizontal_mobile.mp4",
    width=1080,
    height=1920,
    vid_w=1080,
    vid_h=608,
    is_mobile=True
)

print("\n=== All Horizontal Transforms Completed! ===")

