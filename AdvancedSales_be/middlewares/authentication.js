const jwt = require("jsonwebtoken");

module.exports = function authenticateToken(req, res, next) {
  // 1) Verifica secret
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT_SECRET missing in server env (.env)" });
  }

  // 2) Lee header
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Missing Authorization header" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Bad Authorization format. Use: Bearer <token>" });
  }

  const token = parts[1];
  if (!token) return res.status(401).json({ message: "Token missing" });

  // 3) Verify
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: err.message });
    req.user = decoded;
    next();
  });
};
