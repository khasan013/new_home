const Home = require('../models/Home');

module.exports = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const homeId = req.params.homeId;

    const home = await Home.findById(homeId);

    if (!home) {
      return res.status(404).json({ message: 'Home not found' });
    }

    const member = home.members.find(
      (m) => m.user.toString() === userId
    );

    if (!member || member.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();

  } catch (err) {
    res.status(500).json({ message: 'Authorization failed' });
  }
};