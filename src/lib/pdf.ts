import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatXOF, MONTH_NAMES, PayrollResult } from './payroll'
import { supabase } from './supabase'

interface BulletinData {
  employee: any; period: any; variables: any; result: PayrollResult
  orgName: string; returnDoc?: boolean
}

// Couleur bleu clair fond en-tête (comme le PDF DVV)
const HEADER_BG: [number, number, number] = [173, 216, 230]   // light blue
const HEADER_BG2: [number, number, number] = [176, 196, 222]  // steel blue légèrement plus foncé
const RED_LINE: [number, number, number] = [192, 0, 0]
const BLACK: [number, number, number] = [0, 0, 0]
const WHITE: [number, number, number] = [255, 255, 255]
const DARK_BLUE: [number, number, number] = [31, 56, 100]

function num(v: number) {
  // Format nombre avec espaces : 1 308 796
  return v === 0 ? '0' : v.toLocaleString('fr-FR').replace(/\u202f/g, ' ')
}

export async function generateBulletinPDF(data: BulletinData): Promise<jsPDF> {
  const { employee, period, variables, result, orgName, returnDoc } = data
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = 210; const ph = 297
  const ml = 14; const mr = pw - 14
  const monthName = MONTH_NAMES[period.period_month - 1].toUpperCase()
  const client = period.clients || {}

  // ── LOGO (gauche) ──────────────────────────────────────────────────────────
  let logoLoaded = false
  if (client.logo_url) {
    try {
      const resp = await fetch(client.logo_url)
      const blob = await resp.blob()
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob)
      })
      doc.addImage(dataUrl, 'PNG', ml, 8, 45, 22, '', 'FAST')
      logoLoaded = true
    } catch (_) {}
  }
  if (!logoLoaded) {
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK_BLUE)
    doc.text(orgName, ml, 18)
  }

  // ── "BULLETIN DE PAIE" titre (droite) ─────────────────────────────────────
  const titleX = 120; const titleW = mr - titleX
  doc.setFillColor(245, 245, 245)
  doc.rect(titleX, 8, titleW, 10, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(192, 0, 0)
  doc.text('BULLETIN DE PAIE', titleX + titleW / 2, 15, { align: 'center' })
  // Ligne rouge sous le titre
  doc.setDrawColor(...RED_LINE); doc.setLineWidth(0.8)
  doc.line(titleX, 18, mr, 18)

  // ── Période (droite, sous titre) ───────────────────────────────────────────
  const firstDay = `01/${String(period.period_month).padStart(2,'0')}/${period.period_year}`
  const lastDay = `${new Date(period.period_year, period.period_month, 0).getDate()}/${String(period.period_month).padStart(2,'0')}/${period.period_year}`
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3)
  doc.rect(titleX, 20, titleW, 16)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLACK)
  doc.text(`MOIS DE: ${monthName}`, titleX + titleW / 2, 25.5, { align: 'center' })
  doc.text(`PERIODE DU:  ${firstDay}`, titleX + titleW / 2, 30, { align: 'center' })
  doc.text(`AU:  ${lastDay}`, titleX + titleW / 2, 34.5, { align: 'center' })

  let y = 38

  // ── Bloc entité (fond bleu clair) ─────────────────────────────────────────
  doc.setFillColor(...HEADER_BG)
  doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.3)
  doc.rect(ml, y, mr - ml, 14, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLACK)
  const entiteName = client.entite_name || client.name || orgName
  doc.text(`Entité: ${entiteName}`, (pw) / 2, y + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const adresseLine = [client.address || client.bp || '', client.bp || ''].filter(Boolean).join('    ')
  doc.text(adresseLine || (client.bp || ''), pw / 2, y + 10.5, { align: 'center' })
  y += 14

  // ── Bloc N° Employeur / NIF / TEL ─────────────────────────────────────────
  doc.setFillColor(...HEADER_BG2)
  doc.rect(ml, y, mr - ml, 12, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
  const empLine = `N° Employeur : ${client.num_employeur || '—'}     NIF :  ${client.nif || client.ifu || '—'}`
  doc.text(empLine, pw / 2, y + 5, { align: 'center' })
  doc.setFontSize(8.5)
  doc.text(`TEL:${client.phone || '—'}`, pw / 2, y + 10, { align: 'center' })
  y += 12

  // ── Bloc infos salarié ────────────────────────────────────────────────────
  doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.3)
  doc.rect(ml, y, mr - ml, 38)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...BLACK)
  const empName = `${employee.last_name} ${employee.first_name}`
  const infoLeft = ml + 4; let iy = y + 5.5
  const line = (label: string, val: string) => {
    doc.setFont('helvetica', 'bold'); doc.text(label, infoLeft + 28, iy, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.text(val, infoLeft + 30, iy)
    iy += 4.2
  }
  line('Nom & Prénoms :', empName)
  line("N°Assuré :", employee.social_security_number || employee.matricule || '—')
  line('NIF:', employee.nif || '—')
  line('Direction/section:', employee.category || employee.department || '')
  line('Poste/Fonction:', employee.position || '—')
  line('Téléphone:', employee.phone || '—')
  const hireDate = employee.hire_date ? new Date(employee.hire_date).toLocaleDateString('fr-FR') : '—'
  doc.setFont('helvetica', 'normal'); doc.text(`Date d'embauche:  ${hireDate}`, infoLeft, iy)
  iy += 4.5
  doc.text(`Pers à charge `, infoLeft, iy)
  doc.setFont('helvetica', 'bold'); doc.text(String(employee.children_count || 0), infoLeft + 24, iy)
  y += 38

  // ── Tableau principal ─────────────────────────────────────────────────────
  // En-tête colonnes
  const COL = { code: 14, rub: 30, base: 100, taux: 130, ret: 155, gains: 180 }
  const headerH = 5.5
  doc.setFillColor(220, 220, 220)
  doc.rect(ml, y, mr - ml, headerH, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...BLACK)
  doc.text('Code', COL.code + 3, y + 4)
  doc.text('Rubriques', COL.rub + 2, y + 4)
  doc.text('Base', COL.base + 8, y + 4, { align: 'right' })
  doc.text('Taux/NB', COL.taux + 12, y + 4, { align: 'right' })
  doc.text('Retenues', COL.ret + 14, y + 4, { align: 'right' })
  doc.text('Gains', mr - 2, y + 4, { align: 'right' })
  y += headerH
  doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.2)

  // Lignes gains (rubriques brut)
  const rubriqueRows: { label: string; base: number; gains: number }[] = [
    { label: 'Salaire de Base', base: variables.base_salary, gains: variables.base_salary },
    { label: 'Sursalaire', base: variables.overtime_premium, gains: variables.overtime_premium },
    { label: 'Ancienneté', base: variables.anciennete || 0, gains: variables.anciennete || 0 },
    { label: 'Indemnité de fonction', base: variables.function_allowance, gains: variables.function_allowance },
    { label: 'Indemnité de Transport', base: variables.transport_allowance, gains: variables.transport_allowance },
    { label: variables.housing_premium > 0 ? 'Prime de logement' : '', base: variables.housing_premium || 0, gains: variables.housing_premium || 0 },
    { label: variables.meal_premium > 0 ? 'Prime de repas' : '', base: variables.meal_premium || 0, gains: variables.meal_premium || 0 },
  ]

  const rowH = 5.2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
  for (const row of rubriqueRows) {
    doc.rect(ml, y, mr - ml, rowH)
    if (row.label) {
      doc.setTextColor(...BLACK)
      doc.text(row.label, COL.rub + 2, y + 3.8)
      if (row.base > 0) doc.text(num(row.base), COL.base + 8, y + 3.8, { align: 'right' })
      doc.text('30', COL.taux + 12, y + 3.8, { align: 'right' })
      if (row.gains > 0) doc.text(num(row.gains), mr - 2, y + 3.8, { align: 'right' })
      else { doc.text('0', mr - 2, y + 3.8, { align: 'right' }) }
    } else {
      doc.text('', COL.rub + 2, y + 3.8)
      doc.text('30', COL.taux + 12, y + 3.8, { align: 'right' })
      doc.text('0', mr - 2, y + 3.8, { align: 'right' })
    }
    y += rowH
  }

  // Ligne Salaire brut (texte rouge + valeur)
  doc.rect(ml, y, mr - ml, rowH, 'D')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...RED_LINE)
  doc.text('Salaire brut', COL.rub + 2, y + 3.8)
  doc.setTextColor(...BLACK)
  doc.text(num(result.gross_salary), mr - 2, y + 3.8, { align: 'right' })
  y += rowH

  // Cotisations retenues
  const retRows = [
    { label: 'CNSS', base: result.gross_salary, taux: '0,04', retenue: result.cnss_employee },
    { label: 'AMU', base: result.gross_salary, taux: '0,05', retenue: result.amu_employee },
    { label: 'IRPP', base: result.taxable_income_monthly, taux: '', retenue: result.irpp_net },
  ]
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...BLACK)
  for (const row of retRows) {
    doc.rect(ml, y, mr - ml, rowH, 'D')
    doc.text(row.label, COL.rub + 2, y + 3.8)
    doc.text(num(row.base), COL.base + 8, y + 3.8, { align: 'right' })
    if (row.taux) doc.text(row.taux, COL.taux + 12, y + 3.8, { align: 'right' })
    doc.text(num(row.retenue), COL.ret + 14, y + 3.8, { align: 'right' })
    y += rowH
  }

  // Total Retenues Légales
  doc.rect(ml, y, mr - ml, rowH, 'D')
  doc.setFont('helvetica', 'bold')
  doc.text('Total Retenues Légales', COL.rub + 2, y + 3.8)
  doc.text(num(result.total_deductions), COL.ret + 14, y + 3.8, { align: 'right' })
  y += rowH

  // Salaire Net
  doc.rect(ml, y, mr - ml, rowH, 'D')
  doc.setFont('helvetica', 'bold')
  doc.text('Salaire Net ', COL.rub + 2, y + 3.8)
  doc.setFont('helvetica', 'normal'); doc.text('(après Retenues Légales)', COL.rub + 22, y + 3.8)
  doc.setFont('helvetica', 'bold')
  doc.text(num(result.net_payable), mr - 2, y + 3.8, { align: 'right' })
  y += rowH

  // Retenue avance
  const advance = variables.salary_advance || 0
  doc.rect(ml, y, mr - ml, rowH, 'D')
  doc.setFont('helvetica', 'normal')
  doc.text('Retenue avance sur salaire', COL.rub + 2, y + 3.8)
  doc.text(num(advance), COL.ret + 14, y + 3.8, { align: 'right' })
  y += rowH

  // Total autres retenues
  const otherRet = (variables.loan_payment || 0) + advance
  doc.rect(ml, y, mr - ml, rowH, 'D')
  doc.setFont('helvetica', 'bold')
  doc.text('Total Autres retenues', COL.rub + 2, y + 3.8)
  doc.text(num(otherRet - advance), COL.ret + 14, y + 3.8, { align: 'right' })
  y += rowH

  // NET A PAYER (fond gris foncé)
  doc.setFillColor(200, 200, 200)
  doc.rect(ml, y, mr - ml, rowH + 1, 'FD')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...BLACK)
  doc.text('NET A PAYER', (ml + mr) / 2, y + 4.5, { align: 'center' })
  doc.text(num(result.net_payable - (otherRet - advance)), mr - 2, y + 4.5, { align: 'right' })
  y += rowH + 1 + 6

  // ── Signatures + Charges patronales ───────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...BLACK)
  doc.text('Signature et Cachet de l\'employeur', ml, y)

  // Tableau charges patronales (droite)
  const cpX = 140; const cpW = mr - cpX
  const cpRows = [
    { label: 'Charges\nPatronales', val: result.cnss_employer },
    { label: 'AMU Part\nPatronale', val: result.amu_employer },
    { label: 'Masse\nSalariale', val: result.gross_salary + result.employer_total },
  ]
  let cy = y - 2
  for (const row of cpRows) {
    doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.25)
    doc.rect(cpX, cy, cpW * 0.55, 8)
    doc.rect(cpX + cpW * 0.55, cy, cpW * 0.45, 8)
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7)
    const lines = row.label.split('\n')
    doc.text(lines[0], cpX + 1, cy + 3)
    if (lines[1]) doc.text(lines[1], cpX + 1, cy + 6.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.text(num(row.val), cpX + cpW - 1, cy + 5, { align: 'right' })
    cy += 8
  }

  cy += 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
  doc.text('Signature de l\'employé(e)', cpX + cpW / 2, cy, { align: 'center' })

  // Pied de page
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(140, 140, 140)
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')} par ObedPaie · CGI OTR 2025`, pw / 2, ph - 8, { align: 'center' })

  if (!returnDoc) {
    doc.save(`bulletin_${employee.last_name}_${monthName}_${period.period_year}.pdf`)
  }
  return doc
}

// Attestation de travail PDF
export function generateAttestationTravailPDF(employee: any, orgName: string) {
  const doc = new jsPDF(); const pw = doc.internal.pageSize.getWidth()
  doc.setFillColor(37, 99, 235); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('ATTESTATION DE TRAVAIL', pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  let y = 35
  doc.text(`Je soussigné(e), représentant légal de ${orgName},`, 20, y); y += 8
  doc.text('certifie que :', 20, y); y += 12
  doc.setFont('helvetica', 'bold')
  doc.text(`M./Mme ${employee.first_name} ${employee.last_name}`, 20, y); y += 8
  doc.setFont('helvetica', 'normal')
  if (employee.matricule) { doc.text(`Matricule : ${employee.matricule}`, 20, y); y += 7 }
  doc.text(`Poste : ${employee.position || '—'}`, 20, y); y += 7
  doc.text(`Catégorie : ${employee.category || '—'}`, 20, y); y += 7
  if (employee.hire_date) { doc.text(`est employé(e) dans notre entreprise depuis le ${new Date(employee.hire_date).toLocaleDateString('fr-FR')}.`, 20, y); y += 7 }
  y += 10
  doc.text("Cette attestation est délivrée à l'intéressé(e) pour servir et valoir ce que de droit.", 20, y); y += 15
  doc.text(`Lomé, le ${new Date().toLocaleDateString('fr-FR')}`, 20, y); y += 20
  doc.text('Signature et cachet :', pw - 80, y); y += 20
  doc.line(pw - 80, y, pw - 20, y)
  doc.save(`attestation_travail_${employee.last_name}.pdf`)
}

// Attestation de salaire PDF
export function generateAttestationSalairePDF(employee: any, result: PayrollResult, period: any, orgName: string) {
  const doc = new jsPDF(); const pw = doc.internal.pageSize.getWidth()
  const monthName = MONTH_NAMES[period.period_month - 1]
  doc.setFillColor(37, 99, 235); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('ATTESTATION DE SALAIRE', pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  let y = 35
  doc.text(`Je soussigné(e), représentant légal de ${orgName}, certifie que :`, 20, y); y += 12
  doc.setFont('helvetica', 'bold')
  doc.text(`M./Mme ${employee.first_name} ${employee.last_name}`, 20, y); y += 8
  doc.setFont('helvetica', 'normal')
  doc.text(`Poste : ${employee.position || '—'} · Catégorie : ${employee.category || '—'}`, 20, y); y += 7
  doc.text(`perçoit pour la période de ${monthName} ${period.period_year} :`, 20, y); y += 12
  autoTable(doc, { startY: y, body: [['Salaire brut', formatXOF(result.gross_salary)], ['Total retenues', formatXOF(result.total_deductions)], ['Net à payer', formatXOF(result.net_payable)]], theme: 'grid', bodyStyles: { fontSize: 10 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } } })
  y = (doc as any).lastAutoTable.finalY + 15
  doc.text(`Lomé, le ${new Date().toLocaleDateString('fr-FR')}`, 20, y); y += 20
  doc.text('Signature et cachet :', pw - 80, y); y += 20
  doc.line(pw - 80, y, pw - 20, y)
  doc.save(`attestation_salaire_${employee.last_name}_${monthName}${period.period_year}.pdf`)
}

// Bordereau CNSS
export function generateBordereauCNSS(period: any, variables: any[], orgName: string) {
  const doc = new jsPDF('landscape'); const pw = doc.internal.pageSize.getWidth()
  const monthName = MONTH_NAMES[period.period_month - 1]
  doc.setFillColor(37, 99, 235); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text('BORDEREAU DE DÉCLARATION CNSS', pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`Employeur: ${orgName}   |   Période: ${monthName} ${period.period_year}   |   Client: ${period.clients?.name || ''}`, 14, 25)
  const rows = variables.map(v => [v.employees?.matricule || '—', `${v.employees?.first_name || ''} ${v.employees?.last_name || ''}`, formatXOF(v.gross_salary), formatXOF(v.cnss_employee), formatXOF(v.cnss_employer), formatXOF(v.cnss_employee + v.cnss_employer)])
  const totals = ['', 'TOTAL', formatXOF(variables.reduce((s, v) => s + v.gross_salary, 0)), formatXOF(variables.reduce((s, v) => s + v.cnss_employee, 0)), formatXOF(variables.reduce((s, v) => s + v.cnss_employer, 0)), formatXOF(variables.reduce((s, v) => s + v.cnss_employee + v.cnss_employer, 0))]
  autoTable(doc, { startY: 32, head: [['Matricule', 'Nom & Prénom', 'Salaire brut', 'CNSS salarié (4%)', 'CNSS patron (17,5%)', 'Total CNSS']], body: [...rows, totals], theme: 'striped', headStyles: { fillColor: [37, 99, 235], fontSize: 8 }, bodyStyles: { fontSize: 8 }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } } })
  doc.save(`bordereau_CNSS_${monthName}${period.period_year}.pdf`)
}

// Bordereau AMU
export function generateBordereauAMU(period: any, variables: any[], orgName: string) {
  const doc = new jsPDF('landscape'); const pw = doc.internal.pageSize.getWidth()
  const monthName = MONTH_NAMES[period.period_month - 1]
  doc.setFillColor(16, 185, 129); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text('BORDEREAU DE DÉCLARATION AMU', pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`Employeur: ${orgName}   |   Période: ${monthName} ${period.period_year}   |   Client: ${period.clients?.name || ''}`, 14, 25)
  const rows = variables.map(v => [v.employees?.matricule || '—', `${v.employees?.first_name || ''} ${v.employees?.last_name || ''}`, formatXOF(v.gross_salary), formatXOF(v.amu_employee), formatXOF(v.amu_employer), formatXOF(v.amu_employee + v.amu_employer)])
  const totals = ['', 'TOTAL', formatXOF(variables.reduce((s, v) => s + v.gross_salary, 0)), formatXOF(variables.reduce((s, v) => s + v.amu_employee, 0)), formatXOF(variables.reduce((s, v) => s + v.amu_employer, 0)), formatXOF(variables.reduce((s, v) => s + v.amu_employee + v.amu_employer, 0))]
  autoTable(doc, { startY: 32, head: [['Matricule', 'Nom & Prénom', 'Salaire brut', 'AMU salarié (5%)', 'AMU patron (5%)', 'Total AMU']], body: [...rows, totals], theme: 'striped', headStyles: { fillColor: [16, 185, 129], fontSize: 8 }, bodyStyles: { fontSize: 8 }, columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } } })
  doc.save(`bordereau_AMU_${monthName}${period.period_year}.pdf`)
}

// Déclaration IRPP
export function generateDeclarationIRPP(periods: any[], variables: any[], orgName: string, quarter: number, year: number) {
  const doc = new jsPDF('landscape'); const pw = doc.internal.pageSize.getWidth()
  doc.setFillColor(124, 58, 237); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text(`DÉCLARATION IRPP TRIMESTRIELLE — T${quarter} ${year}`, pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(9)
  doc.text(`Employeur: ${orgName}`, 14, 25)
  const rows = variables.map(v => [v.employees?.matricule || '—', `${v.employees?.first_name || ''} ${v.employees?.last_name || ''}`, MONTH_NAMES[(v.period_month || 1) - 1], formatXOF(v.gross_salary), formatXOF(v.taxable_income), formatXOF(v.irpp_net)])
  autoTable(doc, { startY: 32, head: [['Matricule', 'Salarié', 'Mois', 'Salaire brut', 'Revenu imposable', 'IRPP']], body: [...rows, ['', '', 'TOTAL', '', '', formatXOF(variables.reduce((s, v) => s + (v.irpp_net || 0), 0))]], theme: 'striped', headStyles: { fillColor: [124, 58, 237], fontSize: 8 }, bodyStyles: { fontSize: 8 }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } } })
  doc.save(`declaration_IRPP_T${quarter}_${year}.pdf`)
}

// Archivage PDF Supabase Storage
export async function uploadBulletinToStorage(pdfDoc: jsPDF, employeeId: string, periodLabel: string, orgId: string): Promise<{ url: string | null; error: string | null }> {
  try {
    const pdfBlob = pdfDoc.output('blob')
    const filename = `bulletins/${orgId}/${employeeId}/${periodLabel.replace(/\s/g, '-')}.pdf`
    const { error } = await supabase.storage.from('payroll-pdfs').upload(filename, pdfBlob, { contentType: 'application/pdf', upsert: true })
    if (error) return { url: null, error: error.message }
    const { data } = supabase.storage.from('payroll-pdfs').getPublicUrl(filename)
    return { url: data.publicUrl, error: null }
  } catch (e: any) {
    return { url: null, error: e.message }
  }
}
