/**
 * Aksen Frictionless Auth Engine & Clerk Integration Seam.
 *
 * Designed for zero-friction access during testing and operations:
 * - Any valid email + any 6-digit password/PIN is accepted immediately.
 * - 1-Click test accounts for quick testing without typing.
 * - Encodes/decodes cookie-based session compatible with edge middleware.
 * - Ready for Clerk drop-in: maps 1:1 onto Clerk User/Org objects.
 */

export const SESSION_COOKIE = 'aksen_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface Session {
  email: string;
  name: string;
  role: string;
  org: string;
  floatLimit?: string;
  avatar?: string;
  isCustom?: boolean;
}

/** Pre-configured beachhead test accounts for 1-click evaluation */
export const PRESET_ACCOUNTS: Record<string, Session & { defaultPin: string; description: string }> = {
  'bishop@aksen.com': {
    email: 'bishop@aksen.com',
    name: 'Bishop Tewogbade',
    role: 'Principal Desk Operator',
    org: 'Aksen Liquidity Services Ltd',
    floatLimit: '₦25,000,000 / GH₵ 240,000',
    defaultPin: '123456',
    description: 'Founder & Head of Desk · Full float routing & treasury permissions',
  },
  'bello@circle-otc.com': {
    email: 'bello@circle-otc.com',
    name: 'Alhaji Bello',
    role: 'Circle & Balogun OTC Runner',
    org: 'Circle Cross-Border Syndicate',
    floatLimit: '₦10,000,000 / GH₵ 95,000',
    defaultPin: '112233',
    description: 'Wholesale Balogun Market Runner · Frequent high-volume NIP transfers',
  },
  'kofi@legon-fx.gh': {
    email: 'kofi@legon-fx.gh',
    name: 'Kofi Mensah',
    role: 'Legon Campus Money Runner',
    org: 'Univ of Ghana Student Remittance',
    floatLimit: '₦2,500,000 / GH₵ 25,000',
    defaultPin: '654321',
    description: 'Student campus allowance runner · Fast-path micro-MoMo remittances',
  },
};

export const DEFAULT_DEMO_OPERATOR: Session = PRESET_ACCOUNTS['bishop@aksen.com'];

/**
 * Creates a valid session from ANY valid email.
 * Accepts any name provided or derives a formatted name from the email handle.
 */
export function sessionFromEmail(email: string, name?: string, org?: string): Session {
  const normalizedEmail = email.toLowerCase().trim();

  // If matches preset account exactly, return preset details
  if (PRESET_ACCOUNTS[normalizedEmail]) {
    return PRESET_ACCOUNTS[normalizedEmail];
  }

  // Handle common aliases for test personas
  if (normalizedEmail.includes('bishop') || normalizedEmail.includes('tewogbade')) {
    return {
      ...PRESET_ACCOUNTS['bishop@aksen.com'],
      email: normalizedEmail,
    };
  }
  if (normalizedEmail.includes('bello') || normalizedEmail.includes('alhaji')) {
    return {
      ...PRESET_ACCOUNTS['bello@circle-otc.com'],
      email: normalizedEmail,
    };
  }
  if (normalizedEmail.includes('kofi') || normalizedEmail.includes('mensah')) {
    return {
      ...PRESET_ACCOUNTS['kofi@legon-fx.gh'],
      email: normalizedEmail,
    };
  }

  // Derive human-readable name from email handle (e.g., 'ada.obi' -> 'Ada Obi')
  const handle = normalizedEmail.split('@')[0] || 'Operator';
  let derivedName =
    name?.trim() ||
    handle
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  // Prevent fused names
  if (derivedName.toLowerCase() === 'bishoptewogbade') {
    derivedName = 'Bishop Tewogbade';
  }

  return {
    email: normalizedEmail,
    name: derivedName,
    role: 'Desk Operator',
    org: org?.trim() || 'Aksen West Africa OTC Desk',
    floatLimit: '₦5,000,000 / GH₵ 50,000',
    isCustom: true,
  };
}

export function encodeSession(session: Session): string {
  return JSON.stringify(session);
}

export function decodeSession(value?: string | null): Session | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Session>;
    if (parsed && typeof parsed.email === 'string' && parsed.email.length > 0) {
      let resolvedName = typeof parsed.name === 'string' ? parsed.name : DEFAULT_DEMO_OPERATOR.name;
      // Sanitize previously cached unspaced name
      if (resolvedName.toLowerCase() === 'bishoptewogbade' || resolvedName.trim() === 'Bishoptewogbade') {
        resolvedName = 'Bishop Tewogbade';
      }

      return {
        email: parsed.email,
        name: resolvedName,
        role: typeof parsed.role === 'string' ? parsed.role : DEFAULT_DEMO_OPERATOR.role,
        org: typeof parsed.org === 'string' ? parsed.org : DEFAULT_DEMO_OPERATOR.org,
        floatLimit: parsed.floatLimit || DEFAULT_DEMO_OPERATOR.floatLimit,
        isCustom: parsed.isCustom,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Two-letter initials for avatar badges */
export function initialsOf(session?: Session | null): string {
  if (!session?.name) return 'OP';
  return session.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
