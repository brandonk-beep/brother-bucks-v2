const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Middleware to check mover authentication
function requireMoverAuth(req, res, next) {
  if (!req.session.moverId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Mover login
router.post('/login', async (req, res) => {
  try {
    const { email, passcode } = req.body;

    // In a real system, this would check against a secure passcode
    // For now, we use a simple approach: passcode is first 4 chars of name + email domain
    const result = await pool.query(
      'SELECT mover_id, name FROM movers WHERE email = $1 AND status = $2',
      [email, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const mover = result.rows[0];
    // Simplified validation - in production, use proper password hashing
    req.session.moverId = mover.mover_id;
    req.session.moverName = mover.name;

    res.json({ success: true, moverId: mover.mover_id, name: mover.name });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mover logout
router.post('/logout', (req, res) => {
  req.session.moverId = null;
  req.session.moverName = null;
  res.json({ success: true });
});

// Get mover's current score
router.get('/score/:monthYear', requireMoverAuth, async (req, res) => {
  try {
    const { monthYear } = req.params;
    const moverId = req.session.moverId;

    const result = await pool.query(
      `SELECT * FROM scores WHERE mover_id = $1 AND month_year = $2`,
      [moverId, monthYear]
    );

    if (result.rows.length === 0) {
      return res.json({ error: 'No scores calculated yet' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Score fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get leaderboard (visible to all authenticated movers)
router.get('/leaderboard/:monthYear', requireMoverAuth, async (req, res) => {
  try {
    const { monthYear } = req.params;

    const result = await pool.query(
      `SELECT s.mover_id, m.name, s.overall_score, ROW_NUMBER() OVER (ORDER BY s.overall_score DESC) as rank
       FROM scores s
       JOIN movers m ON s.mover_id = m.mover_id
       WHERE s.month_year = $1 AND m.status = 'active'
       ORDER BY s.overall_score DESC`,
      [monthYear]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get mover's review details
router.get('/reviews/:monthYear', requireMoverAuth, async (req, res) => {
  try {
    const { monthYear } = req.params;
    const moverId = req.session.moverId;

    const result = await pool.query(
      `SELECT id, rating, source, date_of_review, feedback_text FROM reviews
       WHERE mover_id = $1 AND month_year = $2
       ORDER BY date_of_review DESC`,
      [moverId, monthYear]
    );

    res.json({ reviews: result.rows });
  } catch (err) {
    console.error('Reviews fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get mover's damage details
router.get('/damages/:monthYear', requireMoverAuth, async (req, res) => {
  try {
    const { monthYear } = req.params;
    const moverId = req.session.moverId;

    const result = await pool.query(
      `SELECT id, cost_per_mover, job_number, date_closed, status, claim_notes FROM damages
       WHERE mover_id = $1 AND month_year = $2
       ORDER BY date_closed DESC`,
      [moverId, monthYear]
    );

    res.json({ damages: result.rows });
  } catch (err) {
    console.error('Damages fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get mover's attendance details
router.get('/attendance/:monthYear', requireMoverAuth, async (req, res) => {
  try {
    const { monthYear } = req.params;
    const moverId = req.session.moverId;

    const result = await pool.query(
      `SELECT id, points, type, date_incident, notes FROM attendance
       WHERE mover_id = $1 AND month_year = $2
       ORDER BY date_incident DESC`,
      [moverId, monthYear]
    );

    res.json({ attendance: result.rows });
  } catch (err) {
    console.error('Attendance fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit challenge
router.post('/challenge', requireMoverAuth, async (req, res) => {
  try {
    const moverId = req.session.moverId;
    const { incidentType, incidentId, challengeText } = req.body;

    // Check if already challenged
    const existingChallenge = await pool.query(
      `SELECT id FROM challenges 
       WHERE mover_id = $1 AND incident_type = $2 AND incident_id = $3 AND status != 'rejected'`,
      [moverId, incidentType, incidentId]
    );

    if (existingChallenge.rows.length > 0) {
      return res.status(400).json({ error: 'This incident has already been challenged' });
    }

    const result = await pool.query(
      `INSERT INTO challenges (mover_id, incident_type, incident_id, challenge_text, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at, status`,
      [moverId, incidentType, incidentId, challengeText, 'pending']
    );

    res.json({ success: true, challenge: result.rows[0] });
  } catch (err) {
    console.error('Challenge submission error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get mover's challenges
router.get('/challenges/:monthYear', requireMoverAuth, async (req, res) => {
  try {
    const moverId = req.session.moverId;
    const { monthYear } = req.params;

    const result = await pool.query(
      `SELECT id, incident_type, incident_id, challenge_text, status, admin_response, resolved_date, created_at
       FROM challenges
       WHERE mover_id = $1
       ORDER BY created_at DESC`,
      [moverId]
    );

    res.json({ challenges: result.rows });
  } catch (err) {
    console.error('Challenges fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
