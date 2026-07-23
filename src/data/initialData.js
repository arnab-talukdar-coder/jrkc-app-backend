export const INITIAL_EMPLOYEES = [
  {
    id: 'HR-0001',
    name: 'Director / Admin User',
    role: 'Executive Director',
    userRole: 'Admin',
    department: 'Executive',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    accountStatus: 'approved',
    clockTime: '08:00 AM In',
    ptoDays: 30,
    sickDays: 10,
    lwpDaysTaken: 0,
    email: 'admin@jrkc.com',
    phone: '+1 (555) 010-0001',
    dateOfBirth: 'Jan 01, 1980',
    reportingManager: 'Board of Directors',
    joiningDate: 'Jan 01, 2018',
    baseSalary: 120000,
    allowances: 15000,
    taxDeductions: 10000,
    recentLogs: []
  },
  {
    id: 'HR-0010',
    name: 'Sarah Chen',
    role: 'HR Operations Lead',
    userRole: 'HR',
    department: 'Human Resources',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    accountStatus: 'approved',
    clockTime: '08:30 AM In',
    ptoDays: 20,
    sickDays: 8,
    lwpDaysTaken: 0,
    email: 'sarah.chen@jrkc.com',
    phone: '+1 (555) 010-0010',
    dateOfBirth: 'Apr 15, 1988',
    reportingManager: 'Director / Admin User',
    joiningDate: 'Mar 10, 2019',
    baseSalary: 85000,
    allowances: 8000,
    taxDeductions: 4500,
    recentLogs: []
  },
  {
    id: 'HR-0011',
    name: 'Robert Vance',
    role: 'Senior HR Partner',
    userRole: 'HR',
    department: 'Human Resources',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    accountStatus: 'approved',
    clockTime: '08:45 AM In',
    ptoDays: 20,
    sickDays: 8,
    lwpDaysTaken: 0,
    email: 'robert.vance@jrkc.com',
    phone: '+1 (555) 010-0011',
    dateOfBirth: 'Aug 22, 1985',
    reportingManager: 'Director / Admin User',
    joiningDate: 'Jun 15, 2020',
    baseSalary: 82000,
    allowances: 7500,
    taxDeductions: 4200,
    recentLogs: []
  },
  {
    id: 'HR-8829',
    name: 'Alex Rivers',
    role: 'Senior Developer',
    userRole: 'Employee',
    department: 'Engineering',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked Out',
    accountStatus: 'approved',
    clockTime: '05:30 PM Out',
    ptoDays: 14,
    sickDays: 5,
    lwpDaysTaken: 2,
    email: 'alex.rivers@luxehr.com',
    phone: '+1 (555) 019-2834',
    dateOfBirth: 'Mar 12, 1990',
    reportingManager: 'Sarah Chen',
    assignedHrId: 'HR-0010',
    assignedHrName: 'Sarah Chen',
    assignedHrEmail: 'sarah.chen@jrkc.com',
    joiningDate: 'Oct 15, 2021',
    baseSalary: 72000,
    allowances: 6000,
    taxDeductions: 3500,
    recentLogs: [
      { date: 'Today', hours: '08:15 AM - Present', duration: '4h 30m', status: 'Active' },
      { date: 'Yesterday', hours: '08:00 AM - 05:00 PM', duration: '8h 00m', status: 'Completed' }
    ]
  },
  {
    id: 'HR-1042',
    name: 'Sarah Jenkins',
    role: 'Senior Frontend Engineer',
    userRole: 'Employee',
    department: 'Engineering',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    accountStatus: 'approved',
    clockTime: '08:15 AM In',
    ptoDays: 12,
    sickDays: 4,
    lwpDaysTaken: 0,
    email: 'sarah.jenkins@luxehr.com',
    phone: '+1 (555) 019-3321',
    dateOfBirth: 'Jun 24, 1992',
    reportingManager: 'Sarah Chen',
    assignedHrId: 'HR-0010',
    assignedHrName: 'Sarah Chen',
    assignedHrEmail: 'sarah.chen@jrkc.com',
    joiningDate: 'Feb 10, 2020',
    baseSalary: 68000,
    allowances: 5500,
    taxDeductions: 3200,
    recentLogs: []
  },
  {
    id: 'HR-2088',
    name: 'Marcus Chen',
    role: 'Lead Product Designer',
    userRole: 'Employee',
    department: 'Design',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked Out',
    accountStatus: 'approved',
    clockTime: '05:30 PM Out',
    ptoDays: 15,
    sickDays: 3,
    lwpDaysTaken: 1,
    email: 'marcus.chen@luxehr.com',
    phone: '+1 (555) 019-4411',
    dateOfBirth: 'Nov 04, 1988',
    reportingManager: 'Robert Vance',
    assignedHrId: 'HR-0011',
    assignedHrName: 'Robert Vance',
    assignedHrEmail: 'robert.vance@jrkc.com',
    joiningDate: 'Jan 12, 2019',
    baseSalary: 65000,
    allowances: 5000,
    taxDeductions: 3000,
    recentLogs: []
  }
];

export const INITIAL_REGISTRATION_REQUESTS = [
  {
    id: 'REG-101',
    name: 'Daniel Kim',
    email: 'daniel.kim@example.com',
    phone: '+1 (555) 018-9922',
    department: 'Engineering',
    role: 'Full Stack Engineer',
    requestedUserRole: 'Employee',
    assignedHrId: 'HR-0010',
    assignedHrName: 'Sarah Chen',
    status: 'pending_approval',
    dateSubmitted: 'Jul 23, 2026'
  },
  {
    id: 'REG-102',
    name: 'Lisa Taylor',
    email: 'lisa.taylor@example.com',
    phone: '+1 (555) 018-4433',
    department: 'Design',
    role: 'UI/UX Specialist',
    requestedUserRole: 'Employee',
    assignedHrId: 'HR-0011',
    assignedHrName: 'Robert Vance',
    status: 'pending_approval',
    dateSubmitted: 'Jul 22, 2026'
  }
];

export const INITIAL_APPROVALS = [
  {
    id: 'REQ-101',
    employeeId: 'HR-1042',
    employeeName: 'Sarah Jenkins',
    role: 'Senior Frontend Engineer',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    type: 'Annual Leave',
    details: 'Oct 24 - Oct 28 (5 Days)',
    subDetails: 'Vacation Trip - Coverage arranged with Alex',
    assignedHrId: 'HR-0010',
    assignedHrName: 'Sarah Chen',
    assignedHrEmail: 'sarah.chen@jrkc.com',
    startDate: '2026-10-24',
    endDate: '2026-10-28',
    totalDays: 5,
    isLwp: false,
    lwpDays: 0,
    status: 'pending',
    dateSubmitted: '2 hours ago'
  },
  {
    id: 'REQ-102',
    employeeId: 'HR-8829',
    employeeName: 'Alex Rivers',
    role: 'Senior Developer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    type: 'LWP Leave',
    details: 'Nov 02 - Nov 04 (2 Days LWP)',
    subDetails: 'Personal Emergency - Leave Without Pay requested',
    assignedHrId: 'HR-0010',
    assignedHrName: 'Sarah Chen',
    assignedHrEmail: 'sarah.chen@jrkc.com',
    startDate: '2026-11-02',
    endDate: '2026-11-04',
    totalDays: 2,
    isLwp: true,
    lwpDays: 2,
    status: 'approved',
    dateSubmitted: 'Yesterday'
  }
];

export const INITIAL_ANNOUNCEMENTS = [
  {
    id: 'ANN-001',
    type: 'Announcement',
    time: '2 hours ago',
    title: 'Q4 All-Hands Town Hall & Strategy Summit',
    summary: 'Join us this Friday at 3:00 PM EST for our quarterly company townhall. Executive leadership will share Q4 roadmaps and product updates.',
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80'
  }
];

export const INITIAL_BANK_DETAILS = {
  bankName: 'Silicon Valley Commercial Bank',
  accountType: 'Checking Account',
  accountNumber: '•••• •••• 8829',
  routingNumberOrIfsc: '121000358',
  isVerified: true
};

export const INITIAL_TAX_DOCS = [
  { id: 'TAX-01', name: 'Form W-2 / Form 16 Annual Statement', period: 'FY 2025-2026', type: 'pdf', statusNote: 'Verified & Signed' }
];

export const INITIAL_PAYROLL = {
  period: 'October 2026',
  payDate: 'Oct 31, 2026',
  grossPay: '$6,000.00',
  deductions: '$680.00',
  netPay: '$5,320.00'
};
