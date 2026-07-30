import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

// Resolve .env from project root (two directories up from src/services/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath, override: true });

// Startup diagnostics
console.log(`📧 Email Service: Loading .env from ${envPath}`);
console.log(`📧 GMAIL_USER loaded: ${process.env.GMAIL_USER ? process.env.GMAIL_USER : '❌ NOT SET'}`);
console.log(`📧 GMAIL_APP_PASSWORD loaded: ${process.env.GMAIL_APP_PASSWORD ? '✅ (hidden)' : '❌ NOT SET'}`);

// Helper to create transport
let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  const emailUser = process.env.GMAIL_USER || process.env.SMTP_USER || 'gameboyarnab.talukdar1999@gmail.com';
  const emailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || 'crybohbblfigqcqy';
  const smtpHost = process.env.SMTP_HOST;

  if (emailUser && emailPass) {
    if (smtpHost && !smtpHost.includes('gmail')) {
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: emailUser,
          pass: emailPass
        }
      });
    } else {
      // Use Gmail SMTP Service directly
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: emailUser,
          pass: emailPass
        }
      });
    }
  } else {
    // Only use fallback mode if no credentials are provided at all.
    console.warn('⚠️ WARNING: No GMAIL_USER or SMTP_USER provided in environment. Using console mock email transport.');
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('\n=================== [MOCK EMAIL DISPATCHED] ===================');
        console.log(`FROM   : ${mailOptions.from || 'JRKC HR Portal <noreply@gmail.com>'}`);
        console.log(`TO     : ${mailOptions.to}`);
        if (mailOptions.cc) console.log(`CC     : ${mailOptions.cc}`);
        if (mailOptions.replyTo) console.log(`REPLY-TO: ${mailOptions.replyTo}`);
        console.log(`SUBJECT: ${mailOptions.subject}`);
        console.log('===============================================================\n');
        return { messageId: `mock-${Date.now()}` };
      }
    };
  }

  // Verify connection configuration (only if it's a real transporter)
  // NOTE: Do NOT throw on verify failure — some SMTP servers reject verify
  // but still accept mail. The transporter should still be usable.
  if (transporter && typeof transporter.verify === 'function') {
    try {
      await transporter.verify();
      console.log('✅ SMTP Server Connection Verified Successfully!');
    } catch (error) {
      console.error('⚠️ SMTP Server Verify Failed (emails may still work):', error.message);
      console.error('   Full error:', error);
      // Do NOT throw — let the transporter try to send anyway
    }
  }

  return transporter;
}

const SENDER = process.env.GMAIL_USER
  ? `"${process.env.SENDER_NAME || 'JRKC HR Portal'}" <${process.env.GMAIL_USER}>`
  : (process.env.SMTP_FROM || '"JRKC HR Portal System" <hr-portal@jrkc.com>');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || 'admin@jrkc.com';

/**
 * 1. Send Registration Notification to Admin/Director
 */
export async function sendAdminRegistrationAlert(requestDetails) {
  const mailer = await getTransporter();
  const subject = `[ACTION REQUIRED] New Registration Request: ${requestDetails.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4f46e5;">JRKC HR Portal - New Registration Request</h2>
      <p>Hello Admin / Director,</p>
      <p>A new registration request has been submitted and is pending your approval.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Name:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${requestDetails.name}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Email:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${requestDetails.email}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Department:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${requestDetails.department}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Position:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${requestDetails.role}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #eee;">Role Requested:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${requestDetails.requestedUserRole}</td></tr>
      </table>
      <p style="margin-top: 20px;">Please log into the HR Admin Portal to approve or reject this request.</p>
    </div>
  `;

  return mailer.sendMail({
    from: SENDER,
    to: ADMIN_EMAIL,
    subject,
    text: `New registration request from ${requestDetails.name} (${requestDetails.email}). Please review in Admin Portal.`,
    html
  });
}

/**
 * 1b. Send Registration Received Confirmation Email to Candidate/Employee
 */
export async function sendRegistrationConfirmationToEmployee(requestDetails) {
  const mailer = await getTransporter();
  const subject = `Registration Request Received — JRKC Rail Infra Portal`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 22px; border: 1px solid #2563eb; border-radius: 10px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #1d4ed8; margin: 0;">Registration Request Received 📩</h2>
      </div>

      <p style="color: #334155; font-size: 14px; line-height: 1.5;">
        Hello <strong>${requestDetails.name}</strong>,<br>
        Thank you for registering with <strong>JRKC Rail Infra Private Limited</strong>.
      </p>

      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; margin: 18px 0;">
        <h4 style="color: #1e40af; margin: 0 0 8px 0; font-size: 14px;">📋 Submitted Details:</h4>
        <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Name:</strong> ${requestDetails.name}</p>
        <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Email:</strong> ${requestDetails.email}</p>
        <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Department:</strong> ${requestDetails.department}</p>
        <p style="margin: 4px 0; color: #1e293b; font-size: 13px;"><strong>Requested System Role:</strong> ${requestDetails.requestedUserRole || requestDetails.role}</p>
      </div>

      <p style="color: #475569; font-size: 13.5px; line-height: 1.5;">
        Your application is currently being reviewed by our Admin & Management team.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 12px; margin: 15px 0;">
        <p style="margin: 0; color: #334155; font-size: 13px;">
          🔑 <strong>Next Steps:</strong> Once your application is approved, your official system access credentials and generated password will automatically be emailed to this address.
        </p>
      </div>

      <div style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        JRKC Rail Infra Private Limited • CIN-U30204UP2023PTC187418<br>
        “Smart Rail Infra, Stronger Nation.”
      </div>
    </div>
  `;

  return mailer.sendMail({
    from: SENDER,
    to: requestDetails.email,
    subject,
    text: `Hello ${requestDetails.name}, your registration request for JRKC Rail Infra Portal has been received and is pending Admin approval. Once approved, your login credentials will be emailed to you.`,
    html
  });
}

/**
 * 2. Send Welcome & Approval Email to Employee and Assigned HR
 */
export async function sendEmployeeApprovalEmail(employeeDetails, assignedHrEmail, generatedPassword) {
  const mailer = await getTransporter();
  const passToDisplay = generatedPassword || employeeDetails.tempPassword || 'JRKC#849201';
  const subject = `Welcome to JRKC Rail Infra! Account Approved & Credentials Inside`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 22px; border: 1px solid #10b981; border-radius: 10px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #059669; margin: 0;">Welcome to JRKC Rail Infra Private Limited! 🎉</h2>
      </div>

      <p style="color: #334155; font-size: 14px; line-height: 1.5;">
        Hello <strong>${employeeDetails.name}</strong>,<br>
        Your registration request has been <strong>APPROVED</strong> by the Director & Management. Your employee portal account is now active.
      </p>

      <!-- Credentials Card -->
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px; border-radius: 8px; margin: 20px 0;">
        <h4 style="color: #15803d; margin: 0 0 10px 0; font-size: 15px;">🔑 Your System Access Credentials:</h4>
        <p style="margin: 4px 0; color: #1e293b; font-size: 13.5px;"><strong>Employee ID:</strong> ${employeeDetails.idCardNo || employeeDetails.id || 'EMP-1001'}</p>
        <p style="margin: 4px 0; color: #1e293b; font-size: 13.5px;"><strong>Login Email:</strong> ${employeeDetails.email}</p>
        <p style="margin: 8px 0 4px 0; color: #1e293b; font-size: 13.5px;">
          <strong>System Generated Password:</strong> 
          <span style="font-family: monospace; font-size: 15px; font-weight: bold; color: #4f46e5; background: #e0e7ff; padding: 4px 10px; border-radius: 4px; border: 1px solid #c7d2fe;">${passToDisplay}</span>
        </p>
        <p style="color: #4d7c0f; font-size: 12px; margin-top: 10px; font-style: italic;">
          🔒 Security Notice: Please log in using the credentials above and update your password after your first sign-in.
        </p>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin: 15px 0;">
        <p style="margin: 0; font-weight: bold; color: #475569; font-size: 13px;">Assigned HR Manager:</p>
        <p style="margin: 4px 0 0 0; color: #334155; font-size: 13px;">${employeeDetails.assignedHrName || 'HR Department'} (${employeeDetails.assignedHrEmail || 'hr@jrkcrail.com'})</p>
      </div>

      <div style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        JRKC Rail Infra Private Limited • CIN-U30204UP2023PTC187418<br>
        “Smart Rail Infra, Stronger Nation.”
      </div>
    </div>
  `;

  let employeeMailRes = null;
  try {
    // Send to Employee
    employeeMailRes = await mailer.sendMail({
      from: SENDER,
      to: employeeDetails.email,
      subject,
      text: `Welcome ${employeeDetails.name}! Your account is approved. Login Email: ${employeeDetails.email}, System-Generated Password: ${passToDisplay}.`,
      html
    });
  } catch (err) {
    console.error(`❌ Failed sending approval email to employee (${employeeDetails.email}):`, err.message);
    console.error(err.stack);
  }

  // Notify Assigned HR (isolated error handling for dummy/internal HR emails)
  if (assignedHrEmail && assignedHrEmail !== employeeDetails.email) {
    try {
      const hrSubject = `[HR Assignment] New Employee Joined: ${employeeDetails.name}`;
      const hrHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #3b82f6; border-radius: 8px;">
          <h3 style="color: #2563eb;">New Employee Assigned to You</h3>
          <p>Hello HR,</p>
          <p><strong>${employeeDetails.name}</strong> (${employeeDetails.email}) has been approved by Admin and assigned to you.</p>
          <p>Department: ${employeeDetails.department} | Position: ${employeeDetails.role}</p>
        </div>
      `;
      await mailer.sendMail({
        from: SENDER,
        to: assignedHrEmail,
        subject: hrSubject,
        text: `New employee ${employeeDetails.name} has been assigned to you.`,
        html: hrHtml
      });
    } catch (hrErr) {
      console.error(`❌ Could not send HR notification email to ${assignedHrEmail}:`, hrErr.message);
      console.error(hrErr.stack);
    }
  }

  return employeeMailRes;
}

/**
 * 3. Send Leave Request Alert to Assigned HR and Admin
 */
export async function sendLeaveRequestAlert(leaveDetails, hrEmail) {
  const mailer = await getTransporter();
  const recipients = [hrEmail, ADMIN_EMAIL].filter(Boolean).join(', ');
  const subject = `[LEAVE REQUEST] ${leaveDetails.employeeName} requested ${leaveDetails.type}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #f59e0b; border-radius: 8px;">
      <h3 style="color: #d97706;">New Leave Request Pending Approval</h3>
      <p><strong>Employee:</strong> ${leaveDetails.employeeName}</p>
      <p><strong>Leave Type:</strong> <span style="font-weight: bold; color: ${leaveDetails.isLwp ? '#dc2626' : '#2563eb'};">${leaveDetails.type} ${leaveDetails.isLwp ? '(LWP - Leave Without Pay)' : ''}</span></p>
      <p><strong>Dates:</strong> ${leaveDetails.details}</p>
      <p><strong>Duration:</strong> ${leaveDetails.totalDays} Day(s)</p>
      <p><strong>Reason:</strong> ${leaveDetails.subDetails || 'None provided'}</p>
      <p style="margin-top: 15px;">Please log into the HR Portal to approve or reject this request.</p>
    </div>
  `;

  return mailer.sendMail({
    from: SENDER,
    to: recipients,
    subject,
    text: `New leave request from ${leaveDetails.employeeName} (${leaveDetails.type}, ${leaveDetails.totalDays} days). Please review in HR Portal.`,
    html
  });
}

/**
 * 4. Send Leave Decision Notification to Employee
 */
export async function sendLeaveStatusNotification(leaveDetails, employeeEmail) {
  const mailer = await getTransporter();
  const isApproved = leaveDetails.status === 'approved';
  const subject = `Leave Request ${isApproved ? 'Approved ✅' : 'Rejected ❌'}: ${leaveDetails.type}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid ${isApproved ? '#10b981' : '#ef4444'}; border-radius: 8px;">
      <h3 style="color: ${isApproved ? '#059669' : '#dc2626'};">Leave Request ${isApproved ? 'Approved' : 'Rejected'}</h3>
      <p>Hello ${leaveDetails.employeeName},</p>
      <p>Your leave request for <strong>${leaveDetails.type}</strong> (${leaveDetails.details}) has been <strong>${leaveDetails.status.toUpperCase()}</strong> by your HR.</p>
      ${leaveDetails.isLwp && isApproved ? `
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin: 15px 0;">
          <p style="color: #991b1b; margin: 0; font-weight: bold;">Note regarding LWP (Leave Without Pay):</p>
          <p style="color: #991b1b; margin: 5px 0 0 0;">This leave is classified as Leave Without Pay (${leaveDetails.lwpDays || leaveDetails.totalDays} days). It will be reflected as a deduction in your upcoming monthly payslip.</p>
        </div>
      ` : ''}
    </div>
  `;

  return mailer.sendMail({
    from: SENDER,
    to: employeeEmail,
    subject,
    text: `Your leave request for ${leaveDetails.type} has been ${leaveDetails.status}.`,
    html
  });
}

function numberToWordsRupees(num) {
  if (!num || num <= 0) return 'Rupees Zero Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '');
  };
  return 'Rupees ' + inWords(Math.floor(num)) + ' Only';
}

/**
 * Generate PDF Buffer for Payslip Email Attachment (Official JRKC Rail Infra Layout)
 */
function createPayslipPDFBuffer(payslip) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const empName = (payslip.employeeName || 'Employee').toUpperCase();
      const empId = payslip.employeeId || payslip.idCardNo || 'JRKCRIPL/008';
      const role = (payslip.role || payslip.designation || 'Staff').toUpperCase();
      const monthYear = payslip.payPeriod || payslip.monthYear || 'May-2026';
      const attendance = payslip.attendance || payslip.workingDaysInMonth || 30;

      const basic = Number(payslip.basic || payslip.baseSalary || 14000);
      const salaryOfAttendance = Number(payslip.salaryOfAttendance || basic);
      const hra = Number(payslip.hra || 5600);
      const da = Number(payslip.da || 3350);
      const sa = Number(payslip.sa || 6420);
      const employerPf = Number(payslip.employerPf || Math.round(basic * 0.12));

      const esi = Number(payslip.esi || 0);
      const advance = Number(payslip.advance || 0);
      const incomeTax = Number(payslip.incomeTax || payslip.taxDeductions || 0);
      const loan = Number(payslip.loan || 0);
      const employeePf = Number(payslip.employeePf || employerPf);
      const other = Number(payslip.other || 0);

      const totalDeductions = Number(payslip.totalDeductions) || (employeePf + esi + advance + incomeTax + loan + other);
      const grossSalary = Number(payslip.grossSalary) || (salaryOfAttendance + hra + da + sa);
      const netPay = Number(payslip.netPay) || (grossSalary - totalDeductions);
      const amountInWords = numberToWordsRupees(netPay);

      // Outer Border Box
      doc.rect(30, 30, 535, 760).strokeColor('#000000').lineWidth(2).stroke();

      // Top Brand Header Banner (Green)
      doc.rect(32, 32, 531, 65).fill('#047857');
      doc.fillColor('#ffffff').fontSize(16).text('JRKC RAIL INFRA PRIVATE LIMITED', 45, 45);
      doc.fontSize(8.5).text('Bangakhurd, Rawania road, Kadipur, Dist. Sultanpur (UP) 228161', 45, 68);
      doc.fontSize(8).text('CIN-U30204UP2023PTC187418 • Smart Rail Infra, Stronger Nation', 45, 80);

      // Document Sub Banner
      doc.rect(32, 97, 531, 30).fill('#f0fdf4');
      doc.rect(32, 97, 531, 30).strokeColor('#000000').lineWidth(1).stroke();
      doc.fillColor('#047857').fontSize(12).text('MONTHLY SALARY STATEMENT', 45, 106);
      doc.fillColor('#ffffff').rect(450, 102, 100, 20).fill('#047857');
      doc.fillColor('#ffffff').fontSize(9).text(monthYear, 455, 107, { width: 90, align: 'center' });

      // Employee Details Grid
      doc.rect(32, 127, 531, 35).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.fillColor('#475569').fontSize(9).text('EMPLOYEE ID', 45, 133);
      doc.fillColor('#047857').fontSize(10).text(empId, 45, 145);

      doc.fillColor('#475569').fontSize(9).text('EMPLOYEE NAME', 210, 133);
      doc.fillColor('#000000').fontSize(10).text(empName, 210, 145);

      doc.fillColor('#475569').fontSize(9).text('DESIGNATION', 400, 133);
      doc.fillColor('#000000').fontSize(10).text(role, 400, 145);

      doc.rect(32, 162, 531, 35).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.fillColor('#475569').fontSize(9).text('ATTENDANCE DAYS', 45, 168);
      doc.fillColor('#000000').fontSize(10).text(attendance + ' Days', 45, 180);

      doc.fillColor('#475569').fontSize(9).text('PAY PERIOD', 210, 168);
      doc.fillColor('#000000').fontSize(10).text(monthYear, 210, 180);

      doc.fillColor('#475569').fontSize(9).text('PAYMENT MODE', 400, 168);
      doc.fillColor('#000000').fontSize(10).text('Direct Bank Deposit (Verified)', 400, 180);

      // Table Header (Earnings & Deductions)
      doc.rect(32, 205, 531, 24).fill('#f1f5f9');
      doc.rect(32, 205, 531, 24).strokeColor('#000000').lineWidth(1.5).stroke();
      
      doc.fillColor('#000000').fontSize(9);
      doc.text('EARNINGS COMPONENT', 45, 212);
      doc.text('AMOUNT (INR)', 210, 212);
      doc.text('DEDUCTIONS COMPONENT', 310, 212);
      doc.text('AMOUNT (INR)', 470, 212);

      // Breakdown Rows
      let y = 235;
      const rows = [
        ['Basic Salary', 'INR ' + basic.toLocaleString('en-IN'), 'Employer PF', 'INR ' + employerPf.toLocaleString('en-IN')],
        ['Salary of Attendance', 'INR ' + salaryOfAttendance.toLocaleString('en-IN') + '.00', 'E.S.I.', 'INR ' + esi.toLocaleString('en-IN')],
        ['House Rent Allowance (HRA)', 'INR ' + hra.toLocaleString('en-IN'), 'Advance / Loan', 'INR ' + (advance + loan).toLocaleString('en-IN')],
        ['Dearness Allowance (DA)', 'INR ' + da.toLocaleString('en-IN'), 'Income Tax (TDS)', 'INR ' + incomeTax.toLocaleString('en-IN')],
        ['Special Allowance (SA)', 'INR ' + sa.toLocaleString('en-IN'), 'Employee PF', 'INR ' + employeePf.toLocaleString('en-IN')],
        ['Other Allowances', 'INR 0.00', 'Other Deductions', 'INR ' + other.toLocaleString('en-IN')]
      ];

      rows.forEach((row) => {
        doc.rect(32, y - 4, 531, 22).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
        doc.fillColor('#1e293b').fontSize(9).text(row[0], 45, y);
        doc.text(row[1], 200, y, { width: 90, align: 'right' });

        doc.fillColor('#1e293b').text(row[2], 310, y);
        doc.fillColor('#dc2626').text(row[3], 460, y, { width: 90, align: 'right' });
        y += 22;
      });

      // Total Gross & Total Deductions Row
      doc.rect(32, y - 4, 531, 24).fill('#f8fafc');
      doc.rect(32, y - 4, 531, 24).strokeColor('#000000').lineWidth(1).stroke();
      doc.fillColor('#000000').fontSize(9).text('GROSS EARNINGS', 45, y + 3);
      doc.fillColor('#166534').text('INR ' + grossSalary.toLocaleString('en-IN') + '.00', 200, y + 3, { width: 90, align: 'right' });

      doc.fillColor('#000000').text('TOTAL DEDUCTIONS', 310, y + 3);
      doc.fillColor('#dc2626').text('INR ' + totalDeductions.toLocaleString('en-IN') + '.00', 460, y + 3, { width: 90, align: 'right' });

      y += 35;

      // Net Salary Disbursed Card Box
      doc.rect(32, y, 531, 55).fill('#f0fdf4');
      doc.rect(32, y, 531, 55).strokeColor('#047857').lineWidth(2).stroke();

      doc.fillColor('#047857').fontSize(11).text('NET SALARY DISBURSED', 45, y + 12);
      doc.fontSize(8.5).fillColor('#475569').text('Direct Deposit to Registered Bank Account', 45, y + 30);

      doc.fillColor('#047857').fontSize(22).text('INR ' + netPay.toLocaleString('en-IN') + '.00', 350, y + 15, { width: 200, align: 'right' });

      y += 65;

      // Amount in Words Banner
      doc.rect(32, y, 531, 25).fill('#f8fafc');
      doc.rect(32, y, 531, 25).strokeColor('#000000').lineWidth(1).stroke();
      doc.fillColor('#000000').fontSize(9).text('AMOUNT IN WORDS: ' + amountInWords.toUpperCase(), 35, y + 7, { width: 525, align: 'center' });

      y += 45;

      // Signatures Section
      doc.fillColor('#475569').fontSize(8.5);
      doc.text('Prepared By: HR Payroll Dept.', 45, y);
      doc.text('Verified By: Accounts & Finance', 220, y);
      doc.text('Authorized Signatory: JRKC Rail Infra', 380, y);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 5. Send Payslip Email to Employee with CC to HR & Admin
 */
export async function sendPayslipEmail(payslip, hrEmail) {
  const mailer = await getTransporter();
  const ccEmails = [hrEmail, ADMIN_EMAIL].filter(Boolean).join(', ');
  const subject = `Official Payslip Statement — ${payslip.payPeriod || 'Monthly Salary'} | JRKC Rail Infra`;

  const basic = Number(payslip.basic || payslip.baseSalary) || 0;
  const hra = Number(payslip.hra) || 0;
  const da = Number(payslip.da) || 0;
  const sa = Number(payslip.sa) || 0;
  const gross = Number(payslip.grossSalary || payslip.gross) || (basic + hra + da + sa);
  const deductions = Number(payslip.totalDeductions || payslip.deductions) || 0;
  const net = Number(payslip.netPay) || (gross - deductions);
  const lwp = Number(payslip.lwpDays) || 0;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; padding: 25px; border: 1px solid #cbd5e1; border-radius: 10px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="color: #4f46e5; margin: 0;">JRKC HR Portal - Official Payslip</h2>
        <p style="color: #64748b; margin: 5px 0 0 0;">Pay Period: <strong>${payslip.payPeriod || 'Current Month'}</strong> | Date: ${payslip.payDate || new Date().toLocaleDateString('en-IN')}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold; width: 30%;">Employee Name:</td>
          <td style="padding: 10px;">${payslip.employeeName || 'Employee'} (${payslip.employeeId || 'N/A'})</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">Department / Role:</td>
          <td style="padding: 10px;">${payslip.department || 'Operations'} - ${payslip.role || 'Staff'}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold;">Email:</td>
          <td style="padding: 10px;">${payslip.employeeEmail || ''}</td>
        </tr>
      </table>

      <h4 style="color: #1e293b; margin-bottom: 10px;">Salary Summary</h4>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #4f46e5; color: white;">
            <th style="padding: 10px; text-align: left;">Component</th>
            <th style="padding: 10px; text-align: right;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Basic Salary</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${basic.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">HRA & Allowances</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a;">+₹${(hra + da + sa).toLocaleString('en-IN')}</td>
          </tr>
          ${lwp > 0 ? `
          <tr style="background-color: #fef2f2;">
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; color: #dc2626; font-weight: bold;">
              Leave Without Pay (${lwp} Day(s))
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626; font-weight: bold;">
              -${lwp} Days
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Gross Salary</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: bold;">₹${gross.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Total Deductions (PF/ESI/Taxes)</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;">-₹${deductions.toLocaleString('en-IN')}</td>
          </tr>
          <tr style="background-color: #f1f5f9; font-weight: bold; font-size: 16px;">
            <td style="padding: 12px;">NET PAYABLE AMOUNT</td>
            <td style="padding: 12px; text-align: right; color: #4f46e5;">₹${net.toLocaleString('en-IN')}</td>
          </tr>
        </tbody>
      </table>

      <p style="font-size: 13px; color: #475569; margin-top: 15px;">
        📎 <strong>PDF Attachment Included:</strong> Your official printable PDF payslip document is attached to this email.
      </p>

      <div style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        This is an official system generated payslip from JRKC HR Portal. Confidential.
      </div>
    </div>
  `;

  const pdfBuffer = await createPayslipPDFBuffer(payslip).catch(err => {
    console.error('Payslip PDF Buffer generation error:', err);
    return null;
  });

  const attachments = [];
  if (pdfBuffer) {
    const cleanName = (payslip.employeeName || 'Employee').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanPeriod = (payslip.payPeriod || 'Monthly').replace(/[^a-zA-Z0-9]/g, '_');
    attachments.push({
      filename: `Payslip_${cleanName}_${cleanPeriod}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  return mailer.sendMail({
    from: SENDER,
    to: payslip.employeeEmail,
    cc: ccEmails,
    subject,
    text: `Payslip for ${payslip.payPeriod}: Net Pay ₹${net.toLocaleString('en-IN')}. PDF statement attached.`,
    html,
    attachments
  });
}

/**
 * Send Delayed Disbursed Payslip Email (4-5 hours after HR marks as Paid)
 */
export async function sendDelayedPayslipDisbursementEmail(payslip) {
  const mailer = await getTransporter();
  const subject = `💳 Official Monthly Payslip Statement - ${payslip.payPeriod} | JRKC Rail Infra`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #047857 0%, #065f46 100%); padding: 20px; border-radius: 8px 8px 0 0; color: #ffffff; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; text-transform: uppercase;">JRKC Rail Infra Private Limited</h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #a7f3d0;">Official Monthly Salary Statement & Disbursement Advice</p>
      </div>

      <div style="padding: 20px;">
        <div style="background-color: #f0fdf4; border-left: 4px solid #047857; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
          <h3 style="margin: 0; color: #047857; font-size: 16px;">Salary Disbursed & Verified</h3>
          <p style="margin: 4px 0 0 0; color: #334155; font-size: 13px;">
            Dear <strong>${payslip.employeeName}</strong>, your salary for <strong>${payslip.payPeriod}</strong> has been successfully processed and transferred to your bank account by HR.
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b; font-weight: bold;">EMPLOYEE ID:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #047857;">${payslip.employeeId}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b; font-weight: bold;">PAY PERIOD:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold;">${payslip.payPeriod}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b; font-weight: bold;">TOTAL CTC (GROSS):</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #16a34a;">₹${(payslip.totalCtc || payslip.grossSalary || 0).toLocaleString('en-IN')}.00</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 0; color: #64748b; font-weight: bold;">TOTAL DEDUCTIONS:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #dc2626;">-₹${(payslip.totalDeductions || 0).toLocaleString('en-IN')}.00</td>
          </tr>
          <tr style="background-color: #f8fafc; font-size: 16px; font-weight: bold;">
            <td style="padding: 12px 8px; color: #0f172a;">NET SALARY DISBURSED:</td>
            <td style="padding: 12px 8px; text-align: right; color: #047857; font-size: 18px;">₹${(payslip.netPay || 0).toLocaleString('en-IN')}.00</td>
          </tr>
        </table>

        <div style="background-color: #f8fafc; padding: 12px; text-align: center; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: #334155;">
          <strong>Amount in Words:</strong> <i>${payslip.amountInWords || 'Rupees Verified'}</i>
        </div>

        <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
          You can view and download your full printable PDF salary statement directly inside your JRKC HR Mobile / Web Portal under the Payroll tab.
        </p>
      </div>
    </div>
  `;

  return mailer.sendMail({
    from: SENDER,
    to: payslip.employeeEmail,
    subject,
    text: `Salary Disbursed for ${payslip.payPeriod}. Net Salary: ₹${payslip.netPay}.`,
    html
  });
}
