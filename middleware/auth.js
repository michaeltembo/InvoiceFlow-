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

    if (!decoded.userId || !decoded.companyId || !decoded.role) {
      return res.status(403).json({ error: "Invalid token structure" });
    }

    req.userId = decoded.userId;
    req.companyId = decoded.companyId;
    req.role = decoded.role;

    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

module.exports = auth;
