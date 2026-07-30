/**
 * Payroll Calculator Service
 * Pure functions — no DB calls, no side effects.
 * Input: salary structure + attendance data → output: full payslip breakdown
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Returns count of Mon–Sat working days in a given month.
 * Sunday is always a non-working day.
 */
export function getWorkingDaysInMonth(year, monthIndex) {
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (new Date(year, monthIndex, d).getDay() !== 0) count++;
  }
  return count;
}

/**
 * Convert number to Indian currency words (for payslip).
 */
export function numberToWords(n) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
    'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(num) {
    if (num === 0) return '';
    if (num < 20) return ones[num] + ' ';
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '') + ' ';
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred ' + convert(num % 100);
    if (num < 100000) return convert(Math.floor(num / 1000)) + 'Thousand ' + convert(num % 1000);
    if (num < 10000000) return convert(Math.floor(num / 100000)) + 'Lakh ' + convert(num % 100000);
    return convert(Math.floor(num / 10000000)) + 'Crore ' + convert(num % 10000000);
  }

  const result = convert(Math.round(n)).trim();
  return result ? result + ' Rupees Only' : 'Zero Rupees Only';
}

/**
 * Core payslip calculation.
 * @param {Object} salaryStruct  - Salary structure (basic, hra, etc.)
 * @param {number} presentDays   - Actual present days from attendance
 * @param {number} lwpDays       - Leave Without Pay days
 * @param {number} workingDays   - Total working days in the month
 * @param {number} extraDays     - Sunday working days (bonus, not deducted)
 * @param {string} lwpBasis      - 'basic' | 'gross' (default: 'basic')
 */
export function calculatePayslip(salaryStruct, presentDays, lwpDays, workingDays, extraDays = 0, lwpBasis = 'basic') {
  const s = salaryStruct || {};

  // Earnings
  const basic            = Number(s.basic || 0);
  const hra              = Number(s.hra || 0);
  const da               = Number(s.da || 0);
  const specialAllowance = Number(s.specialAllowance || 0);
  const conveyance       = Number(s.conveyance || 0);
  const medical          = Number(s.medical || 0);
  const otherAllowances  = Number(s.otherAllowances || 0);

  const grossEarnings = basic + hra + da + specialAllowance + conveyance + medical + otherAllowances;

  // LWP deduction
  const lwpBase   = lwpBasis === 'gross' ? grossEarnings : basic;
  const dailyRate = workingDays > 0 ? lwpBase / workingDays : 0;
  const lwpDeduction = Math.round(dailyRate * lwpDays);

  // Deductions
  const employerPf      = Number(s.employerPf || 0);
  const employeePf      = Number(s.employeePf || 0);
  const esi             = Number(s.esi || 0);
  const professionalTax = Number(s.professionalTax || 0);
  const tds             = Number(s.tds || 0);
  const otherDeductions = Number(s.otherDeductions || 0);

  const totalDeductions = employeePf + esi + professionalTax + tds + otherDeductions + lwpDeduction;

  // Salary adjusted for attendance
  const grossSalary = Math.max(0, grossEarnings - lwpDeduction);
  const totalCtc    = grossEarnings + employerPf;
  const netPay      = Math.max(0, grossSalary - (totalDeductions - lwpDeduction));

  return {
    basic, hra, da, specialAllowance, conveyance, medical, otherAllowances,
    grossEarnings,
    lwpDeduction,
    employerPf, employeePf, esi, professionalTax, tds, otherDeductions,
    totalDeductions,
    grossSalary,
    totalCtc,
    netPay,
    amountInWords: numberToWords(netPay),
    presentDays,
    lwpDays,
    workingDays,
    extraDays,
  };
}

/**
 * Calculate LWP days from attendance logs, approved leaves, and holidays.
 * 
 * A working day (Mon–Sat) is LWP if:
 *   - Employee has no attendance log (no clock in), AND
 *   - Employee has no approved leave covering that date, AND
 *   - The date is not a holiday
 */
export function calculateLWP(year, monthIndex, attendanceLogs, approvedLeaves, holidays) {
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build sets for fast lookup
  const attendedDates = new Set(
    (attendanceLogs || [])
      .filter(l => l.clockIn)  // must have clocked in
      .map(l => l.date)        // YYYY-MM-DD
  );

  const approvedLeaveDates = new Set();
  for (const leave of (approvedLeaves || [])) {
    if (leave.status !== 'approved') continue;
    const start = new Date(leave.startDate);
    const end   = new Date(leave.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      approvedLeaveDates.add(d.toISOString().slice(0, 10));
    }
  }

  const holidayDates = new Set((holidays || []).map(h => h.date));

  let lwpDays = 0;
  let presentDays = 0;
  let workingDays = 0;

  for (let d = 1; d <= totalDays; d++) {
    const dateObj = new Date(year, monthIndex, d);
    const dayOfWeek = dateObj.getDay();

    if (dayOfWeek === 0) continue;  // Sunday — skip
    
    // Only count days up to today (don't penalize future days)
    if (dateObj > today) continue;

    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    workingDays++;

    if (attendedDates.has(dateStr) || approvedLeaveDates.has(dateStr) || holidayDates.has(dateStr)) {
      presentDays++;
    } else {
      lwpDays++;
    }
  }

  return { lwpDays, presentDays, workingDays };
}
