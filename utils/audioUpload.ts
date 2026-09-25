/** Native builds send recordings inline; see audioUpload.web.ts for the browser path. */
export async function uploadAudioBlob(_audio: Blob, _contentType: string): Promise<string> {
  throw new Error("Direct audio upload is only used on web.");
}
