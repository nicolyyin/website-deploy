module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Public deployment intentionally does not store customer names, clicks,
  // browser details, or IP addresses.
  res.status(204).end();
};
