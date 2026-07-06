import { supabase } from './supabase'

export async function sendBulletinEmail(params: {
  to: string
  employeeName: string
  period: string
  pdfBase64: string
  cabinetName: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-bulletin', { body: params })
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
