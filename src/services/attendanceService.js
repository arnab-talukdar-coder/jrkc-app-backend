// src/services/attendanceService.js

/**
 * Calculates the distance between two GPS coordinates in meters using the Haversine formula.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculates duration between two timestamps in minutes.
 */
export function computeDurationMinutes(inTimestamp, outTimestamp) {
  if (!inTimestamp || !outTimestamp) return 0;
  try {
    const diffMs = new Date(outTimestamp) - new Date(inTimestamp);
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / 60000);
  } catch (e) {
    return 0;
  }
}

/**
 * Gets today's date string in YYYY-MM-DD format for the Asia/Kolkata timezone.
 */
export function getTodayDateStr() {
  const now = new Date();
  // We use en-CA as it outputs YYYY-MM-DD format naturally.
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Formats a Date object into a readable time string (e.g., '09:00 AM')
 */
export function getFormattedTimeStr(date = new Date()) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export function formatDurationString(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
