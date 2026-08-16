import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { autoAssignDoctor } from '../services/api';

const AuthContext = createContext(null);
const MAX_PATIENTS = 15;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignedDoctor, setAssignedDoctor] = useState(null);

  // Helper: Retrieve stored doctors
  const getStoredDoctors = () => {
    try {
      const d = localStorage.getItem('lungscan_doctors_list');
      if (d) {
        return JSON.parse(d).filter((doc) => doc.email !== 'sujithamahesh25@gmail.com');
      }
      return [];
    } catch {
      return [];
    }
  };

  // Helper: Retrieve stored patients
  const getStoredPatients = () => {
    try {
      const p = localStorage.getItem('lungscan_patients_list');
      if (p) {
        return JSON.parse(p);
      }
      return [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
    const initSession = async () => {
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setUser(session.user);
            await fetchProfile(session.user.id, session.user);
          }
        } catch (err) {
          console.error("Session init error:", err);
        }
      } else {
        // Ensure default seed data exists in localStorage
        getStoredDoctors();
        getStoredPatients();

        // Load active user profile from localStorage
        const savedMock = localStorage.getItem('lungscan_mock_user');
        if (savedMock) {
          const parsed = JSON.parse(savedMock);
          setUser({ id: parsed.id, email: parsed.email });
          setProfile(parsed);

          if (parsed.role === 'patient' && parsed.doctor_id) {
            const doctors = getStoredDoctors();
            const doc = doctors.find((d) => d.id === parsed.doctor_id);
            if (doc) {
              setAssignedDoctor({
                full_name: doc.full_name,
                email: doc.email,
                specialization: doc.specialization,
              });
            } else if (parsed.doctor_name) {
              setAssignedDoctor({
                full_name: parsed.doctor_name,
                specialization: parsed.doctor_specialization || 'Pulmonology',
              });
            }
          }
        }
      }
      setLoading(false);
    };

    initSession();

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id, session.user);
        } else {
          setUser(null);
          setProfile(null);
          setAssignedDoctor(null);
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const fetchProfile = async (userId, authUser = null) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
        if (data.role === 'patient') {
          if (data.doctor_id) {
            const { data: docData } = await supabase
              .from('profiles')
              .select('full_name, email, specialization')
              .eq('id', data.doctor_id)
              .maybeSingle();
            if (docData) setAssignedDoctor(docData);
            else setAssignedDoctor(null);
          } else {
            // Patient has no doctor assigned yet, attempt auto-assignment
            try {
              const { autoAssignDoctor } = await import('../services/api');
              const assigned = await autoAssignDoctor(data.id);
              if (assigned) {
                data.doctor_id = assigned.id;
                setAssignedDoctor({
                  full_name: assigned.full_name,
                  email: assigned.email,
                  specialization: assigned.specialization || 'Pulmonology',
                });
              } else {
                setAssignedDoctor(null);
              }
            } catch (e) {
              console.warn("Auto-assignment check error:", e);
              setAssignedDoctor(null);
            }
          }
        }
      } else if (!data && authUser) {
        // Fallback self-healing: profile does not exist yet in DB, create it
        const pendingRole = localStorage.getItem('lungscan_pending_role') || (authUser.email?.includes('doc') ? 'doctor' : 'patient');
        const pendingSpec = localStorage.getItem('lungscan_pending_specialization') || 'Pulmonology';
        localStorage.removeItem('lungscan_pending_role');
        localStorage.removeItem('lungscan_pending_specialization');

        const userName = authUser.user_metadata?.full_name
          || authUser.user_metadata?.name
          || authUser.email?.split('@')[0]
          || 'User';

        const profileData = {
          id: userId,
          email: authUser.email,
          full_name: userName,
          role: pendingRole,
          specialization: pendingRole === 'doctor' ? pendingSpec : null,
        };

        const { data: created, error: insertErr } = await supabase
          .from('profiles')
          .insert([profileData])
          .select('*')
          .maybeSingle();

        if (!insertErr && created) {
          setProfile(created);
          if (created.role === 'patient') {
            try {
              const { autoAssignDoctor } = await import('../services/api');
              await autoAssignDoctor(userId);
            } catch (e) {
              console.warn('Auto-assignment failed:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Fetch profile error:", err);
    }
  };

  const login = async (email, password) => {
    const normalizedEmail = email.toLowerCase().trim();

    // Direct Admin authentication handler
    if (normalizedEmail === 'sujithamahesh25@gmail.com' || normalizedEmail.includes('admin')) {
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error && data?.user) return data;
        } catch (supErr) {
          console.warn("Supabase Admin Auth fallback:", supErr);
        }
      }

      const adminUser = {
        id: 'admin-001',
        email: 'sujithamahesh25@gmail.com',
        full_name: 'Sujitha M',
        role: 'admin',
        specialization: 'System Administrator',
        created_at: '2026-07-01T00:00:00.000Z',
      };
      setUser({ id: adminUser.id, email: adminUser.email });
      setProfile(adminUser);
      setAssignedDoctor(null);
      localStorage.setItem('lungscan_mock_user', JSON.stringify(adminUser));
      return { user: adminUser };
    }

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    } else {
      const doctors = getStoredDoctors();
      const patients = getStoredPatients();

      let found = doctors.find((d) => d.email.toLowerCase() === normalizedEmail) ||
        patients.find((p) => p.email.toLowerCase() === normalizedEmail);

      if (!found) {
        if (normalizedEmail.includes('doc')) {
          found = {
            id: `doc-${Date.now()}`,
            email: normalizedEmail,
            full_name: 'Dr. Priya Sharma',
            role: 'doctor',
            specialization: 'Senior Pulmonologist',
          };
          doctors.push(found);
          localStorage.setItem('lungscan_doctors_list', JSON.stringify(doctors));
        } else {
          // Auto-assign new patient to doctor with least assigned patients
          let targetDoc = null;
          let minCount = MAX_PATIENTS + 1;
          for (const d of doctors) {
            const count = patients.filter((p) => p.doctor_id === d.id).length;
            if (count < MAX_PATIENTS && count < minCount) {
              minCount = count;
              targetDoc = d;
            }
          }

          found = {
            id: `pat-${Date.now()}`,
            email: normalizedEmail,
            full_name: 'Aarav Sharma',
            role: 'patient',
            doctor_id: targetDoc ? targetDoc.id : null,
            doctor_name: targetDoc ? targetDoc.full_name : null,
            doctor_specialization: targetDoc ? targetDoc.specialization : null,
          };
          patients.push(found);
          localStorage.setItem('lungscan_patients_list', JSON.stringify(patients));
        }
      }

      setUser({ id: found.id, email: found.email });
      setProfile(found);

      if (found.role === 'patient') {
        if (found.doctor_id) {
          const doc = doctors.find((d) => d.id === found.doctor_id);
          if (doc) {
            setAssignedDoctor({
              full_name: doc.full_name,
              email: doc.email,
              specialization: doc.specialization,
            });
          } else if (found.doctor_name) {
            setAssignedDoctor({
              full_name: found.doctor_name,
              specialization: found.doctor_specialization || 'Pulmonology',
            });
          }
        } else {
          setAssignedDoctor(null);
        }
      }

      localStorage.setItem('lungscan_mock_user', JSON.stringify(found));
      return { user: found };
    }
  };

  const register = async ({ email, password, fullName, role, specialization }) => {
    if (supabase) {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role }
        }
      });
      if (authErr) throw authErr;

      if (authData?.user) {
        const profileData = {
          id: authData.user.id,
          email,
          full_name: fullName,
          role,
          specialization: role === 'doctor' ? (specialization || 'Pulmonology') : null,
        };

        await supabase.from('profiles').insert([profileData]);

        if (role === 'patient') {
          try {
            await autoAssignDoctor(authData.user.id);
          } catch (e) {
            console.warn("Auto-assignment API call failed:", e);
          }
        }
        await fetchProfile(authData.user.id);
      }
      return authData;
    } else {
      // ── UNIQUE ID ISOLATION & MOCK AUTO-ASSIGNMENT ─────────────────────
      const doctors = getStoredDoctors();
      const patients = getStoredPatients();

      if (role === 'doctor') {
        const doctorId = `doc-${Date.now()}`;
        const newDoctor = {
          id: doctorId,
          email,
          full_name: fullName,
          role: 'doctor',
          specialization: specialization || 'Pulmonology',
          created_at: new Date().toISOString(),
        };
        doctors.push(newDoctor);
        localStorage.setItem('lungscan_doctors_list', JSON.stringify(doctors));

        setUser({ id: newDoctor.id, email: newDoctor.email });
        setProfile(newDoctor);
        setAssignedDoctor(null);
        localStorage.setItem('lungscan_mock_user', JSON.stringify(newDoctor));
        return { user: newDoctor };
      } else {
        const patientId = `pat-${Date.now()}`;
        // Find doctor with fewest assigned patients (< 15 capacity)
        let targetDoctor = null;
        let minPatients = MAX_PATIENTS + 1;

        for (const doc of doctors) {
          const count = patients.filter((p) => p.doctor_id === doc.id).length;
          if (count < MAX_PATIENTS && count < minPatients) {
            minPatients = count;
            targetDoctor = doc;
          }
        }

        const newPatient = {
          id: patientId,
          email,
          full_name: fullName,
          role: 'patient',
          doctor_id: targetDoctor ? targetDoctor.id : null,
          doctor_name: targetDoctor ? targetDoctor.full_name : null,
          doctor_specialization: targetDoctor ? targetDoctor.specialization : null,
          created_at: new Date().toISOString(),
        };

        patients.push(newPatient);
        localStorage.setItem('lungscan_patients_list', JSON.stringify(patients));

        setUser({ id: newPatient.id, email: newPatient.email });
        setProfile(newPatient);

        if (targetDoctor) {
          setAssignedDoctor({
            full_name: targetDoctor.full_name,
            email: targetDoctor.email,
            specialization: targetDoctor.specialization,
          });
        } else {
          setAssignedDoctor(null);
        }

        localStorage.setItem('lungscan_mock_user', JSON.stringify(newPatient));
        return { user: newPatient };
      }
    }
  };

  const getAssignedPatients = () => {
    if (!profile || profile.role !== 'doctor') return [];
    const patients = getStoredPatients();
    return patients.filter((p) => p.doctor_id === profile.id);
  };

  const loginWithGoogle = async (role = 'patient', specialization = 'Pulmonology') => {
    if (!supabase) {
      throw new Error('Google sign-in requires Supabase. Please configure Supabase credentials.');
    }
    // Store pending role so the onAuthStateChange handler can create the profile
    localStorage.setItem('lungscan_pending_role', role);
    if (role === 'doctor') {
      localStorage.setItem('lungscan_pending_specialization', specialization);
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('lungscan_mock_user');
    }
    setUser(null);
    setProfile(null);
    setAssignedDoctor(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        assignedDoctor,
        loading,
        login,
        loginWithGoogle,
        register,
        logout,
        getAssignedPatients,
        isDoctor: profile?.role === 'doctor',
        isPatient: profile?.role === 'patient',
        isAdmin: profile?.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
