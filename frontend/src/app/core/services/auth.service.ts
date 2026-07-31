import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable, catchError, map, of, tap } from 'rxjs';
import { Employee, Client, DeviceType } from '../models';
import { API_BASE_URL } from './api-base';
import { SessionService } from './session.service';
import { TokenStorageService, StoredTokens } from './token-storage.service';
import { decodeAccessToken } from './jwt.util';

export interface LoginResult {
  success: boolean;
  message?: string;
  ipAddress?: string;
}

interface AuthTokenResultDto {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

/**
 * Authentication + session state. Tokens are persisted via
 * TokenStorageService (localStorage) so a page refresh doesn't log the
 * user out — see Final_version_fix.docx item 2. The Employee/Client
 * profile itself is re-fetched from the API on app boot using the id/type
 * decoded from the stored access token (see restoreSession()), since the
 * JWT only carries a minimal identity, not the full profile.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _currentEmployee = signal<Employee | null>(null);
  private readonly _currentClient = signal<Client | null>(null);
  /** True while restoreSession() is resolving on app boot — guards can use this to avoid redirecting before we know. */
  private readonly _restoring = signal<boolean>(false);

  readonly currentEmployee = this._currentEmployee.asReadonly();
  readonly currentClient = this._currentClient.asReadonly();
  readonly restoring = this._restoring.asReadonly();

  isStaffAuthenticated(): boolean {
    return this._currentEmployee() !== null;
  }

  isClientAuthenticated(): boolean {
    return this._currentClient() !== null;
  }

  /** True once logged in but before they've completed the forced password change. */
  staffMustChangePassword(): boolean {
    return this._currentEmployee()?.mustChangePassword ?? false;
  }

  clientMustChangePassword(): boolean {
    return this._currentClient()?.mustChangePassword ?? false;
  }

  constructor(
    private http: HttpClient,
    private sessions: SessionService,
    private tokenStorage: TokenStorageService
  ) {}

  /**
   * Called once at app startup (see app.config.ts APP_INITIALIZER). If a
   * refresh token is already stored from a previous session, re-fetches
   * the profile so the user lands back where they were instead of being
   * bounced to the login screen on every page refresh.
   */
  async restoreSession(): Promise<void> {
    const refreshToken = this.tokenStorage.refreshToken;
    if (!refreshToken) return;

    this._restoring.set(true);
    try {
      // The stored access token may already be expired (e.g. the tab was
      // closed for hours) — refresh first so we know we have a valid one
      // before trying to decode identity from it.
      if (this.tokenStorage.isAccessTokenExpiringSoon()) {
        await firstValueFrom(this.refreshTokens());
      }

      const accessToken = this.tokenStorage.accessToken;
      const decoded = accessToken ? decodeAccessToken(accessToken) : null;
      if (!decoded) {
        this.tokenStorage.clear();
        return;
      }

      if (decoded.daftech_account_type === 'Employee') {
        const employee = await firstValueFrom(this.http.get<Employee>(`${API_BASE_URL}/employees/${decoded.sub}`));
        this._currentEmployee.set(employee);
        this.sessions.startHeartbeat('Employee', employee.id);
      } else {
        const client = await firstValueFrom(this.http.get<Client>(`${API_BASE_URL}/clients/${decoded.sub}`));
        this._currentClient.set(client);
        this.sessions.startHeartbeat('Client', client.id);
      }
    } catch {
      // Refresh token invalid/expired, or the profile fetch failed (account
      // disabled/deleted since last login) — treat as logged out.
      this.tokenStorage.clear();
      this._currentEmployee.set(null);
      this._currentClient.set(null);
    } finally {
      this._restoring.set(false);
    }
  }

  /**
   * Employee/staff login by system-issued username + password. The server
   * resolves the caller's real IP address itself and logs every attempt,
   * successful or blocked. If mustChangePassword comes back true, the
   * frontend routes straight to the change-password screen before
   * anything else is usable — the server also withholds tokens in that
   * case, so nothing else is reachable anyway. On success, starts the
   * session heartbeat (SRS v2.0 §4.8 presence tracking).
   */
  async loginEmployee(
    username: string,
    password: string,
    deviceType: DeviceType = 'Laptop',
    deviceIdentifier: string = 'WEB-SESSION'
  ): Promise<LoginResult> {
    const result = await firstValueFrom(
      this.http.post<{
        success: boolean; message?: string; ipAddress: string; employee: Employee | null;
        mustChangePassword: boolean; tokens: AuthTokenResultDto | null;
      }>(`${API_BASE_URL}/auth/employee-login`, { username, password, deviceType, deviceIdentifier })
    );

    if (result.success && result.employee) {
      this._currentEmployee.set(result.employee);
      if (result.tokens) this.tokenStorage.setTokens(result.tokens);
      this.sessions.startHeartbeat('Employee', result.employee.id);
    }
    return { success: result.success, message: result.message, ipAddress: result.ipAddress };
  }

  async changeEmployeePassword(currentPassword: string, newPassword: string, confirmNewPassword: string): Promise<void> {
    const employee = this._currentEmployee();
    if (!employee) throw new Error('Not logged in.');
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/auth/employee/${employee.id}/change-password`, {
        currentPassword, newPassword, confirmNewPassword,
      })
    );
    this._currentEmployee.set({ ...employee, mustChangePassword: false });

    // The password change is what actually unlocks tokens server-side (see
    // AuthService.LoginEmployeeAsync) — log in again silently to obtain them
    // now that MustChangePassword is false, rather than asking the user to
    // re-enter credentials they just typed.
    const result = await firstValueFrom(
      this.http.post<{ tokens: AuthTokenResultDto | null }>(`${API_BASE_URL}/auth/employee-login`, {
        username: employee.username, password: newPassword, deviceType: 'Laptop', deviceIdentifier: 'WEB-SESSION',
      })
    );
    if (result.tokens) this.tokenStorage.setTokens(result.tokens);
  }

  async loginClient(username: string, password: string): Promise<LoginResult> {
    const result = await firstValueFrom(
      this.http.post<{
        success: boolean; message?: string; client: Client | null;
        mustChangePassword: boolean; tokens: AuthTokenResultDto | null;
      }>(`${API_BASE_URL}/auth/client-login`, { username, password })
    );

    if (result.success && result.client) {
      this._currentClient.set(result.client);
      if (result.tokens) this.tokenStorage.setTokens(result.tokens);
      this.sessions.startHeartbeat('Client', result.client.id);
    }
    return { success: result.success, message: result.message };
  }

  async changeClientPassword(currentPassword: string, newPassword: string, confirmNewPassword: string): Promise<void> {
    const client = this._currentClient();
    if (!client) throw new Error('Not logged in.');
    await firstValueFrom(
      this.http.post(`${API_BASE_URL}/auth/client/${client.id}/change-password`, {
        currentPassword, newPassword, confirmNewPassword,
      })
    );
    this._currentClient.set({ ...client, mustChangePassword: false });

    const result = await firstValueFrom(
      this.http.post<{ tokens: AuthTokenResultDto | null }>(`${API_BASE_URL}/auth/client-login`, {
        username: client.username, password: newPassword,
      })
    );
    if (result.tokens) this.tokenStorage.setTokens(result.tokens);
  }

  /**
   * Exchanges the stored refresh token for a new access/refresh pair.
   * Used both proactively (restoreSession) and reactively (the auth
   * interceptor, on a 401). The old refresh token is rotated server-side —
   * whatever comes back replaces what's in storage.
   */
  refreshTokens(): Observable<void> {
    const refreshToken = this.tokenStorage.refreshToken;
    if (!refreshToken) {
      throw new Error('No refresh token available.');
    }

    return this.http.post<AuthTokenResultDto>(`${API_BASE_URL}/auth/refresh`, { refreshToken }).pipe(
      tap((tokens) => this.tokenStorage.setTokens(tokens)),
      map(() => void 0)
    );
  }

  /** Called by the auth interceptor when a refresh attempt itself fails — the refresh token is no longer valid, so force a clean logout. */
  forceLogoutAfterRefreshFailure(): void {
    this.tokenStorage.clear();
    this.sessions.stopHeartbeat();
    this._currentEmployee.set(null);
    this._currentClient.set(null);
  }

  async logoutStaff(): Promise<void> {
    const employee = this._currentEmployee();
    await this.revokeRefreshTokenBestEffort();
    this.tokenStorage.clear();
    this._currentEmployee.set(null);
    if (employee) await this.sessions.closeSession('Employee', employee.id);
  }

  async logoutClient(): Promise<void> {
    const client = this._currentClient();
    await this.revokeRefreshTokenBestEffort();
    this.tokenStorage.clear();
    this._currentClient.set(null);
    if (client) await this.sessions.closeSession('Client', client.id);
  }

  private async revokeRefreshTokenBestEffort(): Promise<void> {
    const refreshToken = this.tokenStorage.refreshToken;
    if (!refreshToken) return;
    try {
      await firstValueFrom(this.http.post(`${API_BASE_URL}/auth/logout`, { refreshToken }));
    } catch {
      // Best-effort — client-side logout still proceeds even if this fails
      // (e.g. offline); the refresh token will simply expire naturally.
    }
  }
}
