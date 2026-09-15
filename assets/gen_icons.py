"""
Generate app icons / favicon / splash background from the PSU logo.
Run: python assets/gen_icons.py
"""
from PIL import Image, ImageDraw, ImageFilter
import os

ASSETS = os.path.dirname(os.path.abspath(__file__))
SRC = r"D:\2024\LOGO PSU.JPG"


def load_logo_transparent():
    im = Image.open(SRC).convert("RGBA")
    datas = list(im.getdata())
    newdata = []
    for r, g, b, a in datas:
        if r > 235 and g > 235 and b > 235:
            newdata.append((r, g, b, 0))
        else:
            newdata.append((r, g, b, 255))
    im.putdata(newdata)
    bbox = im.getbbox()
    return im.crop(bbox)


def square_canvas(logo, size, bg=(255, 255, 255, 0), logo_ratio=0.82):
    """Paste logo centered on a transparent/solid square canvas."""
    canvas = Image.new("RGBA", (size, size), bg)
    target = int(size * logo_ratio)
    logo_resized = logo.copy()
    logo_resized.thumbnail((target, target), Image.LANCZOS)
    x = (size - logo_resized.width) // 2
    y = (size - logo_resized.height) // 2
    canvas.alpha_composite(logo_resized, (x, y))
    return canvas


def soft_background(logo, size, opacity=28, blur=6, bg_color=(0, 0, 0, 0)):
    """Very soft, low-opacity, blurred version of the logo to use as an app
    background watermark so form field labels stay readable on top."""
    canvas = Image.new("RGBA", (size, size), bg_color)
    target = int(size * 0.9)
    logo_resized = logo.copy()
    logo_resized.thumbnail((target, target), Image.LANCZOS)
    # reduce opacity to `opacity` percent (0-100) of original alpha
    r, g, b, a = logo_resized.split()
    factor = max(0.0, min(1.0, opacity / 100))
    a = a.point(lambda p: int(p * factor))
    faded = Image.merge("RGBA", (r, g, b, a))
    faded = faded.filter(ImageFilter.GaussianBlur(blur))
    x = (size - faded.width) // 2
    y = (size - faded.height) // 2
    canvas.alpha_composite(faded, (x, y))
    return canvas


def main():
    logo = load_logo_transparent()

    # --- App icon (1024x1024, opaque white bg like current icon.png) ---
    icon = square_canvas(logo, 1024, bg=(255, 255, 255, 255), logo_ratio=0.86).convert("RGB")
    icon.save(os.path.join(ASSETS, "icon.png"))

    # --- Favicon (48x48, transparent) ---
    favicon = square_canvas(logo, 48, bg=(0, 0, 0, 0), logo_ratio=0.92)
    favicon.save(os.path.join(ASSETS, "favicon.png"))
    # extra larger favicon variants for web/browser tabs
    favicon_192 = square_canvas(logo, 192, bg=(0, 0, 0, 0), logo_ratio=0.92)
    favicon_192.save(os.path.join(ASSETS, "favicon-192.png"))

    # --- Android adaptive icon foreground (512x512, transparent, logo only) ---
    fg = square_canvas(logo, 512, bg=(0, 0, 0, 0), logo_ratio=0.62)
    fg.save(os.path.join(ASSETS, "android-icon-foreground.png"))

    # --- Android adaptive icon background (512x512, soft solid color) ---
    bg = Image.new("RGBA", (512, 512), (230, 244, 254, 255))
    bg.save(os.path.join(ASSETS, "android-icon-background.png"))

    # --- Android adaptive icon monochrome (432x432, black silhouette) ---
    mono_logo = logo.convert("L").point(lambda p: 255 if p > 200 else 0)
    mono_alpha = logo.split()[3]
    mono = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    mono_black = Image.new("RGBA", logo.size, (0, 0, 0, 255))
    mono.paste(mono_black, (0, 0), mono_alpha)
    mono_canvas = square_canvas(mono, 432, bg=(0, 0, 0, 0), logo_ratio=0.62)
    mono_canvas.save(os.path.join(ASSETS, "android-icon-monochrome.png"))

    # --- Splash icon (1024x1024, transparent, logo centered) ---
    splash = square_canvas(logo, 1024, bg=(255, 255, 255, 255), logo_ratio=0.55)
    splash.save(os.path.join(ASSETS, "splash-icon.png"))

    print("Done generating icons/splash/favicon.")


if __name__ == "__main__":
    main()
