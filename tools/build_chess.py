#!/usr/bin/env python3
"""Собирает docs/chess/index.html (страница для GitHub Pages и Play Маркета)
из docs/chess/zoo-chess.html (исходник игры без <html>/<head>)."""
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent / "docs" / "chess"
src = (root / "zoo-chess.html").read_text(encoding="utf-8")
cut = src.index("</style>") + len("</style>")
head = "\n".join(l for l in src[:cut].splitlines() if "claude:viewport" not in l)
page = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f3138">
<meta name="description" content="Шахматы с живыми фигурами: саванна, океан, бактерии, грибы и растения.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
<style>body{{margin:0}}[hidden]{{display:none!important}}:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}</style>
{head}
</head>
<body>
{src[cut:].strip()}
</body>
</html>
"""
(root / "index.html").write_text(page, encoding="utf-8")
print("ok", len(page))
