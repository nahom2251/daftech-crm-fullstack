using DaftechCrm.Domain.Enums;
using DaftechCrm.Infrastructure.Auth;
using Microsoft.AspNetCore.Authorization;

namespace DaftechCrm.Api.Auth;

/// <summary>
/// Named authorization policies used across controllers. Employee roles
/// (Admin/ItSupport/EmployeeTechnician) are carried as standard role
/// claims; "is this caller an Employee at all vs a Client" is carried
/// separately via the daftech_account_type claim, since a Client has no
/// EmployeeRole but still needs to be distinguished from anonymous.
/// </summary>
public static class AuthorizationPolicies
{
    public const string AnyEmployee = "AnyEmployee";
    public const string AdminOnly = "AdminOnly";
    public const string AdminOrItSupport = "AdminOrItSupport";
    public const string AnyClient = "AnyClient";
    public const string AnyAuthenticated = "AnyAuthenticated";

    public static void AddDaftechPolicies(this AuthorizationOptions options)
    {
        options.AddPolicy(AnyAuthenticated, p => p.RequireAuthenticatedUser());

        options.AddPolicy(AnyEmployee, p => p.RequireClaim(DaftechClaimTypes.AccountType, nameof(SessionAccountType.Employee)));

        options.AddPolicy(AdminOnly, p => p
            .RequireClaim(DaftechClaimTypes.AccountType, nameof(SessionAccountType.Employee))
            .RequireRole(nameof(EmployeeRole.Admin)));

        options.AddPolicy(AdminOrItSupport, p => p
            .RequireClaim(DaftechClaimTypes.AccountType, nameof(SessionAccountType.Employee))
            .RequireRole(nameof(EmployeeRole.Admin), nameof(EmployeeRole.ItSupport)));

        options.AddPolicy(AnyClient, p => p.RequireClaim(DaftechClaimTypes.AccountType, nameof(SessionAccountType.Client)));
    }
}
