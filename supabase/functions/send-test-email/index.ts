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
    const { smtp } = await req.json()
    const client = new SmtpClient()
    await client.connectTLS({ hostname: smtp.smtp_host, port: smtp.smtp_port || 587, username: smtp.smtp_user, password: smtp.smtp_pass })
    await client.send({
      from: `${smtp.smtp_from_name || 'ObedPaie'} <${smtp.smtp_from || smtp.smtp_user}>`,
      to: smtp.smtp_user,
      subject: 'Test SMTP — ObedPaie',
      content: 'Configuration SMTP correcte. Les bulletins de paie seront envoyés depuis cette adresse.',
    })
    await client.close()
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }
})
