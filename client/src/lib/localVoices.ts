import { getKv, putKv, deleteKv } from './localStore';

const PREFIX = 'voice-clip:';

export async function putLocalClip(name: string, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  await putKv(PREFIX + name, {
    type: file.type || 'audio/webm',
    data: btoa(binary),
  });
}

export async function getLocalClip(name: string): Promise<Blob | null> {
  const result = await getKv<{ type: string; data: string }>(PREFIX + name);

  if (!result) return null;

  const binary = atob(result.value.data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: result.value.type });
}

export async function deleteLocalClip(name: string): Promise<void> {
  try {
    await deleteKv(PREFIX + name);
  } catch {
    // Nothing to delete.
  }
}