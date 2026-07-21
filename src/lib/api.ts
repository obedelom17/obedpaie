const BASE = '/api'

export async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...opts })
  if (res.status === 401) {
    // Session expirée → rediriger vers /auth
    window.location.href = '/auth'
    throw new Error('Session expirée')
  }
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
  if (res.status === 401) {
    window.location.href = '/auth'
    throw new Error('Session expirée')
  }
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

export const clientsApi = {
  list:   ()              => request<any[]>('GET',  '/clients'),
  get:    (id: string)    => request<any>  ('GET',  `/clients?id=${id}`),
  create: (d: any)        => request<any>  ('POST', '/clients', d),
  update: (id: string, d: any) => request<any>('PUT', `/clients?id=${id}`, d),
  delete: (id: string)    => request<any>  ('DELETE', `/clients?id=${id}`),
}

export const employeesApi = {
  list:   (clientId?: string) => request<any[]>('GET', `/employees${clientId ? `?client_id=${clientId}` : ''}`),
  get:    (id: string)        => request<any>  ('GET', `/employees?id=${id}`),
  create: (d: any)            => request<any>  ('POST', '/employees', d),
  update: (id: string, d: any) => request<any>('PUT', `/employees?id=${id}`, d),
  delete: (id: string)        => request<any>  ('DELETE', `/employees?id=${id}`),
}

export const payrollApi = {
  listPeriods: (clientId?: string) => request<any[]>('GET', `/payroll${clientId ? `?client_id=${clientId}` : ''}`),
  getPeriod:   (id: string)        => request<any>  ('GET', `/payroll?id=${id}`),
  createPeriod: (d: any)           => request<any>  ('POST', '/payroll', d),
  updatePeriod: (id: string, d: any) => request<any>('PATCH', `/payroll?id=${id}`, d),
  listVariables: (periodId: string, empId?: string) =>
    request<any[]>('GET', `/payroll-variables?period_id=${periodId}${empId ? `&employee_id=${empId}` : ''}`),
  saveVariables: (d: any) => request<any>('POST', '/payroll-variables', d),
}

export const salaryGridsApi = {
  list:   ()             => request<any[]>('GET',    '/salary-grids'),
  create: (d: any)       => request<any>  ('POST',   '/salary-grids', d),
  update: (id: string, d: any) => request<any>('PUT', `/salary-grids?id=${id}`, d),
  delete: (id: string)   => request<any>  ('DELETE', `/salary-grids?id=${id}`),
}

export const activityApi = {
  list:   ()       => request<any[]>('GET',  '/activity'),
  log:    (d: any) => request<any>  ('POST', '/activity', d),
}

export async function uploadLogo(file: File): Promise<string> {
  const res = await fetch('/api/upload-logo', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'x-content-type': file.type,
      'x-filename': file.name,
    },
    body: file,
  })
  if (res.status === 401) { window.location.href = '/auth'; throw new Error('Session expirée') }
  if (!res.ok) throw new Error('Erreur upload logo')
  const data = await res.json()
  return data.url
}
