#!/usr/bin/env python3
"""用 flash.jpg 抠掉黑色背景 -> 镂空透明 PNG -> 生成所有 mipmap 尺寸"""
from PIL import Image
import os

SRC = r"E:\Desktop\flash.jpg"
PROJECT = r"E:\Project\Claw\SysTasker-webview"

SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

img = Image.open(SRC).convert("RGBA")
print(f"Source: {img.size}")

pixels = img.load()
w, h = img.size

for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        brightness = (r + g + b) / 3
        if brightness < 30:
            pixels[x, y] = (r, g, b, 0)
        elif brightness < 80:
            t = (brightness - 30) / 50
            new_alpha = int(a * t)
            pixels[x, y] = (r, g, b, new_alpha)

# 预览
preview = r"E:\Desktop\flash_icon_preview.png"
img.save(preview)
print(f"Preview: {preview}")

# 生成 mipmap
for density, size in SIZES.items():
    res_dir = os.path.join(PROJECT, "app", "src", "main", "res", f"mipmap-{density}")
    os.makedirs(res_dir, exist_ok=True)
    resized = img.resize((size, size), Image.LANCZOS)
    for name in ("ic_launcher.png", "ic_launcher_round.png"):
        out = os.path.join(res_dir, name)
        resized.save(out)
        print(f"  OK: {out}")

print("\nDone!")
