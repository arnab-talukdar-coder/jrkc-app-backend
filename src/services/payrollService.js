/**
 * Dynamic Payroll Service
 * Calculates Mon-Sat working days, LWP days from attendance/leaves/regularizations,
 * applies configurable LWP deduction rules, computes full salary breakdown,
 * and handles dynamic Salary Advance Recovery.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Calculates total Gross Monthly Salary dynamically from employee's approved structure.
 * Gross Monthly Salary = Basic + HRA + DA + Special Allowance + Conveyance + Other Allowances
 */
export function calculateGrossSalary(employee) {
  if (!employee) return 0;
  const struct = employee.salaryStructure || {};
  const basic = Number(struct.basic || employee.baseSalary || 0);
  const hra = Number(struct.hra || Math.round(basic * 0.4));
  const da = Number(struct.da || 0);
  const sa = Number(struct.sa || 0);
  const conveyance = Number(struct.conveyance || 0);
  const otherAllowances = Number(struct.otherAllowances || employee.allowances || 0);
  return basic + hra + da + sa + conveyance + otherAllowances;
}

/**
 * Generates an exact integer repayment schedule for Salary Advance without decimal rounding loss.
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

    schedule.push({
      installmentNo: i + 1,
      payPeriod: `${monthName} ${instYear}`,
      year: instYear,
      month: monthName,
      amount,
      status: 'pending'
    });
  }
  return schedule;
}

/**
 * Calculates total working days in a month excluding Sundays (Monday-Saturday working).
 */
export function calculateMonSatWorkingDays(year, monthIndex) {
  const m = typeof monthIndex === 'number' ? (monthIndex > 11 ? monthIndex - 1 : monthIndex) : getMonthIndex(monthIndex);
  const totalDaysInMonth = new Date(year, m + 1, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const date = new Date(year, m, day);
    if (date.getDay() !== 0) { // 0 is Sunday
      workingDays++;
    }
  }
  return workingDays;
}

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
 * Dynamically computes attendance, LWP days, LWP deduction, Salary Advance recovery,
 * and full salary breakdown for an employee.
 */
export function calculateSalaryForEmployee(
  employee,
  year,
  monthInput,
  lwpDeductionBasis = 'basic',
  approvals = [],
  customLwpDays = null,
  salaryAdvances = []
) {
  const monthIdx = getMonthIndex(monthInput);
  const monthName = MONTH_NAMES[monthIdx];
  const totalWorkingDays = calculateMonSatWorkingDays(year, monthIdx);

  // Extract salary structure from employee profile
  const struct = employee.salaryStructure || {};
  const basic = Number(struct.basic || employee.baseSalary || 0);
  const hra = Number(struct.hra || Math.round(basic * 0.4));
  const da = Number(struct.da || 0);
  const sa = Number(struct.sa || 0);
  const conveyance = Number(struct.conveyance || 0);
  const otherAllowances = Number(struct.otherAllowances || employee.allowances || 0);

  const employerPf = Number(struct.employerPf || Math.round(basic * 0.12));
  const employeePf = Number(struct.employeePf || Math.round(basic * 0.12));
  const esi = Number(struct.esi || 0);
  const professionalTax = Number(struct.professionalTax || 200);
  const tds = Number(struct.tds || employee.taxDeductions || 0);

  const grossSalary = basic + hra + da + sa + conveyance + otherAllowances;

  // Calculate LWP days if not explicitly passed
  let lwpDays = 0;
  if (customLwpDays !== null && customLwpDays !== undefined) {
    lwpDays = Number(customLwpDays);
  } else {
    // Determine LWP days from logs & regularizations
    const yyyy = String(year);
    const mm = String(monthIdx + 1).padStart(2, '0');
    const monthPrefix = `${yyyy}-${mm}`;

    const logs = employee.recentLogs || [];
    const monthLogs = logs.filter(l => l.date && l.date.startsWith(monthPrefix));

    // Get regularizations for this employee in this month
    const empId = employee.id;
    const empRegularizations = approvals.filter(a =>
      a.type === 'Attendance Regularization' &&
      (a.employeeId === empId || a.employeeName === employee.name) &&
      a.regularizationDate && a.regularizationDate.startsWith(monthPrefix)
    );

    let absentCount = 0;
    const totalDaysInMonth = new Date(year, monthIdx + 1, 0).getDate();

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      const dateObj = new Date(year, monthIdx, d);
      if (dateObj.getDay() === 0) continue; // Skip Sunday

      const log = monthLogs.find(l => l.date === dStr);
      const isCompleteLog = log && log.clockInTime && log.clockOutTime && log.status !== 'Incomplete';

      if (!isCompleteLog) {
        // Check if there is an approved regularization
        const reg = empRegularizations.find(r => r.regularizationDate === dStr);
        if (reg && reg.status === 'approved') {
          // Regularized, counts as present
        } else {
          // Unregularized or rejected -> LWP
          absentCount++;
        }
      }
    }
    lwpDays = absentCount;
  }

  const attendanceDays = Math.max(0, totalWorkingDays - lwpDays);

  // Compute LWP deduction based on HR Settings basis
  let dailyRate = 0;
  if (lwpDeductionBasis === 'gross') {
    dailyRate = grossSalary / totalWorkingDays;
  } else {
    // Default: Basic Salary only
    dailyRate = basic / totalWorkingDays;
  }

  const lwpDeduction = Math.round(dailyRate * lwpDays);
  const salaryOfAttendance = Math.max(0, basic - lwpDeduction);

  // Salary Advance Recovery calculation
  let advanceRecovery = 0;
  let activeAdvanceRecord = null;
  let advanceOutstanding = 0;

  const targetPeriodStr = `${monthName} ${year}`;
  const empAdv = salaryAdvances.find(adv =>
    (adv.employeeId === employee.id || adv.employeeEmail === employee.email) &&
    adv.status === 'approved' &&
    adv.outstandingBalance > 0
  );

  if (empAdv) {
    activeAdvanceRecord = empAdv;
    advanceOutstanding = empAdv.outstandingBalance;

    // Check if an installment matches targetPeriodStr or pick the first pending installment
    const targetInst = empAdv.repaymentSchedule?.find(s => s.payPeriod === targetPeriodStr && s.status === 'pending') ||
                       empAdv.repaymentSchedule?.find(s => s.status === 'pending');

    if (targetInst) {
      advanceRecovery = Math.min(targetInst.amount, empAdv.outstandingBalance);
    }
  }

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
    attendance: attendanceDays,
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
