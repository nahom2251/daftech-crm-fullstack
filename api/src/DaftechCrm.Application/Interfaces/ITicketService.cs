using DaftechCrm.Application.DTOs;
using DaftechCrm.Domain.Enums;

namespace DaftechCrm.Application.Interfaces;

public interface ITicketService
{
    Task<TicketDto> SubmitFromClientAsync(SubmitTicketRequest request, CancellationToken ct = default);

    /// <summary>IT Support forwards a submitted ticket — this triggers automatic assignment, not an Admin choice.</summary>
    Task<TicketDto> ForwardAsync(Guid ticketId, ForwardTicketRequest request, CancellationToken ct = default);

    /// <summary>
    /// Employee updates ticket status. Setting Resolved starts the client
    /// confirmation window instead of closing the ticket outright.
    /// </summary>
    Task<TicketDto> UpdateStatusAsync(Guid ticketId, UpdateTicketStatusRequest request, CancellationToken ct = default);

    /// <summary>
    /// Client answers whether the issue is fixed. If not, the ticket
    /// reopens to the assigned employee and no rating is recorded. If
    /// fixed, the client also rates it 1-5 stars (score = stars * 20);
    /// score >= MinimumSatisfactionScore (default 90) closes the ticket,
    /// below that escalates it to Admin instead.
    /// </summary>
    Task<TicketDto> ConfirmResolutionAsync(Guid ticketId, ClientConfirmationRequest request, CancellationToken ct = default);

    /// <summary>
    /// Auto-closes any ticket whose ClientConfirmationDeadline has passed
    /// with no client response. Intended to run on a background timer
    /// (see AutoCloseTicketsHostedService) — not rating-gated, since there
    /// was never a rating to gate on.
    /// </summary>
    Task<int> AutoCloseUnansweredTicketsAsync(CancellationToken ct = default);

    Task<IReadOnlyList<TicketDto>> GetAllAsync(CancellationToken ct = default);

    /// <summary>Paged variant of <see cref="GetAllAsync"/> for the Tickets table UI.</summary>
    Task<PagedResult<TicketDto>> GetAllPagedAsync(PaginationQuery query, CancellationToken ct = default);

    Task<TicketDto?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<TicketDto>> GetForClientAsync(Guid clientId, CancellationToken ct = default);
    Task<IReadOnlyList<TicketDto>> GetForEmployeeAsync(Guid employeeId, CancellationToken ct = default);

    /// <summary>Tickets Resolved and awaiting the client's confirmation — surfaced on the client's portal.</summary>
    Task<IReadOnlyList<TicketDto>> GetAwaitingConfirmationForClientAsync(Guid clientId, CancellationToken ct = default);

    /// <summary>Escalated tickets for the Admin review queue.</summary>
    Task<IReadOnlyList<TicketDto>> GetEscalatedAsync(CancellationToken ct = default);

    /// <summary>
    /// Uploads (or replaces) the ticket's optional attachment — typically
    /// a screenshot of the error being reported. Callers must check
    /// CanAccessAttachmentAsync first; this method does not itself verify
    /// ownership. Throws InvalidOperationException if the ticket doesn't
    /// exist, FileValidationException (from IFileStorageService) if the
    /// file fails extension/size validation.
    /// </summary>
    Task<TicketDto> UploadAttachmentAsync(Guid ticketId, Stream content, string fileName, string contentType, CancellationToken ct = default);

    /// <summary>Streams the ticket's attachment back, or null if the ticket has none or doesn't exist.</summary>
    Task<RetrievedFile?> DownloadAttachmentAsync(Guid ticketId, CancellationToken ct = default);

    /// <summary>
    /// True if the given caller may view/upload this ticket's attachment:
    /// the client who owns the ticket, the assigned technician, or any
    /// Admin/IT Support employee. False (not an exception) if the ticket
    /// doesn't exist, so callers can return 404 either way.
    /// </summary>
    Task<bool> CanAccessAttachmentAsync(Guid ticketId, SessionAccountType callerType, Guid callerId, CancellationToken ct = default);
}
