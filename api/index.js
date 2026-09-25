// Vercel Function entry: the asset-admin Express app serves /api/*, /assets/*, /upload
// and /admin/* (see rewrites in vercel.json). Mongo connects lazily per request.
module.exports = require("../asset-admin/app");
