# Trace: web app + API + engine (CPU). Build context must contain ./data (the dataset, see docs/deploy.md).
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/data JUNCTION_DATA=/data CACHE_DIR=/tmp/trace-cache JUNCTION_CACHE=/tmp/trace-cache/engine \
    YOLO_CONFIG_DIR=/tmp/ultralytics PORT=8080
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# CPU-only torch first, so ultralytics does not pull the 2 GB CUDA build
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY agent/requirements.txt agent/requirements.txt
RUN pip install -r agent/requirements.txt
COPY data/ /data/
COPY agent/ agent/
COPY engine/ engine/
COPY models/ models/
COPY mock/ mock/
COPY ask.py ./
COPY --from=web /web/dist web/dist
# warm-up: load the YOLO weights once at build time so the first request is not slow
RUN python -c "from engine import detector; assert detector.available(), 'YOLO detector not available'"
EXPOSE 8080
CMD ["sh", "-c", "uvicorn agent.serve:app --host 0.0.0.0 --port ${PORT}"]
