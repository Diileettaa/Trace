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

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NEMOTRON_BASE_URL = os.getenv("NEMOTRON_BASE_URL", "https://integrate.api.nvidia.com/v1")
NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "")

DATA_DIR = Path(os.getenv("DATA_DIR", "./data/junction-dataset-preview")).resolve()
CACHE_DIR = Path(os.getenv("CACHE_DIR", "./cache")).resolve()
UPLOAD_PREFIX = "uploads/"  # paths of user-uploaded drawings, stored under CACHE_DIR/uploads
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Agent behaviour
MAX_TOOL_STEPS = int(os.getenv("MAX_TOOL_STEPS", "5"))
TEMPERATURE = 0.0
