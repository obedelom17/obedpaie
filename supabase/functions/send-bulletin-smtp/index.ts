import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { to, employeeName, period, pdfBase64, cabinetName, smtp } = await req.json()

    const client = new SmtpClient()
    await client.connectTLS({
      hostname: smtp.smtp_host,
      port: smtp.smtp_port || 587,
      username: smtp.smtp_user,
      password: smtp.smtp_pass,
    })

    await client.send({
      from: `${smtp.smtp_from_name || cabinetName} <${smtp.smtp_from || smtp.smtp_user}>`,
      to,
      subject: `Bulletin de paie — ${period}`,
      content: `Bonjour ${employeeName},\n\nVeuillez trouver ci-joint votre bulletin de paie pour la période ${period}.\n\nCordialement,\n${cabinetName}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:auto"><h2 style="color:#4f46e5">Bulletin de paie — ${period}</h2><p>Bonjour ${employeeName},</p><p>Veuillez trouver ci-joint votre bulletin de paie pour la période <strong>${period}</strong>.</p><p>Cordialement,<br/><strong>${cabinetName}</strong></p></div>`,
      attachments: [{
        filename: `bulletin-${period.replace(' ', '-')}.pdf`,
        content: pdfBase64,
        encoding: 'base64',
        contentType: 'application/pdf',
      }],
    })

    await client.close()
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
})
