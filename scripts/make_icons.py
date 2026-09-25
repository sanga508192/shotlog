# สร้างไอคอน PNG ให้ตรงกับ icons/icon.svg (ต้องมี Pillow)
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"


def draw(size: int) -> Image.Image:
    s = size / 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(96 * s), fill="#1f6f4a")
    d.ellipse([136 * s, 342 * s, 376 * s, 402 * s], fill="#2f8f61")
    d.line([250 * s, 110 * s, 250 * s, 360 * s], fill="#ffffff", width=max(2, int(20 * s)))
    d.polygon([(260 * s, 112 * s), (370 * s, 154 * s), (260 * s, 196 * s)], fill="#f2c94c")
    d.ellipse([304 * s, 326 * s, 356 * s, 378 * s], fill="#ffffff")
    return img


for n in (192, 512):
    draw(n).save(OUT / f"icon-{n}.png")
    print("wrote", OUT / f"icon-{n}.png")
