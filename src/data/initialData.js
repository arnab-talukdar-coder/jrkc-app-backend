export const INITIAL_EMPLOYEES = [
  {
    id: 'ADM-0001',
    name: 'Arnab Director',
    role: 'Admin / Director',
    userRole: 'Admin',
    department: 'Management',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: '$2b$10$rn5DvpB80PE1pnff6DrxsOf9Uh.ZKPone7mS6nTxdiGljd983Qe36', // Admin@123
    ptoDays: 18,
    sickDays: 10,
    casualDays: 10,
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
    status: 'Clocked Out',
    accountStatus: 'approved',
    password: '$2b$10$yhIldDJHpRly46Xon5V3GOkVNYaMUbMu3cjltQx/Di4hEZGk/MVqe', // Hrm@123
    ptoDays: 18,
    sickDays: 10,
    casualDays: 10,
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
    title: 'Financial Discipline & Prevention of Irregularities Notice',
    message: 'All employees are instructed to maintain complete transparency and accuracy in financial transactions, record-keeping, and operational procedures.',
    author: 'Management / HR'
  }
];

// No demo payslips — payslips are created by HR through the Issue Salary Slip workflow
export const INITIAL_PAYSLIPS = [];
