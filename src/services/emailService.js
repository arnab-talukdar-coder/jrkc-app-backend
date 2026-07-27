import nodemailer from 'nodemailer';

// Helper to create transport
let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // Development / Fallback mode using console logger & mock transport
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('\n=================== [EMAIL DISPATCHED] ===================');
        console.log(`FROM   : ${mailOptions.from || 'JRKC HR Portal <noreply@jrkc.com>'}`);
        console.log(`TO     : ${mailOptions.to}`);
        if (mailOptions.cc) console.log(`CC     : ${mailOptions.cc}`);
        console.log(`SUBJECT: ${mailOptions.subject}`);
        console.log('--- BODY SUMMARY ---');
        console.log(mailOptions.text || 'HTML Content Included (See HTML below)');
        console.log('=========================================================\n');
        return { messageId: `mock-${Date.now()}` };
      }
    };
  }

  return transporter;
}

const SENDER = process.env.SMTP_FROM || '"JRKC HR Portal System" <hr-portal@jrkc.com>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@jrkc.com';

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

  // Send to Employee
  await mailer.sendMail({
    from: SENDER,
    to: employeeDetails.email,
    subject,
    text: `Welcome ${employeeDetails.name}! Your account is approved. Login Email: ${employeeDetails.email}, System-Generated Password: ${passToDisplay}.`,
    html
  });

  // Notify Assigned HR
  if (assignedHrEmail) {
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
  }
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

/**
 * 5. Send Payslip Email to Employee with CC to HR & Admin
 */
export async function sendPayslipEmail(payslip, hrEmail) {
  const mailer = await getTransporter();
  const ccEmails = [hrEmail, ADMIN_EMAIL].filter(Boolean).join(', ');
  const subject = `Payslip Available for ${payslip.payPeriod} - ${payslip.employeeName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; padding: 25px; border: 1px solid #cbd5e1; border-radius: 10px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="color: #4f46e5; margin: 0;">JRKC HR Portal - Official Payslip</h2>
        <p style="color: #64748b; margin: 5px 0 0 0;">Pay Period: <strong>${payslip.payPeriod}</strong> | Date: ${payslip.payDate}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold; width: 30%;">Employee Name:</td>
          <td style="padding: 10px;">${payslip.employeeName} (${payslip.employeeId})</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">Department / Role:</td>
          <td style="padding: 10px;">${payslip.department} - ${payslip.role}</td>
        </tr>
        <tr style="background-color: #f8fafc;">
          <td style="padding: 10px; font-weight: bold;">Email:</td>
          <td style="padding: 10px;">${payslip.employeeEmail}</td>
        </tr>
      </table>

      <h4 style="color: #1e293b; margin-bottom: 10px;">Salary Breakdown</h4>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #4f46e5; color: white;">
            <th style="padding: 10px; text-align: left;">Component</th>
            <th style="padding: 10px; text-align: right;">Amount ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Base Monthly Salary</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${payslip.baseSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Allowances</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a;">+$${payslip.allowances.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="background-color: ${payslip.lwpDays > 0 ? '#fef2f2' : '#ffffff'};">
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: ${payslip.lwpDays > 0 ? 'bold' : 'normal'}; color: ${payslip.lwpDays > 0 ? '#dc2626' : '#000'};">
              LWP Deduction (${payslip.lwpDays} Day(s) @ $${payslip.perDaySalary.toFixed(2)}/day)
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626; font-weight: bold;">
              -$${payslip.lwpDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Tax & Statutory Deductions</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626;">-$${payslip.taxDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr style="background-color: #f1f5f9; font-weight: bold; font-size: 16px;">
            <td style="padding: 12px;">NET PAYABLE AMOUNT</td>
            <td style="padding: 12px; text-align: right; color: #4f46e5;">$${payslip.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>

      <div style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 25px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
        This is a system generated payslip from JRKC HR Portal. Confidential.
      </div>
    </div>
  `;

  return mailer.sendMail({
    from: SENDER,
    to: payslip.employeeEmail,
    cc: ccEmails,
    subject,
    text: `Payslip for ${payslip.payPeriod}: Net Pay $${payslip.netPay}. LWP Days: ${payslip.lwpDays}. Deduction: $${payslip.lwpDeduction}.`,
    html
  });
}
