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

/**
 * Pure dynamic-list authentication helper (production authentication runs strictly on the server
 * via POST /api/auth/login with timing-safe checks and rate limiting; zero passwords are stored in client JS).
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
  const cleanUsername = (usernameInput || '').trim().toLowerCase();
  const cleanPassword = (passwordInput || '').trim();

  if (!cleanUsername || !cleanPassword || !Array.isArray(dynamicUsers) || dynamicUsers.length === 0) {
    return null;
  }

  const matchedByUsername = dynamicUsers.find(
    (u) => (u.username || '').trim().toLowerCase() === cleanUsername
  );

  if (!matchedByUsername || matchedByUsername.active_status === 'Inactive') {
    return null;
  }

  const targetPass = String(matchedByUsername.password || '').trim();
  const passOk =
    targetPass === cleanPassword ||
    (cleanPassword.length > 0 &&
      cleanPassword[0] === cleanPassword[0].toUpperCase() &&
      targetPass === cleanPassword[0].toLowerCase() + cleanPassword.slice(1));

  if (!passOk) {
    return null;
  }

  return {
    username: matchedByUsername.username.trim().toLowerCase(),
    role: matchedByUsername.role,
    displayName:
      matchedByUsername.display_name ||
      (matchedByUsername.role === 'admin'
        ? 'Infirmary Administrator'
        : matchedByUsername.role === 'nurse'
          ? 'School Nurse'
          : `${matchedByUsername.username} (Hostel Warden)`),
    badgeTitle:
      matchedByUsername.badge_title ||
      (matchedByUsername.role === 'admin'
        ? 'System Admin'
        : matchedByUsername.role === 'nurse'
          ? 'Infirmary Nurse'
          : 'Hostel Warden'),
    loginTime: new Date().toISOString(),
  };
}
