# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

backend_dir = Path(SPECPATH)
data_dir = backend_dir / "data"
fonts_dir = data_dir / "fonts"
# The international build ships without law sources. The backup folder is a
# developer archive and must not bloat (or seed) the packaged app.
bundled_data = [
    (str(item), "data")
    for item in data_dir.iterdir()
    if item.name not in {"laws_backup", "fonts"}
]
font_data = [(str(item), "data/fonts") for item in fonts_dir.iterdir()]
app_icon = backend_dir.parent / "Nogic" / "public" / "app-icon.png"

hidden_imports = [
    "pymupdf",
    "reportlab",
    "docx",
    "duckduckgo_search",
    "ollama",
    "openpyxl",
    "session_logger",
]
hidden_imports.extend(collect_submodules("duckduckgo_search"))
pymupdf_datas, pymupdf_binaries, pymupdf_hiddenimports = collect_all(
    "pymupdf"
)
a = Analysis(
    [str(backend_dir / "main.py")],
    pathex=[str(backend_dir)],
    binaries=[*pymupdf_binaries],
    datas=[
        *bundled_data,
        *font_data,
        (str(app_icon), "data"),
        *pymupdf_datas,
    ],
    hiddenimports=[*hidden_imports, *pymupdf_hiddenimports],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="nogic-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
)
