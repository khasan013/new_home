const express = require('express'); // ✅ FIX: was missing
const Home = require('../models/Home');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  try { // ✅ FIX: added try/catch
    const home = await Home.create({
      name: req.body.name,
      members: [{ user: req.user.userId, role: 'admin' }]
    });

    res.json(home);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create home', error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try { // ✅ FIX: added try/catch
    const homes = await Home.find({ 'members.user': req.user.userId });
    res.json(homes);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch homes', error: err.message });
  }
});

module.exports = router;
