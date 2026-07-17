export const config = { runtime: 'nodejs' }
import { requireAuth } from './_auth.js'
import { neon } from '@neondatabase/serverless'
import ExcelJS from 'exceljs'
import { calcIrppMensuel } from './_payroll.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const auth = await requireAuth(req)
    const { period_id, employee_id } = req.body
    if (!period_id || !employee_id) return res.status(400).json({ error: 'period_id et employee_id requis' })

    const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)

    // Récupérer données paie
    const [vars] = await sql`
      SELECT pv.*, 
        e.first_name, e.last_name, e.position, e.social_security_number,
        e.hire_date, e.phone, e.children_count, e.marital_status, e.category,
        c.name as client_name, c.nif as client_nif, c.num_employeur,
        pp.period_month, pp.period_year
      FROM payroll_variables pv
      JOIN employees e ON e.id = pv.employee_id
      JOIN payroll_periods pp ON pp.id = pv.period_id
      JOIN clients c ON c.id = pp.client_id
      WHERE pv.period_id = ${period_id} AND pv.employee_id = ${employee_id}
    `
    if (!vars) return res.status(404).json({ error: 'Variables de paie introuvables' })

    const mois_noms = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE']
    const mois_label = mois_noms[(vars.period_month||1)-1]
    const sheet_name = `${vars.last_name?.substring(0,3) || 'EMP'} ${mois_label.substring(0,4)} ${vars.period_year || ''}`

    // Calcul brut
    const brut = (vars.base_salary||0) + (vars.sursalaire||0) +
      (vars.indemnite_grossesse||0) + (vars.indemnite_fonction||0) +
      (vars.indemnite_communication||0) + (vars.indemnite_logement||0) +
      (vars.indemnite_repas||0) + (vars.indemnite_transport||0)

    const personnes_charge = (vars.marital_status === 'marie' ? 1 : 0) + (vars.children_count || 0)
    const irpp = calcIrppMensuel(brut, personnes_charge)
    const brut_imposable = brut - brut * 0.04 - brut * 0.05
    const base_irpp = Math.floor((brut_imposable - Math.min(brut_imposable, 10_000_000/12) * 0.28 - personnes_charge * 10_000) / 1000) * 1000

    // Construire rubriques
    const rubriques = []
    if (vars.base_salary) rubriques.push({ label: 'Salaire de Base', base: vars.base_salary, taux_ou_nb: 30 })
    if (vars.sursalaire) rubriques.push({ label: 'Sursalaire', base: vars.sursalaire, taux_ou_nb: 30 })

    // Ancienneté auto
    if (vars.hire_date) {
      const mois_anciennete = Math.floor((new Date() - new Date(vars.hire_date)) / (1000*60*60*24*30))
      const ann = Math.floor(mois_anciennete / 12)
      if (ann >= 2) {
        const base_anciennete = ((vars.base_salary||0) + (vars.sursalaire||0)) * ann * 0.02
        rubriques.push({ label: 'Ancienneté', base: Math.round(base_anciennete), taux_ou_nb: 30 })
      }
    }
    if (vars.indemnite_fonction) rubriques.push({ label: 'Indemnité de fonction', base: vars.indemnite_fonction, taux_ou_nb: 30 })
    if (vars.indemnite_logement) rubriques.push({ label: 'Indemnité de logement', base: vars.indemnite_logement, taux_ou_nb: 30 })
    if (vars.indemnite_transport) rubriques.push({ label: 'Indemnité de Transport', base: vars.indemnite_transport, taux_ou_nb: 30 })
    if (vars.indemnite_repas) rubriques.push({ label: 'Indemnité de repas', base: vars.indemnite_repas, taux_ou_nb: 30 })
    if (vars.indemnite_communication) rubriques.push({ label: 'Indemnité de communication', base: vars.indemnite_communication, taux_ou_nb: 30 })
    if (vars.indemnite_grossesse) rubriques.push({ label: 'Indemnité de grossesse', base: vars.indemnite_grossesse, taux_ou_nb: 30 })

    const data = {
      nom: `${vars.last_name} ${vars.first_name}`,
      n_assure: vars.social_security_number || '',
      nif: vars.client_nif || '',
      direction: vars.category || '',
      poste: vars.position || '',
      telephone: vars.phone || '',
      date_embauche: vars.hire_date ? new Date(vars.hire_date).toLocaleDateString('fr-FR') : '',
      personnes_charge,
      rubriques,
      avance_salaire: vars.avance_salaire || 0,
      irpp,
      irpp_base: base_irpp,
    }

    // Générer xlsx
    const wb = new ExcelJS.Workbook()
    genBulletin(wb, sheet_name, data)

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Bulletin_${vars.last_name}_${mois_label}_${vars.period_year}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (e) {
    console.error('[export-bulletin]', e)
    res.status(e.message.includes('auth') ? 401 : 500).json({ error: e.message })
  }
}

// ─── GÉNÉRATEUR BULLETIN (inline pour serverless) ─────────────────────────────
function S(s) { return { style: s } }
function cg(size=10,bold=false,italic=false) { return { name:'Century Gothic',size,bold,italic } }
function cal(size=11,bold=false) { return { name:'Calibri',size,bold } }
function bos(size=10,bold=false) { return { name:'Bookman Old Style',size,bold } }
function al(horizontal=null,vertical=null,wrapText=false) { return { horizontal,vertical,wrapText } }
function thin() { return { style:'thin' } }
function double() { return { style:'double' } }
function medium() { return { style:'medium' } }
function sc(ws,addr,val,opts={}) {
  const c = ws.getCell(addr)
  c.value = val
  if (opts.font) c.font = opts.font
  if (opts.alignment) c.alignment = opts.alignment
  if (opts.border) c.border = opts.border
  if (opts.numFmt) c.numFmt = opts.numFmt
}

function genBulletin(wb, sheetName, data) {
  const ws = wb.addWorksheet(sheetName)
  ws.columns = [
    { key:'A', width:18.29 }, { key:'B', width:35.0 },
    { key:'C', width:10.57 }, { key:'D', width:8.86 },
    { key:'E', width:9.29 }, { key:'F', width:11.43 }
  ]
  ws.pageSetup = { orientation:'portrait', paperSize:9,
    margins:{ left:0.7,right:0.7,top:0.75,bottom:0.75 } }

  ws.mergeCells('A13:B13')
  ws.mergeCells('A17:B17')
  ws.mergeCells('D11:F11')
  ws.getRow(11).height = 20.25

  const infos = [
    ['A18',' Nom & Prénoms : ','B18',data.nom,true],
    ['A19','N°Assuré :','B19',data.n_assure,true],
    ['A20','NIF:','B20',data.nif,true],
    ['A21','Direction/section:','B21',data.direction,true],
    ['A22','Poste/Fonction: ','B22',data.poste,true],
    ['A23','Téléphone:','B23',data.telephone,true],
    ['A24'," Date d'embauche: ",'B24',data.date_embauche,false],
    ['A25',' Pers à charge ','B25',data.personnes_charge,false],
  ]
  for (const [ca,la,cb,vb,bold] of infos) {
    sc(ws,ca,la,{font:cg(10,true),alignment:al('right','center'),border:{left:double()}})
    const vFont = ca==='A19'||ca==='A20' ? cal(11,bold) : cg(10,bold||ca==='A25')
    sc(ws,cb,vb,{font:vFont,alignment:al('left','center')})
  }

  const hdrs = ['Code','Rubriques','Base','Taux/NB','Retenues','Gains']
  const hCols = ['A','B','C','D','E','F']
  for (let i=0;i<hdrs.length;i++) {
    const brd = i===0 ? {left:double(),right:thin(),top:thin(),bottom:thin()} : {left:thin(),right:thin(),top:thin(),bottom:thin()}
    sc(ws,`${hCols[i]}26`,hdrs[i],{font:cg(10,true),alignment:al('center','center'),border:brd})
  }

  let row = 27
  const gainsRows = []
  for (const rub of (data.rubriques||[])) {
    sc(ws,`B${row}`,rub.label,{font:cg(10,false),alignment:al(null,'center'),border:{left:thin()}})
    if (rub.base!=null) sc(ws,`C${row}`,rub.base,{font:cg(10,false),alignment:al(null,'center'),border:{left:thin()},numFmt:'#,##0'})
    if (rub.taux_ou_nb!=null) sc(ws,`D${row}`,rub.taux_ou_nb,{font:cg(10,false),alignment:al('left','center'),border:{left:thin()}})
    ws.getCell(`F${row}`).value = { formula:`C${row}` }
    ws.getCell(`F${row}`).font = cg(10,false)
    ws.getCell(`F${row}`).alignment = al(null,'center')
    ws.getCell(`F${row}`).border = {left:thin()}
    ws.getCell(`F${row}`).numFmt = '#,##0'
    gainsRows.push(row)
    row++
  }
  for (let i=0;i<2;i++) {
    sc(ws,`D${row}`,30,{font:cg(10,false),alignment:al('left','center'),border:{left:thin()}})
    ws.getCell(`F${row}`).value = { formula:`IF(ISNUMBER(C${row}),C${row}*D${row}/30,0)` }
    ws.getCell(`F${row}`).numFmt = '#,##0'
    ws.getCell(`F${row}`).border = {left:thin()}
    row++
  }

  const brutRow = row
  sc(ws,`B${brutRow}`,'Salaire brut ',{font:cg(10,true),alignment:al(null,'center'),border:{left:thin()}})
  const gSum = gainsRows.map(r=>`F${r}`).join('+')
  ws.getCell(`F${brutRow}`).value = { formula:`IFERROR(${gSum},0)` }
  ws.getCell(`F${brutRow}`).font = cg(10,true)
  ws.getCell(`F${brutRow}`).numFmt = '#,##0'
  ws.getCell(`F${brutRow}`).border = {left:thin()}
  row++

  const cnssRow = row
  sc(ws,`B${row}`,'CNSS ',{font:cg(10,false),border:{left:thin()}})
  ws.getCell(`C${row}`).value={formula:`F${brutRow}`}; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()}
  sc(ws,`D${row}`,0.04,{numFmt:'0%',border:{left:thin()}})
  ws.getCell(`E${row}`).value={formula:`C${row}*D${row}`}; ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  const amuRow = row
  sc(ws,`B${row}`,'AMU',{font:cg(10,false),border:{left:thin()}})
  ws.getCell(`C${row}`).value={formula:`F${brutRow}`}; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()}
  sc(ws,`D${row}`,0.05,{numFmt:'0%',border:{left:thin()}})
  ws.getCell(`E${row}`).value={formula:`C${row}*D${row}`}; ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  const irppRow = row
  sc(ws,`B${row}`,'IRPP ',{font:cg(10,false),border:{left:thin()}})
  sc(ws,`C${row}`,data.irpp_base||'',{numFmt:'#,##0',border:{left:thin()}})
  sc(ws,`E${row}`,data.irpp||0,{numFmt:'#,##0',border:{left:thin()}})
  row++

  const totRetRow = row
  sc(ws,`B${row}`,'Total Retenues Légales',{font:cg(10,true),border:{left:{style:'medium'}}})
  ws.getCell(`E${row}`).value={formula:`E${cnssRow}+E${amuRow}+E${irppRow}`}; ws.getCell(`E${row}`).font=cg(10,true); ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  const netLegalRow = row
  sc(ws,`B${row}`,'Salaire Net (après Retenues Légales)',{font:cg(10,true),border:{left:thin()}})
  ws.getCell(`F${row}`).value={formula:`F${brutRow}-E${totRetRow}`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}
  row++

  const avRow = row
  sc(ws,`B${row}`,'Retenue avance sur salaire',{font:cg(10,false),border:{left:thin()}})
  sc(ws,`E${row}`,data.avance_salaire||0,{numFmt:'#,##0',border:{left:thin()}})
  row++

  const autRow = row
  sc(ws,`B${row}`,'Total Autres retenues',{font:cg(10,true),border:{left:thin()}})
  ws.getCell(`E${row}`).value={formula:`SUM(E${avRow}:E${avRow})`}; ws.getCell(`E${row}`).font=cg(10,true); ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  ws.mergeCells(`A${row}:E${row}`)
  sc(ws,`A${row}`,'NET A PAYER ',{font:cg(12,true),alignment:al('center','center'),border:{left:double(),right:thin(),top:thin(),bottom:thin()}})
  ws.getCell(`F${row}`).value={formula:`F${netLegalRow}-E${autRow}`}; ws.getCell(`F${row}`).font=cg(12,true); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}
  const netRow = row; row += 2

  const patRow = row
  ws.getRow(row).height=25.5
  sc(ws,`A${row}`,"Signature et Cachet de l'employeur",{font:bos(10,true),alignment:al(null,'center')})
  sc(ws,`E${row}`,'Charges Patronales',{font:cg(8,true,true),alignment:al(null,'center'),border:{left:{style:'medium'}}})
  ws.getCell(`F${row}`).value={formula:`F${brutRow}*17.5%`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).alignment=al('center','center'); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:{style:'medium'}}
  row++

  ws.getRow(row).height=25.5
  sc(ws,`E${row}`,'AMU Part Patronale',{font:cg(8,true,true),alignment:al(null,'center'),border:{left:{style:'medium'}}})
  ws.getCell(`F${row}`).value={formula:`E${amuRow}`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).alignment=al('center','center'); ws.getCell(`F${row}`).numFmt='#,##0'
  row++

  ws.getRow(row).height=25.5
  sc(ws,`E${row}`,'Masse Salariale',{font:cg(8,true,true),alignment:al(null,'center'),border:{left:{style:'medium'}}})
  ws.getCell(`F${row}`).value={formula:`F${brutRow}+F${patRow}+E${amuRow}`}; ws.getCell(`F${row}`).font=cg(9,true); ws.getCell(`F${row}`).alignment=al('center','center'); ws.getCell(`F${row}`).numFmt='#,##0'
  row++

  sc(ws,`D${row}`,"Signature de l'employé(e) ",{font:cg(10,true),alignment:al(null,'center')})
}
