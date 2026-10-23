"""Render the Discord brand GIF locally. Requires Pillow, numpy and a rasterized original logo."""
from pathlib import Path
import argparse
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument("--logo", required=True)
parser.add_argument("--font", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
W, H, FPS, SECONDS = 960, 144, 15, 9
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
logo = Image.open(args.logo).convert("RGBA").resize((100, 100), Image.Resampling.LANCZOS)

def text_mask(text, size):
    font = ImageFont.truetype(args.font, size * 2)
    bounds = font.getbbox(text)
    mask = Image.new("L", ((bounds[2] - bounds[0]) + 4, size * 3))
    ImageDraw.Draw(mask).text((2 - bounds[0], -bounds[1]), text, font=font, fill=255)
    return mask.resize((mask.width // 2, mask.height // 2), Image.Resampling.LANCZOS)

phrases = [text_mask(text, 34) for text in ["COMPETE. WIN. CLIMB.", "BUILD YOUR TEAM.", "OWN YOUR NEXT WIN."]]
brand_parts = [(text_mask("TOP", 31), (244, 252, 255)), (text_mask("FRAGG", 31), (20, 216, 255)), (text_mask(".GG", 31), (178, 215, 237))]
eyebrow = text_mask("THE TOPFRAGG ARENA", 11)
subline = text_mask("YOUR TEAM. YOUR GAME. YOUR MOMENT.", 12)
mask = Image.new("L", (W * 2, H * 2))
ImageDraw.Draw(mask).rounded_rectangle((12, 14, W * 2 - 12, H * 2 - 14), radius=64, fill=255)
mask = mask.resize((W, H), Image.Resampling.LANCZOS)
x, y = np.meshgrid(np.arange(W), np.arange(H))
frames = []

for frame in range(FPS * SECONDS):
    t = frame / FPS
    phase = t / SECONDS * math.tau
    sweep = -240 + ((t / 4.5) % 1) * (W + 480)
    shine = np.exp(-((x - sweep + y * 1.5) / 130) ** 2)
    glow = np.exp(-((x - (W * .58 + 170 * math.sin(phase))) / 460) ** 2 - ((y - H * .8) / 110) ** 2)
    base = np.empty((H, W, 3), dtype=np.float32)
    for channel, (dark, light, reflection) in enumerate([(5, 3, 10), (13, 20, 34), (24, 45, 49)]):
        base[:, :, channel] = dark + glow * light + shine * reflection
    image = Image.fromarray(np.clip(base, 0, 255).astype("uint8"), "RGB").convert("RGBA")
    details = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(details)
    d.rounded_rectangle((6, 7, W - 7, H - 8), radius=32, outline=(31, 119, 155, 180), width=1)
    d.line((143, 30, 143, 113), fill=(60, 170, 207, 65), width=1)
    d.line((425, 34, 425, 111), fill=(60, 170, 207, 80), width=1)
    for line_y in [10, H - 11]:
        for line_x in range(36, W - 36):
            power = math.exp(-((line_x - (sweep - line_y * 1.5)) / 95) ** 2)
            if power > .025:
                d.point((line_x, line_y), fill=(70, 226, 255, int(215 * power)))
    for index in range(19):
        px = 166 + ((index * 67 + t * (8 + index % 4)) % 750)
        py = 19 + ((index * 29 - t * 6) % 102)
        strength = (.5 + .5 * math.sin(phase * 3 + index * 1.7)) ** 7
        alpha = int(145 * strength)
        radius = 1 + (index % 3 == 0)
        d.ellipse((px - radius, py - radius, px + radius, py + radius), fill=(96, 221, 255, alpha))
        if index % 5 == 0:
            d.line((px - 4, py, px + 4, py), fill=(188, 247, 255, alpha), width=1)
            d.line((px, py - 4, px, py + 4), fill=(188, 247, 255, alpha), width=1)
    image = Image.alpha_composite(image, details)
    aura = Image.new("RGBA", (W, H))
    ImageDraw.Draw(aura).ellipse((26, 34, 119, 114), fill=(0, 155, 255, int(44 + 13 * math.sin(phase))))
    image = Image.alpha_composite(image, aura.filter(ImageFilter.GaussianBlur(14)))
    # One subtle full turn per loop; hold the original mark clearly readable between turns.
    spin = max(0, min(1, (t - 6.8) / 1.2))
    angle = (spin * spin * (3 - 2 * spin)) * math.tau
    width = max(5, int(100 * abs(math.cos(angle))))
    spinning_logo = logo.resize((width, 100), Image.Resampling.LANCZOS)
    image.alpha_composite(spinning_logo, (27 + (100 - width) // 2, 22))
    bx = 166
    for word, color in brand_parts:
        image.paste(color, (bx, 56), word)
        bx += word.width - 1
    image.paste((91, 167, 195), (168, 35), eyebrow)
    local = t % 3
    phrase = phrases[int(t // 3) % len(phrases)]
    fade = min(1, local / .38, (3 - local) / .38)
    fade = max(0, fade)
    slide = int(10 * (1 - fade))
    phrase_mask = Image.new("L", (W, H))
    phrase_mask.paste(phrase.point(lambda value: int(value * fade)), (453, 48 + slide))
    text_layer = np.zeros((H, W, 3), dtype=np.uint8)
    highlight = np.exp(-((x - sweep) / 100) ** 2)
    text_layer[:, :, 0] = np.clip(123 + highlight * 125, 0, 255)
    text_layer[:, :, 1] = np.clip(219 + highlight * 35, 0, 255)
    text_layer[:, :, 2] = 255
    blurred = phrase_mask.filter(ImageFilter.GaussianBlur(6)).point(lambda value: int(value * .4))
    image.paste((0, 117, 255), (0, 0), blurred)
    image.paste(Image.fromarray(text_layer), (0, 0), phrase_mask)
    image.paste((95, 150, 177), (454, 97), subline)
    image.putalpha(mask)
    frames.append(image)

# Shared palette avoids changing gradient colors between frames. Reserve 255 for transparent corners.
atlas = Image.new("RGB", (240, 36 * len(frames)))
for index, frame in enumerate(frames):
    atlas.paste(frame.convert("RGB").resize((240, 36)), (0, index * 36))
palette = atlas.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
gif_frames = []
for frame in frames:
    indexed = frame.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
    indexed.paste(255, mask=mask.point(lambda value: 255 if value < 128 else 0))
    gif_frames.append(indexed)
durations = [70 if index % 3 else 60 for index in range(len(frames))]
gif_frames[0].save(output, save_all=True, append_images=gif_frames[1:], duration=durations, loop=0, transparency=255, disposal=2, optimize=False)
frames[15].save(output.with_suffix(".png"))
print(f"Created {output.name}: {W}x{H}, {len(frames)} frames, {output.stat().st_size:,} bytes")
