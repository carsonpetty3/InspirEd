function envValue(name) {
  const value = process.env[name];
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

export default ({ config }) => {
  const ragApiUrl =
    envValue("EXPO_PUBLIC_RAG_API_URL") || envValue("RAG_API_URL");

  return {
    ...config,
    extra: {
      ...config.extra,
      /** asset-admin base URL, no trailing slash — e.g. http://192.168.1.5:3000 */
      RAG_API_URL: ragApiUrl,
      GEMINI_API_KEY:
        envValue("GEMINI_API_KEY") || envValue("EXPO_PUBLIC_GEMINI_API_KEY"),
      PROTOTYPE_RAG_MODE:
        envValue("EXPO_PUBLIC_PROTOTYPE_RAG_MODE").toLowerCase() === "true" ||
        envValue("PROTOTYPE_RAG_MODE").toLowerCase() === "true",
      GOOGLE_SERVICE_ACCOUNT_JSON: envValue("GOOGLE_SERVICE_ACCOUNT_JSON"),
      GOOGLE_DRIVE_VIDEO_FOLDER_ID: envValue("GOOGLE_DRIVE_VIDEO_FOLDER_ID"),
      eas: {
        projectId: config.extra?.eas?.projectId,
      },
    },
  };
};
