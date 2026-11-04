import librosa
import numpy as np
import matplotlib
from PIL import Image, ImageDraw, ImageFont
import subprocess
import time
import os

print("=== 1. Loading Prebuffered Audio & Computing High-Resolution Denoised CQT ===")
t0 = time.time()
audio_path = "chaap_tilak_prebuffered_56_77.wav"
clip_path = "chaap_tilak_clip_56_77.mp4"

y_full, sr = librosa.load(audio_path, sr=44100)

# C2 (65.4 Hz) to C8 (4186 Hz): 6 octaves
fmin = librosa.note_to_hz('C2')
n_octaves = 6
bins_per_octave = 48
n_bins = n_octaves * bins_per_octave
hop_length = 128

print(f"Computing CQT with {n_bins} bins ({bins_per_octave} bins/octave, {n_octaves} octaves C2->C8)...")
C = librosa.cqt(
    y=y_full, 
    sr=sr, 
    hop_length=hop_length, 
    fmin=fmin, 
    n_bins=n_bins, 
    bins_per_octave=bins_per_octave
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
print(f"CQT computed in {time.time()-t0:.2f}s! Matrix shape: {colored_full.shape}")

fps = 25
duration = 21.0
total_frames = int(round(fps * duration))
t_offset = 16.0  # 00:56 is 16.0s into prebuffered audio (00:40 start)
t_window = 7.0   # 7.0 seconds visible retention history

note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Fonts
font_oct = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 14)
font_semi = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 10)
font_mob_oct = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 18)
font_mob_semi = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
font_badge = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 11)
font_mob_badge = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 13)

def create_overlay(width, height, ruler_w, is_mobile=False):
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Dark ruler background
    draw.rectangle([(0, 0), (ruler_w, height)], fill=(12, 10, 22, 240))
    # Border separating ruler and spectrogram
    draw.line([(ruler_w, 0), (ruler_w, height)], fill=(110, 110, 160, 220), width=2)
    # Top border separating video from spectrogram
    draw.line([(0, 0), (width, 0)], fill=(160, 150, 200, 255), width=2)
    
    foct = font_mob_oct if is_mobile else font_oct
    fsemi = font_mob_semi if is_mobile else font_semi
    fbadge = font_mob_badge if is_mobile else font_badge
    
    oct_h = height / float(n_octaves)
    semi_h = oct_h / 12.0
    
    for oct_i in range(n_octaves):
        oct_num = oct_i + 2  # C2 to C7 base
        for semi_i, name in enumerate(note_names):
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
    
    # Modern Semi-transparent HUD Badge
    badge_text = "CHAAP TILAK (00:56 - 01:17)  |  CQT SPECTRUM (INFERNO)  |  C2 - C8"
    bw = 480 if not is_mobile else 470
    bh = 26 if not is_mobile else 30
    draw.rectangle([(ruler_w + 14, 10), (ruler_w + bw, 10 + bh)], fill=(10, 8, 20, 220), outline=(90, 85, 130, 180), width=1)
    draw.text((ruler_w + 24, 10 + (6 if not is_mobile else 7)), badge_text, fill=(255, 225, 160, 255), font=fbadge)
    
    return overlay

def render_horizontal_video(out_path, width, height, vid_w, vid_h, is_mobile=False):
    print(f"\n========================================================")
    print(f"Rendering {out_path} ({width}x{height}, {fps} fps, {duration}s)")
    print(f"========================================================")
    t_start = time.time()
    
    spec_h = height - vid_h
    ruler_w = 100 if is_mobile else 95
    spec_w = width - ruler_w
    
    overlay = create_overlay(width, spec_h, ruler_w, is_mobile=is_mobile)
    
    # Filter complex
    if is_mobile:
        filter_complex = f"[0:v]scale={vid_w}:{vid_h},setsar=1[top_vid]; [1:v]format=yuv420p,setsar=1[spec]; [top_vid][spec]vstack,setsar=1[outv]"
    else:
        # Desktop: native 16:9 960x540 centered horizontally in 1920x540
        filter_complex = f"[0:v]scale=960:540,pad=1920:540:480:0:black,setsar=1[top_vid]; [1:v]format=yuv420p,setsar=1[spec]; [top_vid][spec]vstack,setsar=1[outv]"
        
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", clip_path,
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
        "-b:a", "192k",
        out_path
    ]
    
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    
    # Pre-render loop
    cursor_x = width - 2
    for f in range(total_frames):
        t_curr = f / float(fps)
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
        
        # Glowing vertical playhead needle at cursor_x
        draw_comp.line([(cursor_x, 0), (cursor_x, spec_h)], fill=(255, 240, 180, 240), width=2)
        # Top needle pointer
        draw_comp.polygon([(cursor_x - 6, 2), (cursor_x + 6, 2), (cursor_x, 14)], fill=(255, 215, 0, 255))
        # Bottom needle pointer
        draw_comp.polygon([(cursor_x - 6, spec_h - 2), (cursor_x + 6, spec_h - 2), (cursor_x, spec_h - 14)], fill=(255, 215, 0, 255))
        
        proc.stdin.write(frame_comp.convert("RGB").tobytes())
        
        if (f + 1) % 100 == 0 or (f + 1) == total_frames:
            print(f"  Frame {f+1}/{total_frames} ({(f+1)/total_frames*100:.1f}%) rendered...")
            
    proc.stdin.close()
    stderr = proc.stderr.read().decode('utf-8')
    proc.wait()
    
    if proc.returncode != 0:
        print(f"FFmpeg failed with exit code {proc.returncode}!")
        print(stderr[-1000:])
        raise RuntimeError("FFmpeg encode failed")
        
    print(f"Successfully rendered {out_path} in {time.time()-t_start:.2f}s!")

# 1. Desktop Render (1920x1080)
render_horizontal_video(
    out_path="chaap_tilak_cqt_horizontal_desktop_56_77.mp4",
    width=1920,
    height=1080,
    vid_w=1920,
    vid_h=540,
    is_mobile=False
)

# 2. Mobile Render (1080x1920)
render_horizontal_video(
    out_path="chaap_tilak_cqt_horizontal_mobile_56_77.mp4",
    width=1080,
    height=1920,
    vid_w=1080,
    vid_h=608,
    is_mobile=True
)

print("\n=== All Renders Completed Successfully! ===")

