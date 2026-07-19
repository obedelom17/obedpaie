export const config = {
  runtime: 'nodejs',
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

import { requireAuth } from './_auth.js'
import { sql } from './_db.js'
import { neon } from '@neondatabase/serverless'
import { calcIrppMensuel, calcBrut, calcPersonnesCharge } from './_payroll.js'
import { put } from '@vercel/blob'
import ExcelJS from 'exceljs'

const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL
const DB_URL = () => process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL

// ─── SESSION HELPER ───────────────────────────────────────────────────────────
async function getSession(cookieHeader) {
  if (!NEON_AUTH_BASE_URL) throw new Error('NEON_AUTH_BASE_URL non configuré')
  if (!cookieHeader) return null
  const r = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
    headers: { cookie: cookieHeader },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) return null
  const s = await r.json()
  return s?.user?.id ? s : null
}

// ─── INIT TABLES (idempotent) ─────────────────────────────────────────────────
async function initTables(db) {
  try {
    await db`CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
    await db`CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  } catch {}
}

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
async function authMe(req, res) {
  try {
    const session = await getSession(req.headers?.cookie || '')
    if (!session) return res.status(401).json({ error: 'Non authentifié' })
    const db = neon(DB_URL())
    await initTables(db)
    let org = null
    try {
      const rows = await db`
        SELECT up.organization_id, o.name as org_name
        FROM user_profiles up
        LEFT JOIN organizations o ON o.id = up.organization_id
        WHERE up.user_id = ${session.user.id}
      `
      if (rows[0]?.organization_id) org = { id: rows[0].organization_id.toString(), name: rows[0].org_name }
    } catch (e) { console.error('[authMe:db]', e.message) }
    return res.status(200).json({ userId: session.user.id, email: session.user.email, org })
  } catch (e) {
    console.error('[authMe]', e.message)
    return res.status(500).json({ error: e.message })
  }
}

async function authRepairOrg(req, res) {
  try {
    const session = await getSession(req.headers?.cookie || '')
    if (!session) return res.status(401).json({ error: 'Non authentifié' })
    const userId = session.user.id
    const orgName = (req.body?.orgName || session.user?.email?.split('@')[0] || 'Cabinet').trim()
    const db = neon(DB_URL())
    await initTables(db)
    const existing = await db`
      SELECT up.organization_id, o.name
      FROM user_profiles up
      LEFT JOIN organizations o ON o.id = up.organization_id
      WHERE up.user_id = ${userId}
    `
    if (existing.length && existing[0].organization_id) {
      return res.status(200).json({ ok: true, org: { id: existing[0].organization_id.toString(), name: existing[0].name }, already: true })
    }
    const orgs = await db`INSERT INTO organizations (name) VALUES (${orgName}) RETURNING id::text, name`
    const org = orgs[0]
    await db`INSERT INTO user_profiles (user_id, organization_id) VALUES (${userId}, ${org.id}::uuid)
             ON CONFLICT (user_id) DO UPDATE SET organization_id = ${org.id}::uuid`
    return res.status(200).json({ ok: true, org })
  } catch (e) {
    console.error('[authRepairOrg]', e.message)
    return res.status(500).json({ error: e.message })
  }
}

async function authSignupOrg(req, res) {
  try {
    const auth = await requireAuth(req)
    const orgName = (req.body?.orgName || '').trim()
    if (!orgName) return res.status(400).json({ error: 'orgName requis' })
    const db = neon(DB_URL())
    await initTables(db)
    if (auth.orgId) {
      const orgs = await db`SELECT id::text, name FROM organizations WHERE id::text = ${auth.orgId}`
      if (orgs.length) return res.status(200).json({ ok: true, org: { id: orgs[0].id, name: orgs[0].name } })
    }
    const orgs = await db`INSERT INTO organizations (name) VALUES (${orgName}) RETURNING id::text, name`
    const org = orgs[0]
    await db`INSERT INTO user_profiles (user_id, organization_id) VALUES (${auth.userId}, ${org.id}::uuid)
             ON CONFLICT (user_id) DO UPDATE SET organization_id = ${org.id}::uuid`
    return res.status(200).json({ ok: true, org })
  } catch (e) {
    const status = e.message.includes('auth') || e.message.includes('authentif') || e.message.includes('Session') ? 401 : 500
    return res.status(status).json({ error: e.message })
  }
}

async function authDebug(req, res) {
  const info = {
    env: {
      NEON_AUTH_BASE_URL: NEON_AUTH_BASE_URL ? '✓ défini' : '✗ MANQUANT',
      DATABASE_URL: process.env.DATABASE_URL ? '✓' : '✗',
      POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL ? '✓' : '✗',
    },
    cookie: req.headers?.cookie ? req.headers.cookie.substring(0, 150) + '...' : 'AUCUN COOKIE',
    session: null, userProfile: null, error: null, sessionStatus: null,
  }
  try {
    const session = await getSession(req.headers?.cookie || '')
    info.session = session?.user ? { id: session.user.id, email: session.user.email } : null
    if (session?.user?.id) {
      const db = neon(DB_URL())
      await initTables(db)
      const rows = await db`
        SELECT up.user_id, up.organization_id::text, o.name as org_name
        FROM user_profiles up
        LEFT JOIN organizations o ON o.id = up.organization_id
        WHERE up.user_id = ${session.user.id}
      `
      info.userProfile = rows[0] || 'AUCUN PROFIL (user_profiles vide)'
    }
  } catch (e) { info.error = e.message }
  return res.status(200).json(info)
}

// ─── EXCEL HELPERS ────────────────────────────────────────────────────────────
const thin  = () => ({ style: 'thin' })
const dbl   = () => ({ style: 'double' })
const med   = () => ({ style: 'medium' })
const cg    = (sz=10,bold=false,italic=false) => ({ name:'Century Gothic', size:sz, bold, italic })
const cal   = (sz=11,bold=false)  => ({ name:'Calibri', size:sz, bold })
const bos   = (sz=10,bold=false)  => ({ name:'Bookman Old Style', size:sz, bold })
const aln   = (h,v='center',wrap=false) => ({ horizontal:h, vertical:v, wrapText:wrap })

function sc(ws, addr, val, font, align, border, numFmt) {
  const c = ws.getCell(addr)
  c.value = val
  if (font)   c.font      = font
  if (align)  c.alignment = align
  if (border) c.border    = border
  if (numFmt) c.numFmt    = numFmt
}

// ─── BULLETIN DE PAIE ─────────────────────────────────────────────────────────
function genBulletin(wb, sheetName, data) {
  const ws = wb.addWorksheet(sheetName)
  ws.columns = [
    { key:'A', width:18.29 }, { key:'B', width:35.0 },
    { key:'C', width:10.57 }, { key:'D', width:8.86 },
    { key:'E', width:9.29  }, { key:'F', width:11.43 },
  ]
  ws.pageSetup = { orientation:'portrait', paperSize:9,
    margins:{ left:0.7, right:0.7, top:0.75, bottom:0.75 } }

  // Logo client
  if (data.logoBuffer) {
    try {
      const imgId = wb.addImage({ buffer: data.logoBuffer, extension: 'png' })
      ws.addImage(imgId, { tl:{ col:0, row:0 }, br:{ col:1, row:9 } })
    } catch {}
  }

  ws.mergeCells('A13:B13')
  ws.mergeCells('A17:B17')
  ws.mergeCells('D11:F11')
  ws.getRow(11).height = 20.25

  // Infos employé
  const infos = [
    ['A18', ' Nom & Prénoms : ',    'B18', data.nom,              true ],
    ['A19', 'N°Assuré :',           'B19', data.n_assure,         false],
    ['A20', 'NIF:',                 'B20', data.nif,              false],
    ['A21', 'Direction/section:',   'B21', data.direction,        true ],
    ['A22', 'Poste/Fonction: ',     'B22', data.poste,            true ],
    ['A23', 'Téléphone:',           'B23', data.telephone,        true ],
    ['A24', " Date d'embauche: ",   'B24', data.date_embauche,    false],
    ['A25', ' Pers à charge ',      'B25', data.personnes_charge, false],
  ]
  for (const [ca, la, cb, vb, bold] of infos) {
    sc(ws, ca, la, cg(10,true),  aln('right'),  { left: dbl() })
    sc(ws, cb, vb, cg(10, bold), aln('left'),   null)
  }

  // En-têtes tableau
  const hCols = ['A','B','C','D','E','F']
  const hLabels = ['Code','Rubriques','Base','Taux/NB','Retenues','Gains']
  for (let i=0; i<6; i++) {
    const brd = i===0
      ? { left:dbl(), right:thin(), top:thin(), bottom:thin() }
      : { left:thin(), right:thin(), top:thin(), bottom:thin() }
    sc(ws, `${hCols[i]}26`, hLabels[i], cg(10,true), aln('center'), brd)
  }

  // Rubriques dynamiques
  let row = 27
  const gainsRows = []
  for (const rub of (data.rubriques || [])) {
    sc(ws, `B${row}`, rub.label, cg(10,false), aln(null,'center'), { left: thin() })
    if (rub.base   != null) { ws.getCell(`C${row}`).value=rub.base;        ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()} }
    if (rub.taux_ou_nb != null) { ws.getCell(`D${row}`).value=rub.taux_ou_nb; ws.getCell(`D${row}`).border={left:thin()} }
    ws.getCell(`F${row}`).value   = { formula: `C${row}` }
    ws.getCell(`F${row}`).numFmt  = '#,##0'
    ws.getCell(`F${row}`).border  = { left: thin() }
    gainsRows.push(row)
    row++
  }
  // 2 lignes variables vides
  for (let i=0; i<2; i++) {
    ws.getCell(`D${row}`).value  = 30
    ws.getCell(`D${row}`).border = { left: thin() }
    ws.getCell(`F${row}`).value  = { formula: `IF(ISNUMBER(C${row}),C${row}*D${row}/30,0)` }
    ws.getCell(`F${row}`).numFmt = '#,##0'
    ws.getCell(`F${row}`).border = { left: thin() }
    row++
  }

  // Salaire brut
  const brutRow = row
  sc(ws, `B${brutRow}`, 'Salaire brut ', cg(10,true), aln(null,'center'), { left: thin() })
  ws.getCell(`F${brutRow}`).value  = { formula: `IFERROR(${gainsRows.map(r=>`F${r}`).join('+')},0)` }
  ws.getCell(`F${brutRow}`).font   = cg(10,true)
  ws.getCell(`F${brutRow}`).numFmt = '#,##0'
  ws.getCell(`F${brutRow}`).border = { left: thin() }
  row++

  // CNSS
  const cnssRow = row
  sc(ws, `B${row}`, 'CNSS ', cg(10,false), null, { left: thin() })
  ws.getCell(`C${row}`).value={formula:`F${brutRow}`}; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()}
  ws.getCell(`D${row}`).value=0.04; ws.getCell(`D${row}`).numFmt='0%'; ws.getCell(`D${row}`).border={left:thin()}
  ws.getCell(`E${row}`).value={formula:`C${row}*D${row}`}; ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  // AMU
  const amuRow = row
  sc(ws, `B${row}`, 'AMU', cg(10,false), null, { left: thin() })
  ws.getCell(`C${row}`).value={formula:`F${brutRow}`}; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()}
  ws.getCell(`D${row}`).value=0.05; ws.getCell(`D${row}`).numFmt='0%'; ws.getCell(`D${row}`).border={left:thin()}
  ws.getCell(`E${row}`).value={formula:`C${row}*D${row}`}; ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  // IRPP
  const irppRow = row
  sc(ws, `B${row}`, 'IRPP ', cg(10,false), null, { left: thin() })
  ws.getCell(`C${row}`).value=data.irpp_base||''; ws.getCell(`C${row}`).numFmt='#,##0'; ws.getCell(`C${row}`).border={left:thin()}
  ws.getCell(`E${row}`).value=data.irpp||0;       ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  // Total retenues légales
  const totRetRow = row
  sc(ws, `B${row}`, 'Total Retenues Légales', cg(10,true), null, { left: med() })
  ws.getCell(`E${row}`).value={formula:`E${cnssRow}+E${amuRow}+E${irppRow}`}; ws.getCell(`E${row}`).font=cg(10,true); ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  // Salaire net légal
  const netLegalRow = row
  sc(ws, `B${row}`, 'Salaire Net (après Retenues Légales)', cg(10,true), null, { left: thin() })
  ws.getCell(`F${row}`).value={formula:`F${brutRow}-E${totRetRow}`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}
  row++

  // Avance
  const avRow = row
  sc(ws, `B${row}`, 'Retenue avance sur salaire', cg(10,false), null, { left: thin() })
  ws.getCell(`E${row}`).value=data.avance_salaire||0; ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  // Total autres retenues
  const autRow = row
  sc(ws, `B${row}`, 'Total Autres retenues', cg(10,true), null, { left: thin() })
  ws.getCell(`E${row}`).value={formula:`SUM(E${avRow}:E${avRow})`}; ws.getCell(`E${row}`).font=cg(10,true); ws.getCell(`E${row}`).numFmt='#,##0'; ws.getCell(`E${row}`).border={left:thin()}
  row++

  // NET A PAYER
  ws.mergeCells(`A${row}:E${row}`)
  sc(ws, `A${row}`, 'NET A PAYER ', cg(12,true), aln('center'), { left:dbl(), right:thin(), top:thin(), bottom:thin() })
  ws.getCell(`F${row}`).value={formula:`F${netLegalRow}-E${autRow}`}; ws.getCell(`F${row}`).font=cg(12,true); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:thin()}
  row += 2

  // Charges patronales
  const patRow = row
  ws.getRow(row).height = 25.5
  sc(ws, `A${row}`, "Signature et Cachet de l'employeur", bos(10,true), aln(null,'center'))
  sc(ws, `E${row}`, 'Charges Patronales',  cg(8,true,true), aln(null,'center'), { left: med() })
  ws.getCell(`F${row}`).value={formula:`F${brutRow}*17.5%`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).alignment=aln('center'); ws.getCell(`F${row}`).numFmt='#,##0'; ws.getCell(`F${row}`).border={left:med()}
  row++

  ws.getRow(row).height = 25.5
  sc(ws, `E${row}`, 'AMU Part Patronale', cg(8,true,true), aln(null,'center'), { left: med() })
  ws.getCell(`F${row}`).value={formula:`E${amuRow}`}; ws.getCell(`F${row}`).font=cg(10,true); ws.getCell(`F${row}`).alignment=aln('center'); ws.getCell(`F${row}`).numFmt='#,##0'
  row++

  ws.getRow(row).height = 25.5
  sc(ws, `E${row}`, 'Masse Salariale', cg(8,true,true), aln(null,'center'), { left: med() })
  ws.getCell(`F${row}`).value={formula:`F${brutRow}+F${patRow}+E${amuRow}`}; ws.getCell(`F${row}`).font=cg(9,true); ws.getCell(`F${row}`).alignment=aln('center'); ws.getCell(`F${row}`).numFmt='#,##0'
  row++

  sc(ws, `D${row}`, "Signature de l'employé(e) ", cg(10,true), aln(null,'center'))
}

// ─── ÉTAT DES CHARGES ─────────────────────────────────────────────────────────
function genEtatCharges(wb, sheetName, title, employes, avecRegul) {
  const ws = wb.addWorksheet(sheetName)
  const nCols = avecRegul ? 16 : 14
  const lastCol = avecRegul ? 'P' : 'N'
  const widths = [3.86,53.43,20,41.57,16.86,15.57,23.29,16.71,16.57,23,19.57,13.14,28,15.57,20,15.57]
  for (let i=0; i<nCols; i++) ws.getColumn(i+1).width = widths[i]

  ws.mergeCells(`A1:${lastCol}1`)
  ws.getRow(1).height = 30
  const t = ws.getCell('A1')
  t.value = title; t.font = cal(20,true); t.alignment = aln('center')

  const headers = avecRegul
    ? ['N°','Nom et Prénoms','Responsable','Poste','Pole','Salaire brut','Salaire brut imposable','CNSS Salarié 4%','AMU Salarié 5%','CNSS Patronale 17,5%','AMU Patronale 5%','IRPP Salarié','REGULARISATION IRPP','IRPP A PAYER','TOTAL RETENUES SALARIES','NET A PAYER']
    : ['N°','Nom et Prénoms','Responsable','Poste','Pole','Salaire brut','Salaire brut imposable','CNSS Salarié 4%','AMU Salarié 5%','CNSS Patronale 17,5%','AMU Patronale 5%','IRPP Salarié','TOTAL RETENUES SALARIES','NET A PAYER']

  for (let ci=1; ci<=headers.length; ci++) {
    const c = ws.getRow(2).getCell(ci)
    c.value = headers[ci-1]; c.font = cal(12,true)
    c.alignment = { horizontal:'center', wrapText:true }
    c.border = { left:thin(), right:thin(), top:thin(), bottom:thin() }
  }
  ws.getRow(2).height = 40

  for (let i=0; i<employes.length; i++) {
    const r = i+3; const emp = employes[i]
    for (let ci=1; ci<=5; ci++) {
      const c = ws.getRow(r).getCell(ci)
      c.value = [i+1, emp.nom, emp.responsable, emp.poste, emp.pole][ci-1]
      c.font = cal(11,false)
    }
    const vals = avecRegul
      ? [[6,{formula:`P${r}+O${r}`}],[7,emp.brut_imposable],[8,{formula:`G${r}*4%`}],[9,{formula:`G${r}*5%`}],[10,{formula:`G${r}*17.5%`}],[11,{formula:`G${r}*5%`}],[12,emp.irpp],[13,emp.regularisation_irpp||0],[14,{formula:`L${r}+M${r}`}],[15,{formula:`H${r}+I${r}+N${r}`}],[16,emp.net_payer]]
      : [[6,{formula:`N${r}+M${r}`}],[7,emp.brut_imposable],[8,{formula:`G${r}*4%`}],[9,{formula:`G${r}*5%`}],[10,{formula:`G${r}*17.5%`}],[11,{formula:`G${r}*5%`}],[12,emp.irpp],[13,{formula:`H${r}+I${r}+L${r}`}],[14,emp.net_payer]]
    for (const [ci, val] of vals) {
      const c = ws.getRow(r).getCell(ci)
      c.value = val; c.font = cal(ci===nCols?12:11,false); c.numFmt = '#,##0'
    }
  }

  const tr = employes.length+3; const e = tr-1
  ws.getRow(tr).getCell(2).value = 'TOTAL'
  ws.getRow(tr).getCell(2).font  = cal(12,true)
  for (let ci=6; ci<=nCols; ci++) {
    const lc = String.fromCharCode(64+ci)
    const c = ws.getRow(tr).getCell(ci)
    c.value  = { formula: `SUM(${lc}3:${lc}${e})` }
    c.font   = cal(12,true)
    c.border = { left:thin(), right:thin(), top:thin(), bottom:thin() }
    c.numFmt = '#,##0'
  }

  let rr = tr+3
  const recap = [
    ['CNSS PART SALARIALE à Payer',   `SUM(H3:H${e})+SUM(I3:I${e})`],
    ['CNSS PART PATRONALE à Payer',   `SUM(J3:J${e})`],
    ['Total CNSS',                     `SUM(H3:H${e})+SUM(I3:I${e})+SUM(J3:J${e})+SUM(K3:K${e})`],
    ['IRPP à payer',                   avecRegul?`SUM(N3:N${e})`:`SUM(L3:L${e})`],
    ['Montant Global à payer',         avecRegul
      ? `SUM(J3:J${e})+SUM(K3:K${e})+SUM(H3:H${e})+SUM(I3:I${e})+SUM(N3:N${e})`
      : `SUM(J3:J${e})+SUM(K3:K${e})+SUM(H3:H${e})+SUM(I3:I${e})+SUM(L3:L${e})`],
  ]
  for (const [label, formula] of recap) {
    ws.getRow(rr).getCell(3).value = label;   ws.getRow(rr).getCell(3).font = cal(12,true)
    ws.getRow(rr).getCell(4).value = { formula }; ws.getRow(rr).getCell(4).numFmt = '#,##0'
    rr++
  }
}

// ─── SOLDE DE TOUT COMPTE ─────────────────────────────────────────────────────
function genSolde(wb, sheetName, data) {
  const ws = wb.addWorksheet(sheetName)
  ws.getColumn(5).width = 20; ws.getColumn(6).width = 18; ws.getColumn(8).width = 14.285

  ws.mergeCells('B4:H5')
  const t = ws.getCell('B4')
  t.value     = `   ${data.client_nom} : SOLDE DE TOUT COMPTE : ${data.nom}`
  t.font      = cal(20,true)
  t.alignment = aln('center')

  for (const [row, txt, h] of [
    [6, `DEPART : ${data.depart}`, 'left'],
    [7, `DATE D'EMBAUCHE :  ${data.date_embauche}`, 'left'],
    [8, `FIN DE CONTRAT : ${data.fin_contrat}`, null],
    [9, `ANCIENNETE : ${data.anciennete_label}`, 'left'],
  ]) {
    ws.mergeCells(`B${row}:H${row}`)
    const c = ws.getCell(`B${row}`)
    c.value = txt; c.font = cal(14,true)
    if (h) c.alignment = { horizontal: h }
  }

  ws.mergeCells('F10:H10')
  sc(ws,'F10','CALCUL', cal(16,false), aln('center'))
  sc(ws,'F11','BASE',   cal(16,false), aln('center'))
  sc(ws,'G11','TAUX',   cal(16,false), aln('center'))
  sc(ws,'H11','MONTANT',cal(16,false), aln('center'))

  // Salaire mois
  ws.mergeCells('B12:E12')
  sc(ws,'B12',`\u00a0 ${data.salaire_mois_label} `, cal(16,false), aln('left'))
  ws.getCell('H12').value=data.salaire_mois||0; ws.getCell('H12').font=cal(16,false); ws.getCell('H12').numFmt='#,##0'

  // Congés
  ws.mergeCells('B13:E13')
  sc(ws,'B13','INDEMNITE DE CONGES ACQUIS NON JOUIR ', cal(16,false), aln('left'))
  ws.getCell('F13').value=data.base_conges||0; ws.getCell('F13').font=cal(16,false); ws.getCell('F13').numFmt='#,##0'
  const jours = data.jours_conges_list || []
  if (data.taux_conges_auto && jours.length) {
    ws.getCell('G13').value = { formula: `(${jours.map(([j])=>j).join('+')})/30` }
  } else {
    ws.getCell('G13').value = data.taux_conges_manuel || 0
  }
  ws.getCell('G13').font = cal(16,false); ws.getCell('G13').alignment = aln('center')
  ws.getCell('H13').value={formula:'F13*G13'}; ws.getCell('H13').font=cal(16,false); ws.getCell('H13').numFmt='#,##0.00'

  // Total brut
  ws.mergeCells('B14:E14')
  sc(ws,'B14',' TOTAL BRUT SOLDE DE TOUT COMPTE', cal(16,true), aln('left'))
  ws.getCell('H14').value={formula:'H12+H13'}; ws.getCell('H14').font=cal(16,false); ws.getCell('H14').numFmt='#,##0.00'

  // CNSS
  ws.mergeCells('B15:E15')
  sc(ws,'B15','CNSS', cal(16,false), aln('left'))
  ws.getCell('F15').value={formula:'H14-140000'}; ws.getCell('F15').font=cal(16,true); ws.getCell('F15').alignment=aln('center'); ws.getCell('F15').numFmt='#,##0'
  ws.getCell('G15').value=0.04; ws.getCell('G15').font=cal(16,false); ws.getCell('G15').alignment=aln('center'); ws.getCell('G15').numFmt='0%'
  ws.getCell('H15').value={formula:'F15*G15'}; ws.getCell('H15').font=cal(16,false); ws.getCell('H15').numFmt='#,##0'

  // AMU
  ws.mergeCells('B16:E16')
  sc(ws,'B16','AMU', cal(16,false), aln('left'))
  ws.getCell('F16').value={formula:'H14-140000'}; ws.getCell('F16').font=cal(16,true); ws.getCell('F16').alignment=aln('center'); ws.getCell('F16').numFmt='#,##0'
  ws.getCell('G16').value=0.05; ws.getCell('G16').font=cal(16,false); ws.getCell('G16').alignment=aln('center'); ws.getCell('G16').numFmt='0%'
  ws.getCell('H16').value={formula:'F16*G16'}; ws.getCell('H16').font=cal(16,false); ws.getCell('H16').alignment=aln('right'); ws.getCell('H16').numFmt='#,##0'

  // IRPP
  ws.mergeCells('B17:E17')
  sc(ws,'B17','IRPP', cal(16,false), aln('left'))
  ws.getCell('H17').value=data.irpp||0; ws.getCell('H17').font=cal(16,false); ws.getCell('H17').numFmt='#,##0'

  let r = 18
  if (data.retenues_arrierees) {
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'TOTAL RETENUES ARRIEREES RESTANT A PRELEVE', cal(16,false), aln('left'))
    ws.getCell(`H${r}`).value=data.retenues_arrierees; ws.getCell(`H${r}`).numFmt='#,##0'; r++
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'TOTAL DES RETENUES', cal(16,true), aln('left'))
    ws.getCell(`H${r}`).value={formula:`H15+H16+H17+H${r-1}`}; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
  } else {
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'TOTAL DES RETENUES', cal(16,true), aln('left'))
    ws.getCell(`H${r}`).value={formula:'H15+H16+H17'}; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
  }
  const totR = r; r++

  ws.mergeCells(`B${r}:E${r}`)
  sc(ws,`B${r}`,'SALAIRE NET SOLDE DE TOUT COMPTE', cal(16,true), aln('left'))
  ws.getCell(`H${r}`).value={formula:`H14-H${totR}`}; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
  const netR = r; r++

  if (data.inclure_preavis) {
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'MONTANT DU PREAVIS', cal(16,true), aln('left'))
    ws.getCell(`H${r}`).value=data.preavis||0; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
    const preR = r; r++
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'AVANCE SUR SOLDE DE TOUT COMPTE', cal(16,true), aln('left'))
    ws.getCell(`H${r}`).value=data.avance||0; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
    const avR = r; r++
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'NET A PAYER', cal(16,true), aln('left'))
    ws.getCell(`H${r}`).value={formula:`H${netR}-H${preR}-H${avR}`}; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
  } else {
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'AVANCE SUR SOLDE DE TOUT COMPTE', cal(16,true), aln('left'))
    ws.getCell(`H${r}`).value=data.avance||0; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
    const avR = r; r++
    ws.mergeCells(`B${r}:E${r}`)
    sc(ws,`B${r}`,'NET A PAYER', cal(16,true), aln('left'))
    ws.getCell(`H${r}`).value={formula:`H${netR}-H${avR}`}; ws.getCell(`H${r}`).font=cal(16,true); ws.getCell(`H${r}`).numFmt='#,##0'
  }

  if (jours.length) {
    const noteR = r+3
    const total = jours.map(([j])=>j).join(' + ')
    ws.getCell(`B${noteR}`).value = `TAUX DE CONGES ACQUIS NON JOUIR= (${total}) / 30 jours`
    ws.getCell(`B${noteR}`).font  = cal(12,true)
    jours.forEach(([j,l], i) => {
      ws.getCell(`B${noteR+2+(i*2)}`).value = `${j} jours= ${l}`
      ws.getCell(`B${noteR+2+(i*2)}`).font  = cal(12,true)
    })
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Vercel rewrite: /api/:path* → /api/index?_path=:path*
  const urlObj = new URL(req.url, 'http://x')
  const _p     = urlObj.searchParams.get('_path') || ''
  const path   = _p ? `/api/${_p}`.replace(/\/+$/, '') : req.url.split('?')[0].replace(/\/+$/, '')
  const method = req.method

  res.setHeader('Access-Control-Allow-Credentials', 'true')
  if (method === 'OPTIONS') return res.status(200).end()

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    if (path === '/api/auth/me')         return authMe(req, res)
    if (path === '/api/auth/repair-org') return authRepairOrg(req, res)
    if (path === '/api/auth/signup-org') return authSignupOrg(req, res)
    if (path === '/api/auth/debug')      return authDebug(req, res)

    // ── Exports Excel ─────────────────────────────────────────────────────────
    if (path === '/api/export-bulletin') {
      if (method !== 'POST') return res.status(405).end()
      const auth = await requireAuth(req)
      const { period_id, employee_id } = req.body
      if (!period_id || !employee_id) return res.status(400).json({ error: 'period_id et employee_id requis' })
      const db = neon(DB_URL())
      const rows = await db`
        SELECT pv.*, e.first_name, e.last_name, e.position, e.social_security_number,
               e.hire_date, e.phone, e.children_count, e.marital_status, e.category,
               c.name as client_name, c.nif as client_nif, c.num_employeur, c.logo_url,
               pp.period_month, pp.period_year
        FROM payroll_variables pv
        JOIN employees e  ON e.id  = pv.employee_id
        JOIN payroll_periods pp ON pp.id = pv.period_id
        JOIN clients c    ON c.id  = pp.client_id
        WHERE pv.period_id=${period_id} AND pv.employee_id=${employee_id}
      `
      if (!rows.length) return res.status(404).json({ error: 'Variables de paie introuvables. Enregistrez d\'abord les variables dans la période de paie.' })
      const v = rows[0]
      const MOIS = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE']
      const mois = MOIS[(v.period_month||1)-1]
      const brut = calcBrut(v)
      const pers = calcPersonnesCharge(v.marital_status, v.children_count)
      const irpp = calcIrppMensuel(brut, pers)

      const rubriques = []
      if (v.base_salary)         rubriques.push({ label:'Salaire de Base',        base:v.base_salary,        taux_ou_nb:30 })
      if (v.sursalaire)          rubriques.push({ label:'Sursalaire',             base:v.sursalaire,          taux_ou_nb:30 })
      if (v.hire_date) {
        const ann = Math.floor((Date.now()-new Date(v.hire_date))/(1000*60*60*24*365))
        if (ann >= 2) rubriques.push({ label:'Ancienneté', base:Math.round(((v.base_salary||0)+(v.sursalaire||0))*ann*0.02), taux_ou_nb:30 })
      }
      if (v.indemnite_fonction)      rubriques.push({ label:'Indemnité de fonction',     base:v.indemnite_fonction,      taux_ou_nb:30 })
      if (v.indemnite_logement)      rubriques.push({ label:'Indemnité de logement',     base:v.indemnite_logement,      taux_ou_nb:30 })
      if (v.indemnite_transport)     rubriques.push({ label:'Indemnité de Transport',    base:v.indemnite_transport,     taux_ou_nb:30 })
      if (v.indemnite_repas)         rubriques.push({ label:'Indemnité de repas',        base:v.indemnite_repas,         taux_ou_nb:30 })
      if (v.indemnite_communication) rubriques.push({ label:'Indemnité de communication',base:v.indemnite_communication, taux_ou_nb:30 })
      if (v.indemnite_grossesse)     rubriques.push({ label:'Indemnité de grossesse',    base:v.indemnite_grossesse,     taux_ou_nb:30 })

      let logoBuffer = null
      if (v.logo_url) {
        try {
          const lr = await fetch(v.logo_url)
          if (lr.ok) logoBuffer = Buffer.from(await lr.arrayBuffer())
        } catch {}
      }

      const irpp_base = Math.floor((brut*0.91 - Math.min(brut*0.91*12,10_000_000)*0.28/12 - pers*10_000)/1000)*1000

      const wb2 = new ExcelJS.Workbook()
      genBulletin(wb2, `${(v.last_name||'').substring(0,3)} ${mois.substring(0,4)} ${v.period_year}`, {
        nom: `${v.last_name} ${v.first_name}`,
        n_assure: v.social_security_number || '',
        nif: v.client_nif || '',
        direction: v.category || '',
        poste: v.position || '',
        telephone: v.phone || '',
        date_embauche: v.hire_date ? new Date(v.hire_date).toLocaleDateString('fr-FR') : '',
        personnes_charge: pers,
        rubriques,
        avance_salaire: v.avance_salaire || 0,
        irpp,
        irpp_base,
        logoBuffer,
      })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="Bulletin_${v.last_name}_${mois}_${v.period_year}.xlsx"`)
      await wb2.xlsx.write(res)
      return res.end()
    }

    if (path === '/api/export-etat-charges') {
      if (method !== 'POST') return res.status(405).end()
      await requireAuth(req)
      const { period_id, avec_regularisation } = req.body
      const db = neon(DB_URL())
      const rows = await db`
        SELECT pv.*, e.first_name, e.last_name, e.position, e.children_count,
               e.marital_status, e.responsable, e.pole,
               c.name as client_name, pp.period_month, pp.period_year
        FROM payroll_variables pv
        JOIN employees e ON e.id = pv.employee_id
        JOIN payroll_periods pp ON pp.id = pv.period_id
        JOIN clients c ON c.id = pp.client_id
        WHERE pv.period_id = ${period_id}
        ORDER BY e.last_name
      `
      if (!rows.length) return res.status(404).json({ error: 'Aucune variable de paie pour cette période. Saisissez et enregistrez les variables dans Périodes de paie d\'abord.' })
      const p = rows[0]
      const MOIS = ['JANVIER','FEVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DECEMBRE']
      const mois = MOIS[(p.period_month||1)-1]
      const employes = rows.map(v => {
        const brut = calcBrut(v)
        const pers = calcPersonnesCharge(v.marital_status, v.children_count)
        const irpp = calcIrppMensuel(brut, pers)
        const net  = brut - Math.round(brut*0.04) - Math.round(brut*0.05) - irpp
                   - (v.avance_salaire||0) - (v.remboursement_pret||0) - (v.deduction_forfaitaire||0)
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
      const suffix = avec_regularisation ? 'AVEC REGULARISATION' : 'SANS REGULARISATION'
      const wb2 = new ExcelJS.Workbook()
      genEtatCharges(wb2,
        `${mois.substring(0,4)} ${p.period_year}${avec_regularisation?' REGUL':''}`,
        `${p.client_name}: ETAT DES RETENUES ET SALAIRES NETS A PAYER ${mois} ${p.period_year} ${suffix}`,
        employes, !!avec_regularisation)
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="Etat_Charges_${mois}_${p.period_year}.xlsx"`)
      await wb2.xlsx.write(res)
      return res.end()
    }

    if (path === '/api/export-solde') {
      if (method !== 'POST') return res.status(405).end()
      await requireAuth(req)
      const { employee_id, period_id, date_depart, date_fin_contrat,
              jours_conges_list, taux_conges_auto, taux_conges_manuel,
              avance, preavis, inclure_preavis, retenues_arrierees, regularisation_irpp } = req.body
      const db = neon(DB_URL())
      const [emp] = await db`SELECT e.*, c.name as client_name FROM employees e JOIN clients c ON c.id=e.client_id WHERE e.id=${employee_id}`
      if (!emp) return res.status(404).json({ error: 'Employé introuvable' })
      let vars = null
      if (period_id) {
        const vRows = await db`SELECT * FROM payroll_variables WHERE period_id=${period_id} AND employee_id=${employee_id}`
        vars = vRows[0] || null
      }
      const brut = vars ? calcBrut(vars) : 0
      const pers = calcPersonnesCharge(emp.marital_status, emp.children_count)
      const irpp = calcIrppMensuel(brut, pers) + (regularisation_irpp||0)
      const departDate = new Date(date_depart || Date.now())
      const hireDate   = emp.hire_date ? new Date(emp.hire_date) : null
      const ann = hireDate ? Math.floor((departDate-hireDate)/(1000*60*60*24*365)) : 0
      const fmt = d => d ? new Date(d).toLocaleDateString('fr-FR') : ''

      const wb2 = new ExcelJS.Workbook()
      genSolde(wb2, emp.last_name, {
        nom: `${emp.last_name} ${emp.first_name}`,
        client_nom: emp.client_name || '',
        depart: fmt(date_depart),
        date_embauche: fmt(emp.hire_date),
        fin_contrat: fmt(date_fin_contrat || date_depart),
        anciennete_label: ann <= 0 ? '0 an' : ann === 1 ? '1 an' : `${ann} ans`,
        salaire_mois: brut,
        salaire_mois_label: `SALAIRE DU MOIS DE ${departDate.toLocaleDateString('fr-FR',{month:'long'}).toUpperCase()}`,
        base_conges: brut,
        jours_conges_list: jours_conges_list || [],
        taux_conges_auto: taux_conges_auto !== false,
        taux_conges_manuel: taux_conges_manuel || 0,
        irpp,
        avance: avance || 0,
        preavis: preavis || 0,
        inclure_preavis: !!inclure_preavis,
        retenues_arrierees: retenues_arrierees || 0,
      })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="Solde_${emp.last_name}_${fmt(date_depart).replace(/\//g,'-')}.xlsx"`)
      await wb2.xlsx.write(res)
      return res.end()
    }

    // ── CRUD (nécessite auth) ─────────────────────────────────────────────────
    const auth = await requireAuth(req)
    const qpObj = new URL(req.url, 'http://x')
    qpObj.searchParams.delete('_path')
    const qp = Object.fromEntries(qpObj.searchParams)

    // Clients
    if (path === '/api/clients') {
      const { id } = qp
      if (id) {
        if (method === 'GET')    { const r=await sql('SELECT * FROM clients WHERE id=$1 AND organization_id=$2',[id,auth.orgId]); return res.status(r.rows.length?200:404).json(r.rows[0]||{error:'Introuvable'}) }
        if (method === 'PUT' || method === 'PATCH') {
          const b=req.body
          const r=await sql(`UPDATE clients SET name=$1,address=$2,phone=$3,email=$4,ifu=$5,rccm=$6,sector=$7,num_employeur=$8,nif=$9,bp=$10,entite_name=$11,logo_url=$12,updated_at=NOW() WHERE id=$13 AND organization_id=$14 RETURNING *`,
            [b.name,b.address||null,b.phone||null,b.email||null,b.ifu||null,b.rccm||null,b.sector||null,b.num_employeur||null,b.nif||null,b.bp||null,b.entite_name||null,b.logo_url||null,id,auth.orgId])
          return res.status(200).json(r.rows[0])
        }
        if (method === 'DELETE') { await sql('DELETE FROM clients WHERE id=$1 AND organization_id=$2',[id,auth.orgId]); return res.status(200).json({ok:true}) }
      } else {
        if (method === 'GET')  { const r=await sql('SELECT * FROM clients WHERE organization_id=$1 ORDER BY name',[auth.orgId]); return res.status(200).json(r.rows) }
        if (method === 'POST') {
          const b=req.body
          const r=await sql(`INSERT INTO clients (organization_id,name,address,phone,email,ifu,rccm,sector,num_employeur,nif,bp,entite_name,logo_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [auth.orgId,b.name,b.address||null,b.phone||null,b.email||null,b.ifu||null,b.rccm||null,b.sector||null,b.num_employeur||null,b.nif||null,b.bp||null,b.entite_name||null,b.logo_url||null])
          return res.status(201).json(r.rows[0])
        }
      }
    }

    // Employés
    if (path === '/api/employees') {
      const { id, client_id: clientId } = qp
      if (id) {
        if (method === 'GET')    { const r=await sql(`SELECT e.*,c.name as client_name FROM employees e JOIN clients c ON e.client_id=c.id WHERE e.id=$1 AND c.organization_id=$2`,[id,auth.orgId]); return res.status(r.rows.length?200:404).json(r.rows[0]||{error:'Introuvable'}) }
        if (method === 'PUT' || method === 'PATCH') {
          const b=req.body
          const r=await sql(`UPDATE employees SET client_id=$1,matricule=$2,first_name=$3,last_name=$4,gender=$5,birth_date=$6,hire_date=$7,position=$8,category=$9,marital_status=$10,children_count=$11,social_security_number=$12,phone=$13,email=$14,active=$15,status=$16,contract_type=$17,contract_end_date=$18,pole=$19,responsable=$20,updated_at=NOW() WHERE id=$21 RETURNING *`,
            [b.client_id,b.matricule||null,b.first_name,b.last_name,b.gender||'M',b.birth_date||null,b.hire_date||null,b.position||null,b.category||null,b.marital_status,b.children_count||0,b.social_security_number||null,b.phone||null,b.email||null,b.active!==false,b.status||'actif',b.contract_type||'cdi',b.contract_end_date||null,b.pole||null,b.responsable||null,id])
          return res.status(200).json(r.rows[0])
        }
        if (method === 'DELETE') { await sql('DELETE FROM employees WHERE id=$1',[id]); return res.status(200).json({ok:true}) }
      } else {
        if (method === 'GET')  {
          let q=`SELECT e.*,c.name as client_name FROM employees e JOIN clients c ON e.client_id=c.id WHERE c.organization_id=$1`
          const p=[auth.orgId]
          if (clientId) { q+=' AND e.client_id=$2'; p.push(clientId) }
          q+=' ORDER BY e.last_name'
          const r=await sql(q,p); return res.status(200).json(r.rows)
        }
        if (method === 'POST') {
          const b=req.body
          const r=await sql(`INSERT INTO employees (client_id,matricule,first_name,last_name,gender,birth_date,hire_date,position,category,marital_status,children_count,social_security_number,phone,email,active,status,contract_type,contract_end_date,pole,responsable) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
            [b.client_id,b.matricule||null,b.first_name,b.last_name,b.gender||'M',b.birth_date||null,b.hire_date||null,b.position||null,b.category||null,b.marital_status||'celibataire',b.children_count||0,b.social_security_number||null,b.phone||null,b.email||null,b.active!==false,b.status||'actif',b.contract_type||'cdi',b.contract_end_date||null,b.pole||null,b.responsable||null])
          return res.status(201).json(r.rows[0])
        }
      }
    }

    // Périodes de paie
    if (path === '/api/payroll') {
      const { id, client_id: clientId } = qp
      if (id) {
        if (method === 'GET') {
          const r=await sql(`SELECT pp.*,c.name as client_name,c.logo_url,c.num_employeur,c.nif,c.bp,c.phone as client_phone,c.entite_name FROM payroll_periods pp JOIN clients c ON pp.client_id=c.id WHERE pp.id=$1 AND c.organization_id=$2`,[id,auth.orgId])
          return res.status(r.rows.length?200:404).json(r.rows[0]||{error:'Introuvable'})
        }
        if (method === 'PATCH') {
          const b=req.body; const keys=Object.keys(b)
          const sets=keys.map((k,i)=>`${k}=$${i+1}`).join(', ')
          const vals=[...Object.values(b),id]
          const r=await sql(`UPDATE payroll_periods SET ${sets},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`,vals)
          return res.status(200).json(r.rows[0])
        }
      } else {
        if (method === 'GET') {
          let q=`SELECT pp.*,c.name as client_name FROM payroll_periods pp JOIN clients c ON pp.client_id=c.id WHERE c.organization_id=$1`
          const p=[auth.orgId]
          if (clientId) { q+=' AND pp.client_id=$2'; p.push(clientId) }
          q+=' ORDER BY pp.period_year DESC,pp.period_month DESC'
          const r=await sql(q,p); return res.status(200).json(r.rows)
        }
        if (method === 'POST') {
          const { client_id, period_month, period_year } = req.body
          const ex=await sql('SELECT id FROM payroll_periods WHERE client_id=$1 AND period_year=$2 AND period_month=$3',[client_id,period_year,period_month])
          if (ex.rows.length) return res.status(409).json({ error:'Période déjà existante' })
          const r=await sql('INSERT INTO payroll_periods (client_id,period_month,period_year,status) VALUES ($1,$2,$3,$4) RETURNING *',[client_id,period_month,period_year,'open'])
          return res.status(201).json(r.rows[0])
        }
      }
    }

    // Variables de paie
    if (path === '/api/payroll-variables') {
      const { period_id, employee_id } = qp
      if (method === 'GET') {
        let q=`SELECT pv.*,e.first_name,e.last_name,e.matricule,e.position,e.category,e.marital_status,e.children_count FROM payroll_variables pv JOIN employees e ON pv.employee_id=e.id WHERE pv.period_id=$1`
        const p=[period_id]
        if (employee_id) { q+=' AND pv.employee_id=$2'; p.push(employee_id) }
        const r=await sql(q,p); return res.status(200).json(r.rows)
      }
      if (method === 'POST' || method === 'PUT') {
        const b=req.body
        const ex=await sql('SELECT id FROM payroll_variables WHERE period_id=$1 AND employee_id=$2',[b.period_id,b.employee_id])
        let r
        if (ex.rows.length) {
          const { period_id:_p, employee_id:_e, ...rest } = b
          const keys=Object.keys(rest)
          const sets=keys.map((k,i)=>`${k}=$${i+1}`).join(', ')
          r=await sql(`UPDATE payroll_variables SET ${sets},updated_at=NOW() WHERE id=$${keys.length+1} RETURNING *`,[...Object.values(rest),ex.rows[0].id])
        } else {
          const keys=Object.keys(b)
          r=await sql(`INSERT INTO payroll_variables (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,Object.values(b))
        }
        return res.status(200).json(r.rows[0])
      }
    }

    // Grilles salariales
    if (path === '/api/salary-grids') {
      const { id } = qp
      if (id) {
        if (method === 'PUT')    { const b=req.body; const r=await sql('UPDATE salary_grids SET category=$1,echelon=$2,base_salary=$3,hourly_rate=$4 WHERE id=$5 RETURNING *',[b.category,b.echelon,b.base_salary,b.hourly_rate,id]); return res.status(200).json(r.rows[0]) }
        if (method === 'DELETE') { await sql('DELETE FROM salary_grids WHERE id=$1',[id]); return res.status(200).json({ok:true}) }
      } else {
        if (method === 'GET')  { const r=await sql(`SELECT sg.*,c.name as client_name FROM salary_grids sg JOIN clients c ON sg.client_id=c.id WHERE c.organization_id=$1 ORDER BY sg.category,sg.echelon`,[auth.orgId]); return res.status(200).json(r.rows) }
        if (method === 'POST') { const b=req.body; const r=await sql('INSERT INTO salary_grids (client_id,category,echelon,base_salary,hourly_rate) VALUES ($1,$2,$3,$4,$5) RETURNING *',[b.client_id,b.category,b.echelon||1,b.base_salary||0,b.hourly_rate||0]); return res.status(201).json(r.rows[0]) }
      }
    }

    // Journal d'activité
    if (path === '/api/activity') {
      if (method === 'GET')  { const r=await sql('SELECT * FROM activity_logs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',[auth.orgId]); return res.status(200).json(r.rows) }
      if (method === 'POST') { const { action, details }=req.body; await sql('INSERT INTO activity_logs (organization_id,user_id,action,details) VALUES ($1,$2,$3,$4)',[auth.orgId,auth.userId,action,details||null]); return res.status(201).json({ok:true}) }
    }

    // Upload logo
    if (path === '/api/upload-logo') {
      if (method !== 'POST') return res.status(405).end()
      let buffer
      if (req.body && Buffer.isBuffer(req.body)) {
        buffer = req.body
      } else if (req.body instanceof Uint8Array) {
        buffer = Buffer.from(req.body)
      } else {
        // Vercel n'a pas parsé ce body (binary) - lire manuellement
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        buffer = Buffer.concat(chunks)
      }
      const contentType = req.headers['x-content-type'] || 'image/png'
      const filename    = req.headers['x-filename']     || `logo-${Date.now()}.png`
      const blob = await put(`logos/${filename}`, buffer, { access:'public', contentType, token:process.env.BLOB_READ_WRITE_TOKEN })
      return res.status(200).json({ url: blob.url })
    }

    return res.status(404).json({ error: `Route introuvable: ${path}` })

  } catch (e) {
    console.error('[router]', path, e.message)
    const is401 = e.message?.includes('auth') || e.message?.includes('authentif') ||
                  e.message?.includes('Session') || e.message?.includes('cookie')
    return res.status(is401 ? 401 : 500).json({ error: e.message })
  }
}
