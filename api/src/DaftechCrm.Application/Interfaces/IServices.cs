using DaftechCrm.Application.DTOs;
using DaftechCrm.Domain.Enums;

namespace DaftechCrm.Application.Interfaces;

public interface IClientService
{
    Task<ClientDto> SubmitSignupAsync(CreateClientSignupRequest request, CancellationToken ct = default);

    /// <summary>Admin registers a client directly — Approved immediately, credentials issued and emailed in the same call.</summary>
    Task<ClientRegisteredResult> RegisterAsync(RegisterClientRequest request, CancellationToken ct = default);

    /// <summary>Retries sending the credential email with a freshly regenerated one-time password (SRS v2.0 §4.3.1).</summary>
    Task<ResendClientCredentialEmailResult> ResendCredentialEmailAsync(Guid clientId, CancellationToken ct = default);

    Task<ClientDto> ApproveAsync(Guid clientId, CancellationToken ct = default);
    Task<ClientDto> RejectAsync(Guid clientId, RejectClientRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<ClientDto>> GetAllAsync(CancellationToken ct = default);
    Task<ClientDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<ClientDto>> GetPendingAsync(CancellationToken ct = default);
}

public interface IEmployeeService
{
    /// <summary>Admin registers a staff account — credentials (username + one-time password) are issued, emailed, and returned once.</summary>
    Task<EmployeeRegisteredResult> RegisterAsync(CreateEmployeeRequest request, CancellationToken ct = default);

    /// <summary>Retries sending the credential email with a freshly regenerated one-time password (SRS v2.0 §4.3.1).</summary>
    Task<ResendCredentialEmailResult> ResendCredentialEmailAsync(Guid employeeId, CancellationToken ct = default);
    Task<IReadOnlyList<EmployeeDto>> GetAllAsync(CancellationToken ct = default);
    Task<EmployeeDto?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>Disables the account, revokes all active device sessions, and blocks future logins. Historical records are untouched.</summary>
    Task<EmployeeDto> DisableAsync(Guid employeeId, DisableEmployeeRequest request, CancellationToken ct = default);
    Task<EmployeeDto> EnableAsync(Guid employeeId, CancellationToken ct = default);

    Task<EmployeeDto> AddAllowedIpAsync(Guid employeeId, AddAllowedIpRequest request, CancellationToken ct = default);
    Task<EmployeeDto> RemoveAllowedIpAsync(Guid employeeId, string ip, CancellationToken ct = default);

    Task<IReadOnlyList<DeviceSessionDto>> GetDevicesAsync(Guid employeeId, CancellationToken ct = default);
    Task RevokeDeviceAsync(Guid deviceSessionId, CancellationToken ct = default);
    Task<IReadOnlyList<LoginRecordDto>> GetLoginHistoryAsync(Guid employeeId, CancellationToken ct = default);
}

/// <summary>
/// Login and password-change for both staff and clients. Captures IP/device
/// on every staff login attempt and enforces disabled-account + IP-allow-list
/// rules before authenticating. Also enforces the forced-change-on-first-login
/// rule: while MustChangePassword is true, only ChangePassword succeeds —
/// every other authenticated action should be blocked by the caller (the
/// frontend routes straight to the change-password screen; the API additionally
/// refuses to clear the flag except via a valid current-password match).
/// </summary>
public interface IAuthService
{
    Task<EmployeeLoginResult> LoginEmployeeAsync(EmployeeLoginRequest request, CancellationToken ct = default);
    Task ChangeEmployeePasswordAsync(Guid employeeId, ChangePasswordRequest request, CancellationToken ct = default);

    Task<ClientLoginResult> LoginClientAsync(ClientLoginRequest request, CancellationToken ct = default);
    Task ChangeClientPasswordAsync(Guid clientId, ClientChangePasswordRequest request, CancellationToken ct = default);

    /// <summary>Exchanges a valid, unexpired, unrevoked refresh token for a new access/refresh pair. Rotates the refresh token (old one is revoked).</summary>
    Task<AuthTokenResult> RefreshAsync(RefreshTokenRequest request, string ipAddress, CancellationToken ct = default);

    /// <summary>Revokes a single refresh token (logout on one device). Idempotent — revoking an already-revoked or unknown token is not an error.</summary>
    Task RevokeRefreshTokenAsync(RevokeTokenRequest request, string ipAddress, CancellationToken ct = default);
}

/// <summary>
/// Issues and validates JWT access tokens, and manages refresh-token
/// persistence/rotation. Kept separate from IAuthService so the
/// credential-checking logic (passwords, IP allow-lists) stays decoupled
/// from the token mechanics.
/// </summary>
public interface ITokenService
{
    /// <summary>Creates a new access token + refresh token pair and persists the refresh token's hash.</summary>
    Task<IssuedTokenPair> IssueTokenPairAsync(TokenSubject subject, string ipAddress, CancellationToken ct = default);

    /// <summary>
    /// Validates the raw refresh token against stored hashes, rotates it
    /// (revokes the old one, issues a new pair), and returns the new pair.
    /// The account type is read from the stored token record itself — the
    /// caller doesn't need to know it in advance. Throws
    /// InvalidOperationException if the token is missing, expired, already
    /// revoked, or already replaced (possible token-theft reuse).
    /// </summary>
    Task<IssuedTokenPair> RefreshAsync(string rawRefreshToken, string ipAddress, CancellationToken ct = default);

    Task RevokeAsync(string rawRefreshToken, string ipAddress, CancellationToken ct = default);
}

public interface IAgreementService
{
    Task<AgreementDto> CreateAsync(CreateAgreementRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<AgreementDto>> GetAllAsync(CancellationToken ct = default);
    Task<IReadOnlyList<AgreementDto>> GetForClientAsync(Guid clientId, CancellationToken ct = default);
    Task<IReadOnlyList<AgreementDto>> GetExpiringSoonAsync(CancellationToken ct = default);
    Task<AgreementDto?> GetByIdAsync(Guid id, CancellationToken ct = default);

    /// <summary>
    /// Uploads and attaches a scanned document to the agreement. If the
    /// agreement already has a file attached, the old one is deleted after
    /// the new one is successfully saved (never before — a failed upload
    /// should never destroy the existing file).
    /// </summary>
    Task<AgreementDto> UploadScannedFileAsync(Guid agreementId, Stream content, string fileName, string contentType, CancellationToken ct = default);

    /// <summary>Retrieves the agreement's attached scanned file, or null if none is attached or the agreement doesn't exist.</summary>
    Task<RetrievedFile?> DownloadScannedFileAsync(Guid agreementId, CancellationToken ct = default);
}

public interface IMaintenanceService
{
    Task<MaintenanceRecordDto> CreateAsync(CreateMaintenanceRecordRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<MaintenanceRecordDto>> GetAllAsync(CancellationToken ct = default);
}

public interface ITimeLogService
{
    Task ClockInAsync(Guid employeeId, CancellationToken ct = default);
    Task ClockOutAsync(Guid employeeId, CancellationToken ct = default);
    Task<IReadOnlyList<TimeLogDto>> GetAllAsync(Guid? employeeId = null, CancellationToken ct = default);
}

public interface INotificationService
{
    Task NotifyAsync(NotificationRecipientType recipientType, string recipientId, string eventType, string message, CancellationToken ct = default);
    Task<IReadOnlyList<NotificationDto>> GetForRecipientAsync(NotificationRecipientType recipientType, string recipientId, CancellationToken ct = default);
    Task MarkReadAsync(Guid notificationId, CancellationToken ct = default);
    Task MarkAllReadAsync(NotificationRecipientType recipientType, string recipientId, CancellationToken ct = default);
}

public interface IReportService
{
    /// <summary>On-time vs late resolution stats, overall and per employee, for the Reports bar/donut charts.</summary>
    Task<OnTimeReportDto> GetOnTimeResolutionReportAsync(CancellationToken ct = default);

    /// <summary>
    /// Written/graphical performance metrics for one employee, with an
    /// optional AI-generated narrative summary attached (SRS v2.0 §4.10).
    /// The narrative is always best-effort — see IAiNarrativeReportService.
    /// </summary>
    Task<EmployeePerformanceReportDto> GetEmployeePerformanceReportAsync(Guid employeeId, bool includeAiNarrative, CancellationToken ct = default);
}

public interface ISatisfactionSurveyService
{
    /// <summary>Submits the optional 5-question survey. One per ticket — resubmitting overwrites the previous answers.</summary>
    Task<SatisfactionSurveyDto> SubmitAsync(SubmitSatisfactionSurveyRequest request, CancellationToken ct = default);
    Task<SatisfactionSurveyDto?> GetForTicketAsync(Guid ticketId, CancellationToken ct = default);
    Task<IReadOnlyList<SatisfactionSurveyDto>> GetAllAsync(CancellationToken ct = default);
}

/// <summary>
/// SRS v2.0 §4.8: session/presence tracking. Every login opens a session;
/// a heartbeat ping from the frontend keeps it "online" and updates
/// LastSeen; logging out (or a background sweep after inactivity) marks it
/// offline. Works across both Employee and Client accounts.
/// </summary>
public interface ISessionService
{
    Task<Guid> OpenSessionAsync(SessionAccountType accountType, Guid accountId, string ipAddress, CancellationToken ct = default);
    Task CloseSessionAsync(SessionAccountType accountType, Guid accountId, CancellationToken ct = default);

    /// <summary>Heartbeat — called periodically by the frontend while a user is active. Updates LastSeen and flips OnlineStatus back on if it had lapsed.</summary>
    Task TouchAsync(SessionAccountType accountType, Guid accountId, CancellationToken ct = default);

    /// <summary>Marks any session with no heartbeat within the configured window as offline. Intended for a background sweep.</summary>
    Task<int> MarkStaleSessionsOfflineAsync(CancellationToken ct = default);

    /// <summary>Admin's Session Activity page — current status, last-seen, and most recent IP per account.</summary>
    Task<IReadOnlyList<SessionActivityDto>> GetSessionActivityAsync(CancellationToken ct = default);

    Task<IReadOnlyList<LoginSessionDto>> GetHistoryForAccountAsync(SessionAccountType accountType, Guid accountId, CancellationToken ct = default);
}
