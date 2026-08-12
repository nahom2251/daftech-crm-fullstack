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
    public DateOnly SignDate { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public int SupportWindowMonths { get; set; } = 12;
    public AgreementStatus Status { get; set; } = AgreementStatus.Active;
    public BillingTier BillingTier { get; set; }

    /// <summary>
    /// Storage key (per IFileStorageService) for the scanned training
    /// document — same upload-after-creation pattern as ScannedFileUrl
    /// above (see AgreementService.UploadTrainingScanAsync). Null until uploaded.
    /// </summary>
    public string? TrainingScanStorageKey { get; set; }
    public string? TrainingScanFileName { get; set; }

    /// <summary>Free-text description of the client training delivered before this agreement (what was covered, who attended, etc).</summary>
    public string? TrainingDescription { get; set; }

    /// <summary>When training started/is scheduled to start.</summary>
    public DateOnly? TrainingStartDate { get; set; }

    /// <summary>When training finished/is scheduled to finish. Entered directly by the Admin, not derived.</summary>
    public DateOnly? TrainingEndDate { get; set; }

    public ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();

    /// <summary>
    /// A ticket raised against this agreement is Free while today falls within
    /// [SignDate, SignDate + SupportWindowMonths]; Chargeable afterward.
    /// Mirrors the frontend's AgreementService.isWithinSupportWindow so both
    /// sides agree on the derived chargeable flag.
    /// </summary>
    public bool IsWithinSupportWindow(DateOnly onDate)
    {
        var windowEnd = SignDate.AddMonths(SupportWindowMonths);
        return onDate >= SignDate && onDate <= windowEnd;
    }
}
