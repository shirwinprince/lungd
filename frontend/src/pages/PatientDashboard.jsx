import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { predictXRay, getPatientScans } from '../services/api';
import { supabase } from '../services/supabase';
import { generatePDFReport, generateBatchSummaryPDF, generateComparisonPDF, formatISTDate } from '../utils/pdfGenerator';
import { PredictionAnalyticsVisualizer } from '../components/PredictionAnalyticsVisualizer';
import { GsapPage, GsapButton, GsapReveal, GsapStaggerCards } from '../components/GsapWrapper';
import { SmoothHeightContainer, TabTransition, AnimatedTabPill } from '../components/MotionWrapper';
import { animateTabChange } from '../utils/gsapAnimations';
import { User, Stethoscope, Upload, Activity, FileText, CheckCircle2, AlertTriangle, AlertCircle, History, Clock, ShieldAlert, Award, X, Eye, Thermometer, Download, Layers, Image as ImageIcon, GitCompare, ArrowRightLeft, ScanEye, BarChart3 } from 'lucide-react';

const AVAILABLE_SYMPTOMS = [
  'Fever',
  'Cough',
  'Shortness of breath',
  'Chest pain',
  'Fatigue',
  'Loss of smell/taste',
];

export const PatientDashboard = () => {
  const { profile, assignedDoctor } = useAuth();

  const [uploadMode, setUploadMode] = useState('single'); // 'single', 'batch', 'compare'
  
  // Single Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [prediction, setPrediction] = useState(null);

  // Batch Upload State
  const [batchFiles, setBatchFiles] = useState([]);
  const [batchPreviews, setBatchPreviews] = useState([]);
  const [batchResults, setBatchResults] = useState([]);
  const [batchProgress, setBatchProgress] = useState(0);

  // Comparison Upload State
  const [fileA, setFileA] = useState(null);
  const [previewA, setPreviewA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [previewB, setPreviewB] = useState(null);
  const [scanResultA, setScanResultA] = useState(null);
  const [scanResultB, setScanResultB] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [activeModalScan, setActiveModalScan] = useState(null);
  const [gradcamView, setGradcamView] = useState('original'); // 'original' | 'heatmap'

  // Fetch prediction history from database
  const fetchScans = async () => {
    if (!profile?.id) return;
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('scans')
          .select('*')
          .eq('patient_id', profile.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setScanHistory(data);
          return;
        }
      }

      // API backend fallback
      const scans = await getPatientScans(profile.id);
      setScanHistory(scans || []);
    } catch (err) {
      console.warn("Could not fetch scan history from DB:", err);
    }
  };

  useEffect(() => {
    fetchScans();
  }, [profile]);

  const handleSingleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setPrediction(null);
      setError('');
    }
  };

  const handleBatchFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setBatchFiles(files);
      const previews = files.map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
      }));
      setBatchPreviews(previews);
      setBatchResults([]);
      setError('');
    }
  };

  const handleCompareFileAChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileA(file);
      setPreviewA(URL.createObjectURL(file));
      setScanResultA(null);
      setError('');
    }
  };

  const handleCompareFileBChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileB(file);
      setPreviewB(URL.createObjectURL(file));
      setScanResultB(null);
      setError('');
    }
  };

  const toggleSymptom = (symptom) => {
    setSelectedSymptoms((prev) =>
      prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]
    );
  };

  const handleSingleAnalyze = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError('');

    try {
      const res = await predictXRay(selectedFile, profile?.id, assignedDoctor?.id, selectedSymptoms);
      setPrediction(res);
      fetchScans();
    } catch (err) {
      console.error(err);
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 422 && detail) {
        setError(`⚠️ Image Rejected: ${detail}`);
      } else if (status === 400 && detail) {
        setError(`❌ Invalid File: ${detail}`);
      } else {
        setError(detail || 'Failed to analyze X-ray image. Make sure the backend API is running.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBatchAnalyze = async () => {
    if (batchFiles.length === 0) return;
    setLoading(true);
    setBatchProgress(0);
    setError('');
    const results = [];

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      setBatchProgress(i + 1);
      try {
        const res = await predictXRay(file, profile?.id, assignedDoctor?.id, selectedSymptoms);
        results.push({
          fileName: file.name,
          previewUrl: batchPreviews[i]?.url,
          ...res,
        });
      } catch (err) {
        console.error(`Batch upload error for ${file.name}:`, err);
      }
    }

    setBatchResults(results);
    setLoading(false);
    fetchScans();
  };

  const handleCompareAnalyze = async () => {
    if (!fileA || !fileB) return;
    setLoading(true);
    setError('');

    try {
      const [resA, resB] = await Promise.all([
        predictXRay(fileA, profile?.id, assignedDoctor?.id, selectedSymptoms),
        predictXRay(fileB, profile?.id, assignedDoctor?.id, selectedSymptoms),
      ]);
      setScanResultA(resA);
      setScanResultB(resB);
      fetchScans();
    } catch (err) {
      console.error("Comparison analysis error:", err);
      setError(err.response?.data?.detail || 'Failed to complete side-by-side comparison.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = (scanData, overrideImage = null) => {
    generatePDFReport({
      scan: scanData,
      imageSrc: overrideImage || scanData?.image_url || scanData?.previewUrl || previewUrl,
      gradcamSrc: scanData?.gradcam_image || prediction?.gradcam_image || null,
      patientName: profile?.full_name || 'Aarav Sharma',
      doctorName: assignedDoctor?.full_name || 'Dr. Priya Sharma',
      doctorSpecialization: assignedDoctor?.specialization || 'Senior Pulmonologist',
    });
  };

  const handleDownloadBatchSummary = () => {
    generateBatchSummaryPDF({
      batchResults,
      patientName: profile?.full_name || 'Aarav Sharma',
      doctorName: assignedDoctor?.full_name || 'Dr. Priya Sharma',
    });
  };

  const handleDownloadComparisonPDF = () => {
    generateComparisonPDF({
      scanA: scanResultA,
      scanB: scanResultB,
      imageA: previewA,
      imageB: previewB,
      patientName: profile?.full_name || 'Aarav Sharma',
      doctorName: assignedDoctor?.full_name || 'Dr. Priya Sharma',
    });
  };

  // Single Top 3 Calculation
  let top3List = [];
  let isLowConfidence = false;
  let needsHumanReview = false;

  if (prediction?.probabilities) {
    const sorted = Object.entries(prediction.probabilities).sort((a, b) => b[1] - a[1]);
    top3List = sorted.slice(0, 3).map(([cls, prob], idx) => ({
      rank: idx + 1,
      className: cls,
      confidence: prob,
    }));

    const top1 = sorted[0]?.[1] || 0;
    const top2 = sorted[1]?.[1] || 0;

    isLowConfidence = top1 < 0.70;
    needsHumanReview = top1 < 0.60 || (top1 - top2) < 0.10;
  }

  return (
    <GsapPage className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="p-8 rounded-3xl bg-cyber-card border border-cyber-border relative overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-500 to-pink-600 flex items-center justify-center text-white text-3xl shadow-lg shadow-purple-500/20">
              🫁
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Welcome, {profile?.full_name || 'Aarav Sharma'}</h1>
              <p className="text-xs text-slate-400 mt-1">
                Personal Chest Radiography Diagnostic & Clinical Intelligence Portal
              </p>
            </div>
          </div>

          {/* Assigned Doctor Card */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-cyber-border min-w-[280px]">
            <div className="text-[10px] font-mono text-purple-300 uppercase tracking-wider mb-1">
              Assigned Physician
            </div>
            {assignedDoctor ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold text-lg">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <strong className="block text-sm text-slate-100">{assignedDoctor.full_name || 'Dr. Priya Sharma'}</strong>
                  <span className="text-xs text-purple-300">{assignedDoctor.specialization || 'Senior Pulmonologist'}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 text-xs py-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>No Doctor Available (All Doctors at Capacity)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="w-full overflow-hidden">
        <div className="w-full overflow-x-auto no-scrollbar flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-950/80 border border-cyber-border backdrop-blur-xl relative flex-nowrap sm:flex-wrap">
          <button
            onClick={() => setUploadMode('single')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${
              uploadMode === 'single' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {uploadMode === 'single' && <AnimatedTabPill layoutId="patientTabPill" />}
            <ImageIcon className="w-4 h-4" />
            Single Scan Upload
          </button>

          <button
            onClick={() => setUploadMode('batch')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${
              uploadMode === 'batch' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {uploadMode === 'batch' && <AnimatedTabPill layoutId="patientTabPill" />}
            <Layers className="w-4 h-4" />
            Batch Upload
          </button>

          <button
            onClick={() => setUploadMode('compare')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${
              uploadMode === 'compare' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {uploadMode === 'compare' && <AnimatedTabPill layoutId="patientTabPill" />}
            <GitCompare className="w-4 h-4" />
            Side-by-Side Comparison
          </button>

          <button
            onClick={() => setUploadMode('analytics')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${
              uploadMode === 'analytics' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {uploadMode === 'analytics' && <AnimatedTabPill layoutId="patientTabPill" />}
            <BarChart3 className="w-4 h-4" />
            Visual Analytics & Graphs
          </button>
        </div>
      </div>

      {/* Main Mode Display Section */}
      <SmoothHeightContainer>
        <TabTransition activeKey={uploadMode}>
          {uploadMode === 'analytics' ? (
        /* ── DEDICATED VISUAL ANALYTICS TAB ──────────────────────────────────── */
        <PredictionAnalyticsVisualizer
          prediction={prediction || (scanHistory && scanHistory.length > 0 ? scanHistory[0] : null)}
          title="Personal Radiography AI Visual Insights & Analytics"
        />
      ) : uploadMode === 'compare' ? (
        /* ── SIDE-BY-SIDE COMPARISON MODE ────────────────────────────────── */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Scan A Upload Card */}
            <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-4">
              <h3 className="text-base font-bold text-purple-300 flex items-center justify-between">
                <span>Scan A (Baseline / Image 1)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300">Baseline</span>
              </h3>

              <div className="border-2 border-dashed border-cyber-border rounded-2xl p-6 text-center bg-slate-950/50">
                {previewA ? (
                  <div className="space-y-2">
                    <img src={previewA} alt="Scan A" className="max-h-48 mx-auto rounded-xl object-contain" />
                    <button onClick={() => { setFileA(null); setPreviewA(null); }} className="text-xs text-rose-400 hover:underline">Remove</button>
                  </div>
                ) : (
                  <label className="cursor-pointer block py-6 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto text-xl">📁</div>
                    <span className="text-xs text-slate-300 font-semibold block">Upload Scan A (Baseline)</span>
                    <input type="file" accept="image/*" onChange={handleCompareFileAChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            {/* Scan B Upload Card */}
            <div className="p-6 rounded-3xl bg-cyber-card border border-purple-500/40 shadow-xl space-y-4">
              <h3 className="text-base font-bold text-purple-400 flex items-center justify-between">
                <span>Scan B (Comparison / Image 2)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300">Follow-up</span>
              </h3>

              <div className="border-2 border-dashed border-purple-500/30 rounded-2xl p-6 text-center bg-slate-950/50">
                {previewB ? (
                  <div className="space-y-2">
                    <img src={previewB} alt="Scan B" className="max-h-48 mx-auto rounded-xl object-contain" />
                    <button onClick={() => { setFileB(null); setPreviewB(null); }} className="text-xs text-rose-400 hover:underline">Remove</button>
                  </div>
                ) : (
                  <label className="cursor-pointer block py-6 space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto text-xl">📂</div>
                    <span className="text-xs text-slate-300 font-semibold block">Upload Scan B (Follow-up)</span>
                    <input type="file" accept="image/*" onChange={handleCompareFileBChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Compare Button */}
          <button
            onClick={handleCompareAnalyze}
            disabled={!fileA || !fileB || loading}
            className="w-full py-3.5 rounded-2xl font-extrabold bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white shadow-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ArrowRightLeft className="w-5 h-5" />
                <span>Run Side-by-Side AI Comparative Analysis</span>
              </>
            )}
          </button>

          {/* Comparison Results Grid */}
          {scanResultA && scanResultB && (
            <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-cyber-border">
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <GitCompare className="w-5 h-5 text-amber-400" />
                  Comparative Analysis Output
                </h3>

                <button
                  onClick={handleDownloadComparisonPDF}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs shadow-lg flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Comparison PDF Report
                </button>
              </div>

              {/* Highlights Difference Banner */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-2">
                <div className="text-xs font-mono text-amber-400 uppercase font-bold flex items-center gap-1.5">
                  <Activity className="w-4 h-4" />
                  Key Diagnostic Differences & Highlights
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300">
                  <div>
                    <strong className="text-slate-400 block text-[11px]">Pathology Match:</strong>
                    {scanResultA.predicted_class === scanResultB.predicted_class ? (
                      <span className="text-emerald-400 font-bold">✓ Identical Pathology ({scanResultA.predicted_class})</span>
                    ) : (
                      <span className="text-amber-400 font-bold">⚠️ Pathology Shift: {scanResultA.predicted_class} ➔ {scanResultB.predicted_class}</span>
                    )}
                  </div>
                  <div>
                    <strong className="text-slate-400 block text-[11px]">Confidence Variance:</strong>
                    <span className="font-mono font-bold text-purple-300">
                      {Math.abs((scanResultA.confidence - scanResultB.confidence) * 100).toFixed(1)}% difference
                    </span>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Scan A Side */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-cyan-400 uppercase">Scan A (Baseline)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">
                      {(scanResultA.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  {previewA && <img src={previewA} alt="Scan A" className="h-40 mx-auto rounded-xl object-contain border border-slate-800" />}
                  <div className="text-xl font-bold text-cyan-300">{scanResultA.predicted_class}</div>
                  <div className="text-xs text-slate-400">Risk: <strong className="text-rose-400">{scanResultA.risk_level}</strong></div>
                </div>

                {/* Scan B Side */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-purple-400 uppercase">Scan B (Follow-up)</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-mono">
                      {(scanResultB.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                  {previewB && <img src={previewB} alt="Scan B" className="h-40 mx-auto rounded-xl object-contain border border-slate-800" />}
                  <div className="text-xl font-bold text-purple-300">{scanResultB.predicted_class}</div>
                  <div className="text-xs text-slate-400">Risk: <strong className="text-rose-400">{scanResultB.risk_level}</strong></div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── SINGLE / BATCH MODES ────────────────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Container */}
          <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-4">
            <h2 className="text-base font-bold text-purple-300 flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-400" />
              {uploadMode === 'single' ? 'Upload Single Chest X-Ray Scan' : 'Batch Upload Chest X-Rays'}
            </h2>

            {uploadMode === 'single' ? (
              /* Single Image Dropzone */
              <div className="border-2 border-dashed border-cyber-border rounded-2xl p-6 text-center transition-all bg-slate-950/50">
                {previewUrl ? (
                  <div className="space-y-3">
                    <div className="relative inline-block group">
                      <img
                        src={previewUrl}
                        alt="Uploaded Chest X-Ray"
                        className="max-h-56 mx-auto rounded-2xl object-contain border border-cyber-border shadow-lg"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        setPrediction(null);
                      }}
                      className="text-xs text-rose-400 hover:underline block mx-auto font-semibold"
                    >
                      Remove & Choose Another
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer block py-6 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto text-2xl">
                      📁
                    </div>
                    <div>
                      <strong className="block text-sm text-slate-200">Click to upload Chest X-ray</strong>
                      <span className="text-xs text-slate-500">Supports JPEG, PNG, BMP, WebP (299 × 299 Input)</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSingleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            ) : (
              /* Batch Multiple Files Input */
              <div className="space-y-4">
                <div className="border-2 border-dashed border-purple-500/30 hover:border-purple-500/60 rounded-2xl p-6 text-center transition-all bg-slate-950/50">
                  <label className="cursor-pointer block py-6 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto text-2xl">
                      📂
                    </div>
                    <div>
                      <strong className="block text-sm text-slate-200">Click to select Multiple Chest X-rays</strong>
                      <span className="text-xs text-slate-500">Hold Ctrl / Shift to select multiple images</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleBatchFilesChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Batch Queue Previews */}
                {batchPreviews.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-slate-400 uppercase">
                      Queued Batch Files ({batchPreviews.length})
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-cyber-border">
                      {batchPreviews.map((prev, idx) => (
                        <div key={idx} className="relative group rounded-lg overflow-hidden border border-cyber-border bg-slate-900">
                          <img src={prev.url} alt={prev.name} className="w-full h-16 object-cover" />
                          <span className="text-[9px] block p-1 truncate text-slate-300 font-mono bg-slate-950/90">{prev.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Optional Patient Symptoms Checklist */}
            <div className="space-y-3 p-4 rounded-2xl bg-slate-950/70 border border-cyber-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Thermometer className="w-4 h-4 text-purple-300" />
                  Patient Symptoms Checklist (Optional)
                </label>
                <span className="text-[10px] text-slate-500">Select active symptoms</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SYMPTOMS.map((symptom) => {
                  const isSelected = selectedSymptoms.includes(symptom);
                  return (
                    <button
                      key={symptom}
                      type="button"
                      onClick={() => toggleSymptom(symptom)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300 shadow-sm'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}{symptom}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Run Analysis Button */}
            {uploadMode === 'single' ? (
              <button
                onClick={handleSingleAnalyze}
                disabled={!selectedFile || loading}
                className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-purple-500 to-pink-600 hover:scale-[1.01] active:scale-[0.99] hover:from-purple-400 hover:to-pink-500 text-white shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    <span>Run DenseNet121 AI Analysis</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleBatchAnalyze}
                disabled={batchFiles.length === 0 || loading}
                className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-purple-500 to-pink-600 hover:scale-[1.01] active:scale-[0.99] hover:from-purple-400 hover:to-pink-500 text-white shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              >
                {loading ? (
                  <span className="text-xs font-mono font-bold flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing Image {batchProgress} of {batchFiles.length}...
                  </span>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    <span>Process Batch ({batchFiles.length} Scans)</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Prediction Results Display */}
          <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-4">
            {uploadMode === 'single' ? (
              /* Single Result View */
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-400" />
                    AI Prediction Results
                  </h2>
                  {prediction && (
                    <button
                      onClick={() =>
                        handleDownloadPDF({
                          ...prediction,
                          top3_predictions: top3List,
                          symptoms: selectedSymptoms,
                        }, previewUrl)
                      }
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold hover:bg-purple-500/30 transition-all flex items-center gap-1.5 shadow-md"
                    >
                      <Download className="w-4 h-4" /> Download PDF Report
                    </button>
                  )}
                </div>

                {prediction ? (
                  <div className="space-y-5">
                    {/* Flags & Warnings */}
                    <div className="space-y-2">
                      {needsHumanReview && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center justify-between shadow-lg">
                          <span className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                            🚩 Needs Human Review
                          </span>
                          <span className="text-[10px] font-mono opacity-80 uppercase">High Uncertainty</span>
                        </div>
                      )}

                      {isLowConfidence && (
                        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Low Confidence Prediction – Please review carefully (&lt; 70%)</span>
                        </div>
                      )}
                    </div>

                    {/* Primary Hero */}
                    <div className="p-6 rounded-2xl bg-slate-950 border border-cyber-border flex items-center justify-between">
                      <div>
                        <div className="text-3xl font-extrabold text-purple-300">{prediction.predicted_class}</div>
                        <div className="text-xs text-slate-400 mt-1 font-mono">Primary Classification</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-extrabold font-mono text-purple-300">
                          {(prediction.confidence * 100).toFixed(1)}%
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                          Verified X-Ray
                        </span>
                      </div>
                    </div>

                    {/* Grad-CAM Heatmap Viewer */}
                    {(prediction.gradcam_image || previewUrl) && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <ScanEye className="w-4 h-4 text-purple-300" />
                          <span className="text-xs font-mono text-slate-400 uppercase">AI Visual Explanation — Grad-CAM</span>
                        </div>
                        {/* Tab Toggle */}
                        <div className="flex rounded-xl overflow-hidden border border-cyber-border bg-slate-950">
                          <button
                            onClick={() => setGradcamView('original')}
                            className={`flex-1 px-4 py-2 text-xs font-bold transition-all ${
                              gradcamView === 'original'
                                ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                            }`}
                          >
                            Original X-Ray
                          </button>
                          <button
                            onClick={() => setGradcamView('heatmap')}
                            disabled={!prediction.gradcam_image}
                            className={`flex-1 px-4 py-2 text-xs font-bold transition-all ${
                              gradcamView === 'heatmap'
                                ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                            } ${!prediction.gradcam_image ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            🔥 Grad-CAM Heatmap
                          </button>
                        </div>
                        {/* Image Display */}
                        <div className="relative rounded-xl overflow-hidden border border-cyber-border bg-slate-950 flex items-center justify-center p-2">
                          <img
                            src={gradcamView === 'heatmap' && prediction.gradcam_image ? prediction.gradcam_image : previewUrl}
                            alt={gradcamView === 'heatmap' ? 'Grad-CAM Heatmap' : 'Original X-Ray'}
                            className="max-h-56 rounded-lg object-contain"
                          />
                          {gradcamView === 'heatmap' && (
                            <div className="absolute bottom-2 left-2 right-2 text-center">
                              <span className="bg-purple-900/80 text-purple-200 text-[10px] font-mono px-2 py-0.5 rounded-full">
                                Warm regions = High model attention
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Top-3 Differential */}
                    <div className="space-y-3">
                      <div className="text-xs font-mono text-slate-400 uppercase flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-amber-400" />
                        Top-3 Differential Diagnostics
                      </div>

                      <div className="space-y-2">
                        {top3List.map((item) => (
                          <div
                            key={item.rank}
                            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                              item.rank === 1
                                ? 'bg-slate-900/90 border-purple-500/50 text-purple-200 font-bold shadow-md'
                                : 'bg-slate-950/60 border-cyber-border text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-purple-400 font-bold text-xs">#{item.rank}</span>
                              <span>{item.className}</span>
                            </div>
                            <span className="font-mono font-bold text-purple-300">
                              {(item.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick Link to Dedicated Visual Analytics Tab */}
                    <button
                      onClick={() => setUploadMode('analytics')}
                      className="w-full py-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-300 text-xs font-extrabold transition-all flex items-center justify-center gap-2 shadow-md hover:scale-[1.01]"
                    >
                      <BarChart3 className="w-4 h-4 text-purple-400" />
                      <span>View Advanced Visual Analytics & 5 Deep Learning Graphs ➔</span>
                    </button>
                  </div>
                ) : (
                  <div className="h-64 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <Activity className="w-10 h-10 mb-2 opacity-30 text-purple-400" />
                    <p className="text-xs">No analysis run yet.</p>
                  </div>
                )}
              </>
            ) : (
              /* Batch Results View */
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-400" />
                    Batch Processed Results ({batchResults.length})
                  </h2>
                  {batchResults.length > 0 && (
                    <button
                      onClick={handleDownloadBatchSummary}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold hover:bg-purple-500/30 transition-all flex items-center gap-1.5 shadow-md"
                    >
                      <Download className="w-4 h-4" /> Download Batch PDF Summary
                    </button>
                  )}
                </div>

                {batchResults.length > 0 ? (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {batchResults.map((item, idx) => (
                      <div key={idx} className="p-4 rounded-2xl bg-slate-950 border border-cyber-border flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center font-bold text-xs text-purple-300 font-mono">
                            #{idx + 1}
                          </div>
                          <div>
                            <strong className="block text-sm text-purple-300">{item.predicted_class}</strong>
                            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px] block">{item.fileName || item.filename}</span>
                          </div>
                        </div>

                        <div className="text-right space-y-1">
                          <div className="text-sm font-mono font-bold text-purple-300">
                            {((item.confidence || 0) * (item.confidence > 1 ? 1 : 100)).toFixed(1)}%
                          </div>
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                item.risk_level === 'HIGH'
                                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                                  : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                              }`}
                            >
                              {item.risk_level}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-64 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <Layers className="w-10 h-10 mb-2 opacity-30 text-purple-400" />
                    <p className="text-xs">No batch results processed yet.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      </TabTransition>
      </SmoothHeightContainer>

      {/* Database Saved Prediction Scans Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <History className="w-5 h-5 text-cyan-400" />
          My Saved Prediction Scans ({scanHistory.length})
        </h2>

        {scanHistory.length > 0 ? (
          <div className="bg-cyber-card border border-cyber-border rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-cyber-border bg-slate-950/60 text-[11px] uppercase font-mono text-slate-400">
                    <th className="py-3 px-4">Scan Date</th>
                    <th className="py-3 px-4">Predicted Class</th>
                    <th className="py-3 px-4">Reported Symptoms</th>
                    <th className="py-3 px-4">Confidence %</th>
                    <th className="py-3 px-4">Risk Level</th>
                    <th className="py-3 px-4">Human Review</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {scanHistory.map((scan) => (
                    <tr key={scan.id} className="table-row-hover transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {formatISTDate(scan.created_at)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-cyan-300">
                        {scan.predicted_class}
                      </td>
                      <td className="py-3.5 px-4 text-[11px]">
                        {scan.symptoms && Array.isArray(scan.symptoms) && scan.symptoms.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {scan.symptoms.map((sym, i) => (
                              <span key={i} className="px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                                {sym}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">None reported</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-purple-300">
                        {(scan.confidence * (scan.confidence > 1 ? 1 : 100)).toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                            scan.risk_level === 'HIGH'
                              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                              : scan.risk_level === 'MEDIUM'
                              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                              : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                          }`}
                        >
                          {scan.risk_level}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {scan.needs_human_review ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold text-[10px] border border-rose-500/40">
                            🚩 Needs Review
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Standard</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setActiveModalScan(scan)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-semibold hover:bg-cyan-500/20 text-xs flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(scan)}
                            className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold hover:bg-purple-500/20 text-xs flex items-center gap-1"
                            title="Download PDF Medical Report"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-8 border border-dashed border-cyber-border rounded-2xl text-center space-y-2 bg-slate-950/40">
            <Clock className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">No saved prediction scans in database yet.</p>
          </div>
        )}
      </div>

      {/* Past Scan Details Modal */}
      {activeModalScan && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-cyber-card border border-cyber-border rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setActiveModalScan(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg bg-slate-900 border border-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 text-xl font-bold">
                  🫁
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white">Scan Diagnostic Details</h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatISTDate(activeModalScan.created_at)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDownloadPDF(activeModalScan)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg"
              >
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>

            <div className="space-y-4 border-t border-cyber-border pt-4">
              {/* Scan Images Display */}
              {(activeModalScan.image_url || activeModalScan.gradcam_image) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-2xl bg-slate-950 border border-cyber-border">
                  {activeModalScan.image_url && (
                    <div className="space-y-1 text-center">
                      <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold">Original Radiograph</span>
                      <img src={activeModalScan.image_url} alt="X-Ray" className="max-h-48 mx-auto rounded-xl object-contain border border-slate-800" />
                    </div>
                  )}
                  {activeModalScan.gradcam_image && (
                    <div className="space-y-1 text-center">
                      <span className="text-[10px] font-mono text-purple-400 uppercase font-bold">Grad-CAM Heatmap</span>
                      <img src={activeModalScan.gradcam_image} alt="Grad-CAM" className="max-h-48 mx-auto rounded-xl object-contain border border-slate-800" />
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center p-4 rounded-xl bg-slate-950 border border-cyber-border">
                <div>
                  <div className="text-xs font-mono text-slate-400">Primary Diagnosis</div>
                  <strong className="text-xl text-cyan-400">{activeModalScan.predicted_class}</strong>
                </div>
                <div className="text-right">
                  <div className="text-xl font-mono text-purple-300 font-bold">
                    {(activeModalScan.confidence * (activeModalScan.confidence > 1 ? 1 : 100)).toFixed(1)}%
                  </div>
                  <span className="text-[10px] text-slate-400">Confidence</span>
                </div>
              </div>

              {/* Reported Symptoms */}
              <div className="space-y-1">
                <div className="text-xs font-mono text-slate-400 uppercase">Reported Symptoms</div>
                {activeModalScan.symptoms && activeModalScan.symptoms.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeModalScan.symptoms.map((s, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs">
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No symptoms reported for this scan.</p>
                )}
              </div>

              {/* Top-3 Ranked Predictions */}
              {activeModalScan.top3_predictions && (
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-slate-400 uppercase">Top-3 Differential Ranking</div>
                  <div className="space-y-1">
                    {activeModalScan.top3_predictions.map((t, idx) => (
                      <div key={idx} className="flex justify-between text-xs p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-300">#{idx + 1} {t.class || t.className}</span>
                        <span className="font-mono text-purple-300 font-bold">
                          {((t.confidence || 0) * (t.confidence > 1 ? 1 : 100)).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clinical Notes */}
              {activeModalScan.clinical_notes && (
                <div className="p-3 rounded-xl bg-slate-950 border border-purple-500/30 space-y-1">
                  <div className="text-[11px] font-mono text-purple-400 uppercase font-bold">Class-Specific Clinical Insights</div>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{activeModalScan.clinical_notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </GsapPage>
  );
};
