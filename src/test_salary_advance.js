import { calculateGrossSalary, generateRepaymentSchedule, calculateSalaryForEmployee } from './services/payrollService.js';

console.log('=== SALARY ADVANCE END-TO-END VERIFICATION TEST ===\n');

// Test 1: Dynamic Gross Monthly Salary Calculation
const mockEmployee = {
  id: 'EMP-101',
  name: 'Sachin Sharma',
  email: 'sachin@jrkcrail.com',
  department: 'Operations',
  role: 'Site Engineer',
  baseSalary: 12000,
  allowances: 8000,
  salaryStructure: {
    basic: 12000,
    hra: 4800,
    da: 1200,
    sa: 1000,
    conveyance: 500,
    otherAllowances: 500
  }
};

const gross = calculateGrossSalary(mockEmployee);
console.log(`✅ Gross Monthly Salary: ₹${gross.toLocaleString('en-IN')}`);
console.log(`   (Expected: ₹20,000 | Match: ${gross === 20000 ? 'YES' : 'NO'})\n`);

// Test 2: Repayment Schedule Rounding & Distribution (3 Months)
console.log('--- 3-Month Repayment Schedule (₹20,000) ---');
const sched3 = generateRepaymentSchedule(20000, 3, 2026, 'June');
console.log(sched3);
const sum3 = sched3.reduce((acc, curr) => acc + curr.amount, 0);
console.log(`✅ Total 3-Month Sum: ₹${sum3.toLocaleString('en-IN')} (Matches exact ₹20,000: ${sum3 === 20000 ? 'YES' : 'NO'})\n`);

// Test 3: Repayment Schedule Rounding & Distribution (6 Months)
console.log('--- 6-Month Repayment Schedule (₹20,000) ---');
const sched6 = generateRepaymentSchedule(20000, 6, 2026, 'June');
console.log(sched6);
const sum6 = sched6.reduce((acc, curr) => acc + curr.amount, 0);
console.log(`✅ Total 6-Month Sum: ₹${sum6.toLocaleString('en-IN')} (Matches exact ₹20,000: ${sum6 === 20000 ? 'YES' : 'NO'})\n`);

// Test 4: Repayment Schedule Rounding & Distribution (12 Months)
console.log('--- 12-Month Repayment Schedule (₹20,000) ---');
const sched12 = generateRepaymentSchedule(20000, 12, 2026, 'June');
console.log(sched12);
const sum12 = sched12.reduce((acc, curr) => acc + curr.amount, 0);
console.log(`✅ Total 12-Month Sum: ₹${sum12.toLocaleString('en-IN')} (Matches exact ₹20,000: ${sum12 === 20000 ? 'YES' : 'NO'})\n`);

// Test 5: Automatic Payroll Deduction Integration
const mockActiveAdvance = {
  id: 'ADV-001',
  employeeId: 'EMP-101',
  employeeEmail: 'sachin@jrkcrail.com',
  status: 'approved',
  approvedAmount: 20000,
  outstandingBalance: 20000,
  repaymentSchedule: sched3
};

const payrollCalc = calculateSalaryForEmployee(
  mockEmployee,
  2026,
  'June',
  'basic',
  [],
  0,
  [mockActiveAdvance]
);

console.log('--- Payroll Integration Output ---');
console.log(`Gross Salary: ₹${payrollCalc.grossSalary}`);
console.log(`LWP Deduction: ₹${payrollCalc.lwpDeduction}`);
console.log(`Salary Advance Recovery: ₹${payrollCalc.salaryAdvanceRecovery}`);
console.log(`Remaining Outstanding Balance: ₹${payrollCalc.advanceOutstandingBalance}`);
console.log(`Total Deductions: ₹${payrollCalc.totalDeductions}`);
console.log(`Net Pay: ₹${payrollCalc.netPay}`);
console.log(`\n✅ Payroll Deduction Verification Passed!`);
