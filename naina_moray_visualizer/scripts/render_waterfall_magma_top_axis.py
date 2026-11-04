#!/usr/bin/env python3
"""
Render Volcanic Magma & Ruby Sunburst Waterfall Visualizer (1080x1920 Mobile)
With Dual Notes & Frequency Scale Axis placed directly at the top below the video.
Song: Coke Studio Season 10 | Naina Moray (02:09 - 03:25)
"""

import os
import sys
import time
import math
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import librosa

WORKSPACE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(WORKSPACE_DIR))

from services.intelligence.acoustic_features import AcousticFeatureExtractor
from research.dynamic_emotion import DynamicEmotionModel
from services.intelligence.stem_separation import CHORD_TEMPLATES

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCES_DIR = BASE_DIR / "sources"
ASSETS_DIR = BASE_DIR / "assets"
RENDERS_DIR = BASE_DIR / "renders" / "final"
RENDERS_DIR.mkdir(parents=True, exist_ok=True)

CLIP_PATH = SOURCES_DIR / "naina_moray_clip_129_205.mp4"
CLIP_AUDIO_PATH = SOURCES_DIR / "naina_moray_clip_audio.wav"
AUDIO_PATH = SOURCES_DIR / "naina_moray_seamless_sync.wav"
CLUT_PATH = ASSETS_DIR / "magma_flame_clut.png"
AXIS_PATH = ASSETS_DIR / "axis_top_dual_magma.png"
OUTPUT_VIDEO_PATH = RENDERS_DIR / "naina_moray_waterfall_magma_top_axis.mp4"

FPS = 25
DURATION = 76.0
TOTAL_FRAMES = int(round(FPS * DURATION))
T_OFFSET = 10.0  # Exact 10.000s prebuffer lead-in

WIDTH = 1080
HEIGHT = 1920
VID_H = 608
AXIS_H = 120
CQT_H = HEIGHT - VID_H - AXIS_H  # 1192 px

f_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if not os.path.exists(f_path):
    f_path = "/System/Library/Fonts/HelveticaNeue.ttc"

FONT_BPM = ImageFont.truetype(f_path, 20)
FONT_CHORD = ImageFont.truetype(f_path, 18)
FONT_MAIN = ImageFont.truetype(f_path, 15)
FONT_TITLE = ImageFont.truetype(f_path, 11)

def extract_music_dna():
    print(">>> [MUSIC DNA] Extracting Native Intelligence for Naina Moray...")
    y_clip, sr_dna = librosa.load(str(CLIP_AUDIO_PATH), sr=22050, mono=True)
    extractor = AcousticFeatureExtractor()
    dna = extractor.extract_from_waveform(y_clip, sample_rate=sr_dna, start_offset=129.0, separate_stems_flag=True)

    key_name = dna['musicalDimensions']['melodyHarmony']['key']
    key_conf = dna['musicalDimensions']['melodyHarmony']['keyConfidence']
    bpm = dna['musicalDimensions']['rhythmGroove']['tempoBpm']

    emo_model = DynamicEmotionModel()
    raw_seq = emo_model._extract_sequence_features(dna['segments'])
    attended_seq = emo_model.compute_dual_scale_attention(raw_seq)
    mean_feat = np.mean(attended_seq, axis=0)
    arousal = float(np.tanh(mean_feat[0] * 0.4 + mean_feat[6] * 0.5 - 0.2))
    valence = float(np.tanh(mean_feat[5] * 0.8 + mean_feat[1] * 0.3 - 0.5))

    def classify_russell(v, a):
        if v >= 0.1 and a >= 0.2:
            return "ECSTATIC"
        elif v >= 0.1:
            return "JOYFUL"
        elif a >= 0.2:
            return "TENSE"
        else:
            return "MELANCHOLIC"

    affect_str = f"{classify_russell(valence, arousal)} (V:{valence:+.2f}, A:{arousal:+.2f})"

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
        "affect_str": affect_str,
        "frame_chords": frame_chords,
        "vocal_norm": smooth(vocal_levels),
        "drum_norm": smooth(drum_levels)
    }

def render_bottom_hud_overlay(overlay_path, dna_data):
    print(f">>> Pre-rendering Bottom Glass Telemetry HUD: {overlay_path.name}")
    t0 = time.time()
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
        str(overlay_path)
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    bpm = dna_data["bpm"]
    sec_per_beat = 60.0 / bpm
    key_str = dna_data["key_str"]
    affect_str = dna_data["affect_str"]
    frame_chords = dna_data["frame_chords"]
    vocal_norm = dna_data["vocal_norm"]
    drum_norm = dna_data["drum_norm"]

    pill_x1 = 25
    pill_x2 = 1055
    pill_y1 = 1836
    pill_y2 = 1904

    for frame_idx in range(TOTAL_FRAMES):
        t = frame_idx / float(FPS)
        beat_phase = (t / sec_per_beat) % 1.0
        pulse = math.exp(-beat_phase * 4.5)
        v_lvl = vocal_norm[frame_idx]
        d_lvl = drum_norm[frame_idx]
        chord_now = frame_chords[min(frame_idx, len(frame_chords) - 1)]

        img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Floating Bottom Glass Telemetry HUD Pill (y = 1836..1904)
        draw.rounded_rectangle([pill_x1, pill_y1, pill_x2, pill_y2], radius=12, fill=(18, 9, 14, 250), outline=(255, 90, 50, 240), width=2)

        dot_r = 7 + int(round(pulse * 3.0))
        dot_cx = pill_x1 + 22
        dot_cy = (pill_y1 + pill_y2) // 2
        draw.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=(255, 110, 50))
        draw.text((pill_x1 + 36, pill_y1 + 23), f"{bpm:.0f} BPM", fill=(255, 255, 255), font=FONT_BPM)

        draw.line([(pill_x1 + 138, pill_y1 + 10), (pill_x1 + 138, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
        draw.text((pill_x1 + 152, pill_y1 + 14), "TONAL KEY", fill=(190, 185, 215), font=FONT_TITLE)
        draw.text((pill_x1 + 152, pill_y1 + 34), key_str, fill=(255, 180, 50), font=FONT_MAIN)

        draw.line([(pill_x1 + 330, pill_y1 + 10), (pill_x1 + 330, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
        draw.text((pill_x1 + 344, pill_y1 + 14), "DYNAMIC AFFECT", fill=(190, 185, 215), font=FONT_TITLE)
        draw.text((pill_x1 + 344, pill_y1 + 34), affect_str, fill=(255, 140, 180), font=FONT_MAIN)

        draw.line([(pill_x1 + 610, pill_y1 + 10), (pill_x1 + 610, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
        draw.text((pill_x1 + 624, pill_y1 + 14), "LIVE CHORD", fill=(190, 185, 215), font=FONT_TITLE)
        draw.text((pill_x1 + 624, pill_y1 + 32), chord_now, fill=(255, 120, 50), font=FONT_CHORD)

        draw.line([(pill_x1 + 725, pill_y1 + 10), (pill_x1 + 725, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
        draw.text((pill_x1 + 740, pill_y1 + 16), "VOCAL", fill=(255, 70, 90), font=FONT_TITLE)
        draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 18, pill_x1 + 940, pill_y1 + 26], radius=4, fill=(25, 12, 18), outline=(255, 70, 90, 150))
        draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 18, pill_x1 + 795 + int(145 * v_lvl), pill_y1 + 26], radius=4, fill=(255, 60, 80))

        draw.text((pill_x1 + 740, pill_y1 + 40), "DRUMS", fill=(255, 160, 40), font=FONT_TITLE)
        draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 42, pill_x1 + 940, pill_y1 + 50], radius=4, fill=(25, 20, 15), outline=(255, 160, 40, 150))
        draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 42, pill_x1 + 795 + int(145 * d_lvl), pill_y1 + 50], radius=4, fill=(255, 150, 40))

        proc.stdin.write(img.tobytes())

    proc.stdin.close()
    proc.wait()
    print(f"✓ Telemetry overlay rendered in {time.time()-t0:.1f}s")

def render_master_video():
    print(f"\n=======================================================")
    print(f">>> [RENDERER] Generating Volcanic Magma Waterfall (Top Dual Axis)")
    print(f"    Target:   {OUTPUT_VIDEO_PATH}")
    print(f"    Duration: {DURATION}s ({TOTAL_FRAMES} frames @ {FPS} fps)")
    print(f"=======================================================")

    dna_data = extract_music_dna()
    overlay_path = ASSETS_DIR / "waterfall_overlay_magma_top.mov"
    render_bottom_hud_overlay(overlay_path, dna_data)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(CLIP_PATH),
        "-i", str(AUDIO_PATH),
        "-i", str(CLUT_PATH),
        "-i", str(AXIS_PATH),
        "-i", str(overlay_path),
        "-filter_complex",
        f"[0:v]scale={WIDTH}:{VID_H},setsar=1[top_vid]; "
        f"[1:a]showcqt=s={WIDTH}x{CQT_H}:rate=25:basefreq=65.406:endfreq=8372:sono_h=880:bar_h=312:axis_h=0:sono_v=35:bar_v=38:sono_g=1.70:bar_g=1.15[cqt_raw]; "
        f"[cqt_raw]trim=start={T_OFFSET}:duration={DURATION},setpts=PTS-STARTPTS[cqt_trim]; "
        f"[cqt_trim][2:v]haldclut,vflip,format=yuv420p,setsar=1[cqt_col]; "
        f"[3:v]format=yuv420p,setsar=1[axis]; "
        f"[top_vid][axis][cqt_col]vstack=inputs=3,setsar=1[canvas]; "
        f"[canvas][4:v]overlay=0:0:format=auto,setsar=1[outv]",
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

    t0 = time.time()
    subprocess.run(cmd, check=True)
    print(f"\n✓ BROADCAST WATERFALL RENDER COMPLETE IN {time.time()-t0:.1f}s!")
    print(f"✓ Saved to: {OUTPUT_VIDEO_PATH}")

    # Also symlink to public/videos for the web player
    pub_link = WORKSPACE_DIR / "public" / "videos" / "naina_moray_waterfall_magma_top_axis.mp4"
    subprocess.run(["ln", "-sf", str(OUTPUT_VIDEO_PATH), str(pub_link)], check=True)
    print(f"✓ Symlinked to: {pub_link}")

    if overlay_path.exists():
        overlay_path.unlink()

if __name__ == "__main__":
    render_master_video()
