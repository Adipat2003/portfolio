#!/usr/bin/env python3
"""Verify Python seasonal resolution and renderer parity against the content source."""
from __future__ import annotations

import importlib.util
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("portfolio_build", ROOT / "scripts" / "build.py")
assert SPEC and SPEC.loader
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)

content = build.load_content()
seasons = content["seasons"]
season_for = build.build_seasons(seasons)
checks = [
    (date(2026, 1, 15), "winter"),
    (date(2026, 2, 28), "winter"),
    (date(2026, 3, 19), "winter"),
    (date(2026, 3, 20), "spring"),
    (date(2026, 4, 15), "spring"),
    (date(2026, 6, 20), "spring"),
    (date(2026, 6, 21), "summer"),
    (date(2026, 7, 4), "summer"),
    (date(2026, 9, 21), "summer"),
    (date(2026, 9, 22), "fall"),
    (date(2026, 10, 31), "fall"),
    (date(2026, 11, 30), "fall"),
    (date(2026, 12, 20), "fall"),
    (date(2026, 12, 21), "winter"),
]
for day, expected in checks:
    actual = season_for(day)
    assert actual == expected, f"{day}: expected {expected}, got {actual}"

for season, palette in seasons["palettes"].items():
    markup = build.render_index(content, season=season)
    assert f'data-season="{season}"' in markup, f"{season}: missing data-season"
    for variable, color in (
        ("--accent", palette["accent"]),
        ("--accent-soft", palette["accent_soft"]),
        ("--atlas-sky-1", palette["sky"][0]),
        ("--atlas-sky-2", palette["sky"][1]),
        ("--atlas-sky-3", palette["sky"][2]),
        ("--atlas-lights", palette["lights"]),
    ):
        assert f"{variable}:{color}" in markup, f"{season}: missing {variable} palette"

    detail = build.render_project_page(content["projects"]["projects"][0], content["site"], seasons, season=season)
    assert f'data-season="{season}"' in detail, f"{season}: detail page missing data-season"
    for variable, color in (
        ("--accent", palette["accent"]),
        ("--accent-soft", palette["accent_soft"]),
        ("--atlas-sky-1", palette["sky"][0]),
        ("--atlas-sky-2", palette["sky"][1]),
        ("--atlas-sky-3", palette["sky"][2]),
        ("--atlas-lights", palette["lights"]),
    ):
        assert f"{variable}:{color}" in detail, f"{season}: detail page missing {variable} palette"

svg = build.render_atlas_svg(content["atlas"], content["projects"])
assert "var(--atlas-sky-1" in svg and "var(--atlas-lights" in svg
print(f"python season-check: PASS ({len(checks)} dates, {len(seasons['palettes'])} palettes)")
