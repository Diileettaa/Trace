# Deploy (Google Cloud Run)

## Current setup (since Nov 2026): automatic, no local machine needed

- Live: https://trace-1078169683443.europe-north1.run.app (Google Cloud project `junction26-trace`, Cloud Run service
  `trace`, region `europe-north1`).
- Every push to `main` runs a Cloud Build trigger with [`cloudbuild.yaml`](../cloudbuild.yaml): it copies the dataset
  from the private bucket `gs://junction26-trace-diletta-data/data` into `./data`, builds the `Dockerfile`, and deploys.
- The dataset is not in git (licences, size). The bucket is its cloud copy; the originals are the Stoa Junction 2026
  dataset downloads.
- Environment variables (Gemini key, `SEED_DEMO=1`) are stored on the Cloud Run service and kept by each deploy.
  To change them: Cloud Run console → `trace` → Edit & deploy new revision → Variables, or
  `gcloud run services update trace --region europe-north1 --update-env-vars KEY=VALUE`.
- Settings: `--min-instances 0` (no cost when idle, ~30 s cold start), `--max-instances 1` (shared state below).
- Manual rebuild without a push: Cloud Build → Triggers → Run, or in Cloud Shell
  `git clone https://github.com/Diileettaa/Trace && cd Trace && gcloud builds submit --config cloudbuild.yaml`.
- Take the site down: `gcloud run services delete trace --region europe-north1`, then delete the images in
  Artifact Registry `cloud-run-source-deploy` and, if wanted, the bucket.

## Original manual deploy (used during the event)

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
