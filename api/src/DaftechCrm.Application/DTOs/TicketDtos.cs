using DaftechCrm.Domain.Enums;
using DaftechCrm.Domain.Entities;

namespace DaftechCrm.Application.DTOs;

public record TicketDto(
    Guid Id,
    Guid ClientId,
    string ClientName,
    Guid AgreementId,
    string Description,
    TicketCategory Category,
    Guid? FailureTypeId,
    string? FailureTypeName,
    DateTimeOffset DateSubmitted,
    Guid? ForwardedByEmployeeId,
    Guid? AssignedEmployeeId,
    string? AssignedEmployeeName,
    DateTimeOffset? AssignedAt,
    /// <summary>AssignedAt + the ticket's FailureType duration, or null if no FailureType was chosen (falls back to the global on-time target in reporting — see ReportService).</summary>
    DateTimeOffset? ExpectedResolutionBy,
    bool Chargeable,
    TicketStatus Status,
    DateTimeOffset? ResolvedAt,
    DateTimeOffset? ClientConfirmationDeadline,
    int? SatisfactionStars,
    int? SatisfactionScore,
    ClosureReason? ClosureReason,
    IReadOnlyList<TicketAuditEntryDto> AuditTrail
);

public record TicketAuditEntryDto(DateTimeOffset Timestamp, string Actor, string Action);

public record SubmitTicketRequest(Guid ClientId, Guid AgreementId, string Description, TicketCategory Category, Guid? FailureTypeId);

public record ForwardTicketRequest(Guid ForwardedByEmployeeId);

public record UpdateTicketStatusRequest(TicketStatus Status, string ActorName);

/// <summary>
/// Client's response to the "did this actually get fixed?" confirmation step.
/// Stars are 1-5; the service converts to a 0-100 score (stars * 20) and
/// applies the 90/100 (4.5-star) escalation threshold.
/// </summary>
/// <summary>
/// Client's response to the "did this actually get fixed?" confirmation step.
/// SRS v2.0 §4.5.1: IsFixed is answered first — if false, the ticket
/// reopens to the assigned employee and SatisfactionStars is ignored (not
/// required). If true, SatisfactionStars (1-5) is required and the service
/// converts it to a 0-100 score, applying the 90/100 escalation threshold.
/// </summary>
public record ClientConfirmationRequest(bool IsFixed, int? SatisfactionStars);
