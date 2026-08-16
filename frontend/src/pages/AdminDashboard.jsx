import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAdminStats,
  getAdminDoctors,
  updateDoctorStatus,
  getAdminPatients,
  reassignPatientDoctor,
  getAdminScans,
} from '../services/api';
import { generatePDFReport, formatISTDate } from '../utils/pdfGenerator';
import { decryptNotes } from '../utils/crypto';
import { GsapPage, GsapButton, GsapStaggerCards } from '../components/GsapWrapper';
import { AnimatedTabPill, SmoothHeightContainer } from '../components/MotionWrapper';
import {
  Shield,
  Users,
  Stethoscope,
  Activity,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Lock,
  Download,
  Settings,
  UserCheck,
  UserX,
  Sliders,
  ChevronRight,
  Database,
  Cpu,
} from 'lucide-react';

export const AdminDashboard = () => {
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'doctors', 'patients', 'scans', 'settings'
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingCapacityId, setEditingCapacityId] = useState(null);
  const [capacityInput, setCapacityInput] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Load all Admin Dashboard Data
  const loadAdminData = async () => {
    setLoading(true);

    try {
      const [sData, dData, pData, scData] = await Promise.all([
        getAdminStats(),
        getAdminDoctors(),
        getAdminPatients(),
        getAdminScans(),
      ]);

      // 1. Load doctors from API and local storage
      const doctorsMap = new Map();
      (dData || []).forEach((d) => {
        if (d.role === 'doctor' || d.id !== 'admin-001') {
          doctorsMap.set(d.id, d);
        }
      });
      let localDoctors = [];
      try {
        const storedD = localStorage.getItem('lungscan_doctors_list');
        if (storedD) localDoctors = JSON.parse(storedD);
      } catch (e) { }
      localDoctors.forEach((d) => {
        if (!doctorsMap.has(d.id) && d.id !== 'admin-001') {
          doctorsMap.set(d.id, d);
        }
      });
      const finalDoctors = Array.from(doctorsMap.values());

      // 2. Load patients from API and local storage
      const patientsMap = new Map();
      (pData || []).forEach((p) => {
        patientsMap.set(p.id, p);
      });
      let localPatients = [];
      try {
        const storedP = localStorage.getItem('lungscan_patients_list');
        if (storedP) localPatients = JSON.parse(storedP);
      } catch (e) { }
      localPatients.forEach((p) => {
        if (!patientsMap.has(p.id)) {
          patientsMap.set(p.id, p);
        }
      });

      const finalPatients = Array.from(patientsMap.values()).map((p) => {
        const docObj = finalDoctors.find((d) => d.id === p.doctor_id);
        return {
          ...p,
          doctor_info: p.doctor_info || (docObj ? {
            full_name: docObj.full_name,
            email: docObj.email,
            specialization: docObj.specialization
          } : null)
        };
      });

      // Recalculate assigned patients per doctor
      finalDoctors.forEach((doc) => {
        const count = finalPatients.filter((p) => p.doctor_id === doc.id).length;
        doc.assigned_patients = count;
        doc.max_capacity = doc.max_capacity || 15;
      });

      setDoctors(finalDoctors);
      setPatients(finalPatients);
      setScans(scData || []);

      // Calculate stats
      const totalUsers = finalDoctors.length + finalPatients.length + 1; // +1 Admin
      const totalCap = finalDoctors.reduce((acc, d) => acc + (d.max_capacity || 15), 0);
      const util = Math.round((finalPatients.length / Math.max(1, totalCap)) * 100);

      setStats({
        ...sData,
        total_users: totalUsers,
        total_doctors: finalDoctors.length,
        total_patients: finalPatients.length,
        total_capacity: totalCap,
        total_assigned: finalPatients.length,
        capacity_utilization: util,
      });
    } catch (err) {
      console.error('Error loading Admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // Show temporary action toast message
  const showToast = (msg) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(''), 4000);
  };

  // Toggle Doctor Active Status
  const handleToggleDoctorStatus = async (docId, currentStatus) => {
    try {
      await updateDoctorStatus(docId, { is_active: !currentStatus });
      showToast(`Doctor status updated to ${!currentStatus ? 'Active' : 'Inactive'}.`);
      loadAdminData();
    } catch (err) {
      console.error('Failed to toggle doctor status:', err);
    }
  };

  // Update Doctor Capacity
  const handleSaveCapacity = async (docId) => {
    const cap = parseInt(capacityInput, 10);
    if (isNaN(cap) || cap < 1) return;
    try {
      await updateDoctorStatus(docId, { max_capacity: cap });
      setEditingCapacityId(null);
      showToast(`Doctor capacity limit updated to ${cap} patients.`);
      loadAdminData();
    } catch (err) {
      console.error('Failed to update doctor capacity:', err);
    }
  };

  // Reassign Patient Doctor
  const handleReassign = async (patientId, newDoctorId) => {
    if (!newDoctorId) return;
    try {
      await reassignPatientDoctor(patientId, newDoctorId);

      // Sync local storage
      try {
        const storedP = localStorage.getItem('lungscan_patients_list');
        if (storedP) {
          const pList = JSON.parse(storedP);
          const docObj = doctors.find((d) => d.id === newDoctorId);
          const updated = pList.map((p) => {
            if (p.id === patientId) {
              return {
                ...p,
                doctor_id: newDoctorId,
                doctor_name: docObj ? docObj.full_name : p.doctor_name,
                doctor_specialization: docObj ? docObj.specialization : p.doctor_specialization,
              };
            }
            return p;
          });
          localStorage.setItem('lungscan_patients_list', JSON.stringify(updated));
        }
      } catch (e) {
        console.warn("Local storage reassign sync warning:", e);
      }

      showToast('Patient successfully reassigned to new physician.');
      loadAdminData();
    } catch (err) {
      console.error('Failed to reassign patient:', err);
    }
  };

  // Filtered lists
  const filteredDoctors = doctors.filter(
    (d) =>
      d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.toLowerCase().includes(search.toLowerCase()) ||
      d.specialization?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredPatients = patients.filter(
    (p) =>
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredScans = scans.filter(
    (s) =>
      s.predicted_class?.toLowerCase().includes(search.toLowerCase()) ||
      s.risk_level?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <GsapPage className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ── Admin Header Banner ───────────────────────────────────────────── */}
      <div className="p-8 rounded-3xl bg-cyber-card border border-cyber-border relative overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 flex items-center justify-center text-white text-3xl shadow-lg shadow-purple-500/20">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight">Admin Control Center</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
                  Super Admin Privileges
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Managing Platform-wide Doctors, Patients, Clinical Scans & Security Architecture
              </p>
            </div>
          </div>

          {/* Master Admin Info & Refresh */}
          <div className="flex items-center gap-3">
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-cyber-border text-right min-w-[240px]">
              <span className="text-[10px] font-mono text-purple-300 uppercase tracking-wider block">
                Primary Administrator
              </span>
              <strong className="block text-sm text-slate-100 font-bold">
                {profile?.full_name || 'BALAMURUGAN P G'}
              </strong>
              <span className="text-xs font-mono text-slate-400 block">
                {profile?.email || 'sujithamahesh25@gmail.com'}
              </span>
            </div>

            <button
              onClick={loadAdminData}
              disabled={loading}
              className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 transition-all shadow-lg disabled:opacity-50"
              title="Refresh System Data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Action Toast Alert */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between shadow-xl animate-fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            {actionSuccess}
          </span>
          <span className="text-[10px] font-mono opacity-80 uppercase">System Updated</span>
        </div>
      )}

      {/* ── Key Statistics Overview Cards ─────────────────────────────────── */}
      <GsapStaggerCards className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" keyTrigger={stats ? 'loaded' : 'loading'}>
        {/* Total Users */}
        <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-2 relative overflow-hidden hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase font-bold">Total System Users</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-300 border border-purple-500/30 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">{stats?.total_users || 0}</div>
          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="text-purple-300 font-semibold">{stats?.total_doctors || 0} Doctors</span>
            <span>·</span>
            <span className="text-cyan-300 font-semibold">{stats?.total_patients || 0} Patients</span>
          </div>
        </div>

        {/* Total Scans Processed */}
        <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-2 relative overflow-hidden hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase font-bold">Scans Processed</span>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-cyan-300 font-mono">{stats?.total_scans || 0}</div>
          <div className="text-[11px] text-slate-400">DenseNet121 AI Diagnoses Executed</div>
        </div>

        {/* Doctor Capacity Load */}
        <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-2 relative overflow-hidden hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase font-bold">Doctor Capacity Load</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-300 font-mono">
            {stats?.capacity_utilization || 0}%
          </div>
          <div className="text-[11px] text-slate-400">
            {stats?.total_assigned || 0} / {stats?.total_capacity || 0} slots assigned
          </div>
        </div>

        {/* High Risk Diagnostic Rate */}
        <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-2 relative overflow-hidden hover-lift">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400 uppercase font-bold">High Risk Alerts</span>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-300 border border-rose-500/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-rose-400 font-mono">{stats?.high_risk_scans || 0}</div>
          <div className="text-[11px] text-slate-400">Critical pulmonary pathologies flagged</div>
        </div>
      </GsapStaggerCards>

      {/* ── Tab Navigation & Search Bar ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="w-full overflow-x-auto no-scrollbar flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-950/80 border border-cyber-border backdrop-blur-xl relative flex-nowrap sm:flex-wrap">
          <button
            onClick={() => setActiveTab('doctors')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${activeTab === 'doctors' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {activeTab === 'doctors' && <AnimatedTabPill layoutId="adminTabPill" />}
            <Stethoscope className="w-4 h-4" />
            Doctors Management ({doctors.length})
          </button>

          <button
            onClick={() => setActiveTab('patients')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${activeTab === 'patients' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {activeTab === 'patients' && <AnimatedTabPill layoutId="adminTabPill" />}
            <Users className="w-4 h-4" />
            Patients Management ({patients.length})
          </button>

          <button
            onClick={() => setActiveTab('scans')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${activeTab === 'scans' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {activeTab === 'scans' && <AnimatedTabPill layoutId="adminTabPill" />}
            <Activity className="w-4 h-4" />
            Platform Scans ({scans.length})
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`relative shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-2 z-10 ${activeTab === 'settings' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {activeTab === 'settings' && <AnimatedTabPill layoutId="adminTabPill" />}
            <Settings className="w-4 h-4" />
            Security & System Settings
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users, email, class..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-cyber-border text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
          />
        </div>
      </div>

      {/* ── TAB 1: DOCTORS MANAGEMENT ─────────────────────────────────────── */}
      {(activeTab === 'overview' || activeTab === 'doctors') && (
        <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-purple-400" />
              Doctor Roster & Capacity Controls ({filteredDoctors.length})
            </h2>
            <span className="text-xs font-mono text-slate-400">
              Admin Status Override & Quota Management
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-cyber-border text-[11px] font-mono uppercase text-slate-400">
                  <th className="py-3 px-4">Doctor Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Specialization</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Capacity Load</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredDoctors.map((doc) => {
                  const assignedCount = doc.assigned_patients || 0;
                  const maxCap = doc.max_capacity || 15;
                  const isActive = doc.is_active !== false;

                  return (
                    <tr key={doc.id} className="table-row-hover transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-200 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 flex items-center justify-center font-bold text-xs">
                          🩺
                        </div>
                        {doc.full_name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{doc.email}</td>
                      <td className="py-3.5 px-4 text-purple-300 font-medium">{doc.specialization || 'Pulmonology'}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${isActive
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                            : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                            }`}
                        >
                          {isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {editingCapacityId === doc.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={capacityInput}
                              onChange={(e) => setCapacityInput(e.target.value)}
                              className="w-16 px-2 py-1 rounded bg-slate-900 border border-purple-500 text-xs text-white"
                              min="1"
                              max="100"
                            />
                            <button
                              onClick={() => handleSaveCapacity(doc.id)}
                              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-purple-300 font-bold">
                              {assignedCount} / {maxCap}
                            </span>
                            <button
                              onClick={() => {
                                setEditingCapacityId(doc.id);
                                setCapacityInput(String(maxCap));
                              }}
                              className="text-[10px] text-slate-500 hover:text-purple-300 underline"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleToggleDoctorStatus(doc.id, isActive)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ml-auto ${isActive
                            ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                            }`}
                        >
                          {isActive ? (
                            <>
                              <UserX className="w-3.5 h-3.5" /> Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5" /> Activate
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: PATIENTS MANAGEMENT & REASSIGNMENT ──────────────────────── */}
      {activeTab === 'patients' && (
        <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              Patient Management & Physician Reassignment ({filteredPatients.length})
            </h2>
            <span className="text-xs font-mono text-slate-400">
              Reassign Patients to Available Doctors
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-cyber-border text-[11px] font-mono uppercase text-slate-400">
                  <th className="py-3 px-4">Patient Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4">Current Assigned Physician</th>
                  <th className="py-3 px-4 text-right">Reassign Physician</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredPatients.map((pat) => {
                  const currentDocId = pat.doctor_id || '';
                  return (
                    <tr key={pat.id} className="table-row-hover transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-200">{pat.full_name}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{pat.email}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">
                        {formatISTDate(pat.created_at)}
                      </td>
                      <td className="py-3.5 px-4">
                        {pat.doctor_info ? (
                          <span className="text-purple-300 font-semibold flex items-center gap-1.5">
                            <Stethoscope className="w-3.5 h-3.5" />
                            {pat.doctor_info.full_name}
                          </span>
                        ) : (
                          <span className="text-amber-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <select
                          value={currentDocId}
                          onChange={(e) => handleReassign(pat.id, e.target.value)}
                          className="px-3 py-1.5 rounded-xl bg-slate-950 border border-cyber-border text-xs text-purple-300 font-semibold focus:outline-none focus:border-purple-500"
                        >
                          <option value="">Select Doctor...</option>
                          {doctors.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.full_name} ({d.assigned_patients || 0}/{d.max_capacity || 15})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: PLATFORM SCANS & ENCRYPTION AUDIT ────────────────────────── */}
      {activeTab === 'scans' && (
        <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-400" />
              Platform-Wide Diagnostic Scan Logs ({filteredScans.length})
            </h2>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
              <Lock className="w-3.5 h-3.5" /> AES-256 Decrypted View
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-cyber-border text-[11px] font-mono uppercase text-slate-400">
                  <th className="py-3 px-4">Scan Date (IST)</th>
                  <th className="py-3 px-4">Diagnosis</th>
                  <th className="py-3 px-4">Confidence %</th>
                  <th className="py-3 px-4">Risk Level</th>
                  <th className="py-3 px-4">Clinical Findings (AES Decrypted)</th>
                  <th className="py-3 px-4 text-right">PDF Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredScans.map((scan) => {
                  const decNotes = decryptNotes(scan.clinical_notes || '');
                  return (
                    <tr key={scan.id} className="table-row-hover transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {formatISTDate(scan.created_at)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-purple-300">{scan.predicted_class}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-purple-300">
                        {(scan.confidence * (scan.confidence > 1 ? 1 : 100)).toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${scan.risk_level === 'HIGH'
                            ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                            : scan.risk_level === 'MEDIUM'
                              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                              : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                            }`}
                        >
                          {scan.risk_level}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-md truncate text-slate-300" title={decNotes}>
                        {decNotes || 'No notes'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => generatePDFReport({ scan, pdfMode: 'combined' })}
                          className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 font-semibold hover:bg-purple-500/20 text-xs flex items-center gap-1 ml-auto"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: SECURITY & SYSTEM SETTINGS ─────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Encryption Security Card */}
          <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-purple-400" />
              AES-256-GCM Data Encryption Engine
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Patient clinical notes and sensitive diagnostic texts are encrypted using 256-bit Advanced Encryption Standard in Galois/Counter Mode (AES-GCM). Only authorized clinicians and system administrators possess decryption keys.
            </p>
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Encryption Status:</span>
                <span className="text-emerald-400 font-bold">ACTIVE & OPERATIONAL</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Algorithm:</span>
                <span className="text-purple-300 font-bold">AES-256-GCM / WebCrypto</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Backward Compatibility:</span>
                <span className="text-cyan-300 font-bold">Plaintext Fallback Parser</span>
              </div>
            </div>
          </div>

          {/* RLS & Database Policy Monitor */}
          <div className="p-6 rounded-3xl bg-cyber-card border border-cyber-border shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              Supabase Row-Level Security (RLS)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Row-Level Security is strictly enforced across `profiles` and `scans` tables. Non-recursive security definer functions guarantee Admin superuser access without circular dependency deadlocks.
            </p>
            <div className="p-4 rounded-2xl bg-slate-950 border border-cyber-border space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Profiles RLS:</span>
                <span className="text-emerald-400 font-bold">ENABLED (Non-Recursive)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Scans RLS:</span>
                <span className="text-emerald-400 font-bold">ENABLED (Non-Recursive)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Primary Admin:</span>
                <span className="text-purple-300 font-bold">sujithamahesh25@gmail.com</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </GsapPage>
  );
};
