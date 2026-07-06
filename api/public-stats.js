const statsHandler = require("./stats");

module.exports = async function handler(req, res) {
  const originalKey = process.env.STATS_ADMIN_KEY;
  process.env.STATS_ADMIN_KEY = "public-dashboard";
  req.headers = {
    ...req.headers,
    authorization: "Bearer public-dashboard",
  };

  try {
    return await statsHandler(req, res);
  } finally {
    if (originalKey === undefined) {
      delete process.env.STATS_ADMIN_KEY;
    } else {
      process.env.STATS_ADMIN_KEY = originalKey;
    }
  }
};
