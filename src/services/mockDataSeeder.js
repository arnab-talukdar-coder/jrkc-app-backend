/**
 * Development Mock Data Seeder
 * Populates realistic attendance logs, attendance regularizations, and automatically generated payslips
 * for arnab.talukdar07@gmail.com for May 2026 and June 2026.
 * Supports both MongoDB and in-memory disk store modes.
 */

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Employee } from '../models/Employee.js';
import { Approval } from '../models/Approval.js';
import { Payslip } from '../models/Payslip.js';
import { HRSettings } from '../models/HRSettings.js';
import { calculateSalaryForEmployee } from './payrollService.js';

export async function seedDevelopmentData(targetEmail = 'arnab.talukdar07@gmail.com', memEmployees = [], memApprovals = [], memPayslips = [], saveDiskStore = () => {}) {
  try {
    console.log(`🌱 Seeding development HRMS data for ${targetEmail}...`);
    const isDbConnected = mongoose.connection.readyState === 1;

    // Ensure HR Settings exist with default LWP rule
    if (isDbConnected) {
      let settings = await HRSettings.findOne({ id: 'HR_SETTINGS_GLOBAL' });
      if (!settings) {
        await HRSettings.create({
          id: 'HR_SETTINGS_GLOBAL',
          lwpDeductionBasis: 'basic',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        });
      }
    }

    // 1. Seed Test Admin Account
    const adminEmail = 'admin@jrkc.com';
    const hashedAdminPassword = await bcrypt.hash('AdminPassword123', 10);
    const adminData = {
      id: 'ADM-001',
      name: 'JRKC Director / Admin',
      email: adminEmail,
      password: hashedAdminPassword,
      role: 'Director',
      userRole: 'Admin',
      department: 'Management',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      status: 'Clocked Out',
      accountStatus: 'approved',
      joiningDate: '2024-01-01',
      phone: '+91 9999999999',
      ptoDays: 18,
      sickDays: 10,
      casualDays: 10,
      recentLogs: []
    };

    if (isDbConnected) {
      let adminUser = await Employee.findOne({ email: adminEmail });
      if (!adminUser) {
        await Employee.create(adminData);
        console.log(`✅ Test Admin created in DB: ${adminEmail} (Password: AdminPassword123)`);
      } else if (!adminUser.password) {
        adminUser.password = hashedAdminPassword;
        await adminUser.save();
      }
    }
    let memAdmin = memEmployees.find(e => e.email?.toLowerCase() === adminEmail);
    if (!memAdmin) {
      memEmployees.unshift(adminData);
    } else if (!memAdmin.password) {
      memAdmin.password = hashedAdminPassword;
    }

    // 2. Seed Test HR Manager Account
    const hrEmail = 'hr@jrkc.com';
    const hashedHrPassword = await bcrypt.hash('HrPassword123', 10);
    const hrData = {
      id: 'HR-001',
      name: 'JRKC HR Manager',
      email: hrEmail,
      password: hashedHrPassword,
      role: 'HR Manager',
      userRole: 'HR',
      department: 'Human Resources',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
      status: 'Clocked Out',
      accountStatus: 'approved',
      joiningDate: '2024-01-15',
      phone: '+91 9888888888',
      ptoDays: 18,
      sickDays: 10,
      casualDays: 10,
      recentLogs: []
    };

    if (isDbConnected) {
      let hrUser = await Employee.findOne({ email: hrEmail });
      if (!hrUser) {
        await Employee.create(hrData);
        console.log(`✅ Test HR Manager created in DB: ${hrEmail} (Password: HrPassword123)`);
      } else if (!hrUser.password) {
        hrUser.password = hashedHrPassword;
        await hrUser.save();
      }
    }
    let memHr = memEmployees.find(e => e.email?.toLowerCase() === hrEmail);
    if (!memHr) {
      memEmployees.unshift(hrData);
    } else if (!memHr.password) {
      memHr.password = hashedHrPassword;
    }

    // 3. Find or create target employee
    const salaryStruct = {
      basic: 30000,
      hra: 12000,
      da: 0,
      sa: 8000,
      conveyance: 3000,
      otherAllowances: 2000,
      employerPf: 3600,
      employeePf: 3600,
      esi: 0,
      professionalTax: 200,
      tds: 1500
    };

    const targetEmpPassword = await bcrypt.hash('ArnabPassword123', 10);
    const empData = {
      id: 'EMP-007',
      name: 'Arnab Talukdar',
      email: targetEmail.toLowerCase(),
      password: targetEmpPassword,
      role: 'Senior Project Engineer',
      userRole: 'Employee',
      department: 'Engineering',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      status: 'Clocked Out',
      accountStatus: 'approved',
      joiningDate: '2025-01-15',
      phone: '+91 9876543210',
      station: 'KARAMBELI',
      baseSalary: 30000,
      allowances: 25000,
      taxDeductions: 1700,
      salaryStructure: salaryStruct,
      ptoDays: 18,
      sickDays: 10,
      casualDays: 10,
      recentLogs: []
    };

    let employee = null;
    if (isDbConnected) {
      employee = await Employee.findOne({ email: targetEmail.toLowerCase() });
      if (!employee) {
        employee = await Employee.create(empData);
      } else {
        employee.salaryStructure = salaryStruct;
        employee.baseSalary = 30000;
        if (!employee.password) employee.password = targetEmpPassword;
        await employee.save();
      }
    }

    let memTarget = memEmployees.find(e => e.email?.toLowerCase() === targetEmail.toLowerCase());
    if (!memTarget) {
      memEmployees.unshift(empData);
      memTarget = empData;
    } else {
      memTarget.salaryStructure = salaryStruct;
      memTarget.baseSalary = 30000;
      if (!memTarget.password) memTarget.password = targetEmpPassword;
    }

    // ── MAY 2026 MOCK DATA (100% Attendance Mon-Sat, 0 LWP) ──
    const mayLogs = [];
    const daysInMay = 31;
    for (let day = 1; day <= daysInMay; day++) {
      const dateStr = `2026-05-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(2026, 4, day);
      if (dateObj.getDay() === 0) continue; // Sunday off

      mayLogs.push({
        id: `LOG-MAY-${day}`,
        type: 'Site Entry',
        date: dateStr,
        hours: '9h 0m',
        duration: '9.0',
        createdAt: `${dateStr}T09:00:00.000Z`,
        clockInTime: '09:00 AM',
        clockInTimestamp: `${dateStr}T09:00:00.000Z`,
        clockOutTime: '06:00 PM',
        clockOutTimestamp: `${dateStr}T18:00:00.000Z`,
        projectName: 'Karambeli Track Extension Phase 2',
        notes: 'Regular site operations',
        status: 'Completed'
      });
    }

    // ── JUNE 2026 MOCK DATA (With missed punches & regularizations) ──
    const juneLogs = [];
    const daysInJune = 30;
    const missedDates = {
      8: 'missed_out',   // June 8: Missed Clock Out -> Regularized & Approved
      15: 'missed_in',   // June 15: Missed Clock In -> Regularized & Approved
      22: 'missed_in',   // June 22: Missed Clock In -> Regularized & REJECTED -> LWP 1
      29: 'missed_both'  // June 29: Missed Punch -> Unregularized -> LWP 2
    };

    for (let day = 1; day <= daysInJune; day++) {
      const dateStr = `2026-06-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(2026, 5, day);
      if (dateObj.getDay() === 0) continue; // Sunday off

      if (missedDates[day] === 'missed_out') {
        juneLogs.push({
          id: `LOG-JUN-${day}`,
          type: 'Site Entry',
          date: dateStr,
          hours: 'Incomplete',
          duration: '0',
          createdAt: `${dateStr}T09:00:00.000Z`,
          clockInTime: '09:00 AM',
          clockInTimestamp: `${dateStr}T09:00:00.000Z`,
          clockOutTime: null,
          clockOutTimestamp: null,
          projectName: 'Karambeli Track Extension Phase 2',
          notes: 'Missed Clock Out punch',
          status: 'Incomplete'
        });
      } else if (missedDates[day] === 'missed_in') {
        juneLogs.push({
          id: `LOG-JUN-${day}`,
          type: 'Site Entry',
          date: dateStr,
          hours: 'Incomplete',
          duration: '0',
          createdAt: `${dateStr}T18:00:00.000Z`,
          clockInTime: null,
          clockInTimestamp: null,
          clockOutTime: '06:00 PM',
          clockOutTimestamp: `${dateStr}T18:00:00.000Z`,
          projectName: 'Karambeli Track Extension Phase 2',
          notes: 'Missed Clock In punch',
          status: 'Incomplete'
        });
      } else if (missedDates[day] === 'missed_both') {
        // No log recorded on June 29
      } else {
        juneLogs.push({
          id: `LOG-JUN-${day}`,
          type: 'Site Entry',
          date: dateStr,
          hours: '9h 0m',
          duration: '9.0',
          createdAt: `${dateStr}T09:00:00.000Z`,
          clockInTime: '09:00 AM',
          clockInTimestamp: `${dateStr}T09:00:00.000Z`,
          clockOutTime: '06:00 PM',
          clockOutTimestamp: `${dateStr}T18:00:00.000Z`,
          projectName: 'Karambeli Track Extension Phase 2',
          notes: 'Regular site operations',
          status: 'Completed'
        });
      }
    }

    if (employee && isDbConnected) {
      const existingLogs = employee.recentLogs || [];
      const otherLogs = existingLogs.filter(l => !l.date || (!l.date.startsWith('2026-05') && !l.date.startsWith('2026-06')));
      employee.recentLogs = [...otherLogs, ...mayLogs, ...juneLogs];
      await employee.save();
    }
    if (memTarget) {
      const existingLogs = memTarget.recentLogs || [];
      const otherLogs = existingLogs.filter(l => !l.date || (!l.date.startsWith('2026-05') && !l.date.startsWith('2026-06')));
      memTarget.recentLogs = [...otherLogs, ...mayLogs, ...juneLogs];
    }

    // ── SEED ATTENDANCE REGULARIZATION APPROVALS ──
    const targetEmpId = employee?.id || memTarget?.id || 'EMP-007';
    const targetEmpName = employee?.name || memTarget?.name || 'Arnab Talukdar';
    const targetEmpRole = employee?.role || memTarget?.role || 'Senior Project Engineer';
    const targetEmpAvatar = employee?.avatar || memTarget?.avatar || '';

    const regApprovals = [
      {
        id: `REG-JUN-08-${targetEmpId}`,
        employeeId: targetEmpId,
        employeeName: targetEmpName,
        role: targetEmpRole,
        avatar: targetEmpAvatar,
        type: 'Attendance Regularization',
        details: 'Missed Clock Out on 2026-06-08',
        subDetails: 'System glitch during site exit. Verified site departure at 06:00 PM.',
        regularizationDate: '2026-06-08',
        missedType: 'Missed Clock Out',
        requestedClockIn: '09:00 AM',
        requestedClockOut: '06:00 PM',
        reason: 'Network outage on site mobile terminal during clock out',
        status: 'approved',
        hrApprovedBy: 'HR Manager',
        hrApprovedAt: '2026-06-09T10:00:00.000Z',
        adminApprovedBy: 'Director',
        adminApprovedAt: '2026-06-09T14:30:00.000Z',
        dateSubmitted: '2026-06-08'
      },
      {
        id: `REG-JUN-15-${targetEmpId}`,
        employeeId: targetEmpId,
        employeeName: targetEmpName,
        role: targetEmpRole,
        avatar: targetEmpAvatar,
        type: 'Attendance Regularization',
        details: 'Missed Clock In on 2026-06-15',
        subDetails: 'Train delay at Karambeli station. Arrived on site at 09:15 AM.',
        regularizationDate: '2026-06-15',
        missedType: 'Missed Clock In',
        requestedClockIn: '09:00 AM',
        requestedClockOut: '06:00 PM',
        reason: 'Official duty assignment at station office prior to site arrival',
        status: 'approved',
        hrApprovedBy: 'HR Manager',
        hrApprovedAt: '2026-06-16T11:00:00.000Z',
        adminApprovedBy: 'Director',
        adminApprovedAt: '2026-06-16T15:00:00.000Z',
        dateSubmitted: '2026-06-15'
      },
      {
        id: `REG-JUN-22-${targetEmpId}`,
        employeeId: targetEmpId,
        employeeName: targetEmpName,
        role: targetEmpRole,
        avatar: targetEmpAvatar,
        type: 'Attendance Regularization',
        details: 'Missed Clock In on 2026-06-22',
        subDetails: 'Unannounced absence during morning shift.',
        regularizationDate: '2026-06-22',
        missedType: 'Missed Clock In',
        requestedClockIn: '09:00 AM',
        requestedClockOut: '06:00 PM',
        reason: 'Personal work without prior leave notice',
        status: 'rejected',
        hrApprovedBy: 'HR Manager',
        hrApprovedAt: '2026-06-23T09:30:00.000Z',
        adminApprovedBy: null,
        adminApprovedAt: null,
        dateSubmitted: '2026-06-22'
      }
    ];

    for (const app of regApprovals) {
      if (isDbConnected) {
        await Approval.findOneAndUpdate({ id: app.id }, app, { upsert: true, new: true });
      }
      const existingIdx = memApprovals.findIndex(a => a.id === app.id);
      if (existingIdx !== -1) memApprovals[existingIdx] = app;
      else memApprovals.unshift(app);
    }

    // ── GENERATE MAY 2026 & JUNE 2026 PAYSLIPS ──
    const empForCalc = employee || memTarget;
    const mayPayroll = calculateSalaryForEmployee(empForCalc, 2026, 5, 'basic', regApprovals, 0);
    const mayPayslipData = {
      id: `PAY-2026-05-${targetEmpId}`,
      employeeId: targetEmpId,
      employeeName: targetEmpName,
      employeeEmail: targetEmail.toLowerCase(),
      department: empForCalc.department,
      role: empForCalc.role,
      assignedHrName: 'HR Manager',
      payPeriod: 'May 2026',
      month: 'May',
      year: 2026,
      payDate: '2026-05-31',
      workingDaysInMonth: mayPayroll.workingDaysInMonth,
      attendance: mayPayroll.attendance,
      lwpDays: 0,
      lwpDeduction: 0,
      station: 'KARAMBELI',
      serialNo: '27644',
      baseSalary: mayPayroll.baseSalary,
      basic: mayPayroll.basic,
      salaryOfAttendance: mayPayroll.salaryOfAttendance,
      hra: mayPayroll.hra,
      da: mayPayroll.da,
      sa: mayPayroll.sa,
      conveyance: mayPayroll.conveyance,
      otherAllowances: mayPayroll.otherAllowances,
      employerPf: mayPayroll.employerPf,
      totalCtc: mayPayroll.totalCtc,
      employeePf: mayPayroll.employeePf,
      esi: mayPayroll.esi,
      professionalTax: mayPayroll.professionalTax,
      tds: mayPayroll.tds,
      advance: 0,
      incomeTax: mayPayroll.tds,
      loan: 0,
      other: 0,
      totalDeductions: mayPayroll.totalDeductions,
      grossSalary: mayPayroll.grossSalary,
      netPay: mayPayroll.netPay,
      amountInWords: `Rupees ${mayPayroll.netPay.toLocaleString('en-IN')} Only`,
      disbursementStatus: 'dispatched',
      emailStatus: 'sent'
    };

    const junePayroll = calculateSalaryForEmployee(empForCalc, 2026, 6, 'basic', regApprovals, 2);
    const junePayslipData = {
      id: `PAY-2026-06-${targetEmpId}`,
      employeeId: targetEmpId,
      employeeName: targetEmpName,
      employeeEmail: targetEmail.toLowerCase(),
      department: empForCalc.department,
      role: empForCalc.role,
      assignedHrName: 'HR Manager',
      payPeriod: 'June 2026',
      month: 'June',
      year: 2026,
      payDate: '2026-06-30',
      workingDaysInMonth: junePayroll.workingDaysInMonth,
      attendance: junePayroll.attendance,
      lwpDays: junePayroll.lwpDays,
      lwpDeduction: junePayroll.lwpDeduction,
      station: 'KARAMBELI',
      serialNo: '27645',
      baseSalary: junePayroll.baseSalary,
      basic: junePayroll.basic,
      salaryOfAttendance: junePayroll.salaryOfAttendance,
      hra: junePayroll.hra,
      da: junePayroll.da,
      sa: junePayroll.sa,
      conveyance: junePayroll.conveyance,
      otherAllowances: junePayroll.otherAllowances,
      employerPf: junePayroll.employerPf,
      totalCtc: junePayroll.totalCtc,
      employeePf: junePayroll.employeePf,
      esi: junePayroll.esi,
      professionalTax: junePayroll.professionalTax,
      tds: junePayroll.tds,
      advance: 0,
      incomeTax: junePayroll.tds,
      loan: 0,
      other: 0,
      totalDeductions: junePayroll.totalDeductions,
      grossSalary: junePayroll.grossSalary,
      netPay: junePayroll.netPay,
      amountInWords: `Rupees ${junePayroll.netPay.toLocaleString('en-IN')} Only`,
      disbursementStatus: 'pending_disbursement',
      emailStatus: 'pending'
    };

    if (isDbConnected) {
      await Payslip.findOneAndUpdate({ id: mayPayslipData.id }, mayPayslipData, { upsert: true, new: true });
      await Payslip.findOneAndUpdate({ id: junePayslipData.id }, junePayslipData, { upsert: true, new: true });
    }

    const mayIdx = memPayslips.findIndex(p => p.id === mayPayslipData.id);
    if (mayIdx !== -1) memPayslips[mayIdx] = mayPayslipData;
    else memPayslips.unshift(mayPayslipData);

    const juneIdx = memPayslips.findIndex(p => p.id === junePayslipData.id);
    if (juneIdx !== -1) memPayslips[juneIdx] = junePayslipData;
    else memPayslips.unshift(junePayslipData);

    saveDiskStore();

    console.log(`✅ Development mock data seeded successfully for ${targetEmail}!`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Mock data seeding error:`, err.message);
  }
}
