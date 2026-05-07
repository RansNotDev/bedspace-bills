import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPHP, getMonthLabel, formatPHDate } from '../utils/helpers';

/** Brand colors: deep teal + warm slate */
const THEME = {
  header: [13, 110, 118],
  headerAccent: [212, 175, 55],
  band: [240, 248, 248],
  textMuted: [71, 85, 105],
};

function getUtilitiesSubtotal(bill) {
  if (bill.utilitiesSubtotal != null && bill.utilitiesSubtotal !== '') {
    return Number(bill.utilitiesSubtotal);
  }
  return (
    Number(bill.electricityShare || 0) +
    Number(bill.waterShare || 0) +
    Number(bill.drinkingWaterShare || 0) +
    Number(bill.trashBagShare || 0)
  );
}

/**
 * Monthly bill cycle PDF — includes bedspace location block and rent / discount columns.
 * @param {Object} cycle - BillCycle (with optional populated bedspaceId)
 * @param {Array} tenantBills - TenantBill rows with populated tenantId
 * @param {Object} [bedspace] - { name, locationName, locationAddress } from cycle.bedspaceId or fallback
 */
export function generatePDFReport(cycle, tenantBills, bedspace) {
  const doc = new jsPDF();
  const monthLabel = getMonthLabel(cycle.month, cycle.year);
  const generatedDate = new Date().toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const loc = bedspace || cycle.bedspaceId || {};
  const locationTitle = loc.locationName || loc.name || 'Bedspace';
  const addr = loc.locationAddress || '';
  const landlordRulesPdf = String(loc.pdfRulesText || '').trim();

  // ─── Header band ───────────────────────────────────────────────────────────
  doc.setFillColor(...THEME.header);
  doc.rect(0, 0, 210, 42, 'F');

  doc.setDrawColor(...THEME.headerAccent);
  doc.setLineWidth(1.2);
  doc.line(0, 42, 210, 42);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Bedspace Bill Manager', 14, 14);

  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.text(locationTitle, 14, 26);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Monthly statement — ${monthLabel}`, 14, 34);

  // Location box
  doc.setTextColor(...THEME.textMuted);
  doc.setFillColor(...THEME.band);
  doc.roundedRect(14, 48, 182, addr ? 22 : 14, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...THEME.header);
  doc.text('Property location', 18, 55);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  const propName = loc.name ? `Building / unit: ${loc.name}` : '';
  doc.setFontSize(8.5);
  doc.text(propName || locationTitle, 18, 61);
  if (addr) {
    doc.setTextColor(...THEME.textMuted);
    doc.text(addr, 18, 67, { maxWidth: 170 });
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  const summaryY = addr ? 78 : 70;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('House totals (this cycle)', 14, summaryY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const totalBilled = tenantBills.reduce((s, b) => s + b.totalAmount, 0);
  const totalCollected = tenantBills.filter((b) => b.isPaid === true).reduce((s, b) => s + b.totalAmount, 0);
  const paidCount = tenantBills.filter((b) => b.isPaid === true).length;
  const unpaidCount = tenantBills.filter((b) => b.isPaid !== true).length;

  const summaryData = [
    ['Electricity total (PHP)', formatPHP(cycle.electricityTotal)],
    ['Water bill (PHP)', formatPHP(cycle.waterBill)],
    ['Drinking water pool (PHP)', formatPHP(cycle.drinkingWater)],
    ['Trash bags pool (PHP)', formatPHP(cycle.trashBags)],
    ['Payment deadline', formatPHDate(cycle.deadline)],
    ['Total billed (all tenants)', formatPHP(totalBilled)],
    ['Total collected', formatPHP(totalCollected)],
    ['Paid / Unpaid', `${paidCount} paid, ${unpaidCount} unpaid`],
  ];

  autoTable(doc, {
    startY: summaryY + 4,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [30, 30, 30] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 72, textColor: THEME.header },
      1: { cellWidth: 70 },
    },
    margin: { left: 14 },
  });

  let yBlock = doc.lastAutoTable.finalY + 10;
  if (landlordRulesPdf) {
    doc.setFillColor(252, 250, 245);
    doc.setDrawColor(...THEME.headerAccent);
    doc.setLineWidth(0.3);
    const ruleLines = doc.splitTextToSize(landlordRulesPdf, 178);
    const boxPad = 6;
    const titleH = 7;
    const lineH = 4.1;
    const boxH = boxPad * 2 + titleH + ruleLines.length * lineH;
    doc.roundedRect(12, yBlock, 186, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...THEME.header);
    doc.text('Rules & notices (from landlord)', 12 + boxPad, yBlock + boxPad + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(35, 35, 35);
    doc.text(ruleLines, 12 + boxPad, yBlock + boxPad + titleH + 5);
    yBlock += boxH + 8;
  } else {
    yBlock += 4;
  }

  const tableStartY = yBlock + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...THEME.header);
  doc.text('Tenant breakdown (utilities, rent, discount, total)', 14, tableStartY);

  const tableRows = tenantBills.map((bill) => {
    const u = getUtilitiesSubtotal(bill);
    const rent = Number(bill.rentAmount || 0);
    const dPct = Number(bill.discountPercent || 0);
    return [
      bill.tenantId?.nickname || 'Unknown',
      bill.tenantId?.roomType === 'aircon' ? 'Aircon' : 'Non-Aircon',
      formatPHP(u),
      formatPHP(rent),
      dPct > 0 ? `${dPct}%` : '—',
      formatPHP(bill.discountAmount || 0),
      formatPHP(bill.totalAmount),
      bill.isPaid === true ? 'Paid' : 'Unpaid',
    ];
  });

  autoTable(doc, {
    startY: tableStartY + 4,
    head: [['Tenant', 'Room', 'Utils', 'Rent', 'Disc%', 'Disc ₱', 'Total', 'Status']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: THEME.header,
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: { fontSize: 7.5 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22, halign: 'center' },
      2: { halign: 'right', cellWidth: 22 },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 24, fontStyle: 'bold', textColor: THEME.header },
      7: { halign: 'center', cellWidth: 18 },
    },
    alternateRowStyles: { fillColor: THEME.band },
    margin: { left: 10, right: 10 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated ${generatedDate} · Page ${i}/${pageCount}`, 14, doc.internal.pageSize.height - 10);
  }

  const safeFile = `${locationTitle}-${monthLabel}`.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-');
  doc.save(`bedspace-report-${safeFile}.pdf`);
}

/**
 * Printable calendar agenda PDF (general or filtered tenant / property).
 * @param {{ title: string, subtitle?: string, events: Array<{ start: Date, title: string, type?: string }>, locationLine?: string }} opts
 */
export function generateCalendarReport({ title, subtitle, events, locationLine }) {
  const doc = new jsPDF();
  doc.setFillColor(...THEME.header);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title || 'Calendar', 14, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle || '', 14, 19);
  if (locationLine) {
    doc.setFontSize(8);
    doc.text(locationLine, 14, 25);
  }

  const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
  const rows = sorted.map((e) => [
    formatPHDate(e.start),
    e.title || '',
    e.type || '',
  ]);

  autoTable(doc, {
    startY: locationLine ? 34 : 32,
    head: [['Date', 'Event', 'Type']],
    body: rows.length ? rows : [['—', 'No events in this view', '']],
    theme: 'striped',
    headStyles: { fillColor: THEME.header, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 36 },
      1: { cellWidth: 120 },
      2: { cellWidth: 34 },
    },
    margin: { left: 14, right: 14 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Page ${i}/${pageCount}`, 14, doc.internal.pageSize.height - 10);
  }

  doc.save('bedspace-calendar-report.pdf');
}
