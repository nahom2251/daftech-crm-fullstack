using DaftechCrm.Domain.Enums;

namespace DaftechCrm.Domain.Entities;

public class Agreement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClientId { get; set; }
    public Client Client { get; set; } = default!;

    public string DocumentNumber { get; set; } = default!;
    public string? ScannedFileUrl { get; set; }
    public string AgreementPlace { get; set; } = default!;

    /// <summary>
    /// The support agreement's start date. This is DERIVED, not
    /// admin-entered: support only begins once client training has
    /// finished, so this always mirrors the latest (max) EndDate across
    /// Trainings. Null while no training has an end date yet — see
    /// RecalculateSignDate, which the service layer calls after any
    /// training add/update/delete.
    /// </summary>
    public DateOnly? SignDate { get; set; }

    public DateOnly ExpiryDate { get; set; }
    public int SupportWindowMonths { get; set; } = 12;
    public AgreementStatus Status { get; set; } = AgreementStatus.Active;
    public BillingTier BillingTier { get; set; }

    /// <summary>
    /// Client trainings delivered for this agreement. An agreement may have
    /// several (e.g. separate sessions for different staff groups) — each
    /// has its own scan, description, and start/end dates, saved
    /// independently of the others.
    /// </summary>
    public ICollection<AgreementTraining> Trainings { get; set; } = new List<AgreementTraining>();

    public ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();

    /// <summary>Recomputes SignDate as the latest training EndDate. Call after any training add/update/delete. Leaves SignDate null if no training has an end date yet (support hasn't started).</summary>
    public void RecalculateSignDate()
    {
        var endDates = Trainings.Where(t => t.EndDate.HasValue).Select(t => t.EndDate!.Value).ToList();
        SignDate = endDates.Count > 0 ? endDates.Max() : null;
    }

    /// <summary>
    /// A ticket raised against this agreement is Free while today falls within
    /// [SignDate, SignDate + SupportWindowMonths]; Chargeable afterward.
    /// Mirrors the frontend's AgreementService.isWithinSupportWindow so both
    /// sides agree on the derived chargeable flag. Always Chargeable
    /// (returns false) if training hasn't finished yet, since support
    /// hasn't started.
    /// </summary>
    public bool IsWithinSupportWindow(DateOnly onDate)
    {
        if (SignDate is not { } signDate) return false;
        var windowEnd = signDate.AddMonths(SupportWindowMonths);
        return onDate >= signDate && onDate <= windowEnd;
    }
}
