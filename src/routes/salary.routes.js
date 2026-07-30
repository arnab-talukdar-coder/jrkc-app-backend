import express from 'express';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

function computeSalaryTotals(s) {
  const grossEarnings = (s.basic||0) + (s.hra||0) + (s.da||0) + (s.specialAllowance||0) +
    (s.conveyance||0) + (s.medical||0) + (s.otherAllowances||0);
  const totalDeductions = (s.employeePf||0) + (s.esi||0) + (s.professionalTax||0) +
    (s.tds||0) + (s.otherDeductions||0);
  const totalCtc = grossEarnings + (s.employerPf||0);
  const netSalary = Math.max(0, grossEarnings - totalDeductions);
  return { grossSalary: grossEarnings, totalCtc, netSalary };
}

// ── GET /api/v2/salary/:userId  (HR/Director: view salary) ────────────────
router.get('/:userId', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const struct = await SalaryStructure.findOne({ userIdStr: req.params.userId });
    if (!struct) return res.status(404).json({ error: 'No salary structure configured yet.' });
    res.json(struct);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch salary structure.' });
  }
});

// ── POST /api/v2/salary/configure/:userId  (HR: configure salary) ─────────
router.post('/configure/:userId', authenticateToken, requireRole('HR'), async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId).select('name department userRole accountStatus');
    if (!targetUser) return res.status(404).json({ error: 'Employee not found.' });
    if (targetUser.accountStatus !== 'approved') {
      return res.status(400).json({ error: 'Cannot configure salary for unapproved account.' });
    }

    const fields = ['basic','hra','da','specialAllowance','conveyance','medical','otherAllowances',
                    'employerPf','employeePf','esi','professionalTax','tds','otherDeductions'];
    const data = {};
    for (const f of fields) data[f] = Number(req.body[f] || 0);

    const totals = computeSalaryTotals(data);

    const struct = await SalaryStructure.findOneAndUpdate(
      { userIdStr: req.params.userId },
      {
        userId: req.params.userId,
        userIdStr: req.params.userId,
        userName: targetUser.name,
        department: targetUser.department,
        ...data,
        ...totals,
        status: 'pending_director',
        configuredBy: req.user.id,
        configuredByName: req.user.name,
        configuredAt: new Date(),
      },
      { new: true, upsert: true }
    );

    // Update user flag
    await User.findByIdAndUpdate(req.params.userId, { salaryConfigured: true, salaryApproved: false });

    // Notify Director
    await Notification.create({
      targetRole: 'Director',
      title: 'Salary Structure Pending Approval',
      message: `HR has configured salary for ${targetUser.name}. Please review and approve.`,
      type: 'salary_configured',
      refId: struct._id.toString(),
    });

    res.json({ message: 'Salary structure configured. Pending Director approval.', struct });
  } catch (err) {
    console.error('Salary configure error:', err);
    res.status(500).json({ error: 'Failed to configure salary.' });
  }
});

// ── PATCH /api/v2/salary/:id/approve  (Director: approve) ─────────────────
router.patch('/:id/approve', authenticateToken, requireRole('Director'), async (req, res) => {
  try {
    const struct = await SalaryStructure.findById(req.params.id);
    if (!struct) return res.status(404).json({ error: 'Salary structure not found.' });

    struct.status = 'approved';
    struct.approvedBy = req.user.id;
    struct.approvedByName = req.user.name;
    struct.approvedAt = new Date();
    await struct.save();

    // Sync to user's embedded salary structure
    await User.findOneAndUpdate(
      { _id: struct.userId },
      {
        salaryApproved: true,
        salaryStructure: {
          basic: struct.basic, hra: struct.hra, da: struct.da,
          specialAllowance: struct.specialAllowance, conveyance: struct.conveyance,
          medical: struct.medical, otherAllowances: struct.otherAllowances,
          employerPf: struct.employerPf, employeePf: struct.employeePf,
          esi: struct.esi, professionalTax: struct.professionalTax,
          tds: struct.tds, otherDeductions: struct.otherDeductions,
        }
      }
    );

    // Notify HR
    await Notification.create({
      targetRole: 'HR',
      title: 'Salary Approved',
      message: `Director approved salary structure for ${struct.userName}.`,
      type: 'salary_approved',
    });

    res.json({ message: 'Salary structure approved.', struct });
  } catch (err) {
    res.status(500).json({ error: 'Approval failed.' });
  }
});

// ── PATCH /api/v2/salary/:id/update  (Director: edit approved salary) ─────
router.patch('/:id/update', authenticateToken, requireRole('Director'), async (req, res) => {
  try {
    const struct = await SalaryStructure.findById(req.params.id);
    if (!struct) return res.status(404).json({ error: 'Salary structure not found.' });

    const fields = ['basic','hra','da','specialAllowance','conveyance','medical','otherAllowances',
                    'employerPf','employeePf','esi','professionalTax','tds','otherDeductions'];
    for (const f of fields) {
      if (req.body[f] !== undefined) struct[f] = Number(req.body[f]);
    }

    const totals = computeSalaryTotals(struct);
    Object.assign(struct, totals);
    struct.lastUpdatedBy = req.user.id;
    struct.lastUpdatedAt = new Date();
    await struct.save();

    // Sync to user embedded
    await User.findOneAndUpdate(
      { _id: struct.userId },
      {
        salaryStructure: {
          basic: struct.basic, hra: struct.hra, da: struct.da,
          specialAllowance: struct.specialAllowance, conveyance: struct.conveyance,
          medical: struct.medical, otherAllowances: struct.otherAllowances,
          employerPf: struct.employerPf, employeePf: struct.employeePf,
          esi: struct.esi, professionalTax: struct.professionalTax,
          tds: struct.tds, otherDeductions: struct.otherDeductions,
        }
      }
    );

    res.json({ message: 'Salary structure updated.', struct });
  } catch (err) {
    res.status(500).json({ error: 'Update failed.' });
  }
});

// ── GET /api/v2/salary  (Director: list all pending salary structures) ─────
router.get('/', authenticateToken, requireRole('HR', 'Director'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const structures = await SalaryStructure.find(filter).sort({ createdAt: -1 });
    res.json(structures);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch salary structures.' });
  }
});

export default router;
