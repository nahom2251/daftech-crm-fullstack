using DaftechCrm.Api.Auth;
using DaftechCrm.Api.Extensions;
using DaftechCrm.Application.DTOs;
using DaftechCrm.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace DaftechCrm.Api.Controllers;

[ApiController]
[Route("api/employees")]
[Authorize(Policy = AuthorizationPolicies.AnyEmployee)]
public class EmployeesController : ControllerBase
{
    private readonly IEmployeeService _employees;
    public EmployeesController(IEmployeeService employees) => _employees = employees;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<EmployeeDto>>> GetAll(CancellationToken ct) => Ok(await _employees.GetAllAsync(ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<EmployeeDto>> GetById(Guid id, CancellationToken ct)
    {
        var e = await _employees.GetByIdAsync(id, ct);
        return e is null ? NotFound() : Ok(e);
    }

    /// <summary>
    /// Admin registers a new staff account. The response includes the
    /// system-generated username and a one-time password — this is the
    /// ONLY time the plaintext one-time password is ever available. The
    /// Admin must relay it to the employee immediately; it cannot be
    /// retrieved again afterward.
    /// </summary>
    [HttpPost]
    [Authorize(Policy = AuthorizationPolicies.AdminOnly)]
    public async Task<ActionResult<EmployeeRegisteredResult>> Register([FromBody] CreateEmployeeRequest request, CancellationToken ct)
    {
        var result = await _employees.RegisterAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Employee.Id }, result);
    }

    /// <summary>Disables the account (offboarding) — revokes all device sessions and blocks future logins immediately.</summary>
    [HttpPost("{id:guid}/disable")]
    [Authorize(Policy = AuthorizationPolicies.AdminOnly)]
    public async Task<ActionResult<EmployeeDto>> Disable(Guid id, [FromBody] DisableEmployeeRequest request, CancellationToken ct)
    {
        try { return Ok(await _employees.DisableAsync(id, request, ct)); }
        catch (InvalidOperationException ex) { return NotFound(ex.Message); }
    }

    [HttpPost("{id:guid}/enable")]
    [Authorize(Policy = AuthorizationPolicies.AdminOnly)]
    public async Task<ActionResult<EmployeeDto>> Enable(Guid id, CancellationToken ct)
    {
        try { return Ok(await _employees.EnableAsync(id, ct)); }
        catch (InvalidOperationException ex) { return NotFound(ex.Message); }
    }

    [HttpPost("{id:guid}/allowed-ips")]
    [Authorize(Policy = AuthorizationPolicies.AdminOnly)]
    public async Task<ActionResult<EmployeeDto>> AddAllowedIp(Guid id, [FromBody] AddAllowedIpRequest request, CancellationToken ct) =>
        Ok(await _employees.AddAllowedIpAsync(id, request, ct));

    [HttpDelete("{id:guid}/allowed-ips/{ip}")]
    [Authorize(Policy = AuthorizationPolicies.AdminOnly)]
    public async Task<ActionResult<EmployeeDto>> RemoveAllowedIp(Guid id, string ip, CancellationToken ct) =>
        Ok(await _employees.RemoveAllowedIpAsync(id, ip, ct));

    [HttpGet("{id:guid}/devices")]
    [Authorize(Policy = AuthorizationPolicies.AdminOrItSupport)]
    public async Task<ActionResult<IReadOnlyList<DeviceSessionDto>>> GetDevices(Guid id, CancellationToken ct) =>
        Ok(await _employees.GetDevicesAsync(id, ct));

    [HttpPost("devices/{deviceSessionId:guid}/revoke")]
    [Authorize(Policy = AuthorizationPolicies.AdminOrItSupport)]
    public async Task<IActionResult> RevokeDevice(Guid deviceSessionId, CancellationToken ct)
    {
        await _employees.RevokeDeviceAsync(deviceSessionId, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/login-history")]
    [Authorize(Policy = AuthorizationPolicies.AdminOrItSupport)]
    public async Task<ActionResult<IReadOnlyList<LoginRecordDto>>> GetLoginHistory(Guid id, CancellationToken ct) =>
        Ok(await _employees.GetLoginHistoryAsync(id, ct));

    /// <summary>Retries sending the credential email with a freshly regenerated one-time password (SRS v2.0 §4.3.1).</summary>
    [HttpPost("{id:guid}/resend-credential-email")]
    [Authorize(Policy = AuthorizationPolicies.AdminOnly)]
    public async Task<ActionResult<ResendCredentialEmailResult>> ResendCredentialEmail(Guid id, CancellationToken ct)
    {
        try { return Ok(await _employees.ResendCredentialEmailAsync(id, ct)); }
        catch (InvalidOperationException ex) { return NotFound(ex.Message); }
    }
}

/// <summary>
/// Login, token refresh, and password-change endpoints. These are the only
/// endpoints in the API that allow anonymous access — everything else
/// requires a valid access token. Rate-limited more strictly than the rest
/// of the API (see RateLimitingExtensions.AuthPolicy) to slow down
/// credential-stuffing and brute-force attempts.
/// </summary>
[ApiController]
[Route("api/auth")]
[AllowAnonymous]
[EnableRateLimiting(RateLimitingExtensions.AuthPolicy)]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly Application.Interfaces.ICurrentRequestContext _requestContext;
    public AuthController(IAuthService auth, Application.Interfaces.ICurrentRequestContext requestContext)
    {
        _auth = auth;
        _requestContext = requestContext;
    }

    /// <summary>
    /// Employee login. The server resolves the caller's IP address itself
    /// (see HttpCurrentRequestContext) — it is not supplied by the client —
    /// and records it on every attempt, successful or blocked. The response's
    /// MustChangePassword flag tells the frontend to route straight to the
    /// change-password screen before anything else; Tokens is null until
    /// the password has actually been changed.
    /// </summary>
    [HttpPost("employee-login")]
    public async Task<ActionResult<EmployeeLoginResult>> LoginEmployee([FromBody] EmployeeLoginRequest request, CancellationToken ct) =>
        Ok(await _auth.LoginEmployeeAsync(request, ct));

    [HttpPost("employee/{employeeId:guid}/change-password")]
    public async Task<IActionResult> ChangeEmployeePassword(Guid employeeId, [FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        try
        {
            await _auth.ChangeEmployeePasswordAsync(employeeId, request, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("client-login")]
    public async Task<ActionResult<ClientLoginResult>> LoginClient([FromBody] ClientLoginRequest request, CancellationToken ct) =>
        Ok(await _auth.LoginClientAsync(request, ct));

    [HttpPost("client/{clientId:guid}/change-password")]
    public async Task<IActionResult> ChangeClientPassword(Guid clientId, [FromBody] ClientChangePasswordRequest request, CancellationToken ct)
    {
        try
        {
            await _auth.ChangeClientPasswordAsync(clientId, request, ct);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>
    /// Exchanges a refresh token for a new access/refresh pair. The old
    /// refresh token is rotated (revoked and replaced) — reusing it again
    /// after this call will fail and revoke all sessions for the account
    /// as a precaution against token theft.
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthTokenResult>> Refresh([FromBody] RefreshTokenRequest request, CancellationToken ct)
    {
        try
        {
            var ip = _requestContext.ResolveClientIpAddress();
            return Ok(await _auth.RefreshAsync(request, ip, ct));
        }
        catch (InvalidOperationException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
    }

    /// <summary>Logs out on one device by revoking its refresh token. Safe to call even if the token is already gone.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RevokeTokenRequest request, CancellationToken ct)
    {
        var ip = _requestContext.ResolveClientIpAddress();
        await _auth.RevokeRefreshTokenAsync(request, ip, ct);
        return NoContent();
    }
}
