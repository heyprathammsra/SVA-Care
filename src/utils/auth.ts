export type AuthRole = 'nurse' | 'admin';

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
];

/**
 * Validates credentials against authorized infirmary staff accounts.
 * Username comparison is case-insensitive and trims whitespace.
 * Password comparison is case-sensitive (with outer whitespace trimmed).
 */
export function authenticateUser(usernameInput: string, passwordInput: string): AuthUser | null {
  const cleanUsername = (usernameInput || '').trim().toLowerCase();
  const cleanPassword = (passwordInput || '').trim();

  if (!cleanUsername || !cleanPassword) {
    return null;
  }

  const match = AUTH_CREDENTIALS.find(
    (c) => c.username.toLowerCase() === cleanUsername && c.password === cleanPassword
  );

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
