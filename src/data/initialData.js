export const INITIAL_EMPLOYEES = [
  {
    id: 'ADM-0001',
    name: 'Arnab Director',
    role: 'Admin / Director',
    userRole: 'Admin',
    department: 'Management',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    accountStatus: 'approved',
    password: '$2b$10$rn5DvpB80PE1pnff6DrxsOf9Uh.ZKPone7mS6nTxdiGljd983Qe36', // Admin@123
    ptoDays: 30,
    sickDays: 10,
    lwpDaysTaken: 0,
    email: 'arnab@yopmail.com',
    phone: '+91 98765 00001',
    dateOfBirth: 'Jan 01, 1985',
    reportingManager: 'Board of Directors',
    joiningDate: 'Jan 01, 2020',
    baseSalary: 120000,
    allowances: 15000,
    taxDeductions: 10000,
    recentLogs: []
  },
  {
    id: 'HR-0001',
    name: 'HR Manager',
    role: 'HR Manager',
    userRole: 'HR',
    department: 'Human Resources',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    accountStatus: 'approved',
    password: '$2b$10$yhIldDJHpRly46Xon5V3GOkVNYaMUbMu3cjltQx/Di4hEZGk/MVqe', // Hrm@123
    ptoDays: 20,
    sickDays: 8,
    lwpDaysTaken: 0,
    email: 'hr@yopmail.com',
    phone: '+91 98765 00002',
    dateOfBirth: 'Apr 15, 1990',
    reportingManager: 'Arnab Director',
    joiningDate: 'Mar 10, 2021',
    baseSalary: 85000,
    allowances: 8000,
    taxDeductions: 4500,
    recentLogs: []
  }
];

export const INITIAL_REGISTRATION_REQUESTS = [];

export const INITIAL_APPROVALS = [];

export const INITIAL_ANNOUNCEMENTS = [
  {
    id: 'ANN-001',
    type: 'Announcement',
    time: 'Just now',
    title: 'Welcome to JRKC HR Portal',
    summary: 'JRKC Rail Coach Factory HR Management Portal initialized and ready for operation.',
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80'
  }
];

export const INITIAL_BANK_DETAILS = {
  bankName: 'State Bank of India',
  accountType: 'Savings Account',
  accountNumber: '•••• •••• 8829',
  routingNumberOrIfsc: 'SBIN0001234',
  isVerified: true
};

export const INITIAL_TAX_DOCS = [
  { id: 'TAX-01', name: 'Form 16 Annual Tax Statement', period: 'FY 2025-2026', type: 'pdf', statusNote: 'Verified & Signed' }
];

export const INITIAL_PAYROLL = {
  period: 'October 2026',
  payDate: '31 Oct 2026',
  grossPay: '₹60,000.00',
  deductions: '₹3,000.00',
  netPay: '₹57,000.00'
};
