const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY || ''

export async function sendBulletinEmail(params: {
  to: string
  employeeName: string
  period: string
  pdfBase64: string
  cabinetName: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!RESEND_API_KEY) return { success: false, error: 'Clé RESEND_API_KEY manquante dans les variables Vercel.' }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${params.cabinetName} <onboarding@resend.dev>`,
        to: [params.to],
        subject: `Bulletin de paie – ${params.period}`,
        html: `<p>Bonjour ${params.employeeName},</p><p>Veuillez trouver ci-joint votre bulletin de paie pour la période <strong>${params.period}</strong>.</p><p>Cordialement,<br/>${params.cabinetName}</p>`,
        attachments: [{
          filename: `bulletin-${params.period}.pdf`,
          content: params.pdfBase64,
        }],
      }),
    })
    const data = await res.json()
    if (!res.ok) return { success: false, error: data.message || JSON.stringify(data) }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
