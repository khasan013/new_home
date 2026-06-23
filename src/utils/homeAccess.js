const Home = require('../models/Home');

async function getMembership(homeId, userId) {
  const home = await Home.findOne(
    { _id: homeId, 'members.user': userId },
    { name: 1, members: { $elemMatch: { user: userId } } }
  ).lean();
  if (!home) {
    throw Object.assign(new Error('Home access required'), { status: 403 });
  }

  const member = home.members?.[0];
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
