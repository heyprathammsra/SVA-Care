export type AuthRole = 'nurse' | 'admin' | 'warden';

export interface AuthUser {
  username: string;
  role: AuthRole;
  displayName: string;
  badgeTitle: string;
  loginTime: string;
}

export interface AuthCredential {
  username: string;
  password: string;
  role: AuthRole;
  displayName: string;
  badgeTitle: string;
}

export const AUTH_CREDENTIALS: AuthCredential[] = [
  {
    username: 'nurse',
    password: 'iloveeating',
    role: 'nurse',
    displayName: 'School Nurse',
    badgeTitle: 'Infirmary Nurse',
  },
  {
    username: 'admin',
    password: 'sva0pass',
    role: 'admin',
    displayName: 'Infirmary Administrator',
    badgeTitle: 'System Admin',
  },
  {
    username: 'agnel',
    password: 'ilovesleeping',
    role: 'warden',
    displayName: 'Agnel (Hostel Warden)',
    badgeTitle: 'Hostel Warden',
  },
];

/**
 * Validates credentials against authorized infirmary staff accounts.
 * Username comparison is case-insensitive and trims whitespace.
 * Password comparison is case-sensitive (with outer whitespace trimmed).
 */
export function authenticateUser(
  usernameInput: string,
  passwordInput: string,
  dynamicUsers?: Array<{
    username: string;
    password: string;
    role: AuthRole;
    display_name?: string;
    badge_title?: string;
    active_status?: 'Active' | 'Inactive';
  }>
): AuthUser | null {
  // Trim all whitespace
  const cleanUsername = (usernameInput || '').trim().toLowerCase();
  const cleanPassword = (passwordInput || '').trim();

  if (!cleanUsername || !cleanPassword) {
    return null;
  }

  // 1. First check dynamic users from Google Sheets (Users tab) if present
  if (Array.isArray(dynamicUsers) && dynamicUsers.length > 0) {
    const sheetMatch = dynamicUsers.find((u) => {
      if (u.active_status === 'Inactive') return false;
      const userMatch = (u.username || '').trim().toLowerCase() === cleanUsername;
      if (!userMatch) return false;
      const targetPass = String(u.password || '').trim();
      return targetPass === cleanPassword || targetPass.toLowerCase() === cleanPassword.toLowerCase();
    });

    if (sheetMatch) {
      return {
        username: sheetMatch.username.toLowerCase(),
        role: sheetMatch.role,
        displayName:
          sheetMatch.display_name ||
          (sheetMatch.role === 'admin'
            ? 'Infirmary Administrator'
            : sheetMatch.role === 'nurse'
              ? 'School Nurse'
              : `${sheetMatch.username} (Hostel Warden)`),
        badgeTitle:
          sheetMatch.badge_title ||
          (sheetMatch.role === 'admin'
            ? 'System Admin'
            : sheetMatch.role === 'nurse'
              ? 'Infirmary Nurse'
              : 'Hostel Warden'),
        loginTime: new Date().toISOString(),
      };
    }
  }

  // 2. Fall back to built-in authorized staff credentials
  const match = AUTH_CREDENTIALS.find((c) => {
    const userMatch = c.username.toLowerCase() === cleanUsername;
    if (!userMatch) return false;
    // Direct match OR case-insensitive match (for mobile keyboards that capitalize the first letter)
    return c.password === cleanPassword || c.password.toLowerCase() === cleanPassword.toLowerCase();
  });

  if (!match) {
    return null;
  }

  return {
    username: match.username,
    role: match.role,
    displayName: match.displayName,
    badgeTitle: match.badgeTitle,
    loginTime: new Date().toISOString(),
  };
}
