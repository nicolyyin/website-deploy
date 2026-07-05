module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  res.status(200).json({
    totals: {
      events: 0,
      pageViews: 0,
      propertyClicks: 0,
      likes: 0,
      phoneClicks: 0,
      lineClicks: 0,
    },
    properties: [],
    customers: [],
    recent: [],
  });
};
