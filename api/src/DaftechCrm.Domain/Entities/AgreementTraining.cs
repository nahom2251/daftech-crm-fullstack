namespace DaftechCrm.Domain.Entities;

/// <summary>
/// A single client-training record delivered before/around an agreement.
/// An agreement can have several of these (e.g. multiple training sessions
/// for different staff groups) — replaces the old single set of
/// Training* fields that used to live directly on Agreement.
/// </summary>
public class AgreementTraining
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AgreementId { get; set; }
    public Agreement Agreement { get; set; } = default!;

    /// <summary>Free-text description of what was covered, who attended, etc.</summary>
    public string? Description { get; set; }

    public DateOnly? StartDate { get; set; }

    /// <summary>When this training finished. The agreement's SignDate (support-start date) is derived from the latest EndDate across all of the agreement's trainings.</summary>
    public DateOnly? EndDate { get; set; }

    /// <summary>Storage key (per IFileStorageService) for the scanned training document. Null until uploaded.</summary>
    public string? ScanStorageKey { get; set; }
    public string? ScanFileName { get; set; }
}
