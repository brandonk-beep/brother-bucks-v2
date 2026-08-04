// Lookup tables for score conversion
const RAVING_FANS_TABLE = [
  { minPercent: 0.00, maxPercent: 2.00, score: 0 },
  { minPercent: 2.00, maxPercent: 4.00, score: 1 },
  { minPercent: 4.00, maxPercent: 5.00, score: 2 },
  { minPercent: 5.00, maxPercent: 7.00, score: 3 },
  { minPercent: 7.00, maxPercent: 10.00, score: 4 },
  { minPercent: 10.00, maxPercent: 12.00, score: 5 },
  { minPercent: 12.00, maxPercent: 14.00, score: 6 },
  { minPercent: 14.00, maxPercent: 17.00, score: 7 },
  { minPercent: 17.00, maxPercent: 19.00, score: 8 },
  { minPercent: 19.00, maxPercent: 21.00, score: 9 },
  { minPercent: 21.00, maxPercent: Infinity, score: 10 },
];

const DAMAGE_TABLE = [
  { maxDollarPerHour: 0.00, score: 10 },
  { maxDollarPerHour: 0.62, score: 9 },
  { maxDollarPerHour: 0.92, score: 8 },
  { maxDollarPerHour: 1.23, score: 7 },
  { maxDollarPerHour: 1.54, score: 6 },
  { maxDollarPerHour: 1.85, score: 5 },
  { maxDollarPerHour: 2.16, score: 4 },
  { maxDollarPerHour: 2.46, score: 3 },
  { maxDollarPerHour: 2.53, score: 2 },
  { maxDollarPerHour: 2.60, score: 1 },
  { maxDollarPerHour: 2.67, score: 0 },
  { maxDollarPerHour: Infinity, score: 0 },
];

const ATTENDANCE_TABLE = [
  { maxPoints: 0.0, score: 10 },
  { maxPoints: 0.4, score: 9 },
  { maxPoints: 0.7, score: 8 },
  { maxPoints: 1.0, score: 7 },
  { maxPoints: 1.3, score: 6 },
  { maxPoints: 1.6, score: 5 },
  { maxPoints: 1.9, score: 4 },
  { maxPoints: 2.2, score: 3 },
  { maxPoints: 2.5, score: 2 },
  { maxPoints: 2.8, score: 1 },
  { maxPoints: 3.1, score: 0 },
  { maxPoints: Infinity, score: 0 },
];

function getConversionRateScore(conversionPercent) {
  // conversionPercent is 0-100
  for (let entry of RAVING_FANS_TABLE) {
    if (conversionPercent >= entry.minPercent && conversionPercent <= entry.maxPercent) {
      return entry.score;
    }
  }
  return 0;
}

function getDamageScore(damagePerHour) {
  for (let entry of DAMAGE_TABLE) {
    if (damagePerHour <= entry.maxDollarPerHour) {
      return entry.score;
    }
  }
  return 0;
}

function getAttendanceScore(attendancePoints) {
  for (let entry of ATTENDANCE_TABLE) {
    if (attendancePoints <= entry.maxPoints) {
      return entry.score;
    }
  }
  return 0;
}

function calculateOverallScore(ravingFansScore, damageScore, attendanceScore) {
  // Weights: Raving Fans 20%, Damage 40%, Attendance 40%
  const ravingFansPoints = ravingFansScore * 0.20 * 100; // *100 for the /100 later
  const damagePoints = damageScore * 0.40 * 100;
  const attendancePoints = attendanceScore * 0.40 * 100;

  const totalPoints = ravingFansPoints + damagePoints + attendancePoints;
  const overallScore = totalPoints / 100;

  return Math.round(overallScore * 100) / 100; // Round to 2 decimals
}

function calculateHourlyRate(overallScore) {
  // IF(Overall Score >= 4, (Overall Score - 3) * 0.25, Overall Score * 0.0625)
  let rate;
  if (overallScore >= 4) {
    rate = (overallScore - 3) * 0.25;
  } else {
    rate = overallScore * 0.0625;
  }
  return Math.round(rate * 10000) / 10000; // Round to 4 decimals
}

function calculateMonthlyBonus(hourlyRate, totalHours) {
  return Math.round(hourlyRate * totalHours * 100) / 100; // Round to 2 decimals
}

module.exports = {
  getConversionRateScore,
  getDamageScore,
  getAttendanceScore,
  calculateOverallScore,
  calculateHourlyRate,
  calculateMonthlyBonus,
  RAVING_FANS_TABLE,
  DAMAGE_TABLE,
  ATTENDANCE_TABLE,
};
