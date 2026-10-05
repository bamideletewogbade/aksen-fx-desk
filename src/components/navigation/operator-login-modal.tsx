'use client';

/** Retired: sign-in now lives at /login with real accounts. Kept so old imports keep working. */
export function OperatorLoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; onSuccess?: () => void }) {
  if (isOpen && typeof window !== 'undefined') {
    onClose();
    window.location.href = '/login';
  }
  return null;
}
