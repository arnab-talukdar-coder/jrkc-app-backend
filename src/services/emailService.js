import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

const SENDER = `"${process.env.SENDER_NAME || 'JRKC Rail Infra HRMS'}" <${process.env.GMAIL_USER}>`;

// ── Helpers ────────────────────────────────────────────────────────────────

function baseHtml(title, body) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: 'Segoe UI', Roboto, sans-serif; background: #f0f4f8; margin: 0; padding: 0; }
    .wrapper { max-width: 580px; margin: 30px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 30px 36px; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 700; }
    .header p  { color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 13px; }
    .body { padding: 32px 36px; }
    .body h2 { color: #1e293b; margin: 0 0 12px; font-size: 18px; }
    .body p  { color: #475569; line-height: 1.7; margin: 0 0 12px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .info-box p { margin: 6px 0; font-size: 14px; }
    .info-box .label { color: #64748b; font-weight: 500; }
    .info-box .value { color: #0f172a; font-weight: 700; }
    .btn { display: inline-block; background: #047857; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin-top: 8px; }
    .footer { background: #f8fafc; padding: 20px 36px; text-align: center; }
    .footer p { color: #94a3b8; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>JRKC Rail Infra Pvt. Ltd.</h1>
      <p>Human Resource Management System</p>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} JRKC Rail Infra Private Limited · CIN: U30204UP2023PTC187418</p>
      <p>This is an automated email. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendMail({ to, subject, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('📧 Email not configured. Skipping:', subject);
    return;
  }
  try {
    await getTransporter().sendMail({ from: SENDER, to, subject, html });
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`📧 Email failed to ${to}:`, err.message);
  }
}

// ── Email Functions ────────────────────────────────────────────────────────

export async function sendWelcomeEmail(user) {
  await sendMail({
    to: user.email,
    subject: 'Registration Received — JRKC Rail HRMS',
    html: baseHtml('Registration Received', `
      <h2>Thank you for registering, ${user.name}!</h2>
      <p>Your registration request has been received and is currently under review.</p>
      <div class="info-box">
        <p><span class="label">Name: </span><span class="value">${user.name}</span></p>
        <p><span class="label">Email: </span><span class="value">${user.email}</span></p>
        <p><span class="label">Designation: </span><span class="value">${user.designation || '—'}</span></p>
        <p><span class="label">Department: </span><span class="value">${user.department || '—'}</span></p>
      </div>
      <p>Once your account is approved, you will receive an email with your login credentials.</p>
      <p>If you have any questions, please contact HR at <strong>hr@jrkcrail.com</strong>.</p>
    `)
  });
}

export async function sendApprovalWithCredentials(user, tempPassword) {
  await sendMail({
    to: user.email,
    subject: 'Account Approved — Your Login Credentials',
    html: baseHtml('Account Approved', `
      <h2>Welcome to JRKC Rail HRMS, ${user.name}!</h2>
      <p>Your account has been approved. You can now log in using the credentials below.</p>
      <div class="info-box">
        <p><span class="label">Email: </span><span class="value">${user.email}</span></p>
        <p><span class="label">Temporary Password: </span><span class="value">${tempPassword}</span></p>
      </div>
      <p style="color:#dc2626;font-weight:600;">⚠️ You will be required to change your password on first login.</p>
      <p>Please keep your credentials secure and do not share them with anyone.</p>
      <p>For support, contact HR at <strong>hr@jrkcrail.com</strong>.</p>
    `)
  });
}

export async function sendRejectionEmail(user, reason) {
  await sendMail({
    to: user.email,
    subject: 'Registration Update — JRKC Rail HRMS',
    html: baseHtml('Registration Update', `
      <h2>Registration Status Update</h2>
      <p>Dear ${user.name},</p>
      <p>After careful review, we regret to inform you that your registration request has not been approved at this time.</p>
      ${reason ? `<div class="info-box"><p><span class="label">Reason: </span><span class="value">${reason}</span></p></div>` : ''}
      <p>For further clarification, please contact HR at <strong>hr@jrkcrail.com</strong>.</p>
    `)
  });
}

export async function sendLeaveSubmittedEmail(employee, leave) {
  await sendMail({
    to: employee.email,
    subject: `Leave Request Submitted — ${leave.leaveType}`,
    html: baseHtml('Leave Request Submitted', `
      <h2>Leave Request Submitted</h2>
      <p>Dear ${employee.name}, your leave request has been submitted successfully.</p>
      <div class="info-box">
        <p><span class="label">Leave Type: </span><span class="value">${leave.leaveType}</span></p>
        <p><span class="label">From: </span><span class="value">${leave.startDate}</span></p>
        <p><span class="label">To: </span><span class="value">${leave.endDate}</span></p>
        <p><span class="label">Days: </span><span class="value">${leave.totalDays}</span></p>
        <p><span class="label">Status: </span><span class="value">Pending HR Approval</span></p>
      </div>
      <p>You will be notified when your request is reviewed.</p>
    `)
  });
}

export async function sendLeaveStatusEmail(employee, leave) {
  const isApproved = leave.status === 'approved';
  await sendMail({
    to: employee.email,
    subject: `Leave ${isApproved ? 'Approved' : 'Rejected'} — JRKC Rail HRMS`,
    html: baseHtml(`Leave ${isApproved ? 'Approved' : 'Rejected'}`, `
      <h2>Leave Request ${isApproved ? 'Approved ✅' : 'Rejected ❌'}</h2>
      <p>Dear ${employee.name},</p>
      <div class="info-box">
        <p><span class="label">Leave Type: </span><span class="value">${leave.leaveType}</span></p>
        <p><span class="label">From: </span><span class="value">${leave.startDate}</span></p>
        <p><span class="label">To: </span><span class="value">${leave.endDate}</span></p>
        <p><span class="label">Days: </span><span class="value">${leave.totalDays}</span></p>
        <p><span class="label">Status: </span><span class="value">${isApproved ? 'Approved' : 'Rejected'}</span></p>
        ${!isApproved && leave.directorRemarks ? `<p><span class="label">Reason: </span><span class="value">${leave.directorRemarks}</span></p>` : ''}
      </div>
      ${isApproved
        ? '<p>Your approved leave will be excluded from LWP calculations.</p>'
        : '<p>If you have any questions, please contact your HR representative.</p>'}
    `)
  });
}

export async function sendPayslipEmail(employee, payslip, pdfBase64) {
  const mailOptions = {
    to: employee.email,
    subject: `Payslip for ${payslip.payPeriod} — JRKC Rail HRMS`,
    html: baseHtml('Payslip Released', `
      <h2>Your Payslip for ${payslip.payPeriod}</h2>
      <p>Dear ${employee.name}, your salary has been processed. Please find your payslip attached.</p>
      <div class="info-box">
        <p><span class="label">Pay Period: </span><span class="value">${payslip.payPeriod}</span></p>
        <p><span class="label">Gross Salary: </span><span class="value">₹${payslip.grossSalary?.toLocaleString('en-IN')}</span></p>
        <p><span class="label">Total Deductions: </span><span class="value">₹${payslip.totalDeductions?.toLocaleString('en-IN')}</span></p>
        <p><span class="label">Net Pay: </span><span class="value">₹${payslip.netPay?.toLocaleString('en-IN')}</span></p>
      </div>
      <p>Please keep this payslip for your records. For any discrepancies, contact HR.</p>
    `),
  };

  if (pdfBase64) {
    mailOptions.attachments = [{
      filename: `Payslip_${employee.name.replace(/\s+/g, '_')}_${payslip.payPeriod.replace(/\s+/g, '_')}.pdf`,
      content: pdfBase64,
      encoding: 'base64',
      contentType: 'application/pdf'
    }];
  }

  await sendMail(mailOptions);
}

export async function sendNewRegistrationAlert(hrEmail, registration) {
  await sendMail({
    to: hrEmail,
    subject: `New Registration Request — ${registration.name}`,
    html: baseHtml('New Registration Request', `
      <h2>New Employee Registration</h2>
      <p>A new registration request requires your review.</p>
      <div class="info-box">
        <p><span class="label">Name: </span><span class="value">${registration.name}</span></p>
        <p><span class="label">Email: </span><span class="value">${registration.email}</span></p>
        <p><span class="label">Designation: </span><span class="value">${registration.designation || '—'}</span></p>
        <p><span class="label">Department: </span><span class="value">${registration.department || '—'}</span></p>
        <p><span class="label">Requested Role: </span><span class="value">${registration.requestedRole}</span></p>
      </div>
      <p>Please log in to the HRMS portal to review and approve or reject this request.</p>
    `)
  });
}
