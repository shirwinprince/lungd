import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDoctorPatients, getDoctorCapacity } from '../services/api';
import { supabase } from '../services/supabase';
import { generatePDFReport, formatISTDate } from '../utils/pdfGenerator';
import { PredictionAnalyticsVisualizer } from '../components/PredictionAnalyticsVisualizer';
import { GsapPage, GsapModal, GsapStaggerCards, GsapButton } from '../components/GsapWrapper';
import { AnimatedTabPill } from '../components/MotionWrapper';
import { Stethoscope, Users, Activity, FileText, CheckCircle2, AlertTriangle, ShieldAlert, Search, Calendar, Mail, History, Award, Eye, X, Thermometer, Download, Layers, Flame, FileSpreadsheet } from 'lucide-react';

export const DoctorDashboard = () => {
  const { profile, getAssignedPatients } = useAuth();
  const [search, setSearch] = useState('');
  const [dbPatients, setDbPatients] = useState([]);
  const [capacityInfo, setCapacityInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPatientModal, setSelectedPatientModal] = useState(null);
  const [openPdfMenuScanId, setOpenPdfMenuScanId] = useState(null);
  const [modalTab, setModalTab] = useState('scans'); // 'scans', 'analytics'
  const [selectedScanForAnalytics, setSelectedScanForAnalytics] = useState(null);

  // Fetch doctor assigned patients & capacity from Database
  const fetchDoctorData = async () => {
    if (!profile?.id) return;
    setLoading(true);

    try {
      if (supabase) {
        // Query assigned patients from Supabase
        const { data: patientsData } = await supabase
          .from('profiles')
          .select('*')
          .eq('doctor_id', profile.id)
          .eq('role', 'patient');

        if (patientsData) {
          for (let p of patientsData) {
            const { data: scanData } = await supabase
              .from('scans')
              .select('*')
              .eq('patient_id', p.id)
              .order('created_at', { ascending: false });

            p.scans = scanData || [];
            p.latest_scan = scanData && scanData.length > 0 ? scanData[0] : null;
          }
          setDbPatients(patientsData);
        }

        // Query capacity from Supabase profiles count
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact' })
          .eq('doctor_id', profile.id)
          .eq('role', 'patient');

        setCapacityInfo({
          assigned_patients: count || 0,
          max_patients: 15,
        });
        setLoading(false);
        return;
      }

      // API backend query
      const [patientsRes, capacityRes] = await Promise.all([
        getDoctorPatients(profile.id).catch(() => []),
        getDoctorCapacity().catch(() => []),
      ]);

      setDbPatients(patientsRes || []);
      const docCap = (capacityRes || []).find((d) => d.id === profile.id);
      if (docCap) {
        setCapacityInfo(docCap);
      }
    } catch (err) {
      console.warn("Could not fetch doctor data from DB:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorData();
  }, [profile]);

  const handleDownloadPDF = (patient, scanData, pdfMode = 'combined') => {
    generatePDFReport({
      scan: scanData,
      imageSrc: scanData?.image_url,
      gradcamSrc: scanData?.gradcam_image,
      patientName: patient?.full_name || 'Patient User',
      doctorName: profile?.full_name || 'Attending Physician',
      doctorSpecialization: profile?.specialization || 'Pulmonology',
      pdfMode,
    });
    setOpenPdfMenuScanId(null);
  };

  // Combined DB patients with fallback context patients
  const contextPatients = getAssignedPatients();
  const assignedPatients = dbPatients.length > 0 ? dbPatients : contextPatients;
  const assignedCount = capacityInfo ? capacityInfo.assigned_patients : assignedPatients.length;
  const maxCapacity = 15;
  const capacityPercent = (assignedCount / maxCapacity) * 100;

  const filteredPatients = assignedPatients.filter(
    (p) =>
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <GsapPage className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="p-8 rounded-3xl bg-cyber-card border border-cyber-border relative overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-500 to-pink-600 flex items-center justify-center text-white text-3xl shadow-lg shadow-purple-500/20">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight">{profile?.full_name || 'Dr. Priya Sharma'}</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold">
                  {profile?.specialization || 'Senior Pulmonologist'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Doctor Medical Portal · Managing Assigned Chest Radiography Cases
              </p>
            </div>
          </div>

          {/* Capacity Meter */}
          <div className="w-full md:w-72 p-4 rounded-2xl bg-slate-950/80 border border-cyber-border">
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="text-slate-400 font-mono uppercase">Database Capacity</span>
              <strong className="text-purple-300 font-mono">{assignedCount} / {maxCapacity} Patients</strong>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  assignedCount >= 15
                    ? 'bg-rose-500'
                    : assignedCount >= 10
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-cyan-500 to-purple-500'
                }`}
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-2 text-right">
              {maxCapacity - assignedCount} slots available for auto-assignment
            </p>
          </div>
        </div>
      </div>

      {/* Main Patient Directory Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              Assigned Patient Roster ({filteredPatients.length})
            </h2>
            <p className="text-xs text-slate-400">Patients automatically paired to your pulmonology quota</p>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by patient name or email..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-slate-950 border border-cyber-border text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Patient Table */}
        {filteredPatients.length > 0 ? (
          <div className="bg-cyber-card border border-cyber-border rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-cyber-border bg-slate-950/60 text-[11px] uppercase font-mono text-slate-400">
                    <th className="py-3 px-4">Patient Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Latest Scan</th>
                    <th className="py-3 px-4">Diagnosis</th>
                    <th className="py-3 px-4">Risk Level</th>
                    <th className="py-3 px-4 text-right">Doctor Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyber-border text-xs">
                  {filteredPatients.map((patient) => {
                    const scan = patient.latest_scan || (patient.scans && patient.scans[0]) || null;
                    return (
                      <tr key={patient.id} className="table-row-hover transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-200">
                          {patient.full_name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {patient.email}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {scan ? formatISTDate(scan.created_at) : 'No scans yet'}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-cyan-300">
                          {scan ? scan.predicted_class : '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          {scan ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                scan.risk_level === 'HIGH'
                                  ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                                  : scan.risk_level === 'MEDIUM'
                                  ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                                  : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                              }`}
                            >
                              {scan.risk_level}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Pending Scan</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2 relative">
                            <button
                              onClick={() => setSelectedPatientModal(patient)}
                              className="px-3 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold hover:bg-purple-500/20 text-xs flex items-center gap-1"
                            >
                              <History className="w-3.5 h-3.5" /> Scans ({patient.scans?.length || 0})
                            </button>
                            {scan && (
                              <div className="relative">
                                <button
                                  onClick={() => setOpenPdfMenuScanId(openPdfMenuScanId === scan.id ? null : scan.id)}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold hover:bg-cyan-500/20 text-xs flex items-center gap-1"
                                >
                                  <Download className="w-3.5 h-3.5" /> PDF Options ▾
                                </button>

                                {openPdfMenuScanId === scan.id && (
                                  <div className="absolute right-0 mt-1 w-48 bg-slate-950 border border-cyber-border rounded-xl shadow-2xl p-1.5 z-50 text-left space-y-1">
                                    <div className="text-[9px] font-mono uppercase text-slate-500 px-2 py-1">Doctor Export Format</div>
                                    <button
                                      onClick={() => handleDownloadPDF(patient, scan, 'xray_only')}
                                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-xs text-cyan-300 flex items-center gap-2 font-medium"
                                    >
                                      📷 X-Ray Only PDF
                                    </button>
                                    <button
                                      onClick={() => handleDownloadPDF(patient, scan, 'gradcam_only')}
                                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 text-xs text-purple-300 flex items-center gap-2 font-medium"
                                    >
                                      🔥 Grad-CAM PDF
                                    </button>
                                    <button
                                      onClick={() => handleDownloadPDF(patient, scan, 'combined')}
                                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-xs text-white font-bold flex items-center gap-2"
                                    >
                                      📑 Combined (Both) PDF
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-12 border border-dashed border-cyber-border rounded-2xl text-center space-y-3 bg-slate-950/40">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-300">No Patients Assigned Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              When a new patient registers on LungScan AI, they will automatically be assigned to you in the database until your capacity reaches 15 patients.
            </p>
          </div>
        )}
      </div>

      {/* Patient Scan History Modal for Doctors */}
      <GsapModal isOpen={!!selectedPatientModal} onClose={() => setSelectedPatientModal(null)}>
        {selectedPatientModal && (
          <>
            <button
              onClick={() => setSelectedPatientModal(null)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg bg-slate-900 border border-slate-800 z-20"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 text-xl font-bold">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-white">{selectedPatientModal?.full_name}</h3>
                  <span className="text-xs text-slate-400 font-mono">{selectedPatientModal?.email}</span>
                </div>
              </div>

              {/* Doctor Modal Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-cyber-border backdrop-blur-xl relative">
                <button
                  onClick={() => setModalTab('scans')}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors flex items-center gap-1.5 z-10 ${
                    modalTab === 'scans' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {modalTab === 'scans' && <AnimatedTabPill layoutId="doctorModalTabPill" />}
                  <History className="w-3.5 h-3.5" />
                  Scans & Reports ({selectedPatientModal?.scans?.length || 0})
                </button>
                <button
                  onClick={() => {
                    if (!selectedScanForAnalytics && selectedPatientModal?.scans?.length > 0) {
                      setSelectedScanForAnalytics(selectedPatientModal.scans[0]);
                    }
                    setModalTab('analytics');
                  }}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors flex items-center gap-1.5 z-10 ${
                    modalTab === 'analytics' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {modalTab === 'analytics' && <AnimatedTabPill layoutId="doctorModalTabPill" />}
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                  Visual Analytics
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {modalTab === 'analytics' ? (
                <PredictionAnalyticsVisualizer
                  prediction={selectedScanForAnalytics || (selectedPatientModal.scans && selectedPatientModal.scans[0])}
                  title={`Clinical AI Visual Telemetry — ${selectedPatientModal.full_name}`}
                />
              ) : (
                <>
                  <h4 className="text-xs font-mono uppercase text-purple-400 font-bold flex items-center gap-1.5">
                    <History className="w-4 h-4" /> Patient Scan History ({selectedPatientModal.scans?.length || 0})
                  </h4>

                  {selectedPatientModal.scans && selectedPatientModal.scans.length > 0 ? (
                    <div className="space-y-4">
                      {selectedPatientModal.scans.map((scan) => (
                        <div
                          key={scan.id}
                          className="p-5 rounded-2xl bg-slate-950 border border-cyber-border space-y-4"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <strong className="text-base text-cyan-300 block">{scan.predicted_class}</strong>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {formatISTDate(scan.created_at)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right space-y-1">
                                <span className="text-sm font-mono font-bold text-purple-300 block">
                                  {(scan.confidence * (scan.confidence > 1 ? 1 : 100)).toFixed(1)}%
                                </span>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                    scan.risk_level === 'HIGH'
                                      ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                                      : scan.risk_level === 'MEDIUM'
                                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                                      : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                                  }`}
                                >
                                  {scan.risk_level}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Both Images Side-by-Side Display for Doctor */}
                          {(scan.image_url || scan.gradcam_image) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-slate-900 border border-slate-800">
                              {scan.image_url && (
                                <div className="space-y-1 text-center">
                                  <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold">📷 Original X-Ray</span>
                                  <img src={scan.image_url} alt="X-Ray" className="max-h-40 mx-auto rounded-lg object-contain border border-slate-800" />
                                </div>
                              )}
                              {scan.gradcam_image && (
                                <div className="space-y-1 text-center">
                                  <span className="text-[10px] font-mono text-purple-400 uppercase font-bold">🔥 Grad-CAM Heatmap</span>
                                  <img src={scan.gradcam_image} alt="Grad-CAM" className="max-h-40 mx-auto rounded-lg object-contain border border-slate-800" />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Quick Link to Dedicated Visual Analytics Tab */}
                          <button
                            onClick={() => {
                              setSelectedScanForAnalytics(scan);
                              setModalTab('analytics');
                            }}
                            className="w-full py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-300 text-xs font-bold transition-all flex items-center justify-center gap-2"
                          >
                            <Activity className="w-4 h-4 text-purple-400" />
                            <span>View 5 Advanced Visual Analytics & Graphs ➔</span>
                          </button>

                          {/* Doctor PDF Download Options Bar */}
                          <div className="p-3 rounded-xl bg-slate-900/90 border border-purple-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <span className="text-xs font-mono text-purple-300 font-bold">Doctor PDF Export Options:</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => handleDownloadPDF(selectedPatientModal, scan, 'xray_only')}
                                className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 flex items-center gap-1.5"
                              >
                                📷 X-Ray Only
                              </button>
                              <button
                                onClick={() => handleDownloadPDF(selectedPatientModal, scan, 'gradcam_only')}
                                className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold hover:bg-purple-500/20 flex items-center gap-1.5"
                              >
                                🔥 Grad-CAM Only
                              </button>
                              <button
                                onClick={() => handleDownloadPDF(selectedPatientModal, scan, 'combined')}
                                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-xs font-bold shadow-md flex items-center gap-1.5"
                              >
                                📑 Combined (Both)
                              </button>
                            </div>
                          </div>

                          {/* Reported Symptoms */}
                          {scan.symptoms && scan.symptoms.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono text-slate-400 uppercase">Reported Symptoms:</span>
                              <div className="flex flex-wrap gap-1">
                                {scan.symptoms.map((sym, idx) => (
                                  <span key={idx} className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold border border-cyan-500/30">
                                    ✓ {sym}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Clinical Notes */}
                          {scan.clinical_notes && (
                            <div className="p-3 rounded-xl bg-slate-900/80 text-xs text-slate-300 border border-slate-800 leading-relaxed font-sans whitespace-pre-line">
                              {scan.clinical_notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                      No prediction scans recorded for this patient yet.
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </GsapModal>
    </GsapPage>
  );
};
