#!/usr/bin/env python3
"""Build a 2048x2048 PNG logo atlas from data.json and write an augmented data.json."""
import argparse
import json
import math
import sys
from pathlib import Path

from PIL import Image

ATLAS_SIZE = 2048
ATLAS_NAME = "atlas.png"


def collect(data):
    entries = []
    messages = data.get("messages")
    if isinstance(messages, dict):
        entries.append(messages)
    entries.extend(p for p in data.get("performers", []) if isinstance(p, dict))
    return [e for e in entries if e.get("logoName")]


def fit_square(img, size):
    img = img.convert("RGBA")
    scale = min(size / img.width, size / img.height)
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((w, h), Image.LANCZOS)
    cell = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cell.paste(img, ((size - w) // 2, (size - h) // 2))
    return cell


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data.json")
    ap.add_argument("--images", default="images")
    ap.add_argument("--out", default="_site")
    args = ap.parse_args()

    data = json.loads(Path(args.data).read_text(encoding="utf-8"))
    entries = collect(data)
    images_dir = Path(args.images)

    names = []
    for e in entries:
        e.pop("logoUV", None)
        if e["logoName"] not in names:
            if (images_dir / e["logoName"]).is_file():
                names.append(e["logoName"])
            else:
                print(f"warning: {e['logoName']} not found in {images_dir}", file=sys.stderr)

    atlas = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    uvs = {}
    if names:
        cols = math.ceil(math.sqrt(len(names)))
        cell = ATLAS_SIZE // cols
        for i, name in enumerate(names):
            col, row = i % cols, i // cols
            with Image.open(images_dir / name) as src:
                atlas.paste(fit_square(src, cell), (col * cell, row * cell))
            uvs[name] = {
                "u": col * cell / ATLAS_SIZE,
                "v": 1 - (row + 1) * cell / ATLAS_SIZE,
                "w": cell / ATLAS_SIZE,
                "h": cell / ATLAS_SIZE,
            }

    # Insert logoUV directly after logoName, preserving key order.
    for e in entries:
        uv = uvs.get(e["logoName"])
        if uv is None:
            continue
        items = []
        for k, v in e.items():
            items.append((k, v))
            if k == "logoName":
                items.append(("logoUV", uv))
        e.clear()
        e.update(items)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    atlas.save(out / ATLAS_NAME, "PNG")
    (out / "data.json").write_text(
        json.dumps(data, indent=4, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"atlas: {len(names)} logo(s) -> {out / ATLAS_NAME}")


if __name__ == "__main__":
    main()
