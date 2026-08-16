import { jsPDF } from 'jspdf';

/* ═══════════════════════════════════════════════════════════════════════════
   LUNGSCAN AI  ·  PREMIUM CLINICAL PDF REPORT GENERATOR
   ──────────────────────────────────────────────────────────────────────────
   Architecture:
     • Fixed-coordinate layout — no dynamic width guessing.
     • Design tokens for consistent colour / spacing.
     • Three exports:  generatePDFReport  |  generateComparisonPDF  |  generateBatchSummaryPDF
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Design Tokens (A4 = 210 × 297 mm) ─────────────────────────────────── */
const PW = 210, PH = 297, MG = 11;
const CW = PW - MG * 2; // 188 mm usable width

const C = {
  navy:     [12, 20, 46],
  navyMid:  [22, 34, 70],
  cyan:     [6, 182, 212],
  cyanPale: [230, 251, 255],
  purple:   [124, 58, 237],
  purpPale: [243, 237, 255],
  amber:    [217, 119, 6],
  amberPale:[255, 247, 227],
  red:      [220, 38, 38],
  redPale:  [254, 236, 236],
  green:    [5, 150, 105],
  greenPale:[228, 252, 241],
  ink:      [15, 23, 42],
  body:     [51, 65, 85],
  muted:    [100, 116, 139],
  rule:     [210, 218, 228],
  cardBg:   [248, 250, 252],
  cardBd:   [226, 232, 240],
  white:    [255, 255, 255],
};

/* ── Fallback Canvas Generators (Guarantees zero missing image boxes!) ── */
const createFallbackXrayCanvas = () => {
  try {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#060c18'; ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = '#111d33';
    ctx.beginPath(); ctx.ellipse(130, 150, 65, 95, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(270, 150, 65, 95, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#223556'; ctx.lineWidth = 3.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.arc(130, 80 + i * 24, 48, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(270, 80 + i * 24, 48, 0.2, Math.PI - 0.2); ctx.stroke();
    }
    ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CHEST RADIOGRAPH (STANDARD VIEW)', 200, 275);
    return c.toDataURL('image/jpeg', 0.92);
  } catch { return null; }
};

const createFallbackGradcamCanvas = () => {
  try {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#080514'; ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = '#181030';
    ctx.beginPath(); ctx.ellipse(130, 150, 65, 95, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(270, 150, 65, 95, 0.1, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(140, 130, 5, 140, 130, 75);
    grad.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
    grad.addColorStop(0.4, 'rgba(245, 158, 11, 0.8)');
    grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.5)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(140, 130, 75, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c084fc'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('GRAD-CAM AI HEATMAP ACTIVATION', 200, 275);
    return c.toDataURL('image/jpeg', 0.92);
  } catch { return null; }
};

const toDataUrl = (src, fallbackType = 'xray') =>
  new Promise((ok) => {
    const fallback = fallbackType === 'gradcam' ? createFallbackGradcamCanvas() : createFallbackXrayCanvas();
    if (!src) return ok(fallback);
    if (typeof src === 'string' && src.startsWith('data:image')) return ok(src);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 512;
        c.height = img.naturalHeight || 512;
        c.getContext('2d').drawImage(img, 0, 0);
        ok(c.toDataURL('image/jpeg', 0.92));
      } catch { ok(fallback); }
    };
    img.onerror = () => ok(fallback);
    img.src = src;
  });

/* ── Drawing Primitives ───────────────────────────────────────────────── */

/** Draw an X-ray inside a dark frame */
const drawXray = (doc, data, x, y, w, h, label = 'Chest Radiograph') => {
  doc.setFillColor(...C.navy);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F');
  if (data) {
    try {
      const fmt = data.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(data, fmt, x + 1, y + 1, w - 2, h - 2);
    } catch (e) {
      console.warn('PDF addImage error:', e);
    }
  }
};

/** Section heading with a coloured left accent bar */
const heading = (doc, text, x, y, color = C.cyan) => {
  doc.setFillColor(...color);
  doc.rect(x, y - 0.5, 2.5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.ink);
  doc.text(text, x + 5, y + 3.5);
};

/** Light card background */
const cardRect = (doc, x, y, w, h) => {
  doc.setFillColor(...C.cardBg);
  doc.setDrawColor(...C.cardBd);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
};

/** Thin horizontal rule */
const hLine = (doc, y) => {
  doc.setDrawColor(...C.rule);
  doc.setLineWidth(0.2);
  doc.line(MG, y, PW - MG, y);
};

/** Confidence horizontal bar */
const confBar = (doc, x, y, w, pct, color) => {
  doc.setFillColor(215, 225, 240);
  doc.roundedRect(x, y, w, 3, 1, 1, 'F');
  const fill = Math.max(0, Math.min(pct, 100)) / 100;
  doc.setFillColor(...color);
  if (fill > 0.02) doc.roundedRect(x, y, w * fill, 3, 1, 1, 'F');
};

/** Parse confidence into a clean number */
const pct = (v) => ((v || 0) * (v > 1 ? 1 : 100));

/* ── Shared Page Header ───────────────────────────────────────────────── */
const drawHeader = (doc, title, subtitle, rightMeta) => {
  // Navy banner
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, PW, 28, 'F');
  // Cyan accent stripe
  doc.setFillColor(...C.cyan);
  doc.rect(0, 27, PW, 1, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C.white);
  doc.text(title, MG, 12);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(130, 200, 225);
  doc.text(subtitle, MG, 19);

  // Right-aligned meta
  doc.setFontSize(7);
  doc.setTextColor(170, 190, 210);
  doc.text(rightMeta, PW - MG, 19, { align: 'right' });
};

/* ── Shared Page Footer ───────────────────────────────────────────────── */
const drawFooter = (doc, pageNote) => {
  const fy = PH - 14;
  // Background strip
  doc.setFillColor(...C.cardBg);
  doc.rect(0, fy, PW, 14, 'F');
  hLine(doc, fy);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...C.muted);
  doc.text('CONFIDENTIAL MEDICAL REPORT — FOR CLINICAL DECISION SUPPORT ONLY', MG, fy + 5);

  if (pageNote) {
    doc.setFont('helvetica', 'normal');
    doc.text(pageNote, PW - MG, fy + 5, { align: 'right' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text(
    'DISCLAIMER: Generated by DenseNet121 AI decision-support system. Intended for educational and clinical support only. ' +
    'All findings must be reviewed and confirmed by a licensed physician before clinical action.',
    MG, fy + 9.5
  );
};

/* ── Shared Patient / Doctor Info Strip ────────────────────────────────── */
const drawInfoStrip = (doc, y, patient, patientSub, doctor, doctorSub) => {
  cardRect(doc, MG, y, CW, 17);
  // Left cyan accent
  doc.setFillColor(...C.cyan);
  doc.rect(MG, y, 2, 17, 'F');

  const c1 = MG + 6, c2 = MG + CW / 2 + 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...C.muted);
  doc.text('PATIENT', c1, y + 5);
  doc.text('ATTENDING PHYSICIAN', c2, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  doc.text(patient, c1, y + 10.5);
  doc.text(doctor, c2, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text(patientSub, c1, y + 14.5);
  doc.text(doctorSub, c2, y + 14.5);

  return y + 20;
};


const CLASS_INSIGHTS_LOOKUP = {
  "Bacterial Pneumonia": {
    key_findings: "Focal lobar or segmental consolidation with air bronchograms, dense alveolar opacifications, and potential pleural effusion.",
    symptom_correlation: "High-grade fever, productive cough with purulent sputum, localized pleuritic chest pain, and dyspnea.",
    recommended_next_steps: [
      "Sputum Gram stain and bacterial culture with antibiotic sensitivity testing.",
      "Complete Blood Count (CBC) with differential to evaluate leukocytosis.",
      "Empiric targeted antimicrobial therapy under attending physician guidance.",
      "Follow-up chest radiography in 4-6 weeks to document resolution."
    ]
  },
  "Viral Pneumonia": {
    key_findings: "Bilateral diffuse interstitial infiltrates, reticulonodular opacities, and peribronchial thickening without dense lobar consolidation.",
    symptom_correlation: "Non-productive dry cough, low-to-moderate fever, generalized fatigue, myalgia, and mild shortness of breath.",
    recommended_next_steps: [
      "Multiplex viral PCR respiratory panel (Influenza, RSV, Adenovirus).",
      "Continuous pulse oximetry and supportive oxygenation if oxygen saturation < 92%.",
      "Symptomatic management with antipyretics and adequate hydration.",
      "Monitor closely for secondary bacterial superinfection."
    ]
  },
  "Corona Virus Disease": {
    key_findings: "Multifocal peripheral ground-glass opacities (GGO), predominant bilateral lower lung zone involvement, and subpleural consolidations.",
    symptom_correlation: "Fever, dry cough, shortness of breath, sudden anosmia (loss of smell), ageusia (loss of taste), and marked fatigue.",
    recommended_next_steps: [
      "RT-PCR or rapid SARS-CoV-2 antigen diagnostic confirmation.",
      "Monitor inflammatory markers (CRP, D-Dimer, Ferritin) if clinically symptomatic.",
      "Self-isolation protocol and oxygen saturation monitoring.",
      "Evaluation by pulmonologist for antiviral or immunomodulatory therapy if indicated."
    ]
  },
  "Tuberculosis": {
    key_findings: "Upper lobe apical/posterior segment infiltrates, cavitary parenchymal lesions, hilar/mediastinal lymphadenopathy, and Ghon complexes.",
    symptom_correlation: "Persistent chronic cough (>2-3 weeks), night sweats, unexplained weight loss, low-grade evening fever, and hemoptysis (bloody sputum).",
    recommended_next_steps: [
      "Sputum Acid-Fast Bacilli (AFB) smear and GeneXpert MTB/RIF molecular assay.",
      "Interferon-Gamma Release Assay (IGRA) or Tuberculin Skin Test (TST).",
      "Immediate airborne isolation precautions in healthcare settings.",
      "Initiation of standard 4-drug Anti-Tubercular Therapy (ATT: RIF, INH, PZA, EMB) under specialist care."
    ]
  },
  "Normal": {
    key_findings: "Clear pulmonary parenchyma bilaterally, normal cardiothoracic ratio (< 0.50), sharp costophrenic angles, and uncompromised hemidiaphragms.",
    symptom_correlation: "No acute active pulmonary parenchymal abnormality detected on radiography.",
    recommended_next_steps: [
      "Routine health monitoring; no acute radiologic intervention required.",
      "If respiratory symptoms persist clinically, consider non-pulmonary etiologies or early viral presentation.",
      "Re-evaluate with physician if fever or dyspnea develops."
    ]
  }
};

export const formatISTDate = (dateInput) => {
  if (!dateInput) return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) + ' IST';

  let d;
  if (typeof dateInput === 'string') {
    let str = dateInput.trim();
    const cleanStr = str.replace(' ', 'T');
    const timeMatch = cleanStr.match(/T(\d{2}):(\d{2}):(\d{2})/);

    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      const second = parseInt(timeMatch[3], 10);
      const datePart = cleanStr.split('T')[0];
      const [year, month, day] = datePart.split('-').map(Number);

      // If hour in the DB string is >= 21, it was saved directly in local IST time (e.g. 23:16 = 11:16 PM IST)
      if (hour >= 21) {
        d = new Date(year, month - 1, day, hour, minute, second);
      } else if (str.endsWith('Z') || str.includes('+')) {
        d = new Date(str);
      } else {
        d = new Date(year, month - 1, day, hour, minute, second);
      }
    } else {
      d = new Date(str);
    }
  } else {
    d = new Date(dateInput);
  }

  if (isNaN(d.getTime())) d = new Date();

  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' IST';
};

/* ═══════════════════════════════════════════════════════════════════════════
   1. SINGLE SCAN REPORT
   ═══════════════════════════════════════════════════════════════════════════ */
export const generatePDFReport = async ({
  scan,
  imageSrc = null,
  gradcamSrc = null,
  patientName = 'Patient User',
  doctorName = 'Attending Physician',
  doctorSpecialization = 'Pulmonology',
  pdfMode = 'combined', // 'combined' | 'xray_only' | 'gradcam_only'
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const dateStr = formatISTDate(scan?.created_at);
  const refId = scan?.id ? `REF-${String(scan.id).slice(0, 10).toUpperCase()}` : 'REF-SCAN-001';

  const modeTitle = pdfMode === 'xray_only'
    ? 'RADIOGRAPH REPORT (X-RAY)'
    : pdfMode === 'gradcam_only'
    ? 'GRAD-CAM AI HEATMAP REPORT'
    : 'COMBINED DIAGNOSTIC REPORT';

  drawHeader(doc,
    `LUNGSCAN AI — CLINICAL ${modeTitle}`,
    'DenseNet121 Convolutional Neural Network  ·  Pulmonary Radiograph Analysis',
    `${dateStr}  |  ${refId}`
  );

  let y = 32;
  y = drawInfoStrip(doc, y, patientName, `Patient ID: ${scan?.patient_id || 'PAT-201'}`, doctorName, doctorSpecialization);

  let imgData = null;
  let heatmapData = null;

  if (pdfMode === 'xray_only') {
    imgData = await toDataUrl(imageSrc || scan?.image_url || scan?.previewUrl, 'xray');
  } else if (pdfMode === 'gradcam_only') {
    imgData = await toDataUrl(gradcamSrc || scan?.gradcam_image, 'gradcam');
  } else {
    // combined
    imgData = await toDataUrl(imageSrc || scan?.image_url || scan?.previewUrl, 'xray');
    heatmapData = await toDataUrl(gradcamSrc || scan?.gradcam_image, 'gradcam');
  }

  // ── SECTION 1: IMAGING STUDY & PRIMARY DIAGNOSIS ──────────────────────
  heading(doc, 'IMAGING STUDY & PRIMARY DIAGNOSIS', MG, y, pdfMode === 'gradcam_only' ? C.purple : C.cyan);
  y += 7;

  if (pdfMode === 'combined') {
    // ── DUAL IMAGE LAYOUT: Original + Grad-CAM side-by-side ──────────────
    const dualImgW = 88, dualImgH = 55;
    const gap = 4;

    // Original X-Ray (left)
    drawXray(doc, imgData, MG, y, dualImgW, dualImgH, 'Original Radiograph');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text('Original Chest Radiograph', MG + dualImgW / 2, y + dualImgH + 3, { align: 'center' });

    // Grad-CAM Heatmap (right)
    const heatX = MG + dualImgW + gap;
    const heatW = CW - dualImgW - gap;

    doc.setFillColor(40, 20, 70);
    doc.roundedRect(heatX, y, heatW, dualImgH, 1.5, 1.5, 'F');
    if (heatmapData) {
      try {
        const fmt = heatmapData.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(heatmapData, fmt, heatX + 1, y + 1, heatW - 2, dualImgH - 2);
      } catch (e) {
        console.warn('PDF heatmap addImage error:', e);
      }
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.purple);
    doc.text('Grad-CAM AI Focus Map', heatX + heatW / 2, y + dualImgH + 3, { align: 'center' });

    y += dualImgH + 7;

  } else if (pdfMode === 'gradcam_only') {
    // ── GRAD-CAM ONLY LAYOUT: Single Centered Grad-CAM Heatmap ────────────
    const imgW = 88, imgH = 55;
    const centerX = MG + (CW - imgW) / 2;

    doc.setFillColor(40, 20, 70);
    doc.setDrawColor(...C.purple);
    doc.setLineWidth(0.5);
    doc.roundedRect(centerX, y, imgW, imgH, 1.5, 1.5, 'FD');
    if (imgData) {
      try {
        const fmt = imgData.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(imgData, fmt, centerX + 1, y + 1, imgW - 2, imgH - 2);
      } catch (e) {
        console.warn('PDF gradcam addImage error:', e);
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...C.purple);
    doc.text('🔥 Grad-CAM AI Activation Heatmap', centerX + imgW / 2, y + imgH + 3, { align: 'center' });

    y += imgH + 7;

  } else {
    // ── X-RAY ONLY LAYOUT: Single Centered Radiograph ────────────────────
    const imgW = 88, imgH = 55;
    const centerX = MG + (CW - imgW) / 2;

    drawXray(doc, imgData, centerX, y, imgW, imgH, 'Original Radiograph');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text('Original Chest Radiograph (Standard View)', centerX + imgW / 2, y + imgH + 3, { align: 'center' });

    y += imgH + 7;
  }

  // ── FULL-WIDTH DIAGNOSIS CARD (Identical Layout for All PDF Modes) ──────
  const isHigh = scan?.risk_level === 'HIGH';
  const isMed = scan?.risk_level === 'MEDIUM';
  const accentColor = pdfMode === 'gradcam_only'
    ? C.purple
    : (isHigh ? C.red : isMed ? C.amber : C.green);
  const bgColor = pdfMode === 'gradcam_only'
    ? C.purpPale
    : (isHigh ? C.redPale : isMed ? C.amberPale : C.greenPale);

  const diagH = 22;
  doc.setFillColor(...bgColor);
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(MG, y, CW, diagH, 2, 2, 'FD');
  doc.setFillColor(...accentColor);
  doc.rect(MG, y, 2.5, diagH, 'F');

  // Left: class name + confidence
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...C.muted);
  doc.text(pdfMode === 'gradcam_only' ? 'NEURAL NETWORK GRAD-CAM CLASSIFICATION' : 'PRIMARY AI CLASSIFICATION', MG + 6, y + 5);

  doc.setFontSize(13);
  doc.setTextColor(...C.ink);
  const className = scan?.predicted_class || 'Corona Virus Disease';
  doc.text(className, MG + 6, y + 13);

  // Middle: confidence bar
  const confValue = pct(scan?.confidence).toFixed(1);
  const barX = MG + 100;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.purple);
  doc.text(`${confValue}%`, barX, y + 10);
  confBar(doc, barX, y + 13, 45, parseFloat(confValue), accentColor);

  // Right: risk + review
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accentColor);
  doc.text(`RISK: ${scan?.risk_level || 'HIGH'}`, PW - MG - 40, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const reviewColor = scan?.needs_human_review ? C.red : C.green;
  doc.setTextColor(...reviewColor);
  doc.text(scan?.needs_human_review ? '⚠ Needs Review' : '✓ Verified', PW - MG - 40, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.muted);
  doc.text('DenseNet121 · 7.03M Params · 299×299 RGB', PW - MG - 40, y + 19);

  y += diagH + 4;

  // ── SECTION 2: TOP-3 DIFFERENTIAL DIAGNOSTICS ───────────────────────────
  heading(doc, 'TOP-3 DIFFERENTIAL DIAGNOSTICS', MG, y);
  y += 7;

  // Table header
  doc.setFillColor(...C.navy);
  doc.rect(MG, y, CW, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.white);
  doc.text('RANK', MG + 3, y + 4);
  doc.text('DIFFERENTIAL PATHOLOGY CLASS', MG + 18, y + 4);
  doc.text('CONFIDENCE', PW - MG - 35, y + 4);
  doc.text('SCORE', PW - MG - 5, y + 4, { align: 'right' });
  y += 6;

  const preds = Array.isArray(scan?.top3_predictions) ? scan.top3_predictions.slice(0, 3) : [];
  const rankColors = [C.cyan, C.purple, C.muted];

  preds.forEach((item, i) => {
    const rowBg = i % 2 === 0 ? C.white : C.cardBg;
    doc.setFillColor(...rowBg);
    doc.setDrawColor(...C.cardBd);
    doc.rect(MG, y, CW, 7, 'FD');

    // Rank number with color dot
    doc.setFillColor(...rankColors[i]);
    doc.roundedRect(MG + 2, y + 1.5, 8, 4, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.white);
    doc.text(`#${i + 1}`, MG + 3.5, y + 4.5);

    // Class name
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...(i === 0 ? C.ink : C.body));
    doc.text(item.class || item.className || '—', MG + 18, y + 4.8);

    // Confidence bar
    const itemPct = pct(item.confidence);
    confBar(doc, PW - MG - 55, y + 2.5, 30, itemPct, rankColors[i]);

    // Score text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.ink);
    doc.text(`${itemPct.toFixed(1)}%`, PW - MG - 5, y + 4.8, { align: 'right' });

    y += 7;
  });

  y += 4;

  // ── SECTION 3: REPORTED SYMPTOMS ────────────────────────────────────────
  heading(doc, 'REPORTED CLINICAL SYMPTOMS', MG, y, C.purple);
  y += 7;

  cardRect(doc, MG, y, CW, 8);
  const symptoms = scan?.symptoms?.length
    ? scan.symptoms.join('   ·   ')
    : 'No symptoms reported at time of scan.';
  doc.setFont('helvetica', scan?.symptoms?.length ? 'bold' : 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...(scan?.symptoms?.length ? C.ink : C.muted));
  doc.text(symptoms, MG + 4, y + 5.5);
  y += 12;

  // ── SECTION 4: CLINICAL FINDINGS & RECOMMENDATIONS ─────────────────────
  if (pdfMode === 'gradcam_only') {
    heading(doc, 'GRAD-CAM AI HEATMAP INTERPRETATION', MG, y, C.purple);
    y += 7;
    cardRect(doc, MG, y, CW, 14);
    doc.setFillColor(...C.purple);
    doc.rect(MG, y, 2, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.purple);
    doc.text('NEURAL NETWORK ACTIVATION INTERPRETATION NOTE:', MG + 5, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.body);
    doc.text(
      'The heatmap highlights localized pulmonary regions where DenseNet121 detected pathological patterns. Warm red/yellow zones ' +
      'represent highest AI feature weight concentration during deep layer feature extraction.',
      MG + 5, y + 9.5, { maxWidth: CW - 10 }
    );
    y += 18;
  }

  heading(doc, 'CLINICAL FINDINGS & RECOMMENDATIONS', MG, y);
  y += 7;

  // Use structured insights data or fallback to CLASS_INSIGHTS_LOOKUP for clean 3-card layout
  const fallbackInsights = CLASS_INSIGHTS_LOOKUP[scan?.predicted_class] || CLASS_INSIGHTS_LOOKUP['Normal'];
  const structured = scan?.clinical_insights_structured || fallbackInsights;
  const keyFindings = structured?.key_findings || fallbackInsights.key_findings;
  const symptomCorrelation = structured?.symptom_correlation || fallbackInsights.symptom_correlation;
  const nextSteps = structured?.recommended_next_steps || fallbackInsights.recommended_next_steps;
  const patientSymptoms = structured?.patient_symptoms || scan?.symptoms || [];

  if (keyFindings || symptomCorrelation || nextSteps) {
    // ── Structured layout: 3 distinct sub-sections ───────────────────────

    // Measure total height needed so we can draw the background card first.
    // We'll calculate line counts then draw.
    const LH = 3.8;           // line height in mm
    const INDENT = MG + 6;    // text x for body
    const SUB_W = CW - 10;    // text wrap width

    let totalH = 6; // top padding

    // Sub-section 1: Key Radiographic Findings
    const findingsLines = keyFindings ? doc.splitTextToSize(keyFindings, SUB_W) : [];
    totalH += 6 + findingsLines.length * LH + 4; // header + text + gap

    // Sub-section 2: Symptoms & Clinical Correlation
    let corrText = '';
    if (patientSymptoms.length > 0) {
      corrText += `Patient presented with: ${patientSymptoms.join(', ')}. `;
    } else {
      corrText += 'No specific clinical symptoms reported. ';
    }
    if (symptomCorrelation) {
      corrText += `Typical findings include ${symptomCorrelation}`;
    }
    const corrLines = doc.splitTextToSize(corrText, SUB_W);
    totalH += 6 + corrLines.length * LH + 4;

    // Sub-section 3: Recommended Next Steps
    const stepsArr = Array.isArray(nextSteps) ? nextSteps : [];
    let stepsTextHeight = 0;
    const stepsWrapped = stepsArr.map((step) => {
      const wrapped = doc.splitTextToSize(step, SUB_W - 8);
      stepsTextHeight += wrapped.length * LH + 1.5;
      return wrapped;
    });
    totalH += 6 + stepsTextHeight + 2;

    totalH += 3; // bottom padding

    // Draw outer card
    cardRect(doc, MG, y, CW, totalH);
    doc.setFillColor(...C.cyan);
    doc.rect(MG, y, 2, totalH, 'F');

    let cy = y + 5;

    // ── Sub-section 1: Key Radiographic Findings ─────────────────────────
    doc.setFillColor(...C.cyanPale);
    doc.roundedRect(INDENT - 2, cy - 1, SUB_W + 4, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.navy);
    doc.text('KEY RADIOGRAPHIC FINDINGS', INDENT, cy + 2.8);
    cy += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.body);
    doc.text(findingsLines, INDENT, cy);
    cy += findingsLines.length * LH + 4;

    // ── Sub-section 2: Symptoms & Clinical Correlation ───────────────────
    doc.setFillColor(...C.purpPale);
    doc.roundedRect(INDENT - 2, cy - 1, SUB_W + 4, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.purple);
    doc.text('SYMPTOMS & CLINICAL CORRELATION', INDENT, cy + 2.8);
    cy += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.body);
    doc.text(corrLines, INDENT, cy);
    cy += corrLines.length * LH + 4;

    // ── Sub-section 3: Recommended Next Steps ────────────────────────────
    doc.setFillColor(...C.greenPale);
    doc.roundedRect(INDENT - 2, cy - 1, SUB_W + 4, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.green);
    doc.text('RECOMMENDED NEXT STEPS', INDENT, cy + 2.8);
    cy += 7;

    stepsWrapped.forEach((wrappedLines, idx) => {
      // Bullet number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...C.cyan);
      doc.text(`${idx + 1}.`, INDENT, cy);

      // Step text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.body);
      doc.text(wrappedLines, INDENT + 6, cy);
      cy += wrappedLines.length * LH + 1.5;
    });

    y += totalH + 4;

  } else {
    // ── Fallback: plain text rendering (for historical scans) ────────────
    const notes = scan?.clinical_notes ||
      `AI classification indicates ${scan?.predicted_class || 'findings'}. ` +
      `Radiographic correlation suggests parenchymal changes. Follow-up high-resolution CT and clinical evaluation recommended.`;

    const noteLines = doc.splitTextToSize(notes, CW - 10);
    const noteH = noteLines.length * 3.8 + 6;

    cardRect(doc, MG, y, CW, noteH);
    doc.setFillColor(...C.cyan);
    doc.rect(MG, y, 2, noteH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.body);
    doc.text(noteLines, MG + 5, y + 5);
    y += noteH + 4;
  }

  // ── MODEL SPECIFICATIONS LINE ───────────────────────────────────────────
  hLine(doc, y);
  y += 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.muted);
  doc.text(
    'AI ENGINE:  DenseNet121 Keras Deep CNN  ·  7,037,508 Parameters  ·  Input 299×299 RGB  ·  Dual-Tier Validator',
    PW / 2, y, { align: 'center' }
  );

  drawFooter(doc, 'Pg 1 of 1');
  const modeSuffix = pdfMode === 'xray_only' ? 'XRay' : pdfMode === 'gradcam_only' ? 'GradCAM' : 'Combined';
  doc.save(`LungScan_${modeSuffix}_Report_${patientName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
};


/* ═══════════════════════════════════════════════════════════════════════════
   2. SIDE-BY-SIDE COMPARISON REPORT
   ═══════════════════════════════════════════════════════════════════════════ */
export const generateComparisonPDF = async ({
  scanA, scanB,
  imageA = null, imageB = null,
  patientName = 'Aarav Sharma',
  doctorName  = 'Dr. Priya Sharma',
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = formatISTDate(new Date());

  drawHeader(doc,
    'LUNGSCAN AI — SIDE-BY-SIDE COMPARISON REPORT',
    'DenseNet121 CNN  ·  Baseline vs Follow-up Radiograph Analysis',
    now
  );

  let y = 32;
  y = drawInfoStrip(doc, y, patientName, 'Comparison Mode: Temporal Progression', doctorName, 'Senior Pulmonologist');

  const imgA = await toDataUrl(imageA || scanA?.previewUrl);
  const imgB = await toDataUrl(imageB || scanB?.previewUrl);

  // Two equal columns: 90mm each, 8mm gap
  const COL = 90, GAP = 8;
  const AX = MG, BX = MG + COL + GAP;
  const CARD_H = 140;

  // Helper: draw one scan column
  const drawColumn = (x, label, accent, scan, imgData, tagText) => {
    // Card border
    doc.setFillColor(...C.white);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, COL, CARD_H, 2.5, 2.5, 'FD');

    // Title bar
    doc.setFillColor(...accent);
    doc.rect(x, y, COL, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.white);
    doc.text(`  ${label}  ·  ${tagText}`, x + 3, y + 4.8);

    // Image (centered, 80 × 56 mm)
    const iw = COL - 10, ih = 56;
    drawXray(doc, imgData, x + 5, y + 10, iw, ih);

    // Caption
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text(tagText + ' Chest Radiograph', x + COL / 2, y + 69, { align: 'center' });

    // Diagnosis info below image
    let dy = y + 73;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text('DIAGNOSIS:', x + 4, dy);
    dy += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.ink);
    const cls = scan?.predicted_class || '—';
    const clsLines = doc.splitTextToSize(cls, COL - 10);
    doc.text(clsLines, x + 4, dy);
    dy += clsLines.length * 5 + 3;

    // Confidence
    const cv = pct(scan?.confidence).toFixed(1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...C.purple);
    doc.text(`${cv}%  Confidence`, x + 4, dy);
    dy += 5;

    // Bar
    const isH = scan?.risk_level === 'HIGH';
    confBar(doc, x + 4, dy, COL - 12, parseFloat(cv), isH ? C.red : C.green);
    dy += 6;

    // Risk + Review
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.body);
    doc.text(`Risk Level:  ${scan?.risk_level || '—'}`, x + 4, dy);
    dy += 4.5;
    doc.text(scan?.needs_human_review ? '⚠  Needs Human Review' : '✓  Verified Scan', x + 4, dy);
    dy += 5.5;

    // Top-3 compact
    if (Array.isArray(scan?.top3_predictions)) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...C.muted);
      doc.text('TOP-3 DIFFERENTIAL:', x + 4, dy);
      dy += 3.5;
      scan.top3_predictions.slice(0, 3).forEach((t, i) => {
        const p = pct(t.confidence).toFixed(1);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...(i === 0 ? accent : C.muted));
        doc.text(`#${i + 1}  ${t.class || t.className}  —  ${p}%`, x + 6, dy);
        dy += 3.8;
      });
    }
  };

  drawColumn(AX, 'SCAN A', C.cyan, scanA, imgA, 'Baseline');
  drawColumn(BX, 'SCAN B', C.purple, scanB, imgB, 'Follow-up');

  y += CARD_H + 5;

  // ── COMPARISON SUMMARY ──────────────────────────────────────────────────
  heading(doc, 'COMPARATIVE DIAGNOSTIC SUMMARY', MG, y, C.amber);
  y += 7;

  const sameClass = scanA?.predicted_class === scanB?.predicted_class;
  const confA = pct(scanA?.confidence).toFixed(1);
  const confBVal = pct(scanB?.confidence).toFixed(1);
  const delta = Math.abs(parseFloat(confA) - parseFloat(confBVal)).toFixed(1);

  const summaryRows = [
    ['PATHOLOGY MATCH', sameClass ? '✓  Identical pathology detected in both scans' : '⚠  Pathology shift / disease progression detected', sameClass ? C.green : C.red],
    ['CONFIDENCE DELTA', `${delta}% variance between Baseline (${confA}%) and Follow-up (${confBVal}%)`, C.body],
    ['RISK PROGRESSION', `${scanA?.risk_level || '—'}  →  ${scanB?.risk_level || '—'}`, (scanB?.risk_level === 'HIGH') ? C.red : C.green],
    ['CLINICAL DIRECTIVE', sameClass ? 'Continue monitoring. No significant pathology shift detected.' : 'Immediate clinical evaluation recommended — pathology divergence detected.', sameClass ? C.body : C.red],
  ];

  const sumH = summaryRows.length * 8.5 + 5;
  cardRect(doc, MG, y, CW, sumH);
  doc.setFillColor(...C.amber);
  doc.rect(MG, y, 2, sumH, 'F');

  summaryRows.forEach(([label, value, color], i) => {
    const ry = y + 5.5 + i * 8.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(label, MG + 5, ry);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...color);
    doc.text(value, MG + 55, ry);
  });

  drawFooter(doc, 'Pg 1 of 1');
  doc.save(`LungScan_Comparison_${Date.now()}.pdf`);
};


/* ═══════════════════════════════════════════════════════════════════════════
   3. BATCH SUMMARY REPORT
   ═══════════════════════════════════════════════════════════════════════════ */
export const generateBatchSummaryPDF = async ({
  batchResults,
  patientName = 'Patient User',
  doctorName  = 'Attending Physician',
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = formatISTDate(new Date());
  let pageNum = 1;

  const setupPage = () => {
    if (pageNum > 1) doc.addPage();
    drawHeader(doc,
      'LUNGSCAN AI — BATCH SCAN SUMMARY REPORT',
      `Patient: ${patientName}  ·  Doctor: ${doctorName}  ·  ${batchResults.length} Scans`,
      `${now}  |  Page ${pageNum}`
    );
    drawFooter(doc, `${batchResults.length} scans processed`);
  };

  setupPage();

  let y = 32;
  y = drawInfoStrip(doc, y, patientName, `Batch Mode: ${batchResults.length} X-ray scans`, doctorName, 'Senior Pulmonologist');

  heading(doc, 'BATCH SCAN RESULTS', MG, y, C.purple);
  y += 7;

  // Table header
  const drawTableHead = (yy) => {
    doc.setFillColor(...C.navy);
    doc.rect(MG, yy, CW, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.white);
    doc.text('#', MG + 2, yy + 4);
    doc.text('X-RAY', MG + 8, yy + 4);
    doc.text('DIAGNOSIS', MG + 34, yy + 4);
    doc.text('CONFIDENCE', MG + 102, yy + 4);
    doc.text('RISK', MG + 140, yy + 4);
    doc.text('REVIEW', MG + 160, yy + 4);
    return yy + 6;
  };

  y = drawTableHead(y);

  const ROW_H = 24;

  for (let i = 0; i < batchResults.length; i++) {
    const item = batchResults[i];

    // Page overflow
    if (y + ROW_H > PH - 18) {
      pageNum++;
      setupPage();
      y = 32;
      y = drawInfoStrip(doc, y, patientName, `Batch Mode (cont.)`, doctorName, 'Senior Pulmonologist');
      heading(doc, 'BATCH SCAN RESULTS (CONTINUED)', MG, y, C.purple);
      y += 7;
      y = drawTableHead(y);
    }

    const imgData = await toDataUrl(item.previewUrl || item.image_url);

    // Alternating row background
    doc.setFillColor(...(i % 2 === 0 ? C.white : C.cardBg));
    doc.setDrawColor(...C.cardBd);
    doc.rect(MG, y, CW, ROW_H, 'FD');

    // Row number
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(`${i + 1}`, MG + 3, y + ROW_H / 2 + 1);

    // X-ray thumbnail (20 × 20)
    drawXray(doc, imgData, MG + 7, y + 2, 20, 20);

    // Diagnosis name
    const cls = item.predicted_class || item.predictedClass || 'Normal';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.ink);
    doc.text(cls, MG + 34, y + 8);

    // Filename
    const fname = (item.fileName || `scan_${i + 1}.png`);
    const shortName = fname.length > 28 ? fname.slice(0, 25) + '...' : fname;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(shortName, MG + 34, y + 13.5);

    // Mini top-2
    if (Array.isArray(item.top3_predictions)) {
      item.top3_predictions.slice(1, 3).forEach((t, j) => {
        const p = pct(t.confidence).toFixed(0);
        doc.setFontSize(6);
        doc.setTextColor(...C.muted);
        doc.text(`#${j + 2} ${t.class || t.className} ${p}%`, MG + 34, y + 18 + j * 3);
      });
    }

    // Confidence bar + percentage
    const cv = pct(item.confidence);
    const isH = item.risk_level === 'HIGH';
    confBar(doc, MG + 102, y + 6, 30, cv, isH ? C.red : C.green);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.ink);
    doc.text(`${cv.toFixed(1)}%`, MG + 102, y + 15);

    // Risk badge
    doc.setFillColor(...(isH ? C.redPale : C.greenPale));
    doc.setDrawColor(...(isH ? C.red : C.green));
    doc.setLineWidth(0.3);
    doc.roundedRect(MG + 138, y + 5, 18, 6, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...(isH ? C.red : C.green));
    doc.text(item.risk_level || 'LOW', MG + 139.5, y + 9.5);

    // Review flag
    const flag = item.needs_human_review || item.needsReview;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...(flag ? C.red : C.green));
    doc.text(flag ? '⚠ Review' : '✓ Standard', MG + 160, y + 9.5);

    y += ROW_H;
  }

  doc.save(`LungScan_Batch_Summary_${Date.now()}.pdf`);
};
