using DaftechCrm.Application.DTOs;
using DaftechCrm.Application.Interfaces;
using DaftechCrm.Domain.Entities;
using DaftechCrm.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace DaftechCrm.Application.Services;

public class AuthService : IAuthService
{
    private readonly IAppDbContext _db;
    private readonly ICurrentRequestContext _requestContext;
    private readonly ISessionService _sessions;
    private readonly ITokenService _tokens;

    public AuthService(IAppDbContext db, ICurrentRequestContext requestContext, ISessionService sessions, ITokenService tokens)
    {
        _db = db;
        _requestContext = requestContext;
        _sessions = sessions;
        _tokens = tokens;
    }

    public async Task<EmployeeLoginResult> LoginEmployeeAsync(EmployeeLoginRequest request, CancellationToken ct = default)
    {
        var ip = _requestContext.ResolveClientIpAddress();
        var employee = await _db.Employees.FirstOrDefaultAsync(e => e.Username == request.Username, ct);

        if (employee is null || !PasswordHasher.Verify(request.Password, employee.PasswordHash))
        {
            // Don't record a LoginRecord against an employee we couldn't identify —
            // but if the username matched and only the password was wrong, still log it.
            if (employee is not null)
                await RecordLoginAsync(employee.Id, ip, request.DeviceType, request.DeviceIdentifier, allowed: false, reason: "Incorrect password", ct);
            return new EmployeeLoginResult(false, "Incorrect username or password.", ip, null, false);
        }

        if (employee.AccountStatus == EmployeeAccountStatus.Disabled)
        {
            await RecordLoginAsync(employee.Id, ip, request.DeviceType, request.DeviceIdentifier, allowed: false, reason: "Account disabled", ct);
            return new EmployeeLoginResult(false, "This account has been disabled. Contact your Admin.", ip, null, false);
        }

        // TEMPORARILY DISABLED — the deployed host's outbound IP isn't fixed/known
        // yet, so every login was being blocked. Uncomment to re-enable per-employee
        // IP allow-listing once the real deployment IP(s) are known.
        // if (employee.AllowedIpAddresses.Count > 0 && !employee.AllowedIpAddresses.Contains(ip))
        // {
        //     await RecordLoginAsync(employee.Id, ip, request.DeviceType, request.DeviceIdentifier, allowed: false, reason: "IP not on allow-list", ct);
        //     return new EmployeeLoginResult(false, $"Login blocked: {ip} is not an approved IP address for this account.", ip, null, false);
        // }

        await RecordLoginAsync(employee.Id, ip, request.DeviceType, request.DeviceIdentifier, allowed: true, reason: null, ct);
        await _sessions.OpenSessionAsync(SessionAccountType.Employee, employee.Id, ip, ct);

        // A forced password change must happen before any access token is
        // issued — otherwise a leaked one-time password could be used to
        // call every other endpoint, not just change-password.
        AuthTokenResult? tokens = null;
        if (!employee.MustChangePassword)
        {
            var subject = new TokenSubject(SessionAccountType.Employee, employee.Id, employee.Username, employee.Roles);
            var pair = await _tokens.IssueTokenPairAsync(subject, ip, ct);
            tokens = new AuthTokenResult(pair.AccessToken, pair.RefreshTokenPlainText, pair.AccessTokenExpiresAt);
        }

        var dto = await ToEmployeeDtoAsync(employee, ct);
        return new EmployeeLoginResult(true, null, ip, dto, employee.MustChangePassword, tokens);
    }

    public async Task ChangeEmployeePasswordAsync(Guid employeeId, ChangePasswordRequest request, CancellationToken ct = default)
    {
        var employee = await _db.Employees.FirstOrDefaultAsync(e => e.Id == employeeId, ct)
            ?? throw new InvalidOperationException("Employee not found.");

        if (!PasswordHasher.Verify(request.CurrentPassword, employee.PasswordHash))
            throw new InvalidOperationException("Current password is incorrect.");

        if (request.NewPassword != request.ConfirmNewPassword)
            throw new InvalidOperationException("New password and confirmation do not match.");

        ValidatePasswordStrength(request.NewPassword);

        employee.PasswordHash = PasswordHasher.Hash(request.NewPassword);
        employee.MustChangePassword = false;
        _db.Update(employee);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<ClientLoginResult> LoginClientAsync(ClientLoginRequest request, CancellationToken ct = default)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Username == request.Username, ct);

        if (client is null || client.PasswordHash is null || !PasswordHasher.Verify(request.Password, client.PasswordHash))
            return new ClientLoginResult(false, "Incorrect username or password.", null, false);

        if (client.AccountStatus != ClientAccountStatus.Approved)
            return new ClientLoginResult(false, "Your account is not yet approved.", null, false);

        var ip = _requestContext.ResolveClientIpAddress();
        await _sessions.OpenSessionAsync(SessionAccountType.Client, client.Id, ip, ct);

        AuthTokenResult? tokens = null;
        if (!client.MustChangePassword)
        {
            var subject = new TokenSubject(SessionAccountType.Client, client.Id, client.Username ?? string.Empty, new List<EmployeeRole>());
            var pair = await _tokens.IssueTokenPairAsync(subject, ip, ct);
            tokens = new AuthTokenResult(pair.AccessToken, pair.RefreshTokenPlainText, pair.AccessTokenExpiresAt);
        }

        var dto = ToClientDto(client);
        return new ClientLoginResult(true, null, dto, client.MustChangePassword, tokens);
    }

    public async Task ChangeClientPasswordAsync(Guid clientId, ClientChangePasswordRequest request, CancellationToken ct = default)
    {
        var client = await _db.Clients.FirstOrDefaultAsync(c => c.Id == clientId, ct)
            ?? throw new InvalidOperationException("Client not found.");

        if (!PasswordHasher.Verify(request.CurrentPassword, client.PasswordHash))
            throw new InvalidOperationException("Current password is incorrect.");

        if (request.NewPassword != request.ConfirmNewPassword)
            throw new InvalidOperationException("New password and confirmation do not match.");

        ValidatePasswordStrength(request.NewPassword);

        client.PasswordHash = PasswordHasher.Hash(request.NewPassword);
        client.MustChangePassword = false;
        _db.Update(client);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<AuthTokenResult> RefreshAsync(RefreshTokenRequest request, string ipAddress, CancellationToken ct = default)
    {
        var pair = await _tokens.RefreshAsync(request.RefreshToken, ipAddress, ct);
        return new AuthTokenResult(pair.AccessToken, pair.RefreshTokenPlainText, pair.AccessTokenExpiresAt);
    }

    public Task RevokeRefreshTokenAsync(RevokeTokenRequest request, string ipAddress, CancellationToken ct = default) =>
        _tokens.RevokeAsync(request.RefreshToken, ipAddress, ct);

    private static void ValidatePasswordStrength(string password)
    {
        if (password.Length < 8)
            throw new InvalidOperationException("New password must be at least 8 characters.");
    }

    private async Task RecordLoginAsync(Guid employeeId, string ip, DeviceType deviceType, string deviceIdentifier, bool allowed, string? reason, CancellationToken ct)
    {
        var record = new LoginRecord
        {
            EmployeeId = employeeId,
            IpAddress = ip,
            DeviceType = deviceType,
            DeviceIdentifier = deviceIdentifier,
            Allowed = allowed,
            Reason = reason,
        };
        _db.Add(record);

        if (allowed)
        {
            var existing = await _db.DeviceSessions.FirstOrDefaultAsync(
                d => d.EmployeeId == employeeId && d.DeviceIdentifier == deviceIdentifier, ct);

            if (existing is not null)
            {
                existing.IpAddress = ip;
                existing.LastSeen = DateTimeOffset.UtcNow;
                existing.AccessStatus = DeviceAccessStatus.Allowed;
                _db.Update(existing);
            }
            else
            {
                _db.Add(new DeviceSession
                {
                    EmployeeId = employeeId,
                    DeviceType = deviceType,
                    DeviceIdentifier = deviceIdentifier,
                    IpAddress = ip,
                    LastSeen = DateTimeOffset.UtcNow,
                    AccessStatus = DeviceAccessStatus.Allowed,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task<EmployeeDto> ToEmployeeDtoAsync(Employee e, CancellationToken ct)
    {
        var openCount = await _db.Tickets.CountAsync(t => t.AssignedEmployeeId == e.Id && (t.Status == TicketStatus.Assigned || t.Status == TicketStatus.InProgress), ct);
        var scores = await _db.Tickets.Where(t => t.AssignedEmployeeId == e.Id && t.SatisfactionScore != null).Select(t => t.SatisfactionScore!.Value).ToListAsync(ct);
        double? avgScore = scores.Count > 0 ? scores.Average() : null;

        return new EmployeeDto(
            e.Id, e.FullName, e.Email, e.PhoneNumber, e.Specialization, e.Roles, e.ExtraRoleLabels, e.AccountStatus, e.AllowedIpAddresses,
            e.DisabledAt, e.DisabledReason, openCount, avgScore, e.Username, e.MustChangePassword
        );
    }

    private static ClientDto ToClientDto(Client c) => new(
        c.Id, c.Name, c.IdNumber, c.PhoneNumber, c.Email, c.Office, c.Location,
        c.Region, c.City, c.Woreda,
        c.KycType, c.KycContact, c.ItSupportContact, c.AccountStatus, c.OnboardingDate, c.RejectionReason,
        c.Username, c.MustChangePassword
    );
}