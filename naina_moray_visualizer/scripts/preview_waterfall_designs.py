#!/usr/bin/env python3
"""
Generate Full-Fidelity Broadcast Snapshots for 4 Waterfall Visualizer Designs
Song: Coke Studio Season 10 | Naina Moray (02:09 - 03:25)
Timestamp: t = 35.0s (02:44 - Iconic Lead Vocal Taan & Guitar Solo)
"""

import os
import sys
import math
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WORKSPACE_DIR = Path.cwd()
sys.path.insert(0, str(WORKSPACE_DIR))

BASE_DIR = Path("naina_moray_visualizer")
SOURCES_DIR = BASE_DIR / "sources"
ASSETS_DIR = BASE_DIR / "assets"
PREVIEWS_DIR = BASE_DIR / "previews"
ARTIFACTS_DIR = Path("/Users/wahajaslam/.gemini/antigravity/brain/c4de5157-b2b8-42b1-a175-f735ec9179c2")
PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

CLIP_PATH = SOURCES_DIR / "naina_moray_clip_129_205.mp4"
AUDIO_PATH = SOURCES_DIR / "naina_moray_seamless_sync.wav"
AXIS_PATH = ASSETS_DIR / "axis_1080_v2.png"

# Typography
f_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if not os.path.exists(f_path):
    f_path = "/System/Library/Fonts/HelveticaNeue.ttc"
    
FONT_BPM = ImageFont.truetype(f_path, 20)
FONT_CHORD = ImageFont.truetype(f_path, 18)
FONT_MAIN = ImageFont.truetype(f_path, 15)
FONT_TITLE = ImageFont.truetype(f_path, 11)
FONT_BRACKET = ImageFont.truetype(f_path, 12)

DESIGNS = [
    {
        "id": "cyberpunk_neon",
        "name": "Design 1: Cyberpunk Neon & Electric Cyan",
        "clut": ASSETS_DIR / "cyberpunk_neon_clut.png",
        "sono_h": 900,
        "bar_h": 332,
        "sono_g": 1.75,
        "bar_g": 1.20,
        "sono_v": 34,
        "bar_v": 38,
        "pill_border": (0, 229, 255),
        "pill_bg": (14, 10, 24, 250),
        "accent": (0, 229, 255),
        "vocal_col": (224, 38, 125),
        "drum_col": (0, 229, 255)
    },
    {
        "id": "liquid_gold",
        "name": "Design 2: Imperial Liquid Gold & Obsidian Luxe",
        "clut": ASSETS_DIR / "liquid_gold_clut.png",
        "sono_h": 920,
        "bar_h": 312,
        "sono_g": 1.65,
        "bar_g": 1.15,
        "sono_v": 35,
        "bar_v": 40,
        "pill_border": (255, 208, 54),
        "pill_bg": (16, 13, 10, 250),
        "accent": (255, 215, 60),
        "vocal_col": (255, 208, 54),
        "drum_col": (201, 130, 20)
    },
    {
        "id": "emerald_aurora",
        "name": "Design 3: Emerald Aurora & Deep Bioluminescence",
        "clut": ASSETS_DIR / "emerald_aurora_clut.png",
        "sono_h": 900,
        "bar_h": 332,
        "sono_g": 1.75,
        "bar_g": 1.20,
        "sono_v": 34,
        "bar_v": 38,
        "pill_border": (34, 255, 153),
        "pill_bg": (8, 16, 18, 250),
        "accent": (34, 255, 153),
        "vocal_col": (34, 255, 153),
        "drum_col": (0, 170, 114)
    },
    {
        "id": "magma_calibrated",
        "name": "Design 4: Volcanic Magma & Ruby Sunburst",
        "clut": ASSETS_DIR / "magma_flame_clut.png",
        "sono_h": 920,
        "bar_h": 312,
        "sono_g": 1.70,
        "bar_g": 1.15,
        "sono_v": 35,
        "bar_v": 38,
        "pill_border": (255, 90, 50),
        "pill_bg": (18, 10, 12, 250),
        "accent": (255, 110, 60),
        "vocal_col": (255, 70, 70),
        "drum_col": (255, 160, 40)
    }
]

def draw_hud(img, cfg):
    draw = ImageDraw.Draw(img)
    
    # 1. Glass Telemetry HUD Pill (Floating at y=618..686)
    pill_x1 = 25
    pill_x2 = 1055
    pill_y1 = 618
    pill_y2 = 686

    draw.rounded_rectangle([pill_x1, pill_y1, pill_x2, pill_y2], radius=12, fill=cfg["pill_bg"], outline=(*cfg["pill_border"], 240), width=2)

    # BPM with pulsing dot
    dot_r = 8
    dot_cx = pill_x1 + 22
    dot_cy = (pill_y1 + pill_y2) // 2
    draw.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=cfg["accent"])
    draw.text((pill_x1 + 36, pill_y1 + 23), "144 BPM", fill=(255, 255, 255), font=FONT_BPM)

    # Divider 1
    draw.line([(pill_x1 + 138, pill_y1 + 10), (pill_x1 + 138, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
    draw.text((pill_x1 + 152, pill_y1 + 14), "TONAL KEY", fill=(190, 185, 215), font=FONT_TITLE)
    draw.text((pill_x1 + 152, pill_y1 + 34), "D# MINOR (92%)", fill=cfg["accent"], font=FONT_MAIN)

    # Divider 2
    draw.line([(pill_x1 + 330, pill_y1 + 10), (pill_x1 + 330, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
    draw.text((pill_x1 + 344, pill_y1 + 14), "DYNAMIC AFFECT", fill=(190, 185, 215), font=FONT_TITLE)
    draw.text((pill_x1 + 344, pill_y1 + 34), "ECSTATIC (V:+0.14, A:+0.45)", fill=(240, 200, 255), font=FONT_MAIN)

    # Divider 3
    draw.line([(pill_x1 + 610, pill_y1 + 10), (pill_x1 + 610, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
    draw.text((pill_x1 + 624, pill_y1 + 14), "LIVE CHORD", fill=(190, 185, 215), font=FONT_TITLE)
    draw.text((pill_x1 + 624, pill_y1 + 32), "D#m", fill=cfg["accent"], font=FONT_CHORD)

    # Divider 4
    draw.line([(pill_x1 + 725, pill_y1 + 10), (pill_x1 + 725, pill_y2 - 10)], fill=(255, 255, 255, 60), width=2)
    draw.text((pill_x1 + 740, pill_y1 + 16), "VOCAL", fill=cfg["vocal_col"], font=FONT_TITLE)
    draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 18, pill_x1 + 940, pill_y1 + 26], radius=4, fill=(25, 20, 35), outline=(*cfg["vocal_col"], 150))
    draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 18, pill_x1 + 795 + int(145 * 0.85), pill_y1 + 26], radius=4, fill=cfg["vocal_col"])

    draw.text((pill_x1 + 740, pill_y1 + 40), "DRUMS", fill=cfg["drum_col"], font=FONT_TITLE)
    draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 42, pill_x1 + 940, pill_y1 + 50], radius=4, fill=(25, 25, 25), outline=(*cfg["drum_col"], 150))
    draw.rounded_rectangle([pill_x1 + 795, pill_y1 + 42, pill_x1 + 795 + int(145 * 0.62), pill_y1 + 50], radius=4, fill=cfg["drum_col"])

    # 2. Sleek Horizon Stem Badges (y = 1785..1830, right above the piano keyboard)
    def draw_stem_badge(x1, x2, label, pct_str, border_rgb):
        draw.rounded_rectangle([x1, 1792, x2, 1832], radius=6, fill=(14, 12, 22, 240), outline=(*border_rgb, 240), width=2)
        mid_x = (x1 + x2) // 2
        full_text = f"{label} {pct_str}"
        bbox = FONT_BRACKET.getbbox(full_text)
        w_t = bbox[2] - bbox[0]
        draw.text((mid_x - w_t // 2, 1803), full_text, fill=(255, 255, 255), font=FONT_BRACKET)

    draw_stem_badge(20, 240, "DRUMS & BASS", "98%", cfg["drum_col"])
    draw_stem_badge(260, 520, "GUITAR & HARMONY", "78%", cfg["accent"])
    draw_stem_badge(540, 830, "LEAD VOCALS (JAVED & AKBAR)", "86%", cfg["vocal_col"])
    draw_stem_badge(850, 1060, "AIR & OVERTONES", "45%", (180, 210, 255))

def main():
    print(">>> Generating Complete Broadcast Snapshots for 4 Waterfall Designs...")
    
    for cfg in DESIGNS:
        d_id = cfg["id"]
        out_path = PREVIEWS_DIR / f"waterfall_{d_id}_full_t35.png"
        art_path = ARTIFACTS_DIR / f"waterfall_{d_id}_full_t35.png"
        
        sono_h = cfg["sono_h"]
        bar_h = cfg["bar_h"]
        sono_g = cfg["sono_g"]
        bar_g = cfg["bar_g"]
        sono_v = cfg["sono_v"]
        bar_v = cfg["bar_v"]
        clut_path = cfg["clut"]
        
        # Step 1: Render base video + showcqt + axis
        tmp_base = PREVIEWS_DIR / f"tmp_{d_id}.png"
        cmd = [
            "ffmpeg", "-y",
            "-ss", "35.0", "-i", str(CLIP_PATH),
            "-ss", "45.0", "-i", str(AUDIO_PATH),
            "-i", str(clut_path),
            "-i", str(AXIS_PATH),
            "-filter_complex",
            f"[0:v]scale=1080:608,setsar=1[top_vid]; "
            f"[1:a]showcqt=s=1080x1232:rate=25:basefreq=65.406:endfreq=8372:sono_h={sono_h}:bar_h={bar_h}:axis_h=0:sono_v={sono_v}:bar_v={bar_v}:sono_g={sono_g}:bar_g={bar_g}[cqt_raw]; "
            f"[cqt_raw][2:v]haldclut,format=yuv420p,setsar=1[cqt_col]; "
            f"[3:v]format=yuv420p,setsar=1[axis]; "
            f"[top_vid][cqt_col][axis]vstack=inputs=3,setsar=1[outv]",
            "-map", "[outv]",
            "-frames:v", "1",
            str(tmp_base)
        ]
        subprocess.run(cmd, check=True, stderr=subprocess.DEVNULL)
        
        # Step 2: Overlay HUD and Stem Badges
        base_img = Image.open(tmp_base).convert("RGBA")
        draw_hud(base_img, cfg)
        base_img.save(out_path)
        base_img.save(art_path)
        if tmp_base.exists():
            tmp_base.unlink()
            
        print(f"✓ Completed {cfg['name']}: {out_path.name}")
        
    print("\nAll 4 waterfall design snapshots generated successfully!")

if __name__ == "__main__":
    main()

