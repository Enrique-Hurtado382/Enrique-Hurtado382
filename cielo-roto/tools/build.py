#!/usr/bin/env python3
"""Genera los packs de Cielo Roto (texturas, modelos, animaciones, sonidos) y el .mcaddon.

Uso:  python3 tools/build.py [--skip-sounds]
Requiere: Python 3.10+, numpy, Pillow y ffmpeg (para los .ogg).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import packs  # noqa: E402

if __name__ == "__main__":
    out = packs.build_all(skip_sounds="--skip-sounds" in sys.argv)
    print("Listo:", out, f"({os.path.getsize(out) / 1e6:.1f} MB)")
