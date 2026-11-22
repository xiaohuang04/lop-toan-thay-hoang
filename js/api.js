const TOKEN_KEY = 'edulab_2025_auth_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(url, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Lỗi máy chủ (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Auth & Profile
  me: () => request('/api/me'),
  login: (username, password) => request('/api/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/api/logout', { method: 'POST' }),
  updateProfile: (payload) => request('/api/profile', { method: 'PUT', body: payload }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  // Admin
  adminOverview: () => request('/api/admin/overview'),
  parseExam: (payload) => request('/api/admin/parse-exam', { method: 'POST', body: payload }),
  createExams: (examsOrExam) => request('/api/admin/exams', { method: 'POST', body: examsOrExam }),
  updateExam: (id, exam) => request(`/api/admin/exams/${encodeURIComponent(id)}`, { method: 'PUT', body: exam }),
  deleteExam: (id) => request(`/api/admin/exams/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createStudent: (student) => request('/api/admin/students', { method: 'POST', body: student }),
  updateStudent: (id, student) => request(`/api/admin/students/${encodeURIComponent(id)}`, { method: 'PUT', body: student }),
  deleteStudent: (id) => request(`/api/admin/students/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createAssignment: (asg) => request('/api/admin/assignments', { method: 'POST', body: asg }),
  updateAssignment: (id, asg) => request(`/api/admin/assignments/${encodeURIComponent(id)}`, { method: 'PUT', body: asg }),
  deleteAssignment: (id) => request(`/api/admin/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Classroom Newsfeed Posts & Files
  uploadFile: (payload) => request('/api/admin/files', { method: 'POST', body: payload }),
  deleteFile: (id) => request(`/api/admin/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createPost: (post) => request('/api/admin/posts', { method: 'POST', body: post }),
  updatePost: (id, post) => request(`/api/admin/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: post }),
  deletePost: (id) => request(`/api/admin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Supabase / Local Storage Quota Manager
  getStorageStats: () => request('/api/admin/storage'),
  cleanupOrphanFiles: () => request('/api/admin/storage/cleanup-orphans', { method: 'POST', body: {} }),

  // Student
  studentDashboard: () => request('/api/student/dashboard'),
  submitExam: (payload) => request('/api/student/submissions', { method: 'POST', body: payload }),

  // Interactive HTML Models
  getModels: () => request('/api/models'),
  uploadModel: (payload) => request('/api/models', { method: 'POST', body: payload }),
  updateModel: (id, payload) => request(`/api/models/${encodeURIComponent(id)}`, { method: 'PUT', body: payload }),
  deleteModel: (id) => request(`/api/models/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
