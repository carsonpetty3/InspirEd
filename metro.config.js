const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @vercel/blob swaps Node-only modules for browser builds via its package.json
// "browser" field, which Metro ignores when resolving through "exports".
// Apply those swaps for web bundles (used by utils/audioUpload.web.ts).
const blobDist = path.join(__dirname, "node_modules/@vercel/blob/dist");
const blobBrowserShims = {
  undici: path.join(blobDist, "undici-browser.js"),
  crypto: path.join(blobDist, "crypto-browser.js"),
  stream: path.join(blobDist, "stream-browser.js"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    blobBrowserShims[moduleName] &&
    context.originModulePath.startsWith(blobDist)
  ) {
    return { type: "sourceFile", filePath: blobBrowserShims[moduleName] };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
