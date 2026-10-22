#!/usr/bin/env python3
"""
Depth map estimation using Depth Anything V2 (ONNX).

Usage:
    python scripts/portrait_depth.py \
        --input source/portrait.png \
        --alpha src/assets/portrait-cutout.png \
        --output src/assets/portrait-depth.webp

Outputs an 8-bit normalized greyscale map masked by the subject silhouette.
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

REPO = "onnx-community/depth-anything-v2-small"
ONNX_FILE = "onnx/model.onnx"
HF_BASE = "https://huggingface.co/{repo}/resolve/main/{path}"

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Estimate a depth map for a portrait.")
    ap.add_argument("--input", default="source/portrait.png", type=Path)
    ap.add_argument("--alpha", default="src/assets/portrait-cutout.png", type=Path)
    ap.add_argument("--output", default="src/assets/portrait-depth.webp", type=Path)
    ap.add_argument("--model-dir", default="models", type=Path)
    ap.add_argument("--size", type=int, default=518, help="target resolution of the short side")
    ap.add_argument("--quantize", action="store_true", help="use the int8 export instead of fp32")
    return ap.parse_args()


def download_model(repo: str, path: str, model_dir: Path, quantize: bool) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)
    name = f"{repo.split('/')[-1]}.onnx"
    if quantize:
        name = f"{repo.split('/')[-1]}_int8.onnx"
    target = model_dir / name
    if target.exists():
        print(f"      model cached: {target}")
        return target
    remote = path
    if quantize:
        remote = path.replace("model.onnx", "model_int8.onnx")
    url = HF_BASE.format(repo=repo, path=remote)
    print(f"      downloading {url}")
    tmp = target.with_suffix(".part")
    with urllib.request.urlopen(url) as resp, open(tmp, "wb") as fh:
        while chunk := resp.read(1 << 20):
            fh.write(chunk)
    tmp.rename(target)
    print(f"      -> {target} ({target.stat().st_size / 1e6:.1f} MB)")
    return target


def round_to_14(v: int) -> int:
    return max(14, int(round(v / 14.0)) * 14)


def predict_depth(session, image: Image.Image, size: int) -> np.ndarray:
    w, h = image.size
    scale = size / min(w, h)
    new_w = round_to_14(int(w * scale))
    new_h = round_to_14(int(h * scale))

    resized = image.convert("RGB").resize((new_w, new_h), Image.BICUBIC)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    tensor = np.transpose(arr, (2, 0, 1))[None, ...].astype(np.float32)

    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: tensor})[0]

    # output shape: (1, H, W) or (1, 1, H, W) — relative inverse depth
    depth = np.squeeze(output)
    depth = np.asarray(depth, dtype=np.float32)
    depth = Image.fromarray(depth).resize((w, h), Image.BICUBIC)
    return np.asarray(depth, dtype=np.float32)


def main() -> int:
    args = parse_args()
    import onnxruntime as ort

    if not args.input.exists():
        print(f"error: input not found: {args.input}", file=sys.stderr)
        return 1

    print(f"[1/4] fetching Depth Anything V2 weights ({REPO})...")
    model_path = download_model(REPO, ONNX_FILE, args.model_dir, args.quantize)

    print("[2/4] running inference...")
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    with Image.open(args.input) as img:
        depth = predict_depth(session, img, args.size)

    print("[3/4] normalising + masking with the cutout alpha...")
    lo, hi = np.percentile(depth, 1.0), np.percentile(depth, 99.0)
    depth = np.clip((depth - lo) / max(hi - lo, 1e-6), 0.0, 1.0)

    if args.alpha.exists():
        with Image.open(args.alpha) as a:
            alpha = np.asarray(a.convert("RGBA").getchannel("A"), dtype=np.float32) / 255.0
            if alpha.shape != depth.shape:
                alpha = np.asarray(
                    Image.fromarray((alpha * 255).astype(np.uint8)).resize(
                        (depth.shape[1], depth.shape[0]), Image.BILINEAR
                    ),
                    dtype=np.float32,
                ) / 255.0
        # Only look at statistics inside the subject.
        mask = alpha > 0.5
        if mask.any():
            lo, hi = np.percentile(depth[mask], 2.0), np.percentile(depth[mask], 98.0)
            depth = np.clip((depth - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
        # Pull the silhouette back onto the base plane so the cut-out edge never floats.
        edge = np.clip((alpha - 0.0) / 0.22, 0.0, 1.0)
        edge = edge * edge * (3.0 - 2.0 * edge)
        depth = depth * edge
    else:
        print(f"      warning: alpha matte not found at {args.alpha}, output is unmasked")

    out8 = Image.fromarray((depth * 255.0).astype(np.uint8), mode="L")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    out8.save(args.output, format="WEBP", lossless=True, quality=100, method=6)
    print(f"      -> {args.output} ({args.output.stat().st_size / 1024:.0f} KB)")

    png_fallback = args.output.with_suffix(".png")
    out8.save(png_fallback, format="PNG", optimize=True)
    print(f"      -> {png_fallback} ({png_fallback.stat().st_size / 1024:.0f} KB)")

    # Quick visual sanity check.
    preview = args.output.with_name("portrait-depth-preview.png")
    out8.save(preview)
    print(f"[4/4] done. preview: {preview}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
