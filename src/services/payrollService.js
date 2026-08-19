/**
 * Dynamic Payroll Service — Overhauled
 *
 * Single source of truth:
 *   Gross Salary = baseSalary + allowances
 *   All salary component '0' values are preserved (nullish coalescing)
 *   Attendance is calculated from actual Attendance records (not recentLogs)
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function getMonthIndex(monthInput) {
  if (typeof monthInput === 'number') {
    return monthInput >= 1 && monthInput <= 12 ? monthInput - 1 : monthInput;
  }
  if (!monthInput) return new Date().getMonth();
  const lower = String(monthInput).trim().toLowerCase();
  const idx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(lower));
  return idx !== -1 ? idx : new Date().getMonth();
}

/**
 * Calculates total working days in a month excluding Sundays (Mon-Sat).
 */
export function calculateMonSatWorkingDays(year, monthIndex) {
  const m = typeof monthIndex === 'number' ? (monthIndex > 11 ? monthIndex - 1 : monthIndex) : getMonthIndex(monthIndex);
  const totalDaysInMonth = new Date(year, m + 1, 0).getDate();
  let workingDays = 0;
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const date = new Date(year, m, day);
    if (date.getDay() !== 0) workingDays++;
  }
  return workingDays;
}

/**
 * Gross Monthly Salary = baseSalary + allowances.
 * This is the single canonical formula used everywhere in the app.
 */
export function calculateGrossSalary(employee) {
  if (!employee) return 0;
  return Number(employee.baseSalary ?? 0) + Number(employee.allowances ?? 0);
}

/**
 * Generates an exact integer repayment schedule for Salary Advance.
 */
export function generateRepaymentSchedule(approvedAmount, tenureMonths = 3, startYear = 2026, startMonthInput = 'June') {
  const tenure = [3, 6, 12].includes(Number(tenureMonths)) ? Number(tenureMonths) : 3;
  const totalAmt = Math.round(Number(approvedAmount) || 0);
  const baseInst = Math.floor(totalAmt / tenure);
  const remainder = totalAmt - (baseInst * tenure);
  const startMonthIdx = getMonthIndex(startMonthInput);
  const schedule = [];
  for (let i = 0; i < tenure; i++) {
    const instMonthIdx = (startMonthIdx + i) % 12;
    const instYear = startYear + Math.floor((startMonthIdx + i) / 12);
    const monthName = MONTH_NAMES[instMonthIdx];
    const amount = i < remainder ? baseInst + 1 : baseInst;
    schedule.push({ installmentNo: i + 1, payPeriod: `${monthName} ${instYear}`, year: instYear, month: monthName, amount, status: 'pending' });
  }
  return schedule;
}

/**
 * Counts unique attendance days (CLOCKED_OUT records) from the Attendance collection
 * for a given employee and month.
 *
 * @param {Array} attendanceRecords - Array of Attendance documents for the employee this month
 * @returns {number} - Count of unique dates with a completed (CLOCKED_OUT) attendance record
 */
export function countAttendanceDays(attendanceRecords) {
  if (!attendanceRecords || attendanceRecords.length === 0) return 0;
  const uniqueDates = new Set();
  attendanceRecords.forEach(record => {
    // Count a day as attended only if the employee actually clocked out
    if (record.date && record.status === 'CLOCKED_OUT') {
      uniqueDates.add(record.date);
    }
    // Also count if clocked in today (still working)
    if (record.date && record.status === 'CLOCKED_IN') {
      uniqueDates.add(record.date);
    }
  });
  return uniqueDates.size;
}

/**
 * Full payroll calculation for an employee.
 *
 * @param {Object}  employee           - Employee document
 * @param {number}  year               - Payroll year (e.g. 2026)
 * @param {string|number} monthInput   - Month name or index
 * @param {string}  lwpDeductionBasis  - 'basic' | 'gross'
 * @param {Array}   approvals          - Approval documents for regularizations
 * @param {number|null} customLwpDays  - Override LWP days manually
 * @param {Array}   salaryAdvances     - Active SalaryAdvance documents
 * @param {number|null} customAttendanceDays - Override attendance days for payroll
 * @param {Array}   attendanceRecords  - Attendance collection docs for this employee+month
 */
export function calculateSalaryForEmployee(
  employee,
  year,
  monthInput,
  lwpDeductionBasis = 'basic',
  approvals = [],
  customLwpDays = null,
  salaryAdvances = [],
  customAttendanceDays = null,
  attendanceRecords = []
) {
  const monthIdx = getMonthIndex(monthInput);
  const monthName = MONTH_NAMES[monthIdx];
  const totalWorkingDays = calculateMonSatWorkingDays(year, monthIdx);
  const yyyy = String(year);
  const mm = String(monthIdx + 1).padStart(2, '0');
  const monthPrefix = `${yyyy}-${mm}`;

  // ── Salary Components ───────────────────────────────────────────────────
  // Use baseSalary as the primary "basic" value.
  const basic = Number(employee.baseSalary ?? 0);
  const allowances = Number(employee.allowances ?? 0);

  // Detailed breakdown from salaryStructure (used for display only; gross is always basic+allowances)
  const struct = employee.salaryStructure || {};
  // Use ?? to allow explicit 0 values
  const hra           = struct.hra           !== null && struct.hra           !== undefined ? Number(struct.hra)           : Math.round(basic * 0.4);
  const da            = struct.da            !== null && struct.da            !== undefined ? Number(struct.da)            : 0;
  const sa            = struct.sa            !== null && struct.sa            !== undefined ? Number(struct.sa)            : 0;
  const conveyance    = struct.conveyance    !== null && struct.conveyance    !== undefined ? Number(struct.conveyance)    : 0;
  const otherAllowances = allowances; // top-level allowances is source of truth

  // Deductions from salaryStructure; if all zero and taxDeductions is set, distribute
  const hasStructuredDeductions = (
    (struct.employeePf !== null && struct.employeePf !== undefined) ||
    (struct.employerPf !== null && struct.employerPf !== undefined) ||
    (struct.professionalTax !== null && struct.professionalTax !== undefined) ||
    (struct.tds !== null && struct.tds !== undefined)
  );

  let employeePf, employerPf, esi, professionalTax, tds;
  if (hasStructuredDeductions) {
    employeePf      = struct.employeePf     !== null && struct.employeePf     !== undefined ? Number(struct.employeePf)     : 0;
    employerPf      = struct.employerPf     !== null && struct.employerPf     !== undefined ? Number(struct.employerPf)     : 0;
    esi             = struct.esi            !== null && struct.esi            !== undefined ? Number(struct.esi)            : 0;
    professionalTax = struct.professionalTax !== null && struct.professionalTax !== undefined ? Number(struct.professionalTax) : 200;
    tds             = struct.tds            !== null && struct.tds            !== undefined ? Number(struct.tds)            : 0;
  } else {
    // Fallback: treat taxDeductions as total mandatory deductions (all goes to PT+TDS combined)
    const totalMandatoryDed = Number(employee.taxDeductions ?? 0);
    employeePf = 0;
    employerPf = 0;
    esi = 0;
    professionalTax = Math.min(200, totalMandatoryDed);
    tds = Math.max(0, totalMandatoryDed - professionalTax);
  }

  // Gross = baseSalary + allowances (the single canonical formula)
  const grossSalary = basic + allowances;

  // ── Attendance Calculation ───────────────────────────────────────────────
  // Priority: customAttendanceDays > Attendance collection records > recentLogs fallback
  let calculatedAttendanceDays;

  if (attendanceRecords && attendanceRecords.length > 0) {
    // Count from actual Attendance collection — unique dates this month
    const monthRecords = attendanceRecords.filter(r => r.date && r.date.startsWith(monthPrefix));
    calculatedAttendanceDays = countAttendanceDays(monthRecords);
  } else {
    // Fallback to recentLogs on employee doc
    const logs = employee.recentLogs || [];
    const uniqueDates = new Set();
    logs.forEach(l => {
      if (l.date && l.date.startsWith(monthPrefix)) uniqueDates.add(l.date);
    });
    calculatedAttendanceDays = uniqueDates.size; // 0 if no logs found in month
  }

  // adjustedAttendanceDays is null if no manual override
  const adjustedAttendanceDays = (customAttendanceDays !== null && customAttendanceDays !== undefined)
    ? Number(customAttendanceDays)
    : null;

  const finalAttendanceDays = adjustedAttendanceDays ?? calculatedAttendanceDays;

  // ── LWP Calculation ─────────────────────────────────────────────────────
  let lwpDays = 0;
  if (customLwpDays !== null && customLwpDays !== undefined) {
    lwpDays = Number(customLwpDays);
  } else {
    // Absent = working days - attended
    let absentCount = Math.max(0, totalWorkingDays - finalAttendanceDays);

    // Subtract approved regularizations from absent count
    const empId = employee.id;
    const empRegularizations = approvals.filter(a =>
      a.type === 'Attendance Regularization' &&
      (a.employeeId === empId || a.employeeName === employee.name) &&
      a.regularizationDate && a.regularizationDate.startsWith(monthPrefix) &&
      a.status === 'approved'
    );
    absentCount = Math.max(0, absentCount - empRegularizations.length);
    lwpDays = absentCount;
  }

  const attendanceDays = Math.max(0, totalWorkingDays - lwpDays);

  // ── LWP Deduction ────────────────────────────────────────────────────────
  let dailyRate = 0;
  if (lwpDeductionBasis === 'gross') {
    dailyRate = totalWorkingDays > 0 ? grossSalary / totalWorkingDays : 0;
  } else {
    dailyRate = totalWorkingDays > 0 ? basic / totalWorkingDays : 0;
  }
  const lwpDeduction = Math.round(dailyRate * lwpDays);
  const salaryOfAttendance = Math.max(0, basic - lwpDeduction);

  // ── Salary Advance Recovery ──────────────────────────────────────────────
  let advanceRecovery = 0;
  let advanceOutstanding = 0;
  const targetPeriodStr = `${monthName} ${year}`;

  const empAdv = salaryAdvances.find(adv =>
    (adv.employeeId === employee.id || adv.employeeEmail === employee.email) &&
    adv.status === 'approved' &&
    adv.outstandingBalance > 0
  );

  if (empAdv) {
    advanceOutstanding = empAdv.outstandingBalance;
    const targetInst =
      empAdv.repaymentSchedule?.find(s => s.payPeriod === targetPeriodStr && s.status === 'pending') ||
      empAdv.repaymentSchedule?.find(s => s.status === 'pending');
    if (targetInst) {
      advanceRecovery = Math.min(targetInst.amount, empAdv.outstandingBalance);
    }
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalDeductions = employeePf + esi + professionalTax + tds + lwpDeduction + advanceRecovery;
  const totalCtc = grossSalary + employerPf;
  const netPay = Math.max(0, grossSalary - totalDeductions);

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeEmail: employee.email,
    department: employee.department,
    role: employee.role,
    payPeriod: `${monthName} ${year}`,
    month: monthName,
    year,
    workingDaysInMonth: totalWorkingDays,
    calculatedAttendanceDays,
    adjustedAttendanceDays,
    attendance: adjustedAttendanceDays ?? calculatedAttendanceDays,
    lwpDays,
    lwpDeduction,
    lwpDeductionBasis,
    baseSalary: basic,
    basic,
    salaryOfAttendance,
    hra,
    da,
    sa,
    conveyance,
    otherAllowances,
    grossSalary,
    employerPf,
    totalCtc,
    employeePf,
    esi,
    professionalTax,
    tds,
    advance: advanceRecovery,
    salaryAdvanceRecovery: advanceRecovery,
    advanceOutstandingBalance: Math.max(0, advanceOutstanding - advanceRecovery),
    totalDeductions,
    netPay
  };
}
