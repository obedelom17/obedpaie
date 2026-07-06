import { supabase } from './supabase'

export async function sendBulletinEmail(params: {
  to: string
  employeeName: string
  period: string
  pdfBase64: string
  cabinetName: string
  orgId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch SMTP config for this org
    const { data: orgData, error: orgErr } = await supabase
      .from('organizations')
      .select('smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_from_name')
      .eq('id', params.orgId)
      .maybeSingle()

    if (orgErr || !orgData?.smtp_host) {
      return { success: false, error: 'SMTP non configuré. Allez dans Paramètres > Configuration SMTP.' }
    }

    const { data, error } = await supabase.functions.invoke('send-bulletin-smtp', {
      body: { ...params, smtp: orgData },
    })

    if (error) return { success: false, error: error.message }
    if (data?.error) return { success: false, error: data.error }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
