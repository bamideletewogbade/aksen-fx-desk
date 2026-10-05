import { fail } from './errors';
import { MAX_EVIDENCE_BYTES, type EvidenceInput } from './trades';

/** Reads a multipart evidence upload (optional `file`, optional `note`). */
export async function readEvidence(req: Request): Promise<EvidenceInput> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_EVIDENCE_BYTES + 64 * 1024) fail('INVALID', 'Files must be 4 MB or smaller.');
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    fail('INVALID', 'Upload the file as a form.');
  }
  const note = form!.get('note');
  const file = form!.get('file');
  let parsed: EvidenceInput['file'] = null;
  if (file && typeof file !== 'string' && file.size > 0) {
    parsed = { name: file.name || 'upload', mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
  }
  return { note: typeof note === 'string' ? note : null, file: parsed };
}
