/**
 * Client API — remplace @supabase/supabase-js
 * Toutes les requêtes passent par /api/* (Vercel Edge Functions → Neon)
 */

const BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  signIn: (email: string, password: string) =>
    request<{ token: string; user: any; org: any }>('POST', '/auth/signin', { email, password }),

  signUp: (email: string, password: string, orgName: string) =>
    request<{ token: string; user: any; org: any }>('POST', '/auth/signup', { email, password, orgName }),

  resetPassword: (email: string) =>
    request<{ message: string }>('POST', '/auth/reset-password', { email }),
}

// ── Clients ───────────────────────────────────────────────────────────────
export const clientsApi = {
  list: () => request<any[]>('GET', '/clients'),
  get: (id: string) => request<any>('GET', `/clients/${id}`),
  create: (data: any) => request<any>('POST', '/clients', data),
  update: (id: string, data: any) => request<any>('PUT', `/clients/${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/clients/${id}`),
}

// ── Employees ─────────────────────────────────────────────────────────────
export const employeesApi = {
  list: (clientId?: string) => request<any[]>('GET', `/employees${clientId ? `?client_id=${clientId}` : ''}`),
  get: (id: string) => request<any>('GET', `/employees/${id}`),
  create: (data: any) => request<any>('POST', '/employees', data),
  update: (id: string, data: any) => request<any>('PUT', `/employees/${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/employees/${id}`),
}

// ── Payroll Periods ───────────────────────────────────────────────────────
export const payrollApi = {
  listPeriods: (clientId?: string) => request<any[]>('GET', `/payroll${clientId ? `?client_id=${clientId}` : ''}`),
  getPeriod: (id: string) => request<any>('GET', `/payroll/${id}`),
  createPeriod: (data: any) => request<any>('POST', '/payroll', data),
  updatePeriod: (id: string, data: any) => request<any>('PATCH', `/payroll/${id}`, data),
  listVariables: (periodId: string) => request<any[]>('GET', `/payroll/variables?period_id=${periodId}`),
  saveVariables: (data: any) => request<any>('POST', '/payroll/variables', data),
}

// ── Salary Grids ──────────────────────────────────────────────────────────
export const salaryGridsApi = {
  list: () => request<any[]>('GET', '/salary-grids'),
  create: (data: any) => request<any>('POST', '/salary-grids', data),
  update: (id: string, data: any) => request<any>('PUT', `/salary-grids/${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/salary-grids/${id}`),
}

// ── Activity ──────────────────────────────────────────────────────────────
export const activityApi = {
  list: () => request<any[]>('GET', '/activity'),
  log: (action: string, details?: string) =>
    request<any>('POST', '/activity', { action, details }),
}

// ── Logo upload → Vercel Blob ─────────────────────────────────────────────
export async function uploadLogo(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const res = await fetch(`${BASE}/upload-logo`, {
    method: 'POST',
    headers: {
      'x-content-type': file.type,
      'x-filename': file.name,
    },
    body: arrayBuffer,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data.url
}
