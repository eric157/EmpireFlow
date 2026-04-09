from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
import json
import logging
import os
from pathlib import Path

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("uvicorn.error")

analytics_cache = None
data_ready = False
data_error = None
base_dir = Path(__file__).resolve().parent
geojson_path = base_dir / "empireflow_geojson.json.gz"
analytics_path = base_dir / "analytics.json"

@app.on_event("startup")
def load_data():
    global data_ready, data_error
    try:
        data_ready = False
        data_error = None

        if not geojson_path.exists() or not analytics_path.exists():
            raise FileNotFoundError("Precomputed data files are missing")

        data_ready = True
        logger.info("Ready. Backend initialized with on-demand data loading.")

    except Exception as e:
        data_error = str(e)
        logger.error(f"Startup failed: {e}")
        import traceback; traceback.print_exc()

@app.get("/api/health")
def health():
    ready = data_ready and geojson_path.exists() and analytics_path.exists()
    return {
        "status": "ok" if ready else "loading",
        "ready": ready,
        "error": data_error,
    }

@app.get("/api/analytics")
def get_analytics():
    global analytics_cache
    if not analytics_cache:
        if not analytics_path.exists():
            raise HTTPException(status_code=503, detail="Analytics not ready")
        analytics_cache = json.loads(analytics_path.read_text(encoding="utf-8"))["timeline"]
    return {"timeline": analytics_cache}

@app.get("/api/geojson")
def get_geojson():
    """Streams the pre-compressed GeoJSON directly from disk."""
    if not geojson_path.exists():
        raise HTTPException(status_code=503, detail="GeoJSON not ready")
    def iter_file():
        with geojson_path.open("rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(
        iter_file(),
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Cache-Control": "public, max-age=300"}
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "5000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
