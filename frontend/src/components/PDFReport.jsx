import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPHP, getMonthLabel, formatPHDate } from '../utils/helpers';

/**
 * Generate and download a PDF report for a bill cycle
 * @param {Object} cycle - BillCycle document
 * @param {Array} tenantBills - Array of TenantBill documents with populated tenantId
 */
export function generatePDFReport(cycle, tenantBills) {
  const doc = new jsPDF();
  const monthLabel = getMonthLabel(cycle.month, cycle.year);
  const generatedDate = new Date().toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // ─── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(29, 78, 216); // blue-700
  doc.rect(0, 0, 210, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Bedspace Bill Manager', 14, 15);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Monthly Report — ${monthLabel}`, 14, 25);

  // ─── Summary ──────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const totalBilled = tenantBills.reduce((s, b) => s + b.totalAmount, 0);
  const totalCollected = tenantBills.filter((b) => b.isPaid).reduce((s, b) => s + b.totalAmount, 0);
  const paidCount = tenantBills.filter((b) => b.isPaid).length;
  const unpaidCount = tenantBills.filter((b) => !b.isPaid).length;

  const summaryY = 45;
  doc.setFont('helvetica', 'bold');
  doc.text('Bill Summary', 14, summaryY);
  doc.setFont('helvetica', 'normal');

  const summaryData = [
    ['Electricity Total', formatPHP(cycle.electricityTotal)],
    ['Water Bill', formatPHP(cycle.waterBill)],
    ['Drinking Water', formatPHP(cycle.drinkingWater)],
    ['Trash Bags', formatPHP(cycle.trashBags)],
    ['Payment Deadline', formatPHDate(cycle.deadline)],
    ['Total Billed', formatPHP(totalBilled)],
    ['Total Collected', formatPHP(totalCollected)],
    ['Paid Tenants', `${paidCount} / ${tenantBills.length}`],
    ['Unpaid Tenants', `${unpaidCount}`],
  ];

  autoTable(doc, {
    startY: summaryY + 4,
    head: [],
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 60 },
    },
    margin: { left: 14 },
  });

  // ─── Tenant Bills Table ────────────────────────────────────────────────────
  const tableStartY = doc.lastAutoTable.finalY + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Tenant Bill Breakdown', 14, tableStartY);

  const tableRows = tenantBills.map((bill) => [
    bill.tenantId?.nickname || 'Unknown',
    bill.tenantId?.roomType === 'aircon' ? 'Aircon' : 'Non-Aircon',
    formatPHP(bill.electricityShare),
    formatPHP(bill.waterShare),
    formatPHP(bill.drinkingWaterShare),
    formatPHP(bill.trashBagShare),
    formatPHP(bill.totalAmount),
    bill.isPaid ? '✓ Paid' : '✗ Unpaid',
  ]);

  autoTable(doc, {
    startY: tableStartY + 4,
    head: [['Tenant', 'Room', 'Electricity', 'Water', 'Drinking', 'Trash', 'Total', 'Status']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      7: {
        fontStyle: 'bold',
        textColor: (cell) => (cell.raw.includes('Paid') ? [22, 163, 74] : [220, 38, 38]),
      },
    },
    margin: { left: 14, right: 14 },
  });

  // ─── Footer ───────────────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Generated on ${generatedDate} | Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.height - 10
    );
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  doc.save(`bedspace-bills-${monthLabel.replace(' ', '-')}.pdf`);
}
