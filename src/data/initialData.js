export const INITIAL_EMPLOYEES = [
  {
    id: 'HR-8829',
    name: 'Alex Rivers',
    role: 'Senior Developer',
    department: 'Engineering',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked Out',
    clockTime: '05:30 PM Out',
    ptoDays: 14,
    sickDays: 5,
    email: 'alex.rivers@luxehr.com',
    phone: '+1 (555) 019-2834',
    dateOfBirth: 'Mar 12, 1990',
    reportingManager: 'Sarah Chen',
    joiningDate: 'Oct 15, 2021',
    recentLogs: [
      { date: 'Today', hours: '08:15 AM - Present', duration: '4h 30m', status: 'Active' },
      { date: 'Yesterday', hours: '08:00 AM - 05:00 PM', duration: '8h 00m', status: 'Completed' },
      { date: 'Mon, Oct 08', hours: '08:30 AM - 05:15 PM', duration: '7h 45m', status: 'Completed' }
    ]
  },
  {
    id: 'HR-1042',
    name: 'Sarah Jenkins',
    role: 'Senior Frontend Engineer',
    department: 'Engineering',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    clockTime: '08:15 AM In',
    ptoDays: 12,
    sickDays: 4,
    email: 'sarah.jenkins@luxehr.com',
    phone: '+1 (555) 019-3321',
    dateOfBirth: 'Jun 24, 1992',
    reportingManager: 'Sarah Chen',
    joiningDate: 'Feb 10, 2020',
    recentLogs: [
      { date: 'Today', hours: '08:15 AM - Present', duration: '4h 30m', status: 'Active' },
      { date: 'Yesterday', hours: '08:00 AM - 05:00 PM', duration: '8h 00m', status: 'Completed' }
    ]
  },
  {
    id: 'HR-2088',
    name: 'Marcus Chen',
    role: 'Lead Product Designer',
    department: 'Design',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked Out',
    clockTime: '05:30 PM Out',
    ptoDays: 15,
    sickDays: 3,
    email: 'marcus.chen@luxehr.com',
    phone: '+1 (555) 019-4411',
    dateOfBirth: 'Nov 04, 1988',
    reportingManager: 'Sarah Chen',
    joiningDate: 'Jan 12, 2019',
    recentLogs: [
      { date: 'Yesterday', hours: '08:30 AM - 05:30 PM', duration: '8h 00m', status: 'Completed' }
    ]
  },
  {
    id: 'HR-3391',
    name: 'Elena Rodriguez',
    role: 'Marketing Director',
    department: 'Marketing',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
    status: 'On Leave',
    returnsDate: 'Returns Oct 12',
    ptoDays: 8,
    sickDays: 6,
    email: 'elena.rodriguez@luxehr.com',
    phone: '+1 (555) 019-7720',
    dateOfBirth: 'Aug 18, 1989',
    reportingManager: 'David Wallace',
    joiningDate: 'Mar 01, 2021',
    recentLogs: []
  },
  {
    id: 'HR-5510',
    name: 'David Wallace',
    role: 'VP of Sales',
    department: 'Sales',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    status: 'Clocked In',
    clockTime: '09:00 AM In',
    ptoDays: 18,
    sickDays: 7,
    email: 'david.wallace@luxehr.com',
    phone: '+1 (555) 019-9988',
    dateOfBirth: 'May 03, 1983',
    reportingManager: 'CEO',
    joiningDate: 'Jul 10, 2018',
    recentLogs: [
      { date: 'Today', hours: '09:00 AM - Present', duration: '3h 45m', status: 'Active' }
    ]
  }
];

export const INITIAL_APPROVALS = [
  {
    id: 'REQ-101',
    employeeName: 'Sarah Jenkins',
    role: 'Senior Frontend Engineer',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    type: 'Annual Leave',
    details: 'Oct 24 - Oct 28 (5 Days)',
    subDetails: 'Vacation Trip - Coverage arranged with Alex',
    status: 'pending',
    dateSubmitted: '2 hours ago'
  },
  {
    id: 'REQ-102',
    employeeName: 'Marcus Chen',
    role: 'Lead Product Designer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    type: 'Equipment Loan',
    details: 'MacBook Pro M3 Max + 32" Display',
    subDetails: 'Design Workstation Upgrade Request',
    status: 'pending',
    dateSubmitted: 'Yesterday'
  },
  {
    id: 'REQ-103',
    employeeName: 'Elena Rodriguez',
    role: 'Marketing Director',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80',
    type: 'Salary Advance',
    details: '$2,500.00 Advance',
    subDetails: 'Emergency Medical Expense - Repayment over 3 months',
    status: 'approved',
    dateSubmitted: 'Oct 05, 2026'
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
  },
  {
    id: 'ANN-002',
    type: 'Policy Update',
    time: '2 days ago',
    title: 'Updated Remote Work & Healthcare Benefits 2026',
    summary: 'We have upgraded our health insurance coverage and enhanced wellness stipends. Please review the updated benefit guide in HR portal.',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80'
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
  { id: 'TAX-01', name: 'Form W-2 / Form 16 Annual Statement', period: 'FY 2025-2026', type: 'pdf', statusNote: 'Verified & Signed' },
  { id: 'TAX-02', name: 'Investment & Exemption Declaration', period: 'FY 2026-2027', type: 'form', statusNote: 'Approved' },
  { id: 'TAX-03', name: 'Medical Expense Reimbursement Claim', period: 'Q3 2026', type: 'upload', statusNote: 'Processing' }
];

export const INITIAL_PAYROLL = {
  period: 'October 2026',
  payDate: 'Oct 31, 2026',
  grossPay: '$9,500.00',
  deductions: '$1,850.00',
  netPay: '$7,650.00'
};
