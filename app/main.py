"""
Application entry-point for the Lung Disease Detection API.

• Configures structured logging.
• Creates the FastAPI application with CORS enabled for all origins.
• Loads the DenseNet121 model once at startup (lifespan event).
• Includes the router that defines all endpoints.
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager

# Load .env file BEFORE any app imports so env vars are available everywhere
from dotenv import load_dotenv
load_dotenv()


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import API_DESCRIPTION, API_TITLE, API_VERSION
from app.model_loader import load_model
from app.routes import router

# ── Logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ── Lifespan (startup / shutdown) ────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: load the model into memory (once).
    Shutdown: (nothing special needed — GC cleans up).
    """
    logger.info("Starting up — loading DenseNet121 model …")
    load_model()
    logger.info("Model ready.  API is accepting requests.")
    yield
    logger.info("Shutting down.")


# ── FastAPI app ──────────────────────────────────────────────────────────
app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # allow all origins (adjust in production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────────────────
app.include_router(router)
