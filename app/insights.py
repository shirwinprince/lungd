"""
app/insights.py — Class-Specific Clinical Insights Engine for LungScan AI
"""

from __future__ import annotations
from typing import Dict, List, Optional


CLASS_INSIGHTS_DB: Dict[str, dict] = {
    "Bacterial Pneumonia": {
        "key_findings": "Focal lobar or segmental consolidation with air bronchograms, dense alveolar opacifications, and potential pleural effusion.",
        "symptom_correlation": "High-grade fever, productive cough with purulent sputum, localized pleuritic chest pain, and dyspnea.",
        "recommended_next_steps": [
            "Sputum Gram stain and bacterial culture with antibiotic sensitivity testing.",
            "Complete Blood Count (CBC) with differential to evaluate leukocytosis.",
            "Empiric targeted antimicrobial therapy under attending physician guidance.",
            "Follow-up chest radiography in 4-6 weeks to document resolution."
        ]
    },
    "Viral Pneumonia": {
        "key_findings": "Bilateral diffuse interstitial infiltrates, reticulonodular opacities, and peribronchial thickening without dense lobar consolidation.",
        "symptom_correlation": "Non-productive dry cough, low-to-moderate fever, generalized fatigue, myalgia, and mild shortness of breath.",
        "recommended_next_steps": [
            "Multiplex viral PCR respiratory panel (Influenza, RSV, Adenovirus).",
            "Continuous pulse oximetry and supportive oxygenation if oxygen saturation < 92%.",
            "Symptomatic management with antipyretics and adequate hydration.",
            "Monitor closely for secondary bacterial superinfection."
        ]
    },
    "Corona Virus Disease": {
        "key_findings": "Multifocal peripheral ground-glass opacities (GGO), predominant bilateral lower lung zone involvement, and subpleural consolidations.",
        "symptom_correlation": "Fever, dry cough, shortness of breath, sudden anosmia (loss of smell), ageusia (loss of taste), and marked fatigue.",
        "recommended_next_steps": [
            "RT-PCR or rapid SARS-CoV-2 antigen diagnostic confirmation.",
            "Monitor inflammatory markers (CRP, D-Dimer, Ferritin) if clinically symptomatic.",
            "Self-isolation protocol and oxygen saturation monitoring.",
            "Evaluation by pulmonologist for antiviral or immunomodulatory therapy if indicated."
        ]
    },
    "Tuberculosis": {
        "key_findings": "Upper lobe apical/posterior segment infiltrates, cavitary parenchymal lesions, hilar/mediastinal lymphadenopathy, and Ghon complexes.",
        "symptom_correlation": "Persistent chronic cough (>2-3 weeks), night sweats, unexplained weight loss, low-grade evening fever, and hemoptysis (bloody sputum).",
        "recommended_next_steps": [
            "Sputum Acid-Fast Bacilli (AFB) smear and GeneXpert MTB/RIF molecular assay.",
            "Interferon-Gamma Release Assay (IGRA) or Tuberculin Skin Test (TST).",
            "Immediate airborne isolation precautions in healthcare settings.",
            "Initiation of standard 4-drug Anti-Tubercular Therapy (ATT: RIF, INH, PZA, EMB) under specialist care."
        ]
    },
    "Normal": {
        "key_findings": "Clear pulmonary parenchyma bilaterally, normal cardiothoracic ratio (< 0.50), sharp costophrenic angles, and uncompromised hemidiaphragms.",
        "symptom_correlation": "No acute active pulmonary parenchymal abnormality detected on radiography.",
        "recommended_next_steps": [
            "Routine health monitoring; no acute radiologic intervention required.",
            "If respiratory symptoms persist clinically, consider non-pulmonary etiologies or early viral presentation.",
            "Re-evaluate with physician if fever or dyspnea develops."
        ]
    }
}


def generate_clinical_insights(
    predicted_class: str,
    confidence: float,
    top3: List[dict],
    symptoms: Optional[List[str]] = None,
) -> dict:
    """
    Generates detailed class-specific clinical insights enriched with patient symptoms.
    """
    base_info = CLASS_INSIGHTS_DB.get(predicted_class, CLASS_INSIGHTS_DB["Normal"])
    symptoms_list = symptoms or []

    symptom_text = (
        f"Patient presented with: {', '.join(symptoms_list)}."
        if symptoms_list
        else "No specific clinical symptoms reported."
    )

    narrative = (
        f"AI DenseNet121 Classification: {predicted_class} ({confidence * 100:.1f}% confidence).\n\n"
        f"• Key Radiographic Findings: {base_info['key_findings']}\n"
        f"• Symptoms & Clinical Correlation: {symptom_text} Typical findings include {base_info['symptom_correlation']}\n"
        f"• Recommended Next Steps:\n" + "\n".join([f"  - {step}" for step in base_info['recommended_next_steps']])
    )

    return {
        "predicted_class": predicted_class,
        "confidence": confidence,
        "key_findings": base_info["key_findings"],
        "symptom_correlation": base_info["symptom_correlation"],
        "recommended_next_steps": base_info["recommended_next_steps"],
        "patient_symptoms": symptoms_list,
        "full_narrative": narrative,
    }
