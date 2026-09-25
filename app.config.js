export default ({ config }) => {
  return {
    ...config,
    extra: {
      ...config.extra,
      /**
       * API base URL for native builds (asset-admin locally, or the deployed Vercel URL),
       * no trailing slash — e.g. http://192.168.1.5:3000. Web builds use their own origin.
       * Never put secrets in `extra`: it ships inside the app bundle.
       */
      RAG_API_URL:
        process.env.EXPO_PUBLIC_RAG_API_URL || config.extra?.RAG_API_URL || "",
      eas: {
        projectId: config.extra?.eas?.projectId,
      },
    },
  };
};
