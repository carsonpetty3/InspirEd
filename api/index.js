// Vercel Function: runs the asset-admin server for the hosted web app.
// Online it is read-only: content can be viewed, but uploading, editing and deleting
// only happen through the admin page on a team member's computer.
const app = require("../asset-admin/server");
const { connectDb } = require("../asset-admin/lib/db");

app.set("trust proxy", 1);

const READ_METHODS = ["GET", "HEAD", "OPTIONS"];

module.exports = async (req, res) => {
  // /api/* routes only read data (search, chat), so they may use POST.
  if (!READ_METHODS.includes(req.method) && !req.url.startsWith("/api/")) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Content can only be changed from the local admin page" }));
  }
  try {
    await connectDb();
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "Database unavailable" }));
  }
  return app(req, res);
};
