public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
{
    // Read DATABASE_URL directly from environment variable
    var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL");

    if (string.IsNullOrEmpty(connectionString))
    {
        throw new InvalidOperationException(
            "DATABASE_URL environment variable is not set. " +
            "Please set it to your PostgreSQL connection string.");
    }

    services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(connectionString));

    services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

    services.Configure<TicketWorkflowOptions>(configuration.GetSection(TicketWorkflowOptions.SectionName));
    services.Configure<SessionOptions>(configuration.GetSection(SessionOptions.SectionName));
    services.Configure<SmtpOptions>(configuration.GetSection(SmtpOptions.SectionName));
    services.AddScoped<IEmailSender, MailKitEmailSender>();

    services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));
    services.AddScoped<ITokenService, TokenService>();

    services.Configure<StorageOptions>(configuration.GetSection(StorageOptions.SectionName));
    services.AddSingleton<IFileStorageService, LocalFileStorageService>();

    services.AddScoped<AccountCredentialService>();
    services.AddScoped<ITicketAssignmentService, TicketAssignmentService>();
    services.AddScoped<ITicketService, TicketService>();
    services.AddScoped<IEmployeeService, EmployeeService>();
    services.AddScoped<IAuthService, AuthService>();
    services.AddScoped<IClientService, ClientService>();
    services.AddScoped<IAgreementService, AgreementService>();
    services.AddScoped<INotificationService, NotificationService>();
    services.AddScoped<IMaintenanceService, MaintenanceService>();
    services.AddScoped<ITimeLogService, TimeLogService>();
    services.AddScoped<IReportService, ReportService>();
    services.AddScoped<ISessionService, SessionService>();

    services.Configure<AiReportingOptions>(configuration.GetSection(AiReportingOptions.SectionName));
    services.AddHttpClient<IAiNarrativeReportService, AnthropicNarrativeReportService>();
    services.AddScoped<ISatisfactionSurveyService, SatisfactionSurveyService>();

    return services;
}