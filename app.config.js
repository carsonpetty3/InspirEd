export default ({ config }) => {
  return {
    ...config,
    extra: {
      ...config.extra,
      /** asset-admin base URL, no trailing slash — e.g. http://192.168.1.5:3000 */
      RAG_API_URL:
        process.env.EXPO_PUBLIC_RAG_API_URL || config.extra?.RAG_API_URL || "",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
        config.extra?.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL || config.extra?.GEMINI_MODEL,
      eas: {
        projectId: config.extra?.eas?.projectId,
      },
    },
  };
};
