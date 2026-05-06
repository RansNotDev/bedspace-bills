const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter on startup (optional, logs to console)
transporter.verify((error) => {
  if (error) {
    console.error('❌ Email transporter error:', error.message);
  } else {
    console.log('✅ Email transporter ready');
  }
});

/**
 * Format a date to Philippine locale string
 */
function formatPHDate(date) {
  return new Date(date).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format currency in PHP
 */
function formatPHP(amount) {
  return `PHP ${Number(amount).toFixed(2)}`;
}

/**
 * Send payment link email to a tenant
 * @param {Object} params
 * @param {string} params.toEmail - Recipient email
 * @param {string} params.nickname - Tenant nickname
 * @param {string} params.monthLabel - e.g. "May 2025"
 * @param {Object} params.bill - TenantBill document
 * @param {Object} params.billCycle - BillCycle document
 * @param {string} params.paymentLinkUrl - Full URL to payment page
 */
async function sendPaymentLinkEmail({
  toEmail,
  nickname,
  monthLabel,
  bill,
  billCycle,
  paymentLinkUrl,
}) {
  const deadlineStr = formatPHDate(billCycle.deadline);
  const expiryStr = formatPHDate(bill.paymentLinkExpiry);

  const gcashElec = billCycle.gcashNumbers?.electricity || 'N/A';
  const gcashWater = billCycle.gcashNumbers?.water || 'N/A';
  const gcashOthers = billCycle.gcashNumbers?.others || 'N/A';

  const qrElec = billCycle.gcashQRImages?.electricity || '';
  const qrWater = billCycle.gcashQRImages?.water || '';
  const qrOthers = billCycle.gcashQRImages?.others || '';

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #1d4ed8; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .bill-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .bill-table th, .bill-table td { padding: 10px; border: 1px solid #e5e7eb; text-align: left; }
    .bill-table th { background: #f3f4f6; }
    .total-row { font-weight: bold; background: #eff6ff; }
    .btn { display: inline-block; background: #1d4ed8; color: white; padding: 12px 24px;
           text-decoration: none; border-radius: 6px; margin: 16px 0; }
    .gcash-section { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .qr-img { width: 150px; height: 150px; object-fit: contain; margin: 8px 0; }
    .expiry-note { color: #dc2626; font-size: 13px; }
    .footer { color: #6b7280; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h2>📋 Your Bill for ${monthLabel}</h2>
    <p>Bedspace Bill Manager</p>
  </div>
  <div class="content">
    <p>Hi <strong>${nickname}</strong>,</p>
    <p>Your bill for <strong>${monthLabel}</strong> is ready. Please review the breakdown below.</p>

    <table class="bill-table">
      <thead>
        <tr><th>Description</th><th>Amount</th></tr>
      </thead>
      <tbody>
        <tr><td>⚡ Electricity Share</td><td>${formatPHP(bill.electricityShare)}</td></tr>
        <tr><td>💧 Water Share</td><td>${formatPHP(bill.waterShare)}</td></tr>
        <tr><td>🚰 Drinking Water</td><td>${formatPHP(bill.drinkingWaterShare)}</td></tr>
        <tr><td>🗑️ Trash Bags</td><td>${formatPHP(bill.trashBagShare)}</td></tr>
        <tr class="total-row"><td>TOTAL</td><td>${formatPHP(bill.totalAmount)}</td></tr>
      </tbody>
    </table>

    <p>📅 <strong>Payment Deadline:</strong> ${deadlineStr}</p>

    <div class="gcash-section">
      <h3>💳 Pay via GCash</h3>
      <p><strong>Electricity GCash:</strong> ${gcashElec}</p>
      ${qrElec ? `<img src="${qrElec}" alt="Electricity QR" class="qr-img" />` : ''}
      <p><strong>Water GCash:</strong> ${gcashWater}</p>
      ${qrWater ? `<img src="${qrWater}" alt="Water QR" class="qr-img" />` : ''}
      <p><strong>Others GCash:</strong> ${gcashOthers}</p>
      ${qrOthers ? `<img src="${qrOthers}" alt="Others QR" class="qr-img" />` : ''}
    </div>

    <p>Click the button below to view your bill and upload your payment receipt:</p>
    <a href="${paymentLinkUrl}" class="btn">View Bill & Upload Receipt</a>

    <p class="expiry-note">⚠️ This link expires on: <strong>${expiryStr}</strong></p>

    <div class="footer">
      <p>Thank you for your prompt payment!</p>
      <p>— Bedspace Management</p>
    </div>
  </div>
</body>
</html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `📋 Your Bill for ${monthLabel} — Bedspace`,
    html: htmlBody,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendPaymentLinkEmail };
