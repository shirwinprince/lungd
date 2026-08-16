"""
app/database.py — Database Layer for Profiles, Scans, Patient Symptoms, and Doctor Auto-Assignment
"""

from __future__ import annotations

import os
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Safe import for supabase python package
try:
    # pyrefly: ignore [missing-import]
    from supabase import create_client, Client
    HAS_SUPABASE_PKG = True
except ImportError:
    create_client = None
    Client = None
    HAS_SUPABASE_PKG = False
    logger.info("supabase python package not installed. Running database helper in dual dev/fallback mode.")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

MAX_PATIENTS_PER_DOCTOR = 15

# Initialize Supabase client if configured and package installed
supabase: Optional[Any] = None
if HAS_SUPABASE_PKG and SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY):
    key = SUPABASE_SERVICE_ROLE_KEY if SUPABASE_SERVICE_ROLE_KEY else SUPABASE_ANON_KEY
    try:
        supabase = create_client(SUPABASE_URL, key)
        logger.info("Successfully connected to Supabase database.")
    except Exception as exc:
        logger.warning("Could not initialize Supabase client: %s", exc)

from app.encryption import encrypt_clinical_notes, decrypt_clinical_notes

# In-memory mock database store for seamless offline/development fallback
_MOCK_PROFILES: Dict[str, dict] = {
    "admin-001": {
        "id": "admin-001",
        "email": "sujithamahesh25@gmail.com",
        "full_name": "SUJITHA",
        "role": "admin",
        "specialization": "System Administrator",
        "created_at": "2026-07-01T00:00:00.000Z",
    },
    "doc-101": {
        "id": "doc-101",
        "email": "dr.priya@hospital.org",
        "full_name": "Dr. Priya Sharma",
        "role": "doctor",
        "specialization": "Senior Pulmonologist",
        "is_active": True,
        "max_capacity": 15,
        "created_at": "2026-07-01T00:00:00.000Z",
    },
    "doc-102": {
        "id": "doc-102",
        "email": "dr.arjun@hospital.org",
        "full_name": "Dr. Arjun Mehta",
        "role": "doctor",
        "specialization": "Pulmonology & Respiratory Medicine",
        "is_active": True,
        "max_capacity": 15,
        "created_at": "2026-07-02T00:00:00.000Z",
    },
    "pat-201": {
        "id": "pat-201",
        "email": "aarav.sharma@patient.org",
        "full_name": "Aarav Sharma",
        "role": "patient",
        "doctor_id": "doc-101",
        "created_at": "2026-07-10T00:00:00.000Z",
    },
    "pat-202": {
        "id": "pat-202",
        "email": "kabir.reddy@patient.org",
        "full_name": "Kabir Reddy",
        "role": "patient",
        "doctor_id": "doc-101",
        "created_at": "2026-07-15T00:00:00.000Z",
    },
    "pat-203": {
        "id": "pat-203",
        "email": "diya.patel@patient.org",
        "full_name": "Diya Patel",
        "role": "patient",
        "doctor_id": "doc-102",
        "created_at": "2026-07-20T00:00:00.000Z",
    }
}

_MOCK_SCANS: List[dict] = []


# ── 1. Auto-Assignment of Patients to Doctors ──────────────────────────────
def auto_assign_doctor_for_patient(patient_id: str) -> Optional[dict]:
    if supabase:
        try:
            doc_res = supabase.table("profiles").select("id, full_name, email, specialization").eq("role", "doctor").execute()
            doctors = doc_res.data or []

            if not doctors:
                return None

            best_doctor = None
            min_count = MAX_PATIENTS_PER_DOCTOR + 1

            for doc in doctors:
                p_res = supabase.table("profiles").select("id", count="exact").eq("doctor_id", doc["id"]).eq("role", "patient").execute()
                count = p_res.count if p_res.count is not None else len(p_res.data or [])

                if count < MAX_PATIENTS_PER_DOCTOR and count < min_count:
                    min_count = count
                    best_doctor = doc

            if best_doctor:
                supabase.table("profiles").update({"doctor_id": best_doctor["id"]}).eq("id", patient_id).execute()
                return best_doctor
            else:
                return None
        except Exception as exc:
            logger.error("Error during Supabase auto-assignment: %s", exc)

    # Dev/Mock fallback
    doctors = [p for p in _MOCK_PROFILES.values() if p.get("role") == "doctor"]
    if not doctors:
        return None

    best_doc = None
    min_c = MAX_PATIENTS_PER_DOCTOR + 1

    for d in doctors:
        c = len([p for p in _MOCK_PROFILES.values() if p.get("doctor_id") == d["id"]])
        if c < MAX_PATIENTS_PER_DOCTOR and c < min_c:
            min_c = c
            best_doc = d

    if best_doc and patient_id in _MOCK_PROFILES:
        _MOCK_PROFILES[patient_id]["doctor_id"] = best_doc["id"]
        return best_doc

    return None


# ── 2. Save Prediction Scan to `scans` Table ────────────────────────────────
def save_scan_record(
    patient_id: str,
    predicted_class: str,
    confidence: float,
    top3_predictions: List[dict],
    risk_level: str,
    needs_human_review: bool,
    image_url: Optional[str] = None,
    gradcam_image: Optional[str] = None,
    doctor_id: Optional[str] = None,
    symptoms: Optional[List[str]] = None,
    clinical_notes: Optional[str] = None,
) -> dict:
    if not doctor_id:
        doc = get_patient_doctor(patient_id)
        if doc:
            doctor_id = doc.get("id")

    scan_payload = {
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "image_url": image_url,
        "gradcam_image": gradcam_image,
        "predicted_class": predicted_class,
        "confidence": round(float(confidence), 4),
        "top3_predictions": top3_predictions,
        "symptoms": symptoms or [],
        "risk_level": risk_level,
        "needs_human_review": needs_human_review,
        "clinical_notes": encrypt_clinical_notes(clinical_notes or ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if supabase:
        try:
            res = supabase.table("scans").insert(scan_payload).execute()
            if res.data:
                logger.info("Saved scan with symptoms to Supabase scans table: %s", res.data[0].get("id"))
                return res.data[0]
        except Exception as exc:
            logger.error("Error saving scan to Supabase: %s", exc)
            if "gradcam_image" in scan_payload:
                try:
                    fallback_payload = {k: v for k, v in scan_payload.items() if k != "gradcam_image"}
                    res_fb = supabase.table("scans").insert(fallback_payload).execute()
                    if res_fb.data:
                        return res_fb.data[0]
                except Exception as fb_exc:
                    logger.error("Fallback scan save error: %s", fb_exc)

    # Dev/Mock fallback
    scan_id = f"scan-{len(_MOCK_SCANS) + 1:03d}"
    scan_payload["id"] = scan_id
    _MOCK_SCANS.insert(0, scan_payload)
    return scan_payload


# ── 3. Patient Scans Query ──────────────────────────────────────────────────
def get_patient_scans(patient_id: str) -> List[dict]:
    if supabase:
        try:
            res = supabase.table("scans").select("*").eq("patient_id", patient_id).order("created_at", desc=True).execute()
            return res.data or []
        except Exception as exc:
            logger.error("Error fetching patient scans from Supabase: %s", exc)

    return [s for s in _MOCK_SCANS if s.get("patient_id") == patient_id]


# ── 4. Doctor Assigned Patients & Scans Query ──────────────────────────────
def get_doctor_assigned_patients(doctor_id: str) -> List[dict]:
    if supabase:
        try:
            res = supabase.table("profiles").select("*").eq("doctor_id", doctor_id).eq("role", "patient").execute()
            patients = res.data or []
            for p in patients:
                scan_res = supabase.table("scans").select("*").eq("patient_id", p["id"]).order("created_at", desc=True).execute()
                p["scans"] = scan_res.data or []
                p["latest_scan"] = scan_res.data[0] if scan_res.data else None
            return patients
        except Exception as exc:
            logger.error("Error fetching doctor assigned patients from Supabase: %s", exc)

    patients = [p for p in _MOCK_PROFILES.values() if p.get("doctor_id") == doctor_id]
    for p in patients:
        scans = [s for s in _MOCK_SCANS if s.get("patient_id") == p["id"]]
        p["scans"] = scans
        p["latest_scan"] = scans[0] if scans else None
    return patients


def get_patient_doctor(patient_id: str) -> Optional[dict]:
    if supabase:
        try:
            pat_res = supabase.table("profiles").select("doctor_id").eq("id", patient_id).single().execute()
            if pat_res.data and pat_res.data.get("doctor_id"):
                doc_res = supabase.table("profiles").select("*").eq("id", pat_res.data["doctor_id"]).single().execute()
                return doc_res.data
        except Exception as exc:
            logger.error("Error fetching patient doctor from Supabase: %s", exc)

    pat = _MOCK_PROFILES.get(patient_id)
    if pat and pat.get("doctor_id"):
        return _MOCK_PROFILES.get(pat["doctor_id"])
    return None


# ── 5. Doctor Capacity Calculation ─────────────────────────────────────────
def get_doctor_patient_counts() -> List[dict]:
    if supabase:
        try:
            doc_res = supabase.table("profiles").select("id, full_name, email, specialization").eq("role", "doctor").execute()
            doctors = doc_res.data or []
            output = []
            for doc in doctors:
                p_res = supabase.table("profiles").select("id", count="exact").eq("doctor_id", doc["id"]).eq("role", "patient").execute()
                count = p_res.count if p_res.count is not None else len(p_res.data or [])
                output.append({
                    "id": doc["id"],
                    "full_name": doc["full_name"],
                    "email": doc["email"],
                    "specialization": doc.get("specialization", "Pulmonology"),
                    "assigned_patients": count,
                    "max_patients": MAX_PATIENTS_PER_DOCTOR,
                    "available_slots": max(0, MAX_PATIENTS_PER_DOCTOR - count),
                    "is_full": count >= MAX_PATIENTS_PER_DOCTOR,
                })
            return output
        except Exception as exc:
            logger.error("Error fetching doctor capacity from Supabase: %s", exc)

    output = []
    doctors = [p for p in _MOCK_PROFILES.values() if p.get("role") == "doctor"]
    for doc in doctors:
        count = len([p for p in _MOCK_PROFILES.values() if p.get("doctor_id") == doc["id"]])
        max_cap = doc.get("max_capacity", MAX_PATIENTS_PER_DOCTOR)
        output.append({
            "id": doc["id"],
            "full_name": doc["full_name"],
            "email": doc["email"],
            "specialization": doc.get("specialization", "Pulmonology"),
            "is_active": doc.get("is_active", True),
            "assigned_patients": count,
            "max_patients": max_cap,
            "available_slots": max(0, max_cap - count),
            "is_full": count >= max_cap,
        })
    return output


# ── 6. Admin Data Management Functions ────────────────────────────────────
def get_all_doctors() -> List[dict]:
    if supabase:
        try:
            res = supabase.table("profiles").select("*").eq("role", "doctor").order("created_at", desc=True).execute()
            doctors = res.data or []
            if doctors:
                for d in doctors:
                    p_res = supabase.table("profiles").select("id", count="exact").eq("doctor_id", d["id"]).eq("role", "patient").execute()
                    d["assigned_patients"] = p_res.count if p_res.count is not None else len(p_res.data or [])
                    d["is_active"] = d.get("is_active", True)
                    d["max_capacity"] = d.get("max_capacity", MAX_PATIENTS_PER_DOCTOR)
                return doctors
        except Exception as exc:
            logger.error("Error fetching all doctors from Supabase: %s", exc)

    doctors = [p for p in _MOCK_PROFILES.values() if p.get("role") == "doctor"]
    for d in doctors:
        d["assigned_patients"] = len([p for p in _MOCK_PROFILES.values() if p.get("doctor_id") == d["id"]])
        d["is_active"] = d.get("is_active", True)
        d["max_capacity"] = d.get("max_capacity", MAX_PATIENTS_PER_DOCTOR)
    return doctors


def get_all_patients() -> List[dict]:
    if supabase:
        try:
            res = supabase.table("profiles").select("*").eq("role", "patient").order("created_at", desc=True).execute()
            patients = res.data or []
            if patients:
                for p in patients:
                    if p.get("doctor_id"):
                        doc_res = supabase.table("profiles").select("full_name, email, specialization").eq("id", p["doctor_id"]).execute()
                        p["doctor_info"] = doc_res.data[0] if doc_res and doc_res.data else None
                return patients
        except Exception as exc:
            logger.error("Error fetching all patients from Supabase: %s", exc)

    patients = [p for p in _MOCK_PROFILES.values() if p.get("role") == "patient"]
    for p in patients:
        if p.get("doctor_id") and p["doctor_id"] in _MOCK_PROFILES:
            d = _MOCK_PROFILES[p["doctor_id"]]
            p["doctor_info"] = {"full_name": d.get("full_name"), "email": d.get("email"), "specialization": d.get("specialization")}
    return patients


def get_all_scans() -> List[dict]:
    if supabase:
        try:
            res = supabase.table("scans").select("*").order("created_at", desc=True).execute()
            scans = res.data or []
            if scans:
                for s in scans:
                    if s.get("clinical_notes"):
                        s["clinical_notes"] = decrypt_clinical_notes(s["clinical_notes"])
                return scans
        except Exception as exc:
            logger.error("Error fetching all scans from Supabase: %s", exc)

    for s in _MOCK_SCANS:
        if s.get("clinical_notes"):
            s["clinical_notes"] = decrypt_clinical_notes(s["clinical_notes"])
    return _MOCK_SCANS


def update_doctor_status(doctor_id: str, is_active: Optional[bool] = None, max_capacity: Optional[int] = None) -> dict:
    update_data = {}
    if is_active is not None:
        update_data["is_active"] = is_active
    if max_capacity is not None:
        update_data["max_capacity"] = max_capacity

    if supabase:
        try:
            res = supabase.table("profiles").update(update_data).eq("id", doctor_id).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.error("Error updating doctor status in Supabase: %s", exc)

    if doctor_id in _MOCK_PROFILES:
        _MOCK_PROFILES[doctor_id].update(update_data)
        return _MOCK_PROFILES[doctor_id]
    return {}


def reassign_patient_doctor(patient_id: str, new_doctor_id: str) -> dict:
    if supabase:
        try:
            res = supabase.table("profiles").update({"doctor_id": new_doctor_id}).eq("id", patient_id).execute()
            if res.data:
                # Also update scan doctor_ids for consistency
                supabase.table("scans").update({"doctor_id": new_doctor_id}).eq("patient_id", patient_id).execute()
                return res.data[0]
        except Exception as exc:
            logger.error("Error reassigning patient in Supabase: %s", exc)

    if patient_id in _MOCK_PROFILES:
        _MOCK_PROFILES[patient_id]["doctor_id"] = new_doctor_id
        for s in _MOCK_SCANS:
            if s.get("patient_id") == patient_id:
                s["doctor_id"] = new_doctor_id
        return _MOCK_PROFILES[patient_id]
    return {}


def get_system_stats() -> dict:
    doctors = get_all_doctors()
    patients = get_all_patients()
    scans = get_all_scans()

    high_risk = len([s for s in scans if s.get("risk_level") == "HIGH"])
    medium_risk = len([s for s in scans if s.get("risk_level") == "MEDIUM"])
    low_risk = len([s for s in scans if s.get("risk_level") == "LOW"])

    total_capacity = sum(d.get("max_capacity", 15) for d in doctors)
    total_assigned = len(patients)

    return {
        "total_users": len(doctors) + len(patients) + 1,  # +1 Admin
        "total_doctors": len(doctors),
        "total_patients": len(patients),
        "total_scans": len(scans),
        "high_risk_scans": high_risk,
        "medium_risk_scans": medium_risk,
        "low_risk_scans": low_risk,
        "total_capacity": total_capacity,
        "total_assigned": total_assigned,
        "capacity_utilization": round((total_assigned / max(1, total_capacity)) * 100, 1),
    }

