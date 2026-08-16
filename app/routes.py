"""
API route definitions.

Endpoints
---------
GET  /health                      → simple liveness / readiness probe
GET  /model-info                  → metadata about the loaded model
POST /predict                     → run inference on an uploaded chest X-ray image, generate class-specific clinical insights, & save to DB
GET  /api/scans/patient           → fetch patient prediction scan history from DB
GET  /api/doctors/patients        → fetch doctor's assigned patients & scans from DB
GET  /api/doctors/capacity        → list doctors and current assigned patient counts (max 15)
POST /api/patients/assign-doctor  → auto-assign patient to doctor with least patients (<15 capacity)
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.config import ALLOWED_CONTENT_TYPES, MODEL_INFO
from app.prediction import PredictionResult, predict
from app.insights import generate_clinical_insights
from app.database import (
    get_doctor_patient_counts,
    auto_assign_doctor_for_patient,
    save_scan_record,
    get_patient_scans,
    get_doctor_assigned_patients,
    get_all_doctors,
    get_all_patients,
    get_all_scans,
    update_doctor_status,
    reassign_patient_doctor,
    get_system_stats,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Response schemas ─────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = Field(default="healthy", examples=["healthy"])
    model_loaded: bool = Field(default=True, examples=[True])


class ModelInfoResponse(BaseModel):
    model_name: str
    framework: str
    input_shape: list[int]
    num_classes: int
    classes: list[str]
    preprocessing: str
    training_accuracy: float
    test_accuracy: float
    architecture_summary: list[str]
    total_parameters: int


class PredictResponse(BaseModel):
    predicted_class: str
    confidence: float
    probabilities: Dict[str, float]
    is_xray: bool
    xray_confidence: float
    scan_id: Optional[str] = None
    risk_level: Optional[str] = None
    needs_human_review: Optional[bool] = None
    symptoms: Optional[List[str]] = None
    clinical_notes: Optional[str] = None
    clinical_insights_structured: Optional[dict] = None
    gradcam_image: Optional[str] = None


class DoctorCapacity(BaseModel):
    id: str
    full_name: str
    email: str
    specialization: str
    assigned_patients: int
    max_patients: int
    available_slots: int
    is_full: bool


class AssignDoctorResponse(BaseModel):
    assigned: bool
    doctor: Optional[dict]
    message: str


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    tags=["System"],
)
async def health_check() -> HealthResponse:
    from app.model_loader import _model
    return HealthResponse(
        status="healthy",
        model_loaded=_model is not None,
    )


@router.get(
    "/model-info",
    response_model=ModelInfoResponse,
    summary="Model information",
    tags=["System"],
)
async def model_info() -> ModelInfoResponse:
    return ModelInfoResponse(**MODEL_INFO)


@router.get(
    "/api/doctors/capacity",
    response_model=List[DoctorCapacity],
    summary="Doctor patient capacity list",
    tags=["Doctor Management"],
)
async def doctor_capacity() -> List[DoctorCapacity]:
    return get_doctor_patient_counts()


@router.get(
    "/api/doctors/patients",
    summary="Fetch doctor assigned patients and scans from DB",
    tags=["Doctor Management"],
)
async def doctor_patients(doctor_id: str) -> List[dict]:
    return get_doctor_assigned_patients(doctor_id)


@router.get(
    "/api/scans/patient",
    summary="Fetch patient scan prediction history from DB",
    tags=["Patient Scans"],
)
async def patient_scans(patient_id: str) -> List[dict]:
    return get_patient_scans(patient_id)


@router.post(
    "/api/patients/assign-doctor",
    response_model=AssignDoctorResponse,
    summary="Auto-assign patient to doctor",
    tags=["Doctor Management"],
)
async def assign_doctor(patient_id: str) -> AssignDoctorResponse:
    doc = auto_assign_doctor_for_patient(patient_id)
    if doc:
        return AssignDoctorResponse(
            assigned=True,
            doctor=doc,
            message=f"Successfully assigned to Dr. {doc['full_name']}."
        )
    return AssignDoctorResponse(
        assigned=False,
        doctor=None,
        message="No doctors available (All doctors reached 15 patient capacity)."
    )


@router.post(
    "/predict",
    response_model=PredictResponse,
    summary="Predict lung disease & save scan to DB",
    tags=["Prediction"],
    responses={
        400: {"description": "Invalid image or unsupported file type."},
        422: {"description": "Image did not pass X-ray verification."},
    },
)
async def predict_disease(
    file: UploadFile = File(
        ...,
        description="Chest X-ray image file (JPEG, PNG, BMP, TIFF, or WebP).",
    ),
    patient_id: Optional[str] = Form(None),
    doctor_id: Optional[str] = Form(None),
    symptoms: Optional[str] = Form(None),  # JSON array or comma-separated list
) -> PredictResponse:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{content_type}'.",
        )

    try:
        raw_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read the uploaded file.",
        ) from exc

    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        result: PredictionResult = predict(raw_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred during prediction.",
        ) from exc

    if not result.is_xray:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.xray_details or "The uploaded image does not appear to be a chest X-ray.",
        )

    # Parse symptoms
    parsed_symptoms = []
    if symptoms:
        try:
            parsed_symptoms = json.loads(symptoms)
        except Exception:
            parsed_symptoms = [s.strip() for s in symptoms.split(',') if s.strip()]

    # Calculate risk level & human review flag
    is_normal = result.predicted_class == "Normal"
    risk_level = "LOW" if is_normal else ("HIGH" if result.confidence >= 0.70 else "MEDIUM")
    
    # Sort top 3 predictions
    sorted_probs = sorted(result.probabilities.items(), key=lambda x: -x[1])
    top3 = [{"class": k, "confidence": round(v, 4)} for k, v in sorted_probs[:3]]
    top1_conf = sorted_probs[0][1]
    top2_conf = sorted_probs[1][1] if len(sorted_probs) > 1 else 0.0
    needs_review = (top1_conf < 0.60) or ((top1_conf - top2_conf) < 0.10)

    # Generate Class-Specific Clinical Insights
    insights_data = generate_clinical_insights(
        predicted_class=result.predicted_class,
        confidence=result.confidence,
        top3=top3,
        symptoms=parsed_symptoms,
    )
    clinical_notes = insights_data["full_narrative"]

    # Save to scans database table if patient_id is present
    scan_id = None
    if patient_id:
        image_b64_uri = f"data:image/jpeg;base64,{base64.b64encode(raw_bytes).decode('utf-8')}"
        scan_rec = save_scan_record(
            patient_id=patient_id,
            predicted_class=result.predicted_class,
            confidence=result.confidence,
            top3_predictions=top3,
            risk_level=risk_level,
            needs_human_review=needs_review,
            image_url=image_b64_uri,
            gradcam_image=result.gradcam_image,
            doctor_id=doctor_id,
            symptoms=parsed_symptoms,
            clinical_notes=clinical_notes,
        )
        scan_id = scan_rec.get("id")

    return PredictResponse(
        predicted_class=result.predicted_class,
        confidence=result.confidence,
        probabilities=result.probabilities,
        is_xray=result.is_xray,
        xray_confidence=result.xray_confidence,
        scan_id=scan_id,
        risk_level=risk_level,
        needs_human_review=needs_review,
        symptoms=parsed_symptoms,
        clinical_notes=clinical_notes,
        clinical_insights_structured=insights_data,
        gradcam_image=result.gradcam_image,
    )


# ── Admin API Endpoints ───────────────────────────────────────────────────

class UpdateDoctorStatusRequest(BaseModel):
    is_active: Optional[bool] = None
    max_capacity: Optional[int] = None


class ReassignPatientRequest(BaseModel):
    new_doctor_id: str


@router.get("/api/admin/stats", summary="Fetch system-wide statistics for Admin")
async def fetch_admin_stats():
    """Returns overview metrics: total users, doctors, patients, scans, risk distribution, capacity utilization."""
    return get_system_stats()


@router.get("/api/admin/doctors", summary="Fetch all doctors for Admin")
async def fetch_admin_doctors():
    """Returns complete list of doctors with active status, assigned patients count, and max capacity."""
    return get_all_doctors()


@router.put("/api/admin/doctors/{doctor_id}", summary="Update doctor status / capacity limit")
async def modify_doctor_status(doctor_id: str, req: UpdateDoctorStatusRequest):
    """Updates a doctor's active status (activate/deactivate) or capacity limit."""
    res = update_doctor_status(doctor_id, is_active=req.is_active, max_capacity=req.max_capacity)
    return {"status": "success", "doctor": res}


@router.get("/api/admin/patients", summary="Fetch all patients for Admin")
async def fetch_admin_patients():
    """Returns list of all patients with assigned doctor information."""
    return get_all_patients()


@router.put("/api/admin/patients/{patient_id}/reassign", summary="Reassign patient to a different doctor")
async def reassign_patient(patient_id: str, req: ReassignPatientRequest):
    """Reassigns a patient to a specified doctor."""
    res = reassign_patient_doctor(patient_id, req.new_doctor_id)
    return {"status": "success", "patient": res}


@router.get("/api/admin/scans", summary="Fetch all platform scans for Admin audit")
async def fetch_admin_scans():
    """Returns all scans across the platform with decrypted clinical notes."""
    return get_all_scans()

