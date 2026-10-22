#!/usr/bin/env python3
"""
Portrait background removal using rembg segmentation.

Usage:
    python scripts/portrait_cutout.py \
        --input source/portrait.png \
        --output src/assets/portrait-cutout.png \
        --model isnet-general-use
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import remove, new_session


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Remove the background from a portrait photo.")
    ap.add_argument("--input", default="source/portrait.png", type=Path)
    ap.add_argument("--output", default="src/assets/portrait-cutout.png", type=Path)
    ap.add_argument(
        "--model",
        default="isnet-general-use",
        help="rembg model name (isnet-general-use, u2net_human_seg, birefnet-general, ...)",
    )
    ap.add_argument(
        "--feather",
        type=float,
        default=0.8,
        help="blur radius (px) applied to the alpha channel to soften hair edges",
    )
    ap.add_argument(
        "--contract",
        type=float,
        default=0.12,
        help="alpha contraction (0..0.5) that removes the light background halo",
    )
    ap.add_argument("--keep-source", action="store_true", help="also write the unmasked RGB")
    return ap.parse_args()


def refine_alpha(alpha: np.ndarray, contract: float, feather: float) -> np.ndarray:
    """Contract then feather the matte so hair strands do not carry background pixels."""
    a = alpha.astype(np.float32) / 255.0

    # 1. Hard threshold with a small hysteresis kills the soft grey background fringe.
    a = np.clip((a - 0.30) / 0.55, 0.0, 1.0)
    a = a * a * (3.0 - 2.0 * a)  # smoothstep -> removes banding

    # 2. Contract (erode) the matte slightly: kills the light-grey halo that
    #    survives around the shoulders, where the shirt meets the backdrop.
    if contract > 0:
        from PIL import ImageFilter as _IF

        eroded = Image.fromarray((a * 255).astype(np.uint8)).filter(_IF.MinFilter(3))
        a = np.minimum(a, np.asarray(eroded, dtype=np.float32) / 255.0)

    # 3. Feather: a 1px blur keeps the edge crisp, a larger blur gives soft hair.
    if feather > 0:
        blurred = Image.fromarray((a * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(radius=feather)
        )
        a = np.asarray(blurred, dtype=np.float32) / 255.0

    return np.clip(a, 0.0, 1.0)


def main() -> int:
    args = parse_args()

    if not args.input.exists():
        print(f"error: input not found: {args.input}", file=sys.stderr)
        return 1

    print(f"[1/4] loading rembg model '{args.model}' (first run downloads it)...")
    session = new_session(args.model)

    print(f"[2/4] removing background from {args.input}...")
    with Image.open(args.input) as src:
        src = src.convert("RGB")
        out = remove(src, session=session, alpha_matting=False, post_process_mask=False)

    rgba = out if isinstance(out, Image.Image) else Image.open(io.BytesIO(out)).convert("RGBA")
    rgba = rgba.convert("RGBA")
    src_rgb = Image.open(args.input).convert("RGB")

    print("[3/4] refining matte (contract + feather)...")
    alpha = refine_alpha(np.asarray(rgba.getchannel("A")), args.contract, args.feather)
    rgba.putalpha(Image.fromarray((alpha * 255).astype(np.uint8), mode="L"))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(args.output, format="PNG", optimize=True)
    print(f"      -> {args.output} ({args.output.stat().st_size / 1024:.0f} KB)")

    if args.keep_source:
        src_out = args.output.with_name(args.output.stem.replace("cutout", "source") + ".jpg")
        src_rgb.save(src_out, quality=92)
        print(f"      -> {src_out}")

    bbox = rgba.getbbox()
    print(f"[4/4] done. opaque bbox = {bbox}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
