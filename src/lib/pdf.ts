import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatXOF, MONTH_NAMES, PayrollResult } from './payroll'

interface BulletinData {
  employee: any; period: any; variables: any; result: PayrollResult; orgName: string
}

export function generateBulletinPDF(data: BulletinData, withQR = true) {
  const { employee, period, variables, result, orgName } = data
  const doc = new jsPDF()
  const pw = doc.internal.pageSize.getWidth()
  const monthName = MONTH_NAMES[period.period_month - 1]

  // En-tête gradient simulé
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('BULLETIN DE PAIE', pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0)

  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`Période : ${monthName} ${period.period_year}`, pw / 2, 24, { align: 'center' })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text('EMPLOYEUR', 14, 33)
  doc.setFont('helvetica', 'normal')
  doc.text(orgName, 14, 38); doc.text(period.clients?.name || '', 14, 43)

  doc.setFont('helvetica', 'bold')
  doc.text('SALARIÉ', pw - 14, 33, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text(`${employee.first_name} ${employee.last_name}`, pw - 14, 38, { align: 'right' })
  if (employee.matricule) doc.text(`Matr.: ${employee.matricule}`, pw - 14, 43, { align: 'right' })
  if (employee.position) doc.text(`Poste: ${employee.position}`, pw - 14, 48, { align: 'right' })
  doc.text(`Situation: ${employee.marital_status} — ${employee.children_count} enf.`, pw - 14, 53, { align: 'right' })

  const rows: [string, string][] = []
  const add = (l: string, v: number) => { if (v > 0) rows.push([l, formatXOF(v)]) }
  add('Salaire de base', variables.base_salary)
  add('Heures supplémentaires', result.overtime_amount || 0)
  add('Sursalaire', variables.overtime_premium)
  add('Indemnité grossesse', variables.pregnancy_allowance)
  add('Indemnité de fonction', variables.function_allowance)
  add('Prime de logement', variables.housing_premium)
  add('Prime de repas', variables.meal_premium)
  add('Indemnité transport', variables.transport_allowance)
  add('13ème mois', variables.thirteenth_month || 0)
  add('Prime exceptionnelle', variables.exceptional_bonus || 0)

  autoTable(doc, {
    startY: 60, head: [['ÉLÉMENTS DE RÉMUNÉRATION', 'MONTANT']], body: rows,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 }, columnStyles: { 1: { halign: 'right' } },
  })

  let y: number = (doc as any).lastAutoTable.finalY + 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('SALAIRE BRUT', 14, y); doc.text(formatXOF(result.gross_salary), pw - 14, y, { align: 'right' })

  const retenues: [string, string][] = [
    ['CNSS salarié (4%)', formatXOF(result.cnss_employee)],
    ['INAM salarié (5%)', formatXOF(result.inam_employee)],
    [`Abattement 28% (Art.26 CGI)`, `- ${formatXOF(result.abattement_28)}`],
    [`Déd. charges famille (${employee.children_count} enf.)`, `- ${formatXOF(result.charges_famille)}`],
    ['Revenu imposable mensuel', formatXOF(result.taxable_income_monthly)],
    ['ITS (barème Art.74 CGI 2025)', formatXOF(result.its_net)],
  ]
  if (variables.salary_advance > 0) retenues.push(['Avance sur salaire', formatXOF(variables.salary_advance)])
  if (variables.loan_payment   > 0) retenues.push(['Remboursement prêt', formatXOF(variables.loan_payment)])

  autoTable(doc, {
    startY: y + 5, head: [['COTISATIONS & RETENUES', 'MONTANT']], body: retenues,
    theme: 'striped',
    headStyles: { fillColor: [220, 38, 38], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 }, columnStyles: { 1: { halign: 'right' } },
  })

  y = (doc as any).lastAutoTable.finalY + 4
  doc.text('TOTAL RETENUES', 14, y); doc.text(formatXOF(result.total_deductions), pw - 14, y, { align: 'right' })

  y += 10
  doc.setFillColor(37, 99, 235)
  doc.rect(14, y - 6, pw - 28, 14, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(12)
  doc.text('NET À PAYER', 18, y + 2)
  doc.text(formatXOF(result.net_payable), pw - 18, y + 2, { align: 'right' })
  doc.setTextColor(0, 0, 0)

  y += 18; doc.setFontSize(8); doc.setFont('helvetica', 'bold')
  doc.text('CHARGES PATRONALES', 14, y)
  doc.setFont('helvetica', 'normal')
  y += 5; doc.text(`CNSS employeur (17,5%) : ${formatXOF(result.cnss_employer)}`, 14, y)
  y += 5; doc.text(`INAM employeur (5%)    : ${formatXOF(result.inam_employer)}`, 14, y)
  y += 5; doc.setFont('helvetica', 'bold')
  doc.text(`Total charges : ${formatXOF(result.employer_total)}   |   Coût total employeur : ${formatXOF(result.gross_salary + result.employer_total)}`, 14, y)

  // QR Code vérification
  if (withQR) {
    const qrData = `OBEDPAIE|${employee.last_name}|${monthName}${period.period_year}|NET:${result.net_payable}`
    try {
      // QR code via canvas inline (pas de lib externe au runtime)
      const canvas = document.createElement('canvas')
      import('qrcode').then(QRCode => {
        QRCode.toCanvas(canvas, qrData, { width: 60 }, () => {
          const imgData = canvas.toDataURL('image/png')
          doc.addImage(imgData, 'PNG', pw - 28, y - 20, 20, 20)
        })
      }).catch(() => {})
    } catch (_) {}
  }

  y += 12; doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(120, 120, 120)
  doc.text('Conforme CGI OTR 2025 (Art.26, 73, 74) · Code du Travail Togo 2021 · CNSS 4%+17,5% · INAM 5%+5%', pw / 2, y, { align: 'center' })
  y += 4; doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')} par ${orgName}`, pw / 2, y, { align: 'center' })

  doc.save(`bulletin_${employee.last_name}_${monthName}_${period.period_year}.pdf`)
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
  if (employee.hire_date) {
    doc.text(`est employé(e) dans notre entreprise depuis le ${new Date(employee.hire_date).toLocaleDateString('fr-FR')}.`, 20, y); y += 7
  }
  y += 10
  doc.text('Cette attestation est délivrée à l\'intéressé(e) pour servir et valoir ce que de droit.', 20, y); y += 15
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

  autoTable(doc, {
    startY: y,
    body: [
      ['Salaire brut', formatXOF(result.gross_salary)],
      ['Total retenues', formatXOF(result.total_deductions)],
      ['Net à payer', formatXOF(result.net_payable)],
    ],
    theme: 'grid',
    bodyStyles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  })

  y = (doc as any).lastAutoTable.finalY + 15
  doc.text(`Lomé, le ${new Date().toLocaleDateString('fr-FR')}`, 20, y); y += 20
  doc.text('Signature et cachet :', pw - 80, y); y += 20
  doc.line(pw - 80, y, pw - 20, y)
  doc.save(`attestation_salaire_${employee.last_name}_${monthName}${period.period_year}.pdf`)
}

// Bordereau CNSS PDF
export function generateBordereauCNSS(period: any, variables: any[], orgName: string) {
  const doc = new jsPDF('landscape'); const pw = doc.internal.pageSize.getWidth()
  const monthName = MONTH_NAMES[period.period_month - 1]
  doc.setFillColor(37, 99, 235); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text('BORDEREAU DE DÉCLARATION CNSS', pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`Employeur: ${orgName}   |   Période: ${monthName} ${period.period_year}   |   Client: ${period.clients?.name || ''}`, 14, 25)

  const rows = variables.map(v => [
    v.employees?.matricule || '—',
    `${v.employees?.first_name || ''} ${v.employees?.last_name || ''}`,
    formatXOF(v.gross_salary),
    formatXOF(v.cnss_employee),
    formatXOF(v.cnss_employer),
    formatXOF(v.cnss_employee + v.cnss_employer),
  ])
  const totals = ['', 'TOTAL',
    formatXOF(variables.reduce((s, v) => s + v.gross_salary, 0)),
    formatXOF(variables.reduce((s, v) => s + v.cnss_employee, 0)),
    formatXOF(variables.reduce((s, v) => s + v.cnss_employer, 0)),
    formatXOF(variables.reduce((s, v) => s + v.cnss_employee + v.cnss_employer, 0)),
  ]

  autoTable(doc, {
    startY: 32,
    head: [['Matricule', 'Nom & Prénom', 'Salaire brut', 'CNSS salarié (4%)', 'CNSS patron (17,5%)', 'Total CNSS']],
    body: [...rows, totals],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
  })

  doc.save(`bordereau_CNSS_${monthName}${period.period_year}.pdf`)
}

// Bordereau INAM PDF
export function generateBordereauINAM(period: any, variables: any[], orgName: string) {
  const doc = new jsPDF('landscape'); const pw = doc.internal.pageSize.getWidth()
  const monthName = MONTH_NAMES[period.period_month - 1]
  doc.setFillColor(16, 185, 129); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text('BORDEREAU DE DÉCLARATION INAM', pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text(`Employeur: ${orgName}   |   Période: ${monthName} ${period.period_year}   |   Client: ${period.clients?.name || ''}`, 14, 25)

  const rows = variables.map(v => [
    v.employees?.matricule || '—',
    `${v.employees?.first_name || ''} ${v.employees?.last_name || ''}`,
    formatXOF(v.gross_salary),
    formatXOF(v.inam_employee),
    formatXOF(v.inam_employer),
    formatXOF(v.inam_employee + v.inam_employer),
  ])
  const totals = ['', 'TOTAL',
    formatXOF(variables.reduce((s, v) => s + v.gross_salary, 0)),
    formatXOF(variables.reduce((s, v) => s + v.inam_employee, 0)),
    formatXOF(variables.reduce((s, v) => s + v.inam_employer, 0)),
    formatXOF(variables.reduce((s, v) => s + v.inam_employee + v.inam_employer, 0)),
  ]

  autoTable(doc, {
    startY: 32,
    head: [['Matricule', 'Nom & Prénom', 'Salaire brut', 'INAM salarié (5%)', 'INAM patron (5%)', 'Total INAM']],
    body: [...rows, totals],
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
  })

  doc.save(`bordereau_INAM_${monthName}${period.period_year}.pdf`)
}

// Déclaration ITS trimestrielle
export function generateDeclarationITS(periods: any[], variables: any[], orgName: string, quarter: number, year: number) {
  const doc = new jsPDF('landscape'); const pw = doc.internal.pageSize.getWidth()
  doc.setFillColor(124, 58, 237); doc.rect(0, 0, pw, 18, 'F')
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text(`DÉCLARATION ITS TRIMESTRIELLE — T${quarter} ${year}`, pw / 2, 12, { align: 'center' })
  doc.setTextColor(0, 0, 0); doc.setFontSize(9)
  doc.text(`Employeur: ${orgName}`, 14, 25)

  const rows = variables.map(v => [
    v.employees?.matricule || '—',
    `${v.employees?.first_name || ''} ${v.employees?.last_name || ''}`,
    MONTH_NAMES[(v.period_month || 1) - 1],
    formatXOF(v.gross_salary),
    formatXOF(v.taxable_income),
    formatXOF(v.its_net),
  ])

  autoTable(doc, {
    startY: 32,
    head: [['Matricule', 'Salarié', 'Mois', 'Salaire brut', 'Revenu imposable', 'ITS']],
    body: [...rows, ['', '', 'TOTAL', '', '', formatXOF(variables.reduce((s, v) => s + (v.its_net || 0), 0))]],
    theme: 'striped',
    headStyles: { fillColor: [124, 58, 237], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
  })

  doc.save(`declaration_ITS_T${quarter}_${year}.pdf`)
}
