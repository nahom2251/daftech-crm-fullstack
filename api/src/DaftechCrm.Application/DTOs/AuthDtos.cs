using DaftechCrm.Domain.Enums;

namespace DaftechCrm.Application.DTOs;

/// <summary>
/// Issued alongside a successful login. AccessToken is a short-lived JWT
/// sent as `Authorization: Bearer {AccessToken}` on every subsequent
/// request. RefreshToken is a long-lived opaque secret used only against
/// POST /api/auth/refresh to obtain a new pair — never sent to any other
/// endpoint. AccessTokenExpiresAt lets the frontend proactively refresh
/// before the token actually expires.
/// </summary>
public record AuthTokenResult(string AccessToken, string RefreshToken, DateTimeOffset AccessTokenExpiresAt);

public record RefreshTokenRequest(string RefreshToken);

public record RevokeTokenRequest(string RefreshToken);

/// <summary>
/// Internal result from ITokenService — not returned directly over the
/// wire (AuthService folds this into AuthTokenResult).
/// </summary>
public record IssuedTokenPair(string AccessToken, string RefreshTokenPlainText, DateTimeOffset AccessTokenExpiresAt);

/// <summary>Minimal identity used to issue a token — enough to build JWT claims for either account type.</summary>
public record TokenSubject(SessionAccountType AccountType, Guid AccountId, string Username, IReadOnlyList<EmployeeRole> Roles);
