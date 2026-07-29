// Initial seed data — only used when database is empty and SEED_INITIAL_DATA is not 'false'
// In production, the first Admin registers via /api/auth/register-admin with the admin secret key

export const INITIAL_EMPLOYEES = [];

export const INITIAL_REGISTRATION_REQUESTS = [];

export const INITIAL_APPROVALS = [];

export const INITIAL_ANNOUNCEMENTS = [];

export const INITIAL_PAYSLIPS = [];

export const INITIAL_BANK_DETAILS = {
  bankName: 'JRKC Rail Infra Pvt Ltd - Company Account',
  accountNumber: '',
  ifscCode: '',
  accountType: 'Current',
  branch: ''
};
