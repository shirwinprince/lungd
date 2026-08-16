import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const predictXRay = async (imageFile, patientId = null, doctorId = null, symptoms = []) => {
  const formData = new FormData();
  formData.append('file', imageFile);
  if (patientId) formData.append('patient_id', patientId);
  if (doctorId) formData.append('doctor_id', doctorId);
  if (symptoms && symptoms.length > 0) {
    formData.append('symptoms', JSON.stringify(symptoms));
  }

  const response = await apiClient.post('/predict', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getPatientScans = async (patientId) => {
  const response = await apiClient.get(`/api/scans/patient?patient_id=${patientId}`);
  return response.data;
};

export const getDoctorPatients = async (doctorId) => {
  const response = await apiClient.get(`/api/doctors/patients?doctor_id=${doctorId}`);
  return response.data;
};

export const getDoctorCapacity = async () => {
  const response = await apiClient.get('/api/doctors/capacity');
  return response.data;
};

export const autoAssignDoctor = async (patientId) => {
  const response = await apiClient.post(`/api/patients/assign-doctor?patient_id=${patientId}`);
  return response.data;
};

// ── Admin API Service Calls ──────────────────────────────────────────────────
export const getAdminStats = async () => {
  const response = await apiClient.get('/api/admin/stats');
  return response.data;
};

export const getAdminDoctors = async () => {
  const response = await apiClient.get('/api/admin/doctors');
  return response.data;
};

export const updateDoctorStatus = async (doctorId, updateData) => {
  const response = await apiClient.put(`/api/admin/doctors/${doctorId}`, updateData);
  return response.data;
};

export const getAdminPatients = async () => {
  const response = await apiClient.get('/api/admin/patients');
  return response.data;
};

export const reassignPatientDoctor = async (patientId, newDoctorId) => {
  const response = await apiClient.put(`/api/admin/patients/${patientId}/reassign`, { new_doctor_id: newDoctorId });
  return response.data;
};

export const getAdminScans = async () => {
  const response = await apiClient.get('/api/admin/scans');
  return response.data;
};
