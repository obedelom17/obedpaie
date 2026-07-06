import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { to, employeeName, period, pdfBase64, cabinetName } = await req.json()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'ObedPaie <onboarding@resend.dev>',
        to: [to],
        subject: `Bulletin de paie — ${period}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto">
            <h2 style="color:#4f46e5">Bulletin de paie — ${period}</h2>
            <p>Bonjour ${employeeName},</p>
            <p>Veuillez trouver ci-joint votre bulletin de paie pour la période <strong>${period}</strong>.</p>
            <p>Cordialement,<br/><strong>${cabinetName}</strong></p>
          </div>
        `,
        attachments: [{
          filename: `bulletin-${period.replace(' ', '-')}.pdf`,
          content: pdfBase64,
        }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return new Response(JSON.stringify({ error: data }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
})
