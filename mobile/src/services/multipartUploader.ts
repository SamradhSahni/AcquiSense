import * as FileSystem from 'expo-file-system';
import { apiClient, API_BASE_URL } from './api';
import { useAuthStore } from '../stores/useAuthStore';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB S3 minimum part size

export async function uploadLargeVdrDocumentResumable(params: {
  dealId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  onProgress?: (pct: number) => void;
}): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(params.fileUri, { size: true });
  if (!fileInfo.exists || !fileInfo.size) throw new Error('File does not exist');

  // 1. Initialize Multipart Upload
  const { data: initData } = await apiClient.post('/api/mobile/upload/multipart/init', {
    dealId: params.dealId,
    fileName: params.fileName,
    mimeType: params.mimeType,
  });

  const { uploadId, objectKey } = initData;
  const totalParts = Math.ceil(fileInfo.size / CHUNK_SIZE);
  const completedParts: Array<{ partNumber: number; eTag: string }> = [];

  // 2. Upload 5MB chunks sequentially with per-chunk retry
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const offset = (partNumber - 1) * CHUNK_SIZE;
    const length = Math.min(CHUNK_SIZE, fileInfo.size - offset);

    const base64Chunk = await FileSystem.readAsStringAsync(params.fileUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: offset,
      length,
    });

    const tempChunkUri = `${FileSystem.cacheDirectory}chunk_${uploadId}_${partNumber}.bin`;
    await FileSystem.writeAsStringAsync(tempChunkUri, base64Chunk, {
      encoding: FileSystem.EncodingType.Base64,
    });

    let retries = 0;
    while (retries < 3) {
      try {
        const token = useAuthStore.getState().accessToken;
        const uploadRes = await FileSystem.uploadAsync(
          `${API_BASE_URL}/api/mobile/upload/multipart/part?objectKey=${encodeURIComponent(
            objectKey
          )}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
          tempChunkUri,
          {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const parsed = JSON.parse(uploadRes.body);
        completedParts.push({ partNumber, eTag: parsed.eTag });
        break;
      } catch (e) {
        retries++;
        if (retries >= 3) throw e;
        await new Promise((r) => setTimeout(r, 1500 * retries));
      } finally {
        await FileSystem.deleteAsync(tempChunkUri, { idempotent: true });
      }
    }

    params.onProgress?.(Math.round((partNumber / totalParts) * 100));
  }

  // 3. Complete Multipart Upload
  await apiClient.post('/api/mobile/upload/multipart/complete', {
    objectKey,
    uploadId,
    parts: completedParts,
  });

  return objectKey;
}
