"""Settings read from environment variables (and .env if present)."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv is optional
    pass

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
os.environ.setdefault("GEMINI_MODEL", GEMINI_MODEL)  # engine/cubicasa.py reads it for room questions (else gemini-2.5-pro)

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NEMOTRON_BASE_URL = os.getenv("NEMOTRON_BASE_URL", "https://integrate.api.nvidia.com/v1")
NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "")

DATA_DIR = Path(os.getenv("DATA_DIR", "./data/junction-dataset-preview")).resolve()
CACHE_DIR = Path(os.getenv("CACHE_DIR", "./cache")).resolve()
UPLOAD_PREFIX = "uploads/"  # paths of user-uploaded drawings, stored under CACHE_DIR/uploads
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Cost shown in the reasoning panel: USD per 1M tokens for GEMINI_MODEL (thinking billed as output).
# Defaults match web/src/pricing.ts (Gemini 3.8 Flash, checked 2026-11-14); override in .env if the model changes. The engine itself is 0 tokens.
GEMINI_PRICE_IN = float(os.getenv("GEMINI_PRICE_IN", "0.75"))
GEMINI_PRICE_OUT = float(os.getenv("GEMINI_PRICE_OUT", "3.75"))

# Agent behaviour
MAX_TOOL_STEPS = int(os.getenv("MAX_TOOL_STEPS", "5"))
TOKEN_BUDGET = int(os.getenv("TOKEN_BUDGET", "30000"))  # per question; the agent stops and says why above this
TEMPERATURE = 0.0
