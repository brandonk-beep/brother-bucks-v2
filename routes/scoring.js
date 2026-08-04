const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const {
  getConversionRateScore,
  getDamageScore,
  getAttendanceScore,
  calculateOverallScore,
  calculateHourlyRate,
  calculateMonthlyBonus,
} = require('../utils/scoring');

async function calculateMoverScore(moverId, monthYear) {
  const client = await pool.connect();
  try {
    // Get total hours worked
    const hoursResult = await client.query(
      'SELECT SUM(total_hours) as total FROM hours WHERE mover_id = $1 AND month_year = $2',
      [moverId, monthYear]
    );
    const totalHours = parseFloat(hoursResult.rows[0]?.total) || 0;

    // Get all reviews for the month
    const reviewsResult = await client.query(
      'SELECT rating FROM reviews WHERE mover_id = $1 AND month_year = $2 ORDER BY rating DESC',
      [moverId, monthYear]
    );
    const reviews = reviewsResult.rows || [];

    // Calculate raving fans score
    let fiveStarCount = reviews.filter(r => r.rating === 5).length;
    const totalReviews = reviews.length;

    // Apply negative review penalties
    for (const review of reviews) {
      if (review.rating === 3) fiveStarCount -= 3;
      if (review.rating === 2) fiveStarCount -= 4;
      if (review.rating === 1) fiveStarCount -= 5;
    }

    fiveStarCount = Math.max(0, fiveStarCount); // Don't go negative
    const conversionRate = totalReviews > 0 ? (fiveStarCount / totalReviews) * 100 : 0;
    const ravingFansScore = totalReviews > 0 ? getConversionRateScore(conversionRate) : 0;

    // Get damage score
    const damageResult = await client.query(
      'SELECT SUM(cost_per_mover) as total FROM damages WHERE mover_id = $1 AND month_year = $2',
      [moverId, monthYear]
    );
    const totalDamage = parseFloat(damageResult.rows[0]?.total) || 0;
    const damagePerHour = totalHours > 0 ? totalDamage / totalHours : 0;
    const damageScore = getDamageScore(damagePerHour);

    // Get attendance score
    const attendanceResult = await client.query(
      'SELECT SUM(points) as total FROM attendance WHERE mover_id = $1 AND month_year = $2',
      [moverId, monthYear]
    );
    const totalAttendancePoints = parseFloat(attendanceResult.rows[0]?.total) || 0;
    const attendanceScore = getAttendanceScore(totalAttendancePoints);

    // Calculate overall score and bonus
    const overallScore = calculateOverallScore(ravingFansScore, damageScore, attendanceScore);
    const hourlyRate = calculateHourlyRate(overallScore);
    const monthlyBonus = totalHours > 0 ? calculateMonthlyBonus(hourlyRate, totalHours) : 0;

    // Upsert score record
    await client.query(
      `INSERT INTO scores (mover_id, month_year, raving_fans_score, damage_score, attendance_score, overall_score, hourly_rate, monthly_bonus)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (mover_id, month_year) DO UPDATE
       SET raving_fans_score = $3, damage_score = $4, attendance_score = $5, overall_score = $6, hourly_rate = $7, monthly_bonus = $8, updated_at = CURRENT_TIMESTAMP`,
      [moverId, monthYear, ravingFansScore, damageScore, attendanceScore, overallScore, hourlyRate, monthlyBonus]
    );

    return {
      moverId,
      monthYear,
      totalHours: Math.round(totalHours * 100) / 100,
      ravingFansScore,
      damageScore,
      attendanceScore,
      overallScore,
      hourlyRate,
      monthlyBonus,
      conversionRate: Math.round(conversionRate * 100) / 100,
      damagePerHour: Math.round(damagePerHour * 100) / 100,
      totalAttendancePoints,
    };
  } finally {
    client.release();
  }
}

// Get or calculate mover score
router.get('/score/:moverId/:monthYear', async (req, res) => {
  try {
    const { moverId, monthYear } = req.params;
    const score = await calculateMoverScore(parseInt(moverId), monthYear);
    res.json(score);
  } catch (err) {
    console.error('Scoring error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get leaderboard for month
router.get('/leaderboard/:monthYear', async (req, res) => {
  try {
    const { monthYear } = req.params;

    const result = await pool.query(
      `SELECT s.mover_id, m.name, s.overall_score, s.hourly_rate, s.monthly_bonus, s.raving_fans_score, s.damage_score, s.attendance_score
       FROM scores s
       JOIN movers m ON s.mover_id = m.mover_id
       WHERE s.month_year = $1 AND m.status = 'active'
       ORDER BY s.overall_score DESC`,
      [monthYear]
    );

    // Add rankings
    const leaderboard = result.rows.map((row, idx) => ({
      ...row,
      rank: idx + 1,
    }));

    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Recalculate all scores for a month (admin only)
router.post('/recalculate/:monthYear', async (req, res) => {
  try {
    const { monthYear } = req.params;

    // Get all movers
    const moversResult = await pool.query('SELECT mover_id FROM movers WHERE status = $1', ['active']);
    const movers = moversResult.rows;

    const results = [];
    for (const mover of movers) {
      try {
        const score = await calculateMoverScore(mover.mover_id, monthYear);
        results.push(score);
      } catch (err) {
        console.error(`Error calculating score for mover ${mover.mover_id}:`, err);
      }
    }

    res.json({ success: true, scoresUpdated: results.length, scores: results });
  } catch (err) {
    console.error('Recalculation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.calculateMoverScore = calculateMoverScore;
