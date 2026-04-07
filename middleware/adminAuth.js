const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    console.log("👤 ADMIN CHECK:", decoded);

    // ✅ FIX HERE
    if (!decoded.is_super_admin) {
      return res.status(403).json({ error: "Access denied" });
    }

    req.user = decoded;
    next();

  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};
