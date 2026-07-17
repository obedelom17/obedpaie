/**
 * Router principal ElomPaie — 1 seule fonction Vercel
 * Routes: /api/clients /api/employees /api/payroll /api/payroll-variables
 *         /api/salary-grids /api/activity /api/upload-logo
 *         /api/auth/me /api/auth/signup-org /api/auth/repair-org /api/auth/debug
 *         /api/export-bulletin /api/export-etat-charges /api/export-solde
 */
export const config = { runtime: 'nodejs' }

import { requireAuth } from './_auth.js'
import { sql } from './_db.js'
import { neon } from '@neondatabase/serverless'
import { calcIrppMensuel, calcBrut, calcPersonnesCharge } from './_payroll.js'
import { put } from '@vercel/blob'
import ExcelJS from 'exceljs'

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
async function authMe(req, res) {
  try {
    if (!NEON_AUTH_BASE_URL) throw new Error('NEON_AUTH_BASE_URL non configuré')
    const sessionRes = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
      headers: { cookie: req.headers?.cookie || '' },
      signal: AbortSignal.timeout(5000),
    })
    if (!sessionRes.ok) return res.status(401).json({ error: 'Session invalide' })
    const session = await sessionRes.json()
    const userId = session?.user?.id
    if (!userId) return res.status(401).json({ error: 'Non authentifié' })
    const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
    const rows = await db`SELECT up.organization_id, o.name as org_name FROM user_profiles up LEFT JOIN organizations o ON o.id = up.organization_id WHERE up.user_id = ${userId}`
    const row = rows[0]
    return res.status(200).json({ userId, email: session.user.email, org: row?.organization_id ? { id: row.organization_id.toString(), name: row.org_name } : null })
  } catch (e) { return res.status(500).json({ error: e.message }) }
}

async function authRepairOrg(req, res) {
  try {
    if (!NEON_AUTH_BASE_URL) return res.status(500).json({ error: 'NEON_AUTH_BASE_URL manquant' })
    const sessionRes = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
      headers: { cookie: req.headers?.cookie || '' }, signal: AbortSignal.timeout(5000),
    })
    if (!sessionRes.ok) return res.status(401).json({ error: 'Non authentifié' })
    const session = await sessionRes.json()
    const userId = session?.user?.id
    if (!userId) return res.status(401).json({ error: 'Session vide' })
    const { orgName } = req.body || {}
    const name = orgName || session.user?.email?.split('@')[0] || 'Cabinet'
    const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
    const existing = await db`SELECT up.organization_id, o.name FROM user_profiles up LEFT JOIN organizations o ON o.id = up.organization_id WHERE up.user_id = ${userId}`
    if (existing.length && existing[0].organization_id) return res.status(200).json({ ok: true, org: { id: existing[0].organization_id, name: existing[0].name }, already: true })
    const orgs = await db`INSERT INTO organizations (name) VALUES (${name}) RETURNING id::text, name`
    const org = orgs[0]
    await db`INSERT INTO user_profiles (user_id, organization_id) VALUES (${userId}, ${org.id}::uuid) ON CONFLICT (user_id) DO UPDATE SET organization_id = ${org.id}::uuid`
    return res.status(200).json({ ok: true, org })
  } catch (e) { return res.status(500).json({ error: e.message }) }
}

async function authSignupOrg(req, res) {
  try {
    const auth = await requireAuth(req)
    const { orgName } = req.body
    if (!orgName?.trim()) return res.status(400).json({ error: 'orgName requis' })
    const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
    if (auth.orgId) {
      const orgs = await db`SELECT id::text, name FROM organizations WHERE id::text = ${auth.orgId}`
      if (orgs.length) return res.status(200).json({ ok: true, org: { id: orgs[0].id, name: orgs[0].name } })
    }
    const orgs = await db`INSERT INTO organizations (name) VALUES (${orgName.trim()}) RETURNING id::text, name`
    const org = orgs[0]
    await db`INSERT INTO user_profiles (user_id, organization_id) VALUES (${auth.userId}, ${org.id}::uuid) ON CONFLICT (user_id) DO UPDATE SET organization_id = ${org.id}::uuid`
    return res.status(200).json({ ok: true, org })
  } catch (e) {
    const status = e.message.includes('auth') || e.message.includes('authentif') ? 401 : 500
    return res.status(status).json({ error: e.message })
  }
}

async function authDebug(req, res) {
  const info = { env: { NEON_AUTH_BASE_URL: NEON_AUTH_BASE_URL ? '✓' : '✗', DATABASE_URL: process.env.DATABASE_URL ? '✓' : '✗', POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL ? '✓' : '✗' }, cookie: req.headers?.cookie ? req.headers.cookie.substring(0, 100) + '...' : 'AUCUN', session: null, userProfile: null, error: null }
  try {
    const sessionRes = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, { headers: { cookie: req.headers?.cookie || '' }, signal: AbortSignal.timeout(5000) })
    info.sessionStatus = sessionRes.status
    const session = await sessionRes.json()
    info.session = session?.user ? { id: session.user.id, email: session.user.email } : null
    if (session?.user?.id) {
      const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
      const rows = await db`SELECT up.user_id, up.organization_id, o.name as org_name FROM user_profiles up LEFT JOIN organizations o ON o.id = up.organization_id WHERE up.user_id = ${session.user.id}`
      info.userProfile = rows[0] || 'AUCUN PROFIL'
    }
  } catch (e) { info.error = e.message }
  return res.status(200).json(info)
}

// ─── EXPORTS EXCEL ────────────────────────────────────────────────────────────
function thin() { return { style: 'thin' } }
function double_() { return { style: 'double' } }
function medium_() { return { style: 'medium' } }
function cg(size=10,bold=false,italic=false) { return { name:'Century Gothic',size,bold,italic } }
function cal(size=11,bold=false) { return { name:'Calibri',size,bold } }
function bos(size=10,bold=false) { return { name:'Bookman Old Style',size,bold } }
function sc(ws,addr,val,opts={}) { const c=ws.getCell(addr); c.value=val; if(opts.font)c.font=opts.font; if(opts.alignment)c.alignment=opts.alignment; if(opts.border)c.border=opts.border; if(opts.numFmt)c.numFmt=opts.numFmt }

function genBulletin(wb, sheetName, data) {
  const ws = wb.addWorksheet(sheetName)
  ws.columns = [{ key:'A',width:18.29 },{ key:'B',width:35 },{ key:'C',width:10.57 },{ key:'D',width:8.86 },{ key:'E',width:9.29 },{ key:'F',width:11.43 }]
  ws.pageSetup = { orientation:'portrait', paperSize:9, margins:{ left:0.7,right:0.7,top:0.75,bottom:0.75 } }
  ws.mergeCells('A13:B13'); ws.mergeCells('A17:B17'); ws.mergeCells('D11:F11'); ws.getRow(11).height=20.25
  const infos = [['A18',' Nom & Prénoms : ','B18',data.nom,true],['A19','N°Assuré :','B19',data.n_assure,false],['A20','NIF:','B20',data.nif,false],['A21','Direction/section:','B21',data.direction,true],['A22','Poste/Fonction: ','B22',data.poste,true],['A23','Téléphone:','B23',data.telephone,true],['A24'," Date d'embauche: ",'B24',data.date_embauche,false],['A25',' Pers à charge ','B25',data.personnes_charge,false]]
  for (const [ca,la,cb,vb,bold] of infos) {
    sc(ws,ca,la,{font:cg(10,true),alignment:{horizontal:'right',vertical:'center'},border:{left:double_()}})
    sc(ws,cb,vb,{font:cg(10,bold),alignment:{horizontal:'left',vertical:'center'}})
  }
  for (let i=0;i<6;i++) {
    const col=['A','B','C','D','E','F'][i]; const h=['Code','Rubriques','Base','Taux/NB','Retenues','Gains'][i]
    const brd = i===0 ? {left:double_(),right:thin(),top:thin(),bottom:thin()} : {left:thin(),right:thin(),top:thin(),bottom:thin()}
    sc(ws,`${col}26`,h,{font:cg(10,true),alignment:{horizontal:'center',vertical:'center'},border:brd})
  }
  let row=27; const gainsRows=[]
  for (const rub of (data.rubriques||[])) {
    sc(ws,`B${row}`,rub.label,{font:cg(10,false),alignment:{vertical:'center'},border:{left:thin()}})
    if (rub.base!=null) { ws.getCell(`C${row}`).value=rub.base; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()} }
    if (rub.taux_ou_nb!=null) { ws.getCell(`D${row}`).value=rub.taux_ou_nb; ws.getCell(`D${row}`).border={left:thin()} }
    ws.getCell(`F${row}`).value={formula:`C${row}`}; ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}
    gainsRows.push(row); row++
  }
  for (let i=0;i<2;i++) {
    ws.getCell(`D${row}`).value=30; ws.getCell(`D${row}`).border={left:thin()}
    ws.getCell(`F${row}`).value={formula:`IF(ISNUMBER(C${row}),C${row}*D${row}/30,0)`}; ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}; row++
  }
  const brutRow=row
  sc(ws,`B${brutRow}`,'Salaire brut ',{font:cg(10,true),alignment:{vertical:'center'},border:{left:thin()}})
  ws.getCell(`F${brutRow}`).value={formula:`IFERROR(${gainsRows.map(r=>`F${r}`).join('+')},0)`}; ws.getCell(`F${brutRow}`).font=cg(10,true); ws.getCell(`F${brutRow}`).numFmt='#,##0'; ws.getCell(`F${brutRow}`).border={left:thin()}; row++
  const cnssRow=row
  sc(ws,`B${row}`,'CNSS ',{font:cg(10,false),border:{left:thin()}})
  ws.getCell(`C${row}`).value={formula:`F${brutRow}`}; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()}
  ws.getCell(`D${row}`).value=0.04; ws.getCell(`D${row}`).numFmt='0%'; ws.getCell(`D${row}`).border={left:thin()}
  ws.getCell(`E${row}`).value={formula:`C${row}*D${row}`}; ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}; row++
  const amuRow=row
  sc(ws,`B${row}`,'AMU',{font:cg(10,false),border:{left:thin()}})
  ws.getCell(`C${row}`).value={formula:`F${brutRow}`}; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()}
  ws.getCell(`D${row}`).value=0.05; ws.getCell(`D${row}`).numFmt='0%'; ws.getCell(`D${row}`).border={left:thin()}
  ws.getCell(`E${row}`).value={formula:`C${row}*D${row}`}; ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}; row++
  const irppRow=row
  sc(ws,`B${row}`,'IRPP ',{font:cg(10,false),border:{left:thin()}}); sc(ws,`C${row}`,data.irpp_base||'',{numFmt:'#,##0',border:{left:thin()}}); sc(ws,`E${row}`,data.irpp||0,{numFmt:'#,##0',border:{left:thin()}}); row++
  const totRetRow=row
  sc(ws,`B${row}`,'Total Retenues Légales',{font:cg(10,true),border:{left:{style:'medium'}}})
  ws.getCell(`E${row}`).value={formula:`E${cnssRow}+E${amuRow}+E${irppRow}`}; ws.getCell(`E${row}`).font=cg(10,true); ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}; row++
  const netLegalRow=row
  sc(ws,`B${row}`,'Salaire Net (après Retenues Légales)',{font:cg(10,true),border:{left:thin()}})
  ws.getCell(`F${row}`).value={formula:`F${brutRow}-E${totRetRow}`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}; row++
  const avRow=row
  sc(ws,`B${row}`,'Retenue avance sur salaire',{font:cg(10,false),border:{left:thin()}}); sc(ws,`E${row}`,data.avance_salaire||0,{numFmt:'#,##0',border:{left:thin()}}); row++
  const autRow=row
  sc(ws,`B${row}`,'Total Autres retenues',{font:cg(10,true),border:{left:thin()}})
  ws.getCell(`E${row}`).value={formula:`SUM(E${avRow}:E${avRow})`}; ws.getCell(`E${row}`).font=cg(10,true); ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}; row++
  ws.mergeCells(`A${row}:E${row}`)
  sc(ws,`A${row}`,'NET A PAYER ',{font:cg(12,true),alignment:{horizontal:'center',vertical:'center'},border:{left:double_(),right:thin(),top:thin(),bottom:thin()}})
  ws.getCell(`F${row}`).value={formula:`F${netLegalRow}-E${autRow}`}; ws.getCell(`F${row}`).font=cg(12,true); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}; const netRow=row; row+=2
  const patRow=row; ws.getRow(row).height=25.5
  sc(ws,`A${row}`,"Signature et Cachet de l'employeur",{font:bos(10,true),alignment:{vertical:'center'}})
  sc(ws,`E${row}`,'Charges Patronales',{font:cg(8,true,true),alignment:{vertical:'center'},border:{left:{style:'medium'}}})
  ws.getCell(`F${row}`).value={formula:`F${brutRow}*17.5%`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).alignment={horizontal:'center',vertical:'center'}; ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:{style:'medium'}}; row++
  ws.getRow(row).height=25.5; sc(ws,`E${row}`,'AMU Part Patronale',{font:cg(8,true,true),alignment:{vertical:'center'},border:{left:{style:'medium'}}})
  ws.getCell(`F${row}`).value={formula:`E${amuRow}`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).alignment={horizontal:'center',vertical:'center'}; ws.getCell(`F${row}`).numFmt='#,##0'; row++
  ws.getRow(row).height=25.5; sc(ws,`E${row}`,'Masse Salariale',{font:cg(8,true,true),alignment:{vertical:'center'},border:{left:{style:'medium'}}})
  ws.getCell(`F${row}`).value={formula:`F${brutRow}+F${patRow}+E${amuRow}`}; ws.getCell(`F${row}`).font=cg(9,true); ws.getCell(`F${row}`).alignment={horizontal:'center',vertical:'center'}; ws.getCell(`F${row}`).numFmt='#,##0'; row++
  sc(ws,`D${row}`,"Signature de l'employé(e) ",{font:cg(10,true),alignment:{vertical:'center'}})
}

function genEtatCharges(wb, sheetName, title, employes, avecRegul) {
  const ws = wb.addWorksheet(sheetName)
  const nColIdx = avecRegul ? 16 : 14; const lastCol = avecRegul ? 'P' : 'N'
  const widths = [3.86,53.43,20,41.57,16.86,15.57,23.29,16.71,16.57,23,19.57,13.14,28,15.57,20,15.57]
  for (let i=0;i<nColIdx;i++) ws.getColumn(i+1).width=widths[i]
  ws.mergeCells(`A1:${lastCol}1`); ws.getRow(1).height=30
  const t=ws.getCell('A1'); t.value=title; t.font=cal(20,true); t.alignment={horizontal:'center'}
  const headers = avecRegul
    ? ['N°','Nom et Prénoms','Responsable','Poste','Pole','Salaire brut','Salaire brut imposable','CNSS Salarié 4%','AMU Salarié 5%','CNSS Patronale 17,5%','AMU Patronale 5%','IRPP Salarié','REGULARISATION IRPP','IRPP A PAYER','TOTAL RETENUES SALARIES','NET A PAYER']
    : ['N°','Nom et Prénoms','Responsable','Poste','Pole','Salaire brut','Salaire brut imposable','CNSS Salarié 4%','AMU Salarié 5%','CNSS Patronale 17,5%','AMU Patronale 5%','IRPP Salarié','TOTAL RETENUES SALARIES','NET A PAYER']
  for (let ci=1;ci<=headers.length;ci++) { const c=ws.getRow(2).getCell(ci); c.value=headers[ci-1]; c.font=cal(12,true); c.alignment={horizontal:'center',wrapText:true}; c.border={left:thin(),right:thin(),top:thin(),bottom:thin()} }
  ws.getRow(2).height=40
  for (let i=0;i<employes.length;i++) {
    const r=i+3; const emp=employes[i]
    for (let ci=1;ci<=5;ci++) { const c=ws.getRow(r).getCell(ci); c.value=[i+1,emp.nom,emp.responsable,emp.poste,emp.pole][ci-1]; c.font=cal(11,false) }
    const vals = avecRegul
      ? [[6,{formula:`P${r}+O${r}`}],[7,emp.brut_imposable],[8,{formula:`G${r}*4%`}],[9,{formula:`G${r}*5%`}],[10,{formula:`G${r}*17.5%`}],[11,{formula:`G${r}*5%`}],[12,emp.irpp],[13,emp.regularisation_irpp||0],[14,{formula:`L${r}+M${r}`}],[15,{formula:`H${r}+I${r}+N${r}`}],[16,emp.net_payer]]
      : [[6,{formula:`N${r}+M${r}`}],[7,emp.brut_imposable],[8,{formula:`G${r}*4%`}],[9,{formula:`G${r}*5%`}],[10,{formula:`G${r}*17.5%`}],[11,{formula:`G${r}*5%`}],[12,emp.irpp],[13,{formula:`H${r}+I${r}+L${r}`}],[14,emp.net_payer]]
    for (const [ci,val] of vals) { const c=ws.getRow(r).getCell(ci); c.value=val; c.font=cal(ci===nColIdx?12:11,false); c.numFmt='#,##0' }
  }
  const tr=employes.length+3; const e=tr-1
  ws.getRow(tr).getCell(2).value='TOTAL'; ws.getRow(tr).getCell(2).font=cal(12,true)
  for (let ci=6;ci<=nColIdx;ci++) { const lc=String.fromCharCode(64+ci); const c=ws.getRow(tr).getCell(ci); c.value={formula:`SUM(${lc}3:${lc}${e})`}; c.font=cal(12,true); c.border={left:thin(),right:thin(),top:thin(),bottom:thin()}; c.numFmt='#,##0' }
  let rr=tr+3
  const recap = [['CNSS PART SALARIALE à Payer',`SUM(H3:H${e})+SUM(I3:I${e})`],['CNSS PART PATRONALE à Payer',`SUM(J3:J${e})`],['Total CNSS',`SUM(H3:H${e})+SUM(I3:I${e})+SUM(J3:J${e})+SUM(K3:K${e})`],['IRPP à payer',avecRegul?`SUM(N3:N${e})`:`SUM(L3:L${e})`],['Montant Global à payer',avecRegul?`SUM(J3:J${e})+SUM(K3:K${e})+SUM(H3:H${e})+SUM(I3:I${e})+SUM(N3:N${e})`:`SUM(J3:J${e})+SUM(K3:K${e})+SUM(H3:H${e})+SUM(I3:I${e})+SUM(L3:L${e})`]]
  for (const [label,formula] of recap) { ws.getRow(rr).getCell(3).value=label; ws.getRow(rr).getCell(3).font=cal(12,true); ws.getRow(rr).getCell(4).value={formula}; ws.getRow(rr).getCell(4).numFmt='#,##0'; rr++ }
}

function genSolde(wb, sheetName, data) {
  const ws = wb.addWorksheet(sheetName)
  ws.getColumn(5).width=20; ws.getColumn(6).width=18; ws.getColumn(8).width=14.29
  ws.mergeCells('B4:H5'); const t=ws.getCell('B4'); t.value=`   ${data.client_nom} : SOLDE DE TOUT COMPTE : ${data.nom}`; t.font=cal(20,true); t.alignment={horizontal:'center'}
  for (const [row,txt,h] of [[6,`DEPART : ${data.depart}`,'left'],[7,`DATE D'EMBAUCHE :  ${data.date_embauche}`,'left'],[8,`FIN DE CONTRAT : ${data.fin_contrat}`,null],[9,`ANCIENNETE : ${data.anciennete_label}`,'left']]) {
    ws.mergeCells(`B${row}:H${row}`); const c=ws.getCell(`B${row}`); c.value=txt; c.font=cal(14,true); if(h)c.alignment={horizontal:h}
  }
  ws.mergeCells('F10:H10'); ws.getCell('F10').value='CALCUL'; ws.getCell('F10').font=cal(16,false); ws.getCell('F10').alignment={horizontal:'center'}
  for (const [addr,v] of [['F11','BASE'],['G11','TAUX'],['H11','MONTANT']]) { ws.getCell(addr).value=v; ws.getCell(addr).font=cal(16,false); ws.getCell(addr).alignment={horizontal:'center'} }
  ws.mergeCells('B12:E12'); ws.getCell('B12').value=`\u00a0 ${data.salaire_mois_label} `; ws.getCell('B12').font=cal(16,false); ws.getCell('B12').alignment={horizontal:'left'}
  ws.getCell('H12').value=String(data.salaire_mois||0); ws.getCell('H12').font=cal(16,false); ws.getCell('H12').numFmt='#,##0'
  ws.mergeCells('B13:E13'); ws.getCell('B13').value='INDEMNITE DE CONGES ACQUIS NON JOUIR '; ws.getCell('B13').font=cal(16,false); ws.getCell('B13').alignment={horizontal:'left'}
  ws.getCell('F13').value=String(data.base_conges||0); ws.getCell('F13').font=cal(16,false)
  const jours=data.jours_conges_list||[]
  if (data.taux_conges_auto && jours.length) ws.getCell('G13').value={formula:`(${jours.map(([j])=>j).join('+')})/30`}
  else ws.getCell('G13').value=String(data.taux_conges_manuel||0)
  ws.getCell('G13').font=cal(16,false); ws.getCell('G13').alignment={horizontal:'center'}
  ws.getCell('H13').value={formula:'F13*G13'}; ws.getCell('H13').numFmt='#,##0.00'
  ws.mergeCells('B14:E14'); ws.getCell('B14').value=' TOTAL BRUT SOLDE DE TOUT COMPTE'; ws.getCell('B14').font=cal(16,true); ws.getCell('B14').alignment={horizontal:'left'}
  ws.getCell('H14').value={formula:'+H12+H13'}; ws.getCell('H14').numFmt='#,##0.00'
  for (const [r,label,base,taux] of [[15,'CNSS','=(H14-140000)','0.04'],[16,'AMU','=(H14-140000)','0.05']]) {
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value=label; ws.getCell(`B${r}`).font=cal(16,false)
    ws.getCell(`F${r}`).value=base; ws.getCell(`F${r}`).font=cal(16,true); ws.getCell(`F${r}`).alignment={horizontal:'center'}
    ws.getCell(`G${r}`).value=taux; ws.getCell(`G${r}`).font=cal(16,false); ws.getCell(`G${r}`).alignment={horizontal:'center'}
    ws.getCell(`H${r}`).value={formula:`+F${r}*G${r}`}; ws.getCell(`H${r}`).font=cal(16,false); ws.getCell(`H${r}`).numFmt='#,##0'
  }
  ws.mergeCells('B17:E17'); ws.getCell('B17').value='IRPP'; ws.getCell('B17').font=cal(16,false)
  ws.getCell('H17').value=data.irpp||0; ws.getCell('H17').numFmt='#,##0'
  let r=18
  if (data.retenues_arrierees) {
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='TOTAL RETENUES ARRIEREES RESTANT A PRELEVE'; ws.getCell(`B${r}`).font=cal(16,false)
    ws.getCell(`H${r}`).value=data.retenues_arrierees; ws.getCell(`H${r}`).numFmt='#,##0'; r++
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='TOTAL DES RETENUES'; ws.getCell(`B${r}`).font=cal(16,true)
    ws.getCell(`H${r}`).value={formula:`H15+H16+H17+H${r-1}`}; ws.getCell(`H${r}`).numFmt='#,##0'
  } else {
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='TOTAL DES RETENUES'; ws.getCell(`B${r}`).font=cal(16,true)
    ws.getCell(`H${r}`).value={formula:'H15+H16+H17'}; ws.getCell(`H${r}`).numFmt='#,##0'
  }
  const totR=r; r++
  ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='SALAIRE NET SOLDE DE TOUT COMPTE'; ws.getCell(`B${r}`).font=cal(16,true)
  ws.getCell(`H${r}`).value={formula:`H14-H${totR}`}; ws.getCell(`H${r}`).numFmt='#,##0'; const netR=r; r++
  if (data.inclure_preavis) {
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='MONTANT DU PREAVIS'; ws.getCell(`B${r}`).font=cal(16,true)
    ws.getCell(`H${r}`).value=data.preavis||0; ws.getCell(`H${r}`).numFmt='#,##0'; const preR=r; r++
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='AVANCE SUR SOLDE DE TOUT COMPTE'; ws.getCell(`B${r}`).font=cal(16,true)
    ws.getCell(`H${r}`).value=data.avance||0; ws.getCell(`H${r}`).numFmt='#,##0'; const avR=r; r++
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='NET A PAYER'; ws.getCell(`B${r}`).font=cal(16,true)
    ws.getCell(`H${r}`).value={formula:`H${netR}-H${preR}-H${avR}`}; ws.getCell(`H${r}`).numFmt='#,##0'
  } else {
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='AVANCE SUR SOLDE DE TOUT COMPTE'; ws.getCell(`B${r}`).font=cal(16,true)
    ws.getCell(`H${r}`).value=data.avance||0; ws.getCell(`H${r}`).numFmt='#,##0'; const avR=r; r++
    ws.mergeCells(`B${r}:E${r}`); ws.getCell(`B${r}`).value='NET A PAYER'; ws.getCell(`B${r}`).font=cal(16,true)
    ws.getCell(`H${r}`).value={formula:`H${netR}-H${avR}`}; ws.getCell(`H${r}`).numFmt='#,##0'
  }
  if (jours.length) { ws.getCell(`B${r+3}`).value=`TAUX DE CONGES ACQUIS NON JOUIR= (${jours.map(([j,l])=>`${j} jours (${l})`).join(' + ')}) / 30 jours`; ws.getCell(`B${r+3}`).font=cal(12,true) }
}

// ─── ROUTER PRINCIPAL ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const path = req.url.split('?')[0].replace(/\/+$/, '')
  const method = req.method

  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  if (method === 'OPTIONS') return res.status(200).end()

  try {
    // ── Auth routes ──
    if (path === '/api/auth/me') return authMe(req, res)
    if (path === '/api/auth/repair-org') return authRepairOrg(req, res)
    if (path === '/api/auth/signup-org') return authSignupOrg(req, res)
    if (path === '/api/auth/debug') return authDebug(req, res)

    // ── Export routes ──
    if (path === '/api/export-bulletin') {
      if (method !== 'POST') return res.status(405).end()
      const auth = await requireAuth(req)
      const { period_id, employee_id } = req.body
      if (!period_id || !employee_id) return res.status(400).json({ error: 'period_id et employee_id requis' })
      const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
      const rows = await db`SELECT pv.*,e.first_name,e.last_name,e.position,e.social_security_number,e.hire_date,e.phone,e.children_count,e.marital_status,e.category,c.name as client_name,c.nif as client_nif,c.num_employeur,pp.period_month,pp.period_year FROM payroll_variables pv JOIN employees e ON e.id=pv.employee_id JOIN payroll_periods pp ON pp.id=pv.period_id JOIN clients c ON c.id=pp.client_id WHERE pv.period_id=${period_id} AND pv.employee_id=${employee_id}`
      if (!rows.length) return res.status(404).json({ error: 'Variables introuvables' })
      const v=rows[0]
      const mois_noms=['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE']
      const mois=mois_noms[(v.period_month||1)-1]
      const brut=calcBrut(v); const pers=calcPersonnesCharge(v.marital_status,v.children_count); const irpp=calcIrppMensuel(brut,pers)
      const rubriques=[]
      if(v.base_salary) rubriques.push({label:'Salaire de Base',base:v.base_salary,taux_ou_nb:30})
      if(v.sursalaire) rubriques.push({label:'Sursalaire',base:v.sursalaire,taux_ou_nb:30})
      if(v.hire_date){const ann=Math.floor((Date.now()-new Date(v.hire_date))/(1000*60*60*24*365));if(ann>=2)rubriques.push({label:'Ancienneté',base:Math.round(((v.base_salary||0)+(v.sursalaire||0))*ann*0.02),taux_ou_nb:30})}
      if(v.indemnite_fonction) rubriques.push({label:'Indemnité de fonction',base:v.indemnite_fonction,taux_ou_nb:30})
      if(v.indemnite_logement) rubriques.push({label:'Indemnité de logement',base:v.indemnite_logement,taux_ou_nb:30})
      if(v.indemnite_transport) rubriques.push({label:'Indemnité de Transport',base:v.indemnite_transport,taux_ou_nb:30})
      if(v.indemnite_repas) rubriques.push({label:'Indemnité de repas',base:v.indemnite_repas,taux_ou_nb:30})
      if(v.indemnite_communication) rubriques.push({label:'Indemnité de communication',base:v.indemnite_communication,taux_ou_nb:30})
      if(v.indemnite_grossesse) rubriques.push({label:'Indemnité de grossesse',base:v.indemnite_grossesse,taux_ou_nb:30})
      const wb2=new ExcelJS.Workbook()
      genBulletin(wb2,`${(v.last_name||'').substring(0,3)} ${mois.substring(0,4)} ${v.period_year}`,{nom:`${v.last_name} ${v.first_name}`,n_assure:v.social_security_number||'',nif:v.client_nif||'',direction:v.category||'',poste:v.position||'',telephone:v.phone||'',date_embauche:v.hire_date?new Date(v.hire_date).toLocaleDateString('fr-FR'):'',personnes_charge:pers,rubriques,avance_salaire:v.avance_salaire||0,irpp,irpp_base:Math.floor((brut*0.91-Math.min(brut*0.91*12,10_000_000)*0.28/12-pers*10_000)/1000)*1000})
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition',`attachment; filename="Bulletin_${v.last_name}_${mois}_${v.period_year}.xlsx"`)
      await wb2.xlsx.write(res); return res.end()
    }

    if (path === '/api/export-etat-charges') {
      if (method !== 'POST') return res.status(405).end()
      const auth = await requireAuth(req)
      const { period_id, avec_regularisation } = req.body
      const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
      const rows = await db`SELECT pv.*,e.first_name,e.last_name,e.position,e.children_count,e.marital_status,e.responsable,e.pole,c.name as client_name,pp.period_month,pp.period_year FROM payroll_variables pv JOIN employees e ON e.id=pv.employee_id JOIN payroll_periods pp ON pp.id=pv.period_id JOIN clients c ON c.id=pp.client_id WHERE pv.period_id=${period_id} ORDER BY e.last_name`
      if (!rows.length) return res.status(404).json({ error: 'Aucune donnée' })
      const p=rows[0]; const mois_noms=['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE']; const mois=mois_noms[(p.period_month||1)-1]
      const employes=rows.map(v=>{const brut=calcBrut(v);const pers=calcPersonnesCharge(v.marital_status,v.children_count);const irpp=calcIrppMensuel(brut,pers);const net=brut-Math.round(brut*0.04)-Math.round(brut*0.05)-irpp-(v.avance_salaire||0)-(v.remboursement_pret||0)-(v.deduction_forfaitaire||0);return{nom:`${v.last_name} ${v.first_name}`,responsable:v.responsable||'',poste:v.position||'',pole:v.pole||'',brut_imposable:brut,irpp,net_payer:Math.round(net),regularisation_irpp:v.regularisation_irpp||0}})
      const wb2=new ExcelJS.Workbook()
      const suffix=avec_regularisation?'AVEC REGULARISATION':'SANS REGULARISATION'
      genEtatCharges(wb2,`${mois.substring(0,4)} ${p.period_year}${avec_regularisation?' REGUL':''}`,`${p.client_name}: ETAT DES RETENUES ET SALAIRES NETS A PAYER ${mois} ${p.period_year} ${suffix}`,employes,!!avec_regularisation)
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition',`attachment; filename="Etat_Charges_${mois}_${p.period_year}.xlsx"`)
      await wb2.xlsx.write(res); return res.end()
    }

    if (path === '/api/export-solde') {
      if (method !== 'POST') return res.status(405).end()
      const auth = await requireAuth(req)
      const { employee_id, period_id, date_depart, date_fin_contrat, jours_conges_list, taux_conges_auto, taux_conges_manuel, avance, preavis, inclure_preavis, retenues_arrierees, regularisation_irpp } = req.body
      const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)
      const [emp] = await db`SELECT e.*,c.name as client_name FROM employees e JOIN clients c ON c.id=e.client_id WHERE e.id=${employee_id}`
      if (!emp) return res.status(404).json({ error: 'Employé introuvable' })
      let vars=null; if(period_id){const rows=await db`SELECT * FROM payroll_variables WHERE period_id=${period_id} AND employee_id=${employee_id}`;vars=rows[0]||null}
      const brut=vars?calcBrut(vars):0; const pers=calcPersonnesCharge(emp.marital_status,emp.children_count); const irpp=calcIrppMensuel(brut,pers)+(regularisation_irpp||0)
      const departDate=new Date(date_depart||Date.now()); const hireDate=emp.hire_date?new Date(emp.hire_date):null; const ann=hireDate?Math.floor((departDate-hireDate)/(1000*60*60*24*365)):0
      const fmt=d=>d?new Date(d).toLocaleDateString('fr-FR'):''
      const wb2=new ExcelJS.Workbook()
      genSolde(wb2,emp.last_name,{nom:`${emp.last_name} ${emp.first_name}`,client_nom:emp.client_name||'',depart:fmt(date_depart),date_embauche:fmt(emp.hire_date),fin_contrat:fmt(date_fin_contrat||date_depart),anciennete_label:ann===1?'1 an':`${ann} ans`,salaire_mois:brut,salaire_mois_label:`SALAIRE DU MOIS DE ${departDate.toLocaleDateString('fr-FR',{month:'long'}).toUpperCase()}`,base_conges:brut,jours_conges_list:jours_conges_list||[],taux_conges_auto:taux_conges_auto!==false,taux_conges_manuel:taux_conges_manuel||0,irpp,avance:avance||0,preavis:preavis||0,inclure_preavis:!!inclure_preavis,retenues_arrierees:retenues_arrierees||0})
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition',`attachment; filename="Solde_${emp.last_name}_${fmt(date_depart).replace(/\//g,'-')}.xlsx"`)
      await wb2.xlsx.write(res); return res.end()
    }

    // ── Données CRUD ──
    const auth = await requireAuth(req)
    const qp = Object.fromEntries(new URL(req.url, 'http://x').searchParams)

    if (path === '/api/clients') {
      const id = qp.id
      if (id) {
        if (method === 'GET') { const r=await sql('SELECT * FROM clients WHERE id=$1 AND organization_id=$2',[id,auth.orgId]); return res.status(r.rows.length?200:404).json(r.rows[0]||{error:'Introuvable'}) }
        if (method==='PUT'||method==='PATCH') { const b=req.body; const r=await sql(`UPDATE clients SET name=$1,address=$2,phone=$3,email=$4,ifu=$5,rccm=$6,sector=$7,num_employeur=$8,nif=$9,bp=$10,entite_name=$11,logo_url=$12,updated_at=NOW() WHERE id=$13 AND organization_id=$14 RETURNING *`,[b.name,b.address||null,b.phone||null,b.email||null,b.ifu||null,b.rccm||null,b.sector||null,b.num_employeur||null,b.nif||null,b.bp||null,b.entite_name||null,b.logo_url||null,id,auth.orgId]); return res.status(200).json(r.rows[0]) }
        if (method==='DELETE') { await sql('DELETE FROM clients WHERE id=$1 AND organization_id=$2',[id,auth.orgId]); return res.status(200).json({ok:true}) }
      } else {
        if (method==='GET') { const r=await sql('SELECT * FROM clients WHERE organization_id=$1 ORDER BY name',[auth.orgId]); return res.status(200).json(r.rows) }
        if (method==='POST') { const b=req.body; const r=await sql(`INSERT INTO clients (organization_id,name,address,phone,email,ifu,rccm,sector,num_employeur,nif,bp,entite_name,logo_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[auth.orgId,b.name,b.address||null,b.phone||null,b.email||null,b.ifu||null,b.rccm||null,b.sector||null,b.num_employeur||null,b.nif||null,b.bp||null,b.entite_name||null,b.logo_url||null]); return res.status(201).json(r.rows[0]) }
      }
    }

    if (path === '/api/employees') {
      const id=qp.id; const clientId=qp.client_id
      if (id) {
        if (method==='GET') { const r=await sql(`SELECT e.*,c.name as client_name FROM employees e JOIN clients c ON e.client_id=c.id WHERE e.id=$1 AND c.organization_id=$2`,[id,auth.orgId]); return res.status(r.rows.length?200:404).json(r.rows[0]||{error:'Introuvable'}) }
        if (method==='PUT'||method==='PATCH') { const b=req.body; const r=await sql(`UPDATE employees SET client_id=$1,matricule=$2,first_name=$3,last_name=$4,gender=$5,birth_date=$6,hire_date=$7,position=$8,category=$9,marital_status=$10,children_count=$11,social_security_number=$12,phone=$13,email=$14,active=$15,status=$16,contract_type=$17,contract_end_date=$18,pole=$19,responsable=$20,updated_at=NOW() WHERE id=$21 RETURNING *`,[b.client_id,b.matricule||null,b.first_name,b.last_name,b.gender||'M',b.birth_date||null,b.hire_date||null,b.position||null,b.category||null,b.marital_status,b.children_count||0,b.social_security_number||null,b.phone||null,b.email||null,b.active!==false,b.status||'actif',b.contract_type||'cdi',b.contract_end_date||null,b.pole||null,b.responsable||null,id]); return res.status(200).json(r.rows[0]) }
        if (method==='DELETE') { await sql('DELETE FROM employees WHERE id=$1',[id]); return res.status(200).json({ok:true}) }
      } else {
        if (method==='GET') { let q=`SELECT e.*,c.name as client_name FROM employees e JOIN clients c ON e.client_id=c.id WHERE c.organization_id=$1`;const p=[auth.orgId];if(clientId){q+=' AND e.client_id=$2';p.push(clientId)}q+=' ORDER BY e.last_name';const r=await sql(q,p);return res.status(200).json(r.rows) }
        if (method==='POST') { const b=req.body; const r=await sql(`INSERT INTO employees (client_id,matricule,first_name,last_name,gender,birth_date,hire_date,position,category,marital_status,children_count,social_security_number,phone,email,active,status,contract_type,contract_end_date,pole,responsable) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,[b.client_id,b.matricule||null,b.first_name,b.last_name,b.gender||'M',b.birth_date||null,b.hire_date||null,b.position||null,b.category||null,b.marital_status||'celibataire',b.children_count||0,b.social_security_number||null,b.phone||null,b.email||null,b.active!==false,b.status||'actif',b.contract_type||'cdi',b.contract_end_date||null,b.pole||null,b.responsable||null]); return res.status(201).json(r.rows[0]) }
      }
    }

    if (path === '/api/payroll') {
      const id=qp.id; const clientId=qp.client_id
      if (id) {
        if (method==='GET') { const r=await sql(`SELECT pp.*,c.name as client_name,c.logo_url,c.num_employeur,c.nif,c.bp,c.phone as client_phone,c.entite_name FROM payroll_periods pp JOIN clients c ON pp.client_id=c.id WHERE pp.id=$1 AND c.organization_id=$2`,[id,auth.orgId]); return res.status(r.rows.length?200:404).json(r.rows[0]||{error:'Introuvable'}) }
        if (method==='PATCH') { const b=req.body;const keys=Object.keys(b);const sets=keys.map((k,i)=>`${k}=$${i+1}`).join(', ');const vals=[...Object.values(b),id];const r=await sql(`UPDATE payroll_periods SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`,vals);return res.status(200).json(r.rows[0]) }
      } else {
        if (method==='GET') { let q=`SELECT pp.*,c.name as client_name FROM payroll_periods pp JOIN clients c ON pp.client_id=c.id WHERE c.organization_id=$1`;const p=[auth.orgId];if(clientId){q+=' AND pp.client_id=$2';p.push(clientId)}q+=' ORDER BY pp.period_year DESC,pp.period_month DESC';const r=await sql(q,p);return res.status(200).json(r.rows) }
        if (method==='POST') { const{client_id,period_month,period_year}=req.body;const ex=await sql('SELECT id FROM payroll_periods WHERE client_id=$1 AND period_year=$2 AND period_month=$3',[client_id,period_year,period_month]);if(ex.rows.length)return res.status(409).json({error:'Période déjà existante'});const r=await sql('INSERT INTO payroll_periods (client_id,period_month,period_year,status) VALUES ($1,$2,$3,$4) RETURNING *',[client_id,period_month,period_year,'open']);return res.status(201).json(r.rows[0]) }
      }
    }

    if (path === '/api/payroll-variables') {
      const{period_id,employee_id}=qp
      if (method==='GET') { let q=`SELECT pv.*,e.first_name,e.last_name,e.matricule,e.position,e.category,e.marital_status,e.children_count FROM payroll_variables pv JOIN employees e ON pv.employee_id=e.id WHERE pv.period_id=$1`;const p=[period_id];if(employee_id){q+=' AND pv.employee_id=$2';p.push(employee_id)}const r=await sql(q,p);return res.status(200).json(r.rows) }
      if (method==='POST'||method==='PUT') { const b=req.body;const ex=await sql('SELECT id FROM payroll_variables WHERE period_id=$1 AND employee_id=$2',[b.period_id,b.employee_id]);let r;if(ex.rows.length){const{period_id:_p,employee_id:_e,...rest}=b;const keys=Object.keys(rest);const sets=keys.map((k,i)=>`${k}=$${i+1}`).join(', ');r=await sql(`UPDATE payroll_variables SET ${sets},updated_at=NOW() WHERE id=$${keys.length+1} RETURNING *`,[...Object.values(rest),ex.rows[0].id])}else{const keys=Object.keys(b);r=await sql(`INSERT INTO payroll_variables (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,Object.values(b))}return res.status(200).json(r.rows[0]) }
    }

    if (path === '/api/salary-grids') {
      const id=qp.id
      if (id) {
        if (method==='PUT') { const b=req.body;const r=await sql('UPDATE salary_grids SET category=$1,echelon=$2,base_salary=$3,hourly_rate=$4 WHERE id=$5 RETURNING *',[b.category,b.echelon,b.base_salary,b.hourly_rate,id]);return res.status(200).json(r.rows[0]) }
        if (method==='DELETE') { await sql('DELETE FROM salary_grids WHERE id=$1',[id]);return res.status(200).json({ok:true}) }
      } else {
        if (method==='GET') { const r=await sql(`SELECT sg.*,c.name as client_name FROM salary_grids sg JOIN clients c ON sg.client_id=c.id WHERE c.organization_id=$1 ORDER BY sg.category,sg.echelon`,[auth.orgId]);return res.status(200).json(r.rows) }
        if (method==='POST') { const b=req.body;const r=await sql('INSERT INTO salary_grids (client_id,category,echelon,base_salary,hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING *',[b.client_id,b.category,b.echelon||1,b.base_salary||0,b.hourly_rate||0]);return res.status(201).json(r.rows[0]) }
      }
    }

    if (path === '/api/activity') {
      if (method==='GET') { const r=await sql('SELECT * FROM activity_logs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',[auth.orgId]);return res.status(200).json(r.rows) }
      if (method==='POST') { const{action,details}=req.body;await sql('INSERT INTO activity_logs (organization_id,user_id,action,details) VALUES ($1,$2,$3,$4)',[auth.orgId,auth.userId,action,details||null]);return res.status(201).json({ok:true}) }
    }

    if (path === '/api/upload-logo') {
      if (method!=='POST') return res.status(405).end()
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const buffer=Buffer.concat(chunks)
      const contentType=req.headers['x-content-type']||'image/png'; const filename=req.headers['x-filename']||`logo-${Date.now()}.png`
      const blob=await put(`logos/${filename}`,buffer,{access:'public',contentType,token:process.env.BLOB_READ_WRITE_TOKEN})
      return res.status(200).json({url:blob.url})
    }

    return res.status(404).json({ error: 'Route introuvable' })
  } catch (e) {
    const status = e.message?.includes('auth')||e.message?.includes('authentif')||e.message?.includes('Session')||e.message?.includes('cookie') ? 401 : 500
    return res.status(status).json({ error: e.message })
  }
}
