const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: 'Auth route is working' });
});

// Login endpoint
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === process.env.EMAIL && password === process.env.PASSWORD) {
    return res.json({ success: true, token: 'authenticated', message: 'Login successful' });
  }

  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

module.exports = router;