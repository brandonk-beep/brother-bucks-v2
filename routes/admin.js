const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { parseSmartMovingCSV, extractMoversFromCrewString } = require('../utils/csvParser');

// Middleware to check admin authentication
function requireAdmin(req, res, next) {
  if (!req.session.adminLoggedIn) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Admin login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.adminLoggedIn = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Admin logout
router.post('/logout', (req, res) => {
  req.session.adminLoggedIn = false;
  res.json({ success: true });
});

// Upload SmartMoving CSV
router.post('/upload-csv', requireAdmin, async (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent) {
      return res.status(400).json({ error: 'No CSV content provided' });
    }

    const jobs = await parseSmartMovingCSV(csvContent);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const job of jobs) {
        const movers = extractMoversFromCrewString(job.crewMemberNames);
        const monthYear = new Date(job.jobDate).toISOString().slice(0, 7); // YYYY-MM

        // Add review if job has a rating
        if (job.jobRating) {
          for (const moverName of movers) {
            try {
              // Get mover ID
              const moverResult = await client.query(
                'SELECT mover_id FROM movers WHERE name = $1',
                [moverName]
              );

              if (moverResult.rows.length > 0) {
                const moverId = moverResult.rows[0].mover_id;

                // Insert or update review
                await client.query(
                  `INSERT INTO reviews (mover_id, month_year, rating, source, date_of_review)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT DO NOTHING`,
                  [moverId, monthYear, job.jobRating, 'SmartMoving', job.jobDate]
                );
              }
            } catch (err) {
              console.error(`Error adding review for mover ${moverName}:`, err);
            }
          }
        }

        // Add hours for each mover
        for (const moverName of movers) {
          try {
            const moverResult = await client.query(
              'SELECT mover_id FROM movers WHERE name = $1',
              [moverName]
            );

            if (moverResult.rows.length > 0) {
              const moverId = moverResult.rows[0].mover_id;

              // Insert or replace hours
              await client.query(
                `INSERT INTO hours (mover_id, month_year, job_number, total_hours)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (mover_id, month_year, job_number) DO UPDATE
                 SET total_hours = $4, updated_at = CURRENT_TIMESTAMP`,
                [moverId, monthYear, job.jobNumber, job.actualTimeHours]
              );
            }
          } catch (err) {
            console.error(`Error adding hours for mover ${moverName}:`, err);
          }
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, jobsProcessed: jobs.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('CSV upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add/update damage
router.post('/damage', requireAdmin, async (req, res) => {
  try {
    const { moverId, cost, jobNumber, dateClosedInput, status, notes } = req.body;

    const monthYear = new Date(dateClosedInput).toISOString().slice(0, 7);

    const result = await pool.query(
      `INSERT INTO damages (mover_id, month_year, cost_per_mover, job_number, date_closed, status, claim_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (mover_id, month_year, job_number) DO UPDATE
       SET cost_per_mover = $3, status = $6, claim_notes = $7, updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [moverId, monthYear, cost, jobNumber, dateClosedInput, status || 'closed', notes || '']
    );

    res.json({ success: true, damageId: result.rows[0].id });
  } catch (err) {
    console.error('Damage entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add/update review
router.post('/review', requireAdmin, async (req, res) => {
  try {
    const { moverId, rating, source, dateOfReviewInput, feedback } = req.body;

    const monthYear = new Date(dateOfReviewInput).toISOString().slice(0, 7);

    const result = await pool.query(
      `INSERT INTO reviews (mover_id, month_year, rating, source, date_of_review, feedback_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [moverId, monthYear, rating, source || 'Manual', dateOfReviewInput, feedback || '']
    );

    res.json({ success: true, reviewId: result.rows[0].id });
  } catch (err) {
    console.error('Review entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add attendance mark
router.post('/attendance', requireAdmin, async (req, res) => {
  try {
    const { moverId, points, type, dateIncidentInput, notes } = req.body;

    const monthYear = new Date(dateIncidentInput).toISOString().slice(0, 7);

    const result = await pool.query(
      `INSERT INTO attendance (mover_id, month_year, points, type, date_incident, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [moverId, monthYear, points, type, dateIncidentInput, notes || '']
    );

    res.json({ success: true, attendanceId: result.rows[0].id });
  } catch (err) {
    console.error('Attendance entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add mover
router.post('/mover', requireAdmin, async (req, res) => {
  try {
    const { name, email } = req.body;

    const result = await pool.query(
      'INSERT INTO movers (name, email) VALUES ($1, $2) RETURNING mover_id',
      [name, email || null]
    );

    res.json({ success: true, moverId: result.rows[0].mover_id });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'Mover name already exists' });
    } else {
      console.error('Mover creation error:', err);
      res.status(500).json({ error: err.message });
    }
  }
});

// Get all movers
router.get('/movers', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT mover_id, name, email, status FROM movers ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching movers:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resolve challenge
router.post('/challenge/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, response } = req.body; // status: 'approved' or 'rejected'

    const result = await pool.query(
      `UPDATE challenges 
       SET status = $1, admin_response = $2, resolved_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status === 'approved' ? 'approved' : 'rejected', response || '', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    res.json({ success: true, challenge: result.rows[0] });
  } catch (err) {
    console.error('Challenge resolution error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
