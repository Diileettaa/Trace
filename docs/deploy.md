# Deploy (Google Cloud Run)

One container: web app at `/`, API at `/api`, engine + YOLO on CPU. Dataset is baked into the image from `./data`
(git-ignored; copy of `junction-dataset-preview`, ~700 MB).

```powershell
gcloud run deploy trace --source . --region europe-north1 `
  --memory 4Gi --cpu 2 --min-instances 1 --max-instances 1 --timeout 300 `
  --allow-unauthenticated `
  --set-env-vars GEMINI_MODEL=gemini-3.8-flash,GEMINI_API_KEY=<key>,NVIDIA_API_KEY=<key>,NEMOTRON_MODEL=<model id>
```

- `--max-instances 1`: Room Board, media, files and the shared scene are JSON files in `CACHE_DIR`; one instance keeps
  everyone on the same state. They reset when the instance restarts (demo data: `python scripts/seed_demo.py`).
- `--min-instances 1`: no cold start during judging (YOLO weights are loaded at build time as a check).
- Build happens in Cloud Build (~10 min, uploads ~750 MB).
- Local check without Docker: `cd web && npm run build`, then `uvicorn agent.serve:app --port 8080` → http://localhost:8080
