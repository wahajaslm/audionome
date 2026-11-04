#!/usr/bin/env python3
"""
Generate Designer CLUTs (Color Lookup Tables) for World-Class CQT Spectrograms
Styles:
  1. Cyberpunk Neon (Electric Violet -> Magenta -> Cyan -> Pure Solar White)
  2. Liquid Gold / Obsidian (Deep Onyx -> Dark Amber -> Liquid Gold -> Champagne Platinum)
  3. Emerald Aurora (Midnight Navy -> Deep Cyan -> Emerald Green -> Electric Lime -> White)
  4. Magma Flame (Deep Obsidian -> Crimson -> Vivid Orange -> Solar White)
  5. Calibrated Inferno (Contrast-boosted, deep black floor Inferno)
"""

import os
from pathlib import Path
import numpy as np
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BASE_DIR / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

# Custom Curated Palettes for Audio Spectrograms
CUSTOM_PALETTES = {
    "cyberpunk_neon": LinearSegmentedColormap.from_list(
        "cyberpunk_neon",
        [
            (0.00, "#080612"),  # Deep Obsidian Black Floor
            (0.18, "#280b4d"),  # Deep Violet
            (0.38, "#791986"),  # Radiant Purple
            (0.58, "#e0267d"),  # Electric Hot Magenta
            (0.78, "#00e5ff"),  # High-Voltage Cyan
            (0.92, "#85faff"),  # Neon Ice
            (1.00, "#ffffff"),  # Pure Solar White Peak
        ]
    ),
    "liquid_gold": LinearSegmentedColormap.from_list(
        "liquid_gold",
        [
            (0.00, "#080706"),  # Deep Velvet Onyx
            (0.20, "#261706"),  # Espresso Amber
            (0.40, "#73430a"),  # Antique Bronze
            (0.62, "#c98214"),  # Radiant Topaz
            (0.80, "#ffd036"),  # Liquid Gold
            (0.93, "#fff2a8"),  # Champagne Glow
            (1.00, "#ffffff"),  # Pure Platinum White
        ]
    ),
    "emerald_aurora": LinearSegmentedColormap.from_list(
        "emerald_aurora",
        [
            (0.00, "#04090d"),  # Abyssal Deep Navy
            (0.18, "#07232e"),  # Dark Teal
            (0.38, "#0a5c54"),  # Forest Cyan
            (0.58, "#00aa72"),  # Bioluminescent Emerald
            (0.78, "#22ff99"),  # Electric Mint
            (0.92, "#b8ffdc"),  # Aurora Ice
            (1.00, "#ffffff"),  # Pure White Star
        ]
    ),
    "magma_flame": matplotlib.colormaps["magma"],
    "plasma_electric": matplotlib.colormaps["plasma"],
    "inferno_calibrated": matplotlib.colormaps["inferno"]
}

def generate_hald_clut(cmap, output_path, gamma=1.0):
    level = 8
    n = level * level
    img_data = np.zeros((n, n, 3), dtype=np.uint8)
    
    for y in range(n):
        for x in range(n):
            r = (x % level) * (255.0 / (level - 1.0))
            g = (x // level) * (255.0 / (level - 1.0))
            b = y * (255.0 / (n - 1.0))
            
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            if gamma != 1.0:
                lum = np.power(lum, gamma)
                
            norm_lum = np.clip(lum, 0.0, 1.0)
            mapped_rgb = (np.array(cmap(norm_lum)[:3]) * 255.0).astype(np.uint8)
            img_data[y, x] = mapped_rgb
            
    img = Image.fromarray(img_data)
    img.save(output_path, "PNG")
    print(f"✓ Generated CLUT: {output_path.name}")

def main():
    print(">>> Generating Designer CLUTs for CQT Waterfall Visualizers...")
    for name, cmap in CUSTOM_PALETTES.items():
        out_file = ASSETS_DIR / f"{name}_clut.png"
        generate_hald_clut(cmap, out_file)
    print("All designer CLUTs successfully created!")

if __name__ == "__main__":
    main()

