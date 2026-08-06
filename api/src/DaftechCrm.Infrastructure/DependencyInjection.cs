using DaftechCrm.Application.Interfaces;
using DaftechCrm.Application.Options;
using DaftechCrm.Application.Services;
using DaftechCrm.Infrastructure.Ai;
using DaftechCrm.Infrastructure.Auth;
using DaftechCrm.Infrastructure.Email;
using DaftechCrm.Infrastructure.Persistence;
using DaftechCrm.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace DaftechCrm.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Read DATABASE_URL directly from environment variable
        var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL");

        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("DATABASE_URL environment variable is missing or empty.");

        // Parse the connection string if it is in URL format
        if (connectionString.StartsWith("postgres://") ||
            connectionString.StartsWith("postgresql://"))
        {
            try
            {
                var uri = new Uri(connectionString);

                var userInfo = uri.UserInfo.Split(':', 2);

                if (userInfo.Length == 0 || string.IsNullOrWhiteSpace(userInfo[0]))
                {
                    throw new InvalidOperationException("DATABASE_URL is missing username.");
                }

                var builder = new Npgsql.NpgsqlConnectionStringBuilder
                {
                    Host = uri.Host,
                    Port = uri.IsDefaultPort ? 5432 : uri.Port,
                    Database = uri.AbsolutePath.Trim('/'),
                    Username = userInfo[0],
                    Password = userInfo.Length > 1 ? userInfo[1] : "",
                    SslMode = Npgsql.SslMode.Require
                };

                // Preserve additional query parameters
                var queryParams = System.Web.HttpUtility.ParseQueryString(uri.Query);

                if (!string.IsNullOrEmpty(queryParams["sslmode"]))
                {
                    builder.SslMode = Enum.Parse<Npgsql.SslMode>(
                        queryParams["sslmode"]!,
                        true);
                }

                if (!string.IsNullOrEmpty(queryParams["connect_timeout"]))
                {
                    builder.Timeout = int.Parse(queryParams["connect_timeout"]!);
                }

                if (!string.IsNullOrEmpty(queryParams["pooling"]))
                {
                    builder.Pooling = bool.Parse(queryParams["pooling"]!);
                }

                connectionString = builder.ConnectionString;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    $"Failed to parse DATABASE_URL: {ex.Message}. " +
                    "Ensure it is in the format: postgres://user:password@host:port/database",
                    ex);
            }
        }

        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<IAppDbContext>(sp =>
            sp.GetRequiredService<AppDbContext>());

        services.Configure<TicketWorkflowOptions>(
            configuration.GetSection(TicketWorkflowOptions.SectionName));

        services.Configure<SessionOptions>(
            configuration.GetSection(SessionOptions.SectionName));

        services.Configure<SmtpOptions>(
            configuration.GetSection(SmtpOptions.SectionName));

        services.AddScoped<IEmailSender, MailKitEmailSender>();

        services.Configure<JwtOptions>(
            configuration.GetSection(JwtOptions.SectionName));

        services.AddScoped<ITokenService, TokenService>();

        services.Configure<StorageOptions>(
            configuration.GetSection(StorageOptions.SectionName));

        services.AddSingleton<IFileStorageService, LocalFileStorageService>();

        services.AddScoped<AccountCredentialService>();
        services.AddScoped<ReferenceNumberService>();
        services.AddScoped<ITicketAssignmentService, TicketAssignmentService>();
        services.AddScoped<ITicketService, TicketService>();
        services.AddScoped<IEmployeeService, EmployeeService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IPasswordResetService, PasswordResetService>();
        services.AddScoped<IClientService, ClientService>();
        services.AddScoped<IAgreementService, AgreementService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IMaintenanceService, MaintenanceService>();
        services.AddScoped<ITimeLogService, TimeLogService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<ISessionService, SessionService>();

        services.Configure<AiReportingOptions>(
            configuration.GetSection(AiReportingOptions.SectionName));

        services.AddHttpClient<IAiNarrativeReportService, AnthropicNarrativeReportService>();

        services.AddScoped<ISatisfactionSurveyService, SatisfactionSurveyService>();

        services.AddScoped<ISystemConfigurationService, SystemConfigurationService>();

        return services;
    }

    /// <summary>
    /// Applies pending migrations and inserts seed data if database is empty.
    /// Call once at startup.
    /// </summary>
    public static async Task MigrateAndSeedAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        await db.Database.MigrateAsync();

        if (!await db.EmployeesSet.AnyAsync())
        {
            db.EmployeesSet.AddRange(SeedData.Employees());
            db.ClientsSet.AddRange(SeedData.Clients());

            await db.SaveChangesAsync();
        }
    }
}