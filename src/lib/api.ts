const BASE = '/api'

export async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...opts })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

export const clientsApi = {
  list: () => request<any[]>('GET', '/clients'),
  get: (id: string) => request<any>('GET', `/clients?id=${id}`),
  create: (data: any) => request<any>('POST', '/clients', data),
  update: (id: string, data: any) => request<any>('PUT', `/clients?id=${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/clients?id=${id}`),
}

export const employeesApi = {
  list: (clientId?: string) => request<any[]>('GET', `/employees${clientId ? `?client_id=${clientId}` : ''}`),
  get: (id: string) => request<any>('GET', `/employees?id=${id}`),
  create: (data: any) => request<any>('POST', '/employees', data),
  update: (id: string, data: any) => request<any>('PUT', `/employees?id=${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/employees?id=${id}`),
}

export const payrollApi = {
  listPeriods: (clientId?: string) => request<any[]>('GET', `/payroll${clientId ? `?client_id=${clientId}` : ''}`),
  getPeriod: (id: string) => request<any>('GET', `/payroll?id=${id}`),
  createPeriod: (data: any) => request<any>('POST', '/payroll', data),
  updatePeriod: (id: string, data: any) => request<any>('PATCH', `/payroll?id=${id}`, data),
  listVariables: (periodId: string, employeeId?: string) =>
    request<any[]>('GET', `/payroll-variables?period_id=${periodId}${employeeId ? `&employee_id=${employeeId}` : ''}`),
  saveVariables: (data: any) => request<any>('POST', '/payroll-variables', data),
}

export const salaryGridsApi = {
  list: () => request<any[]>('GET', '/salary-grids'),
  create: (data: any) => request<any>('POST', '/salary-grids', data),
  update: (id: string, data: any) => request<any>('PUT', `/salary-grids?id=${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/salary-grids?id=${id}`),
}

export const activityApi = {
  list: () => request<any[]>('GET', '/activity'),
  log: (action: string, details?: string) => request<any>('POST', '/activity', { action, details }),
}

export async function uploadLogo(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const res = await fetch(`${BASE}/upload-logo`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-content-type': file.type, 'x-filename': file.name },
    body: arrayBuffer,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data.url
}
