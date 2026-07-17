export const config = { runtime: 'nodejs' }
import { requireAuth } from './_auth.js'
import { neon } from '@neondatabase/serverless'
import ExcelJS from 'exceljs'
import { calcIrppMensuel, calcBrut, calcPersonnesCharge } from './_payroll.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const auth = await requireAuth(req)
    const { period_id, avec_regularisation } = req.body
    if (!period_id) return res.status(400).json({ error: 'period_id requis' })

    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)

    const rows = await sql`
      SELECT pv.*,
        e.first_name, e.last_name, e.position, e.category,
        e.children_count, e.marital_status, e.responsable, e.pole,
        c.name as client_name,
        pp.period_month, pp.period_year
      FROM payroll_variables pv
      JOIN employees e ON e.id = pv.employee_id
      JOIN payroll_periods pp ON pp.id = pv.period_id
      JOIN clients c ON c.id = pp.client_id
      WHERE pv.period_id = ${period_id}
      ORDER BY e.last_name
    `
    if (!rows.length) return res.status(404).json({ error: 'Aucune donnée pour cette période' })

    const mois_noms = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE']
    const p = rows[0]
    const mois = mois_noms[(p.period_month||1)-1]
    const annee = p.period_year || ''
    const client = p.client_name || ''

    const employes = rows.map(v => {
      const brut = calcBrut(v)
      const pers = calcPersonnesCharge(v.marital_status, v.children_count)
      const irpp = calcIrppMensuel(brut, pers)
      const cnss_s = Math.round(brut * 0.04)
      const amu_s = Math.round(brut * 0.05)
      const net = brut - cnss_s - amu_s - irpp - (v.avance_salaire||0) - (v.remboursement_pret||0) - (v.deduction_forfaitaire||0)
      return {
        nom: `${v.last_name} ${v.first_name}`,
        responsable: v.responsable || '',
        poste: v.position || '',
        pole: v.pole || '',
        brut_imposable: brut,
        irpp,
        net_payer: Math.round(net),
        regularisation_irpp: v.regularisation_irpp || 0,
      }
    })

    const wb = new ExcelJS.Workbook()

    const suffix = avec_regularisation ? 'AVEC REGULARISATION' : 'SANS REGULARISATION'
    const title = `${client}: ETAT DES RETENUES ET SALAIRES NETS A PAYER ${mois} ${annee} ${suffix}`
    const sheetName = `${mois.substring(0,4)} ${annee}${avec_regularisation ? ' REGUL' : ''}`

    genEtatCharges(wb, sheetName, title, employes, !!avec_regularisation)

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Etat_Charges_${mois}_${annee}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('[export-etat-charges]', e)
    res.status(e.message.includes('auth') ? 401 : 500).json({ error: e.message })
  }
}

function thin() { return { style:'thin' } }
function cal(size=11,bold=false) { return { name:'Calibri',size,bold } }

function genEtatCharges(wb, sheetName, title, employes, avecRegularisation) {
  const ws = wb.addWorksheet(sheetName)
  const nColIdx = avecRegularisation ? 16 : 14
  const lastCol = avecRegularisation ? 'P' : 'N'

  ws.getColumn(1).width = 3.86
  ws.getColumn(2).width = 53.43
  ws.getColumn(3).width = 20
  ws.getColumn(4).width = 41.57
  ws.getColumn(5).width = 16.86
  ws.getColumn(6).width = 15.57
  ws.getColumn(7).width = 23.29
  ws.getColumn(8).width = 16.71
  ws.getColumn(9).width = 16.57
  ws.getColumn(10).width = 23.0
  ws.getColumn(11).width = 19.57
  ws.getColumn(12).width = 13.14
  ws.getColumn(13).width = 28.0
  ws.getColumn(14).width = 15.57
  if (avecRegularisation) { ws.getColumn(15).width = 20; ws.getColumn(16).width = 15.57 }

  // Titre fusionné
  ws.mergeCells(`A1:${lastCol}1`)
  const t = ws.getCell('A1'); t.value = title
  t.font = cal(20,true); t.alignment = { horizontal:'center' }
  ws.getRow(1).height = 30

  // En-têtes
  const headers = avecRegularisation
    ? ['N°','Nom et Prénoms','Responsable','Poste','Pole','Salaire brut','Salaire brut imposable','CNSS Salarié 4%','AMU Salarié 5%','CNSS Patronale 17,5%','AMU Patronale 5%','IRPP Salarié','REGULARISATION IRPP','IRPP A PAYER','TOTAL RETENUES SALARIES','NET A PAYER']
    : ['N°','Nom et Prénoms','Responsable','Poste','Pole','Salaire brut','Salaire brut imposable','CNSS Salarié 4%','AMU Salarié 5%','CNSS Patronale 17,5%','AMU Patronale 5%','IRPP Salarié','TOTAL RETENUES SALARIES','NET A PAYER']

  for (let ci=1; ci<=headers.length; ci++) {
    const c = ws.getRow(2).getCell(ci)
    c.value = headers[ci-1]
    c.font = cal(12,true)
    c.alignment = { horizontal:'center', wrapText:true }
    c.border = { left:thin(),right:thin(),top:thin(),bottom:thin() }
  }
  ws.getRow(2).height = 40

  // Données
  for (let i=0; i<employes.length; i++) {
    const r = i+3; const emp = employes[i]
    const baseVals = [i+1, emp.nom, emp.responsable, emp.poste, emp.pole]
    for (let ci=1; ci<=5; ci++) {
      const c = ws.getRow(r).getCell(ci)
      c.value = baseVals[ci-1]; c.font = cal(11,false)
    }

    const g = emp.brut_imposable; const irpp = emp.irpp; const net = emp.net_payer
    let vals
    if (avecRegularisation) {
      vals = [
        { ci:6, val:{ formula:`P${r}+O${r}` } },
        { ci:7, val:g },
        { ci:8, val:{ formula:`G${r}*4%` } },
        { ci:9, val:{ formula:`G${r}*5%` } },
        { ci:10, val:{ formula:`G${r}*17.5%` } },
        { ci:11, val:{ formula:`G${r}*5%` } },
        { ci:12, val:irpp },
        { ci:13, val:emp.regularisation_irpp||0 },
        { ci:14, val:{ formula:`L${r}+M${r}` } },
        { ci:15, val:{ formula:`H${r}+I${r}+N${r}` } },
        { ci:16, val:net, font:cal(12,false) },
      ]
    } else {
      vals = [
        { ci:6, val:{ formula:`N${r}+M${r}` } },
        { ci:7, val:g },
        { ci:8, val:{ formula:`G${r}*4%` } },
        { ci:9, val:{ formula:`G${r}*5%` } },
        { ci:10, val:{ formula:`G${r}*17.5%` } },
        { ci:11, val:{ formula:`G${r}*5%` } },
        { ci:12, val:irpp },
        { ci:13, val:{ formula:`H${r}+I${r}+L${r}` } },
        { ci:14, val:net, font:cal(12,false) },
      ]
    }
    for (const { ci, val, font } of vals) {
      const c = ws.getRow(r).getCell(ci)
      c.value = val; c.font = font||cal(11,false); c.numFmt = '#,##0'
    }
  }

  // Total
  const tr = employes.length+3
  ws.getRow(tr).getCell(2).value = 'TOTAL'
  ws.getRow(tr).getCell(2).font = cal(12,true)
  const e = tr-1
  for (let ci=6; ci<=nColIdx; ci++) {
    const lc = String.fromCharCode(64+ci)
    const c = ws.getRow(tr).getCell(ci)
    c.value = { formula:`SUM(${lc}3:${lc}${e})` }
    c.font = cal(12,true); c.border = { left:thin(),right:thin(),top:thin(),bottom:thin() }; c.numFmt = '#,##0'
  }

  // Récapitulatif
  let rr = tr+3
  const recap = [
    ['CNSS PART SALARIALE à Payer', `SUM(H3:H${e})+SUM(I3:I${e})`],
    ['CNSS PART PATRONALE à Payer', `SUM(J3:J${e})`],
    ['Total CNSS', `SUM(H3:H${e})+SUM(I3:I${e})+SUM(J3:J${e})+SUM(K3:K${e})`],
    avecRegularisation
      ? ['IRPP à payer', `SUM(N3:N${e})`]
      : ['IRPP à payer', `SUM(L3:L${e})`],
    avecRegularisation
      ? ['Montant Global à payer', `SUM(J3:J${e})+SUM(K3:K${e})+SUM(H3:H${e})+SUM(I3:I${e})+SUM(N3:N${e})`]
      : ['Montant Global à payer', `SUM(J3:J${e})+SUM(K3:K${e})+SUM(H3:H${e})+SUM(I3:I${e})+SUM(L3:L${e})`],
  ]
  for (const [label, formula] of recap) {
    ws.getRow(rr).getCell(3).value = label; ws.getRow(rr).getCell(3).font = cal(12,true)
    ws.getRow(rr).getCell(4).value = { formula }; ws.getRow(rr).getCell(4).numFmt = '#,##0'
    rr++
  }
}
