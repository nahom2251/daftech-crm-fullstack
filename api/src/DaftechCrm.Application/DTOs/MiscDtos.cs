using DaftechCrm.Domain.Enums;

namespace DaftechCrm.Application.DTOs;

public record AgreementDto(
    Guid Id, Guid ClientId, string DocumentNumber, string? ScannedFileUrl, string AgreementPlace,
    DateOnly SignDate, DateOnly ExpiryDate, int SupportWindowMonths, AgreementStatus Status, BillingTier BillingTier,
    string? TrainingScanFileName, string? TrainingDescription, DateOnly? TrainingStartDate, DateOnly? TrainingEndDate
);

/// <summary>DocumentNumber is system-generated (see ReferenceNumberService), not supplied by the caller.</summary>
public record CreateAgreementRequest(
    Guid ClientId, string? ScannedFileUrl, string AgreementPlace,
    DateOnly SignDate, DateOnly? ExpiryDate, int SupportWindowMonths, BillingTier BillingTier
);

/// <summary>
/// Written training info (description + timeline) is set/updated
/// separately from the scan upload, since the scan goes through the
/// existing IFormFile upload endpoint pattern while these are plain
/// fields. All fields optional — the Admin can fill this in over time as
/// training details firm up, there's no completeness requirement.
/// </summary>
public record UpdateTrainingInfoRequest(
    string? TrainingDescription, DateOnly? TrainingStartDate, DateOnly? TrainingEndDate
);

public record TimeLogDto(Guid Id, Guid EmployeeId, DateOnly Date, DateTimeOffset? StartTime, DateTimeOffset? FinishTime, double? TotalHours);

public record MaintenanceRecordDto(
    Guid Id, DateOnly Date, string Category, string Description,
    Guid PerformedByEmployeeId, MaintenanceStatus Status, string? Remarks
);

public record CreateMaintenanceRecordRequest(string Category, string Description, Guid PerformedByEmployeeId, MaintenanceStatus Status, string? Remarks);

public record NotificationDto(Guid Id, NotificationRecipientType RecipientType, string RecipientId, string EventType, string Message, DateTimeOffset DateSent, bool ReadStatus);
