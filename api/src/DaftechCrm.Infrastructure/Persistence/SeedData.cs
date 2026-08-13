using DaftechCrm.Application.Services;
using DaftechCrm.Domain.Entities;
using DaftechCrm.Domain.Enums;

namespace DaftechCrm.Infrastructure.Persistence;

/// <summary>
/// Deterministic seed data — same fixed Guids/dates every run so migrations
/// stay reproducible. Mirrors src/app/core/mock-data.ts on the Angular side
/// so a fresh dev database tells the same demo story as the frontend mocks.
///
/// Seeded accounts use known dev credentials (documented in the backend
/// README) so the demo can be logged into immediately without depending on
/// SMTP being configured. In a real deployment, every account is created
/// through Employees/Clients registration instead, which issues a random
/// one-time password and emails it via MailKit.
/// </summary>
public static class SeedData
{
    public static readonly Guid Emp1Admin = Guid.Parse("11111111-0000-0000-0000-000000000001");

    /// <summary>
    /// The single dedicated testing employee account. Previously there were
    /// four seeded employees (2 more active technicians + 1 disabled); those
    /// were trimmed to keep exactly one Admin + one Employee for login
    /// testing, per the account cleanup requirement. Nothing referenced
    /// their Guids elsewhere (no seeded tickets/assignments pointed at
    /// them), so removing them here is safe and doesn't touch client or
    /// agreement data.
    /// </summary>
    public static readonly Guid Emp2Tech = Guid.Parse("11111111-0000-0000-0000-000000000002");

    public static readonly Guid Client1 = Guid.Parse("22222222-0000-0000-0000-000000000001");
    public static readonly Guid Client2 = Guid.Parse("22222222-0000-0000-0000-000000000002");

    /// <summary>Dev-only known password for every seeded account. Never used outside seed data.</summary>
    public const string SeedPassword = "DaftechDemo1!";

    public static IEnumerable<Employee> Employees()
    {
        yield return new Employee
        {
            Id = Emp1Admin, FullName = "Nahom Alehegne", Email = "nahom@daftech.et", PhoneNumber = "+251911000001",
            Specialization = "Back-end",
            Roles = new() { EmployeeRole.Admin }, AccountStatus = EmployeeAccountStatus.Active,
            AllowedIpAddresses = new() { "196.188.20.10" },
            AccountRefId = "DAF-ADMIN-1001",
            Username = "na1001", PasswordHash = PasswordHasher.Hash(SeedPassword), MustChangePassword = false,
        };
        yield return new Employee
        {
            Id = Emp2Tech, FullName = "Nebil Sherefa", Email = "nebil@daftech.et", PhoneNumber = "+251911000002",
            Specialization = "Front-end",
            Roles = new() { EmployeeRole.EmployeeTechnician }, AccountStatus = EmployeeAccountStatus.Active,
            AllowedIpAddresses = new(),
            AccountRefId = "DAF-EMP-1002",
            Username = "ns1002", PasswordHash = PasswordHasher.Hash(SeedPassword), MustChangePassword = false,
        };
    }

    public static IEnumerable<Client> Clients()
    {
        yield return new Client
        {
            Id = Client1, Name = "Abyssinia Traders PLC", IdNumber = "ID-88213", PhoneNumber = "+251911223344",
            Email = "contact@abyssiniatraders.et",
            Office = "Bole Head Office", Location = "Addis Ababa", KycType = "Business License",
            KycContact = "Selam Tesfaye — +251911998877", AccountStatus = ClientAccountStatus.Approved,
            OnboardingDate = DateOnly.Parse("2025-02-10"),
            AccountRefId = "DAF-CLI-2001",
            Username = "at2001", PasswordHash = PasswordHasher.Hash(SeedPassword), MustChangePassword = false,
        };
        yield return new Client
        {
            Id = Client2, Name = "Merkato Micro-Finance", IdNumber = "ID-77012", PhoneNumber = "+251922334455",
            Email = "info@merkatomf.et",
            Office = "Merkato Branch", Location = "Addis Ababa", KycType = "Financial Institution License",
            KycContact = "Dawit Alemu — +251922112233", AccountStatus = ClientAccountStatus.Approved,
            OnboardingDate = DateOnly.Parse("2024-11-03"),
            AccountRefId = "DAF-CLI-2002",
            Username = "mm2002", PasswordHash = PasswordHasher.Hash(SeedPassword), MustChangePassword = false,
        };
    }

    /// <summary>
    /// Same two accounts as Employees() above — exposed under a separate
    /// name because DependencyInjection.EnsureDemoAccountsAsync calls this
    /// on every single startup (upserting by Username), not just once when
    /// the database is empty like Employees()/Clients() are. Kept as a
    /// direct alias rather than a duplicate list so there's one source of
    /// truth for what the demo accounts actually are.
    /// </summary>
    public static IEnumerable<Employee> DemoEmployees() => Employees();

    /// <summary>Same two accounts as Clients() above — see DemoEmployees() for why this exists as a separate name.</summary>
    public static IEnumerable<Client> DemoClients() => Clients();
}
