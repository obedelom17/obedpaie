export const config = { runtime: 'nodejs' }
import { requireAuth } from './_auth.js'
import { neon } from '@neondatabase/serverless'
import ExcelJS from 'exceljs'
import { calcIrppMensuel, calcBrut, calcPersonnesCharge } from './_payroll.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const auth = await requireAuth(req)
    const {
      employee_id, period_id,
      date_depart, date_fin_contrat,
      jours_conges_list, taux_conges_auto, taux_conges_manuel,
      avance, preavis, inclure_preavis, retenues_arrierees,
      regularisation_irpp
    } = req.body

    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)

    const [emp] = await sql`
      SELECT e.*, c.name as client_name
      FROM employees e JOIN clients c ON c.id = e.client_id
      WHERE e.id = ${employee_id}
    `
    if (!emp) return res.status(404).json({ error: 'Employé introuvable' })

    let vars = null
    if (period_id) {
      const rows = await sql`SELECT * FROM payroll_variables WHERE period_id=${period_id} AND employee_id=${employee_id}`
      vars = rows[0] || null
    }

    const brut = vars ? calcBrut(vars) : 0
    const pers = calcPersonnesCharge(emp.marital_status, emp.children_count)
    const irpp = calcIrppMensuel(brut, pers) + (regularisation_irpp || 0)

    const hireDate = emp.hire_date ? new Date(emp.hire_date) : null
    const departDate = date_depart ? new Date(date_depart) : new Date()
    const anneesTotal = hireDate ? Math.floor((departDate - hireDate) / (1000*60*60*24*365)) : 0
    const moisTotal = hireDate ? Math.floor((departDate - hireDate) / (1000*60*60*24*30)) : 0
    const anneesLabel = anneesTotal === 1 ? '1 an' : `${anneesTotal} ans`

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

    const data = {
      nom: `${emp.last_name} ${emp.first_name}`,
      client_nom: emp.client_name || '',
      depart: fmt(date_depart),
      date_embauche: fmt(emp.hire_date),
      fin_contrat: fmt(date_fin_contrat || date_depart),
      anciennete_label: anneesLabel,
      salaire_mois: brut,
      salaire_mois_label: `SALAIRE DU MOIS DE ${new Date(departDate).toLocaleDateString('fr-FR',{month:'long'}).toUpperCase()}`,
      base_conges: brut,
      jours_conges_list: jours_conges_list || [],
      taux_conges_auto: taux_conges_auto !== false,
      taux_conges_manuel: taux_conges_manuel || 0,
      irpp,
      avance: avance || 0,
      preavis: preavis || 0,
      inclure_preavis: !!inclure_preavis,
      retenues_arrierees: retenues_arrierees || 0,
    }

    const wb = new ExcelJS.Workbook()
    genSolde(wb, `${emp.last_name}`, data)

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Solde_${emp.last_name}_${fmt(date_depart).replace(/\//g,'-')}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('[export-solde]', e)
    res.status(e.message.includes('auth') ? 401 : 500).json({ error: e.message })
  }
}

function cal(size=11,bold=false) { return { name:'Calibri',size,bold } }

function genSolde(wb, sheetName, data) {
  const ws = wb.addWorksheet(sheetName)
  ws.getColumn(5).width = 20; ws.getColumn(6).width = 18; ws.getColumn(8).width = 14.29

  ws.mergeCells('B4:H5')
  const t = ws.getCell('B4')
  t.value = `   ${data.client_nom} : SOLDE DE TOUT COMPTE : ${data.nom}`
  t.font = cal(20,true); t.alignment = { horizontal:'center' }

  for (const [row, txt, halign] of [
    [6, `DEPART : ${data.depart}`, 'left'],
    [7, `DATE D'EMBAUCHE :  ${data.date_embauche}`, 'left'],
    [8, `FIN DE CONTRAT : ${data.fin_contrat}`, null],
    [9, `ANCIENNETE : ${data.anciennete_label}`, 'left'],
  ]) {
    ws.mergeCells(`B${row}:H${row}`)
    const c = ws.getCell(`B${row}`)
    c.value = txt; c.font = cal(14,true)
    if (halign) c.alignment = { horizontal:halign }
  }

  ws.mergeCells('F10:H10')
  ws.getCell('F10').value = 'CALCUL'; ws.getCell('F10').font = cal(16,false); ws.getCell('F10').alignment = { horizontal:'center' }
  ws.getCell('F11').value = 'BASE'; ws.getCell('F11').font = cal(16,false); ws.getCell('F11').alignment = { horizontal:'center' }
  ws.getCell('G11').value = 'TAUX'; ws.getCell('G11').font = cal(16,false); ws.getCell('G11').alignment = { horizontal:'center' }
  ws.getCell('H11').value = 'MONTANT'; ws.getCell('H11').font = cal(16,false); ws.getCell('H11').alignment = { horizontal:'center' }

  ws.mergeCells('B12:E12')
  ws.getCell('B12').value = `\u00a0 ${data.salaire_mois_label} `; ws.getCell('B12').font = cal(16,false); ws.getCell('B12').alignment = { horizontal:'left' }
  ws.getCell('H12').value = String(data.salaire_mois||0); ws.getCell('H12').font = cal(16,false); ws.getCell('H12').numFmt = '#,##0'

  ws.mergeCells('B13:E13')
  ws.getCell('B13').value = 'INDEMNITE DE CONGES ACQUIS NON JOUIR '; ws.getCell('B13').font = cal(16,false); ws.getCell('B13').alignment = { horizontal:'left' }
  ws.getCell('F13').value = String(data.base_conges||0); ws.getCell('F13').font = cal(16,false); ws.getCell('F13').alignment = { horizontal:'left' }
  const jours = data.jours_conges_list||[]
  if (data.taux_conges_auto && jours.length) {
    const nums = jours.map(([j])=>j).join('+')
    ws.getCell('G13').value = { formula:`(${nums})/30` }
  } else {
    ws.getCell('G13').value = String(data.taux_conges_manuel||0)
  }
  ws.getCell('G13').font = cal(16,false); ws.getCell('G13').alignment = { horizontal:'center' }
  ws.getCell('H13').value = { formula:'F13*G13' }; ws.getCell('H13').font = cal(16,false); ws.getCell('H13').numFmt = '#,##0.00'

  ws.mergeCells('B14:E14')
  ws.getCell('B14').value = ' TOTAL BRUT SOLDE DE TOUT COMPTE'; ws.getCell('B14').font = cal(16,true); ws.getCell('B14').alignment = { horizontal:'left' }
  ws.getCell('H14').value = { formula:'+H12+H13' }; ws.getCell('H14').font = cal(16,false); ws.getCell('H14').numFmt = '#,##0.00'

  ws.mergeCells('B15:E15')
  ws.getCell('B15').value = 'CNSS'; ws.getCell('B15').font = cal(16,false); ws.getCell('B15').alignment = { horizontal:'left' }
  ws.getCell('F15').value = '=(H14-140000)'; ws.getCell('F15').font = cal(16,true); ws.getCell('F15').alignment = { horizontal:'center' }
  ws.getCell('G15').value = '0.04'; ws.getCell('G15').font = cal(16,false); ws.getCell('G15').alignment = { horizontal:'center' }
  ws.getCell('H15').value = { formula:'+F15*G15' }; ws.getCell('H15').font = cal(16,false); ws.getCell('H15').numFmt = '#,##0'

  ws.mergeCells('B16:E16')
  ws.getCell('B16').value = 'AMU'; ws.getCell('B16').font = cal(16,false); ws.getCell('B16').alignment = { horizontal:'left' }
  ws.getCell('F16').value = '=(H14-140000)'; ws.getCell('F16').font = cal(16,true); ws.getCell('F16').alignment = { horizontal:'center' }
  ws.getCell('G16').value = '0.05'; ws.getCell('G16').font = cal(16,false); ws.getCell('G16').alignment = { horizontal:'center' }
  ws.getCell('H16').value = { formula:'+F16*G16' }; ws.getCell('H16').font = cal(16,false); ws.getCell('H16').alignment = { horizontal:'right' }; ws.getCell('H16').numFmt = '#,##0'

  ws.mergeCells('B17:E17')
  ws.getCell('B17').value = 'IRPP'; ws.getCell('B17').font = cal(16,false); ws.getCell('B17').alignment = { horizontal:'left' }
  ws.getCell('H17').value = data.irpp||0; ws.getCell('H17').font = cal(16,false); ws.getCell('H17').numFmt = '#,##0'

  let r = 18
  if (data.retenues_arrierees) {
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'TOTAL RETENUES ARRIEREES RESTANT A PRELEVE'; ws.getCell(`B${r}`).font = cal(16,false)
    ws.getCell(`H${r}`).value = data.retenues_arrierees; ws.getCell(`H${r}`).font = cal(16,false); ws.getCell(`H${r}`).numFmt = '#,##0'
    r++
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'TOTAL DES RETENUES'; ws.getCell(`B${r}`).font = cal(16,true)
    ws.getCell(`H${r}`).value = { formula:`H15+H16+H17+H${r-1}` }; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
  } else {
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'TOTAL DES RETENUES'; ws.getCell(`B${r}`).font = cal(16,true)
    ws.getCell(`H${r}`).value = { formula:'H15+H16+H17' }; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
  }
  const totR = r; r++

  ws.mergeCells(`B${r}:E${r}`)
  ws.getCell(`B${r}`).value = 'SALAIRE NET SOLDE DE TOUT COMPTE'; ws.getCell(`B${r}`).font = cal(16,true)
  ws.getCell(`H${r}`).value = { formula:`H14-H${totR}` }; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
  const netR = r; r++

  if (data.inclure_preavis) {
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'MONTANT DU PREAVIS'; ws.getCell(`B${r}`).font = cal(16,true)
    ws.getCell(`H${r}`).value = data.preavis||0; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
    const preR = r; r++
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'AVANCE SUR SOLDE DE TOUT COMPTE'; ws.getCell(`B${r}`).font = cal(16,true)
    ws.getCell(`H${r}`).value = data.avance||0; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
    const avR = r; r++
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'NET A PAYER'; ws.getCell(`B${r}`).font = cal(16,true)
    ws.getCell(`H${r}`).value = { formula:`H${netR}-H${preR}-H${avR}` }; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
    r++
  } else {
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'AVANCE SUR SOLDE DE TOUT COMPTE'; ws.getCell(`B${r}`).font = cal(16,true)
    ws.getCell(`H${r}`).value = data.avance||0; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
    const avR = r; r++
    ws.mergeCells(`B${r}:E${r}`)
    ws.getCell(`B${r}`).value = 'NET A PAYER'; ws.getCell(`B${r}`).font = cal(16,true)
    ws.getCell(`H${r}`).value = { formula:`H${netR}-H${avR}` }; ws.getCell(`H${r}`).font = cal(16,true); ws.getCell(`H${r}`).numFmt = '#,##0'
    r++
  }

  if (jours.length) {
    const note = `TAUX DE CONGES ACQUIS NON JOUIR= (${jours.map(([j,l])=>`${j} jours (${l})`).join(' + ')}) / 30 jours`
    ws.getCell(`B${r+2}`).value = note; ws.getCell(`B${r+2}`).font = cal(12,true)
  }
}
