const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "No token provided" });
  }

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Invalid authorization format" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ CLEAN STRUCTURE
    req.user = {
      userId: decoded.userId,
      companyId: decoded.companyId,
      role: decoded.role,
      is_super_admin: decoded.is_super_admin || false
    };

    console.log("👤 USER:", req.user);

    next();

  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

module.exports = auth;
