const Home = require('../models/Home');

async function getMembership(homeId, userId) {
  const home = await Home.findById(homeId);
  if (!home) {
    throw Object.assign(new Error('Home not found'), { status: 404 });
  }

  const member = home.members.find(m => m.user.toString() === userId);
  if (!member) {
    throw Object.assign(new Error('Home access required'), { status: 403 });
  }

  return { home, member };
}

async function requireHomeMember(homeId, userId) {
  return getMembership(homeId, userId);
}

async function requireHomeAdmin(homeId, userId) {
  const result = await getMembership(homeId, userId);
  if (result.member.role !== 'admin') {
    throw Object.assign(new Error('Admin access required'), { status: 403 });
  }
  return result;
}

module.exports = {
  requireHomeMember,
  requireHomeAdmin,
};
