#!/usr/bin/env python3
"""
Generate Piano Axis Overlays & Inferno CLUT for CQT Spectrograms
"""
import os
from pathlib import Path
import numpy as np
import matplotlib
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BASE_DIR / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

def generate_axis(width, height, output_path):
    img = Image.new("RGB", (width, height), color=(10, 8, 18))
    draw = ImageDraw.Draw(img)
    
    # Select best system font
    oct_size = int(round(height * 0.28))
    note_size = int(round(height * 0.20))
    font_oct = None
    font_note = None
    
    for font_path in [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        if os.path.exists(font_path):
            try:
                font_oct = ImageFont.truetype(font_path, oct_size)
                font_note = ImageFont.truetype(font_path, note_size)
                break
            except Exception:
                pass
                
    if font_oct is None:
        font_oct = ImageFont.load_default()
        font_note = ImageFont.load_default()
            
    n_octaves = 7  # C2 to C9
    oct_w = width / float(n_octaves)
    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    
    # Top border line (Gold)
    draw.line([(0, 0), (width, 0)], fill=(255, 215, 0), width=2)
    
    key_h = int(round(height * 0.38))
    key_top = height - key_h
    
    for oct_i in range(n_octaves):
        oct_num = oct_i + 2  # C2 to C8
        oct_x = oct_i * oct_w
        
        # Octave divider line across full height
        draw.line([(oct_x, 0), (oct_x, height)], fill=(255, 215, 0), width=2)
        # Bold Gold Octave Label
        draw.text((oct_x + 6, 4), f"C{oct_num}", fill=(255, 220, 60), font=font_oct)
        
        # 12 semitones
        for semi_i in range(12):
            semi_x = oct_x + (semi_i / 12.0) * oct_w
            w_semi = oct_w / 12.0
            name = note_names[semi_i]
            is_sharp = "#" in name
            
            if is_sharp:
                # Black key (narrower, elevated)
                draw.rectangle([(semi_x + 1, key_top), (semi_x + w_semi - 1, height - int(round(key_h * 0.35)))], fill=(35, 30, 48))
            else:
                # White key indicator
                draw.rectangle([(semi_x + 1, key_top), (semi_x + w_semi - 1, height - 2)], outline=(90, 85, 120), fill=(18, 16, 28))
                
            # Secondary major note letters (E, G, A)
            if name in ["E", "G", "A"] and width >= 1080:
                draw.text((semi_x + 2, 6), f"{name}", fill=(180, 180, 220), font=font_note)
                
    # Final C9 boundary
    draw.line([(width - 1, 0), (width - 1, height)], fill=(255, 215, 0), width=2)
    draw.text((width - 34, 4), "C9", fill=(255, 220, 60), font=font_oct)
    
    img.save(output_path, "PNG")
    print(f"Generated axis: {output_path} ({width}x{height})")

def generate_inferno_clut(output_path):
    # Standard Hald CLUT level 8 (512x512)
    level = 8
    n = level * level
    img_data = np.zeros((n, n, 3), dtype=np.uint8)
    
    cmap = matplotlib.colormaps["inferno"]
    for y in range(n):
        for x in range(n):
            # RGB coordinates in 3D color cube
            r = (x % level) * (255.0 / (level - 1.0))
            g = (x // level) * (255.0 / (level - 1.0))
            b = y * (255.0 / (n - 1.0))
            
            # Grayscale luminosity
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            norm_lum = lum / 255.0
            
            mapped_rgb = (np.array(cmap(norm_lum)[:3]) * 255.0).astype(np.uint8)
            img_data[y, x] = mapped_rgb
            
    img = Image.fromarray(img_data)
    img.save(output_path, "PNG")
    print(f"Generated Inferno CLUT: {output_path} (512x512)")

if __name__ == "__main__":
    generate_axis(1080, 80, ASSETS_DIR / "axis_1080_v2.png")
    generate_axis(1920, 60, ASSETS_DIR / "axis_1920_v2.png")
    generate_inferno_clut(ASSETS_DIR / "inferno_clut.png")
    print("All assets successfully built in:", ASSETS_DIR)
