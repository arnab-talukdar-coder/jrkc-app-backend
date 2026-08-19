import { Attendance } from '../models/Attendance.js';
import { Employee } from '../models/Employee.js';
import {
  haversineDistance,
  getTodayDateStr,
  getFormattedTimeStr,
  computeDurationMinutes
} from '../services/attendanceService.js';
import { memEmployees } from '../data/store.js';

export const getStatus = async (req, res) => {
  try {
    const employeeId = req.user?.id || req.query?.employeeId || req.body?.employeeId;
    const email = req.user?.email || req.query?.email || req.body?.email;
    const today = getTodayDateStr();

    if (!employeeId && !email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let attendance = null;
    if (employeeId) attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance && email) {
      // Find employee by email first to get ID
      const empByEmail = await Employee.findOne({ email: email.toLowerCase().trim() });
      if (empByEmail && empByEmail.id) {
        attendance = await Attendance.findOne({ employeeId: empByEmail.id, date: today });
      }
    }

    if (!attendance) {
      return res.status(200).json({ status: 'NOT_CLOCKED_IN', attendance: null });
    }

    return res.status(200).json({ status: attendance.status, attendance });
  } catch (error) {
    console.error('Error fetching attendance status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const clockIn = async (req, res) => {
  try {
    const employeeId = req.user?.id || req.body?.employeeId;
    const email = req.user?.email || req.body?.email;
    const { latitude, longitude, deviceInfo } = req.body;
    const now = new Date();
    const today = getTodayDateStr();
    const timeStr = getFormattedTimeStr(now);

    if (!employeeId && !email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const queryParams = [];
    if (employeeId) queryParams.push({ id: employeeId });
    if (email) queryParams.push({ email: email.toLowerCase().trim() });

    const emp = await Employee.findOne({ $or: queryParams });
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Normalize employeeId to the one from DB
    const finalEmployeeId = emp.id;

    // Check if Sunday
    if (now.getDay() === 0) {
      return res.status(400).json({ error: 'Sunday is a non-working day. Attendance cannot be recorded.' });
    }

    // Geofence Validation
    if (emp.assignedLocation && emp.assignedLocation.latitude && emp.assignedLocation.longitude) {
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: 'GPS location is required for attendance.' });
      }
      const distance = haversineDistance(latitude, longitude, emp.assignedLocation.latitude, emp.assignedLocation.longitude);
      const radius = emp.assignedLocation.geofenceRadius || 50;
      const locName = emp.assignedProjectName || emp.assignedLocation?.address || 'Work Site';
      if (distance > radius) {
        return res.status(403).json({
          error: `You are ${Math.round(distance)}m from ${locName}. You must be within ${radius}m to clock in.`,
          distance: Math.round(distance),
          radius
        });
      }
    }

    // Check for existing attendance today
    let attendance = await Attendance.findOne({ employeeId: finalEmployeeId, date: today });
    if (attendance) {
      if (attendance.status === 'CLOCKED_IN') {
        return res.status(400).json({ error: 'You are already clocked in.' });
      }
      if (attendance.status === 'CLOCKED_OUT') {
        return res.status(400).json({ error: 'You have already completed your shift for today.' });
      }
    }

    // Create new Attendance record
    attendance = new Attendance({
      employeeId: finalEmployeeId,
      employeeEmail: emp.email,
      date: today,
      status: 'CLOCKED_IN',
      clockInTime: timeStr,
      clockInTimestamp: now,
      clockInLocation: { latitude, longitude },
      assignedRadius: emp.assignedLocation?.geofenceRadius || 50,
      projectName: emp.assignedProjectName || emp.assignedLocation?.address || '',
      deviceInfo: deviceInfo || ''
    });

    await attendance.save();

    // Update Employee backward compatibility
    emp.status = 'Clocked In';
    emp.clockInTimestamp = now.toISOString();
    emp.clockOutTimestamp = null;
    
    if (!emp.recentLogs) emp.recentLogs = [];
    emp.recentLogs.unshift({
      type: 'clock_punch',
      date: today,
      clockInTime: timeStr,
      status: 'Active',
      projectName: emp.assignedProjectName || emp.assignedLocation?.address || '',
      createdAt: now.toISOString()
    });

    await emp.save();

    return res.status(201).json({ message: 'Clocked in successfully', attendance });
  } catch (error) {
    console.error('Error during clock in:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const clockOut = async (req, res) => {
  try {
    const employeeId = req.user?.id || req.body?.employeeId;
    const email = req.user?.email || req.body?.email;
    const { latitude, longitude } = req.body;
    const now = new Date();
    const today = getTodayDateStr();
    const timeStr = getFormattedTimeStr(now);

    if (!employeeId && !email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const queryParams = [];
    if (employeeId) queryParams.push({ id: employeeId });
    if (email) queryParams.push({ email: email.toLowerCase().trim() });

    const emp = await Employee.findOne({ $or: queryParams });
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Normalize employeeId to the one from DB
    const finalEmployeeId = emp.id;

    // Geofence Validation
    if (emp.assignedLocation && emp.assignedLocation.latitude && emp.assignedLocation.longitude) {
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: 'GPS location is required for attendance.' });
      }
      const distance = haversineDistance(latitude, longitude, emp.assignedLocation.latitude, emp.assignedLocation.longitude);
      const radius = emp.assignedLocation.geofenceRadius || 50;
      const locName = emp.assignedProjectName || emp.assignedLocation?.address || 'Work Site';
      if (distance > radius) {
        return res.status(403).json({
          error: `You are ${Math.round(distance)}m from ${locName}. You must be within ${radius}m to clock out.`,
          distance: Math.round(distance),
          radius
        });
      }
    }

    // Check for existing active attendance today
    const attendance = await Attendance.findOne({ employeeId: finalEmployeeId, date: today, status: 'CLOCKED_IN' });
    if (!attendance) {
      // Check if they are already clocked out
      const anyAttendance = await Attendance.findOne({ employeeId: finalEmployeeId, date: today, status: 'CLOCKED_OUT' });
      if (anyAttendance) {
        return res.status(400).json({ error: 'You are already clocked out.' });
      }
      return res.status(400).json({ error: 'No active clock-in session found for today.' });
    }

    const durationMins = computeDurationMinutes(attendance.clockInTimestamp, now);

    attendance.status = 'CLOCKED_OUT';
    attendance.clockOutTime = timeStr;
    attendance.clockOutTimestamp = now;
    attendance.clockOutLocation = { latitude, longitude };
    attendance.durationMinutes = durationMins;
    await attendance.save();

    emp.status = 'Clocked Out';
    emp.clockOutTimestamp = now.toISOString();
    
    if (!emp.recentLogs) emp.recentLogs = [];
    const activeLog = emp.recentLogs.find(l => l.date === today && l.type === 'clock_punch' && l.status === 'Active');
    if (activeLog) {
      activeLog.status = 'Completed';
      activeLog.clockOutTime = timeStr;
      activeLog.hours = `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`;
    } else {
      emp.recentLogs.unshift({
        type: 'clock_punch',
        date: today,
        clockInTime: attendance.clockInTime,
        clockOutTime: timeStr,
        hours: `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`,
        status: 'Completed',
        createdAt: now.toISOString()
      });
    }

    await emp.save();

    return res.status(200).json({ message: 'Clocked out successfully', attendance });
  } catch (error) {
    console.error('Error during clock out:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getHistory = async (req, res) => {
  try {
    const employeeId = req.user?.id;
    const { month } = req.query; // optional format YYYY-MM

    if (!employeeId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let query = { employeeId };
    
    if (month) {
      // month is "YYYY-MM", date is "YYYY-MM-DD", so we can use a regex or string prefix
      query.date = { $regex: `^${month}` };
    }

    const history = await Attendance.find(query).sort({ date: -1 });
    return res.status(200).json(history);
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


export const updateAttendanceByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { clockInTime, clockOutTime, status } = req.body;

    const attendance = await Attendance.findById(id);
    if (!attendance) {
      return res.status(404).json({ error: 'Attendance record not found.' });
    }

    if (clockInTime) attendance.clockInTime = clockInTime;
    if (clockOutTime) attendance.clockOutTime = clockOutTime;
    if (status) attendance.status = status;

    if (attendance.clockInTime && attendance.clockOutTime) {
      const parseTime = (timeStr) => {
        const [time, period] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };

      try {
        const inMins = parseTime(attendance.clockInTime);
        const outMins = parseTime(attendance.clockOutTime);
        attendance.durationMinutes = outMins > inMins ? outMins - inMins : (outMins + 24 * 60) - inMins;
      } catch (e) {
        console.error('Error calculating duration from string:', e);
      }
    }

    await attendance.save();

    res.json({ message: 'Attendance updated successfully', attendance });
  } catch (error) {
    console.error('Error updating attendance by admin:', error);
    res.status(500).json({ error: 'Internal server error while updating attendance.' });
  }
};
