from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import geopandas as gpd
import json
import gzip
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

geo_data = None
analytics_cache = None
geojson_bytes_gz = None   # Pre-compressed GZip bytes — served instantly

@app.on_event("startup")
def load_data():
    global geo_data, analytics_cache, geojson_bytes_gz
    try:
        logger.info("Loading GLOBE GeoJSON data (LITE version)...")
        base_dir = Path(__file__).resolve().parent
        zip_path = base_dir / 'empireflow.geojson.zip'
        lite_path = base_dir / 'empireflow_lite.geojson'
        heavy_path = base_dir / 'empireflow_polities_only.geojson'

        if zip_path.exists():
            logger.info("Loading zipped GeoJSON archive...")
            geo_data = gpd.read_file(f"zip://{zip_path}")
        elif lite_path.exists():
            logger.warning("ZIP archive not found — falling back to raw lite file.")
            geo_data = gpd.read_file(lite_path)
        elif heavy_path.exists():
            logger.warning("ZIP archive and lite file not found — falling back to raw file (slow!).")
            geo_data = gpd.read_file(heavy_path)
        else:
            raise FileNotFoundError("No EmpireFlow data file found")

        if str(geo_data.crs) != "EPSG:4326":
            geo_data = geo_data.to_crs("EPSG:4326")

        if heavy_path.exists() and not zip_path.exists():
            logger.info("Simplifying geometry (not lite file)...")
            geo_data['geometry'] = geo_data['geometry'].simplify(0.02)

        logger.info(f"Loaded {len(geo_data)} polities. Serializing & compressing...")

        # Serialize once to JSON string, then GZIP it — served as raw bytes every request
        raw_json = geo_data.to_json()
        geojson_bytes_gz = gzip.compress(raw_json.encode("utf-8"), compresslevel=6)

        size_mb = len(geojson_bytes_gz) / (1024 * 1024)
        logger.info(f"GeoJSON pre-compressed: {size_mb:.2f} MB (GZipped)")

        # Precompute analytics
        logger.info("Precomputing chronological analytics...")
        min_year = int(geo_data['FromYear'].min())
        max_year = int(geo_data['ToYear'].max())

        analytics = []
        for yr in range(min_year, max_year + 50, 50):
            active = geo_data[(geo_data['FromYear'] <= yr) & (geo_data['ToYear'] >= yr)]
            analytics.append({
                "year": yr,
                "count": int(len(active)),
                "total_area": float(active['Area'].sum()) if not active.empty else 0
            })
        analytics_cache = analytics
        logger.info("Ready. Backend fully initialized.")

    except Exception as e:
        logger.error(f"Startup failed: {e}")
        import traceback; traceback.print_exc()

@app.get("/api/health")
def health():
    ready = geojson_bytes_gz is not None and analytics_cache is not None
    return {"status": "ok" if ready else "loading", "ready": ready}

@app.get("/api/analytics")
def get_analytics():
    if not analytics_cache:
        raise HTTPException(status_code=503, detail="Analytics not ready")
    return {"timeline": analytics_cache}

@app.get("/api/geojson")
def get_geojson():
    """Serves pre-serialized, GZip-compressed GeoJSON — ultra fast."""
    if geojson_bytes_gz is None:
        raise HTTPException(status_code=503, detail="GeoJSON not ready")
    return Response(
        content=geojson_bytes_gz,
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Cache-Control": "public, max-age=300"}
    )

@app.get("/api/geojson/year/{year}")
def get_geojson_by_year(year: int):
    """Year-filtered endpoint — returns only polities active at the given year."""
    if geo_data is None:
        raise HTTPException(status_code=503, detail="Data not ready")
    filtered = geo_data[(geo_data['FromYear'] <= year) & (geo_data['ToYear'] >= year)]
    raw = filtered.to_json()
    compressed = gzip.compress(raw.encode("utf-8"), compresslevel=6)
    return Response(
        content=compressed,
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Cache-Control": "public, max-age=60"}
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "5000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
