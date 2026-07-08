/**
 * Client API — toutes les requêtes vers /api/* avec JWT Bearer token
 */

const BASE = '/api'
const TOKEN_KEY = 'elompaie_token'

// Token persisté en sessionStorage
export function setAuthToken(t: string | null) {
  if (t) sessionStorage.setItem(TOKEN_KEY, t)
  else sessionStorage.removeItem(TOKEN_KEY)
}

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  me: () => request<any>('GET', '/auth/me'),
}

// ── Clients ───────────────────────────────────────────────────────────────
export const clientsApi = {
  list: () => request<any[]>('GET', '/clients'),
  get: (id: string) => request<any>('GET', `/clients?id=${id}`),
  create: (data: any) => request<any>('POST', '/clients', data),
  update: (id: string, data: any) => request<any>('PUT', `/clients?id=${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/clients?id=${id}`),
}

// ── Employees ─────────────────────────────────────────────────────────────
export const employeesApi = {
  list: (clientId?: string) => request<any[]>('GET', `/employees${clientId ? `?client_id=${clientId}` : ''}`),
  get: (id: string) => request<any>('GET', `/employees?id=${id}`),
  create: (data: any) => request<any>('POST', '/employees', data),
  update: (id: string, data: any) => request<any>('PUT', `/employees?id=${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/employees?id=${id}`),
}

// ── Payroll ───────────────────────────────────────────────────────────────
export const payrollApi = {
  listPeriods: (clientId?: string) => request<any[]>('GET', `/payroll${clientId ? `?client_id=${clientId}` : ''}`),
  getPeriod: (id: string) => request<any>('GET', `/payroll?id=${id}`),
  createPeriod: (data: any) => request<any>('POST', '/payroll', data),
  updatePeriod: (id: string, data: any) => request<any>('PATCH', `/payroll?id=${id}`, data),
  listVariables: (periodId: string, employeeId?: string) =>
    request<any[]>('GET', `/payroll-variables?period_id=${periodId}${employeeId ? `&employee_id=${employeeId}` : ''}`),
  saveVariables: (data: any) => request<any>('POST', '/payroll-variables', data),
}

// ── Salary Grids ──────────────────────────────────────────────────────────
export const salaryGridsApi = {
  list: () => request<any[]>('GET', '/salary-grids'),
  create: (data: any) => request<any>('POST', '/salary-grids', data),
  update: (id: string, data: any) => request<any>('PUT', `/salary-grids?id=${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/salary-grids?id=${id}`),
}

// ── Activity ──────────────────────────────────────────────────────────────
export const activityApi = {
  list: () => request<any[]>('GET', '/activity'),
  log: (action: string, details?: string) => request<any>('POST', '/activity', { action, details }),
}

// ── Logo upload → Vercel Blob ─────────────────────────────────────────────
export async function uploadLogo(file: File): Promise<string> {
  const token = getToken()
  const arrayBuffer = await file.arrayBuffer()
  const headers: Record<string, string> = {
    'x-content-type': file.type,
    'x-filename': file.name,
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}/upload-logo`, { method: 'POST', headers, body: arrayBuffer })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data.url
}
