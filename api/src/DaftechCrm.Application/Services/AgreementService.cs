using DaftechCrm.Application.DTOs;
using DaftechCrm.Application.Interfaces;
using DaftechCrm.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace DaftechCrm.Application.Services;

public class AgreementService : IAgreementService
{
    private readonly IAppDbContext _db;
    private readonly IFileStorageService _storage;
    private readonly ReferenceNumberService _referenceNumbers;

    public AgreementService(IAppDbContext db, IFileStorageService storage, ReferenceNumberService referenceNumbers)
    {
        _db = db;
        _storage = storage;
        _referenceNumbers = referenceNumbers;
    }

    public async Task<AgreementDto> CreateAsync(CreateAgreementRequest request, CancellationToken ct = default)
    {
        // Expiry defaults to a year out from today when not supplied — it
        // can no longer default off SignDate since SignDate isn't known
        // until training finishes (may be null at creation time).
        var expiry = request.ExpiryDate ?? DateOnly.FromDateTime(DateTime.UtcNow).AddYears(1);
        var agreement = new Agreement
        {
            ClientId = request.ClientId,
            DocumentNumber = await _referenceNumbers.GenerateAgreementDocumentNumberAsync(ct),
            // A scanned file is attached later via UploadScannedFileAsync, not at creation —
            // any client-provided value here is ignored to keep this null until a real
            // upload happens (see Final_version_fix.docx item 1: "ensure ScannedFileUrl is null").
            ScannedFileUrl = null,
            AgreementPlace = request.AgreementPlace,
            // SignDate starts null — the support agreement only starts once
            // training ends (see Agreement.RecalculateSignDate). It's set
            // for the first time when a training with an EndDate is saved.
            SignDate = null,
            ExpiryDate = expiry,
            SupportWindowMonths = request.SupportWindowMonths,
            BillingTier = request.BillingTier,
        };
        _db.Add(agreement);
        await _db.SaveChangesAsync(ct);
        return ToDto(agreement);
    }

    public async Task<IReadOnlyList<AgreementDto>> GetAllAsync(CancellationToken ct = default) =>
        (await _db.Agreements.AsNoTracking().Include(a => a.Trainings).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task<PagedResult<AgreementDto>> GetAllPagedAsync(PaginationQuery query, CancellationToken ct = default)
    {
        var totalCount = await _db.Agreements.CountAsync(ct);

        var items = await _db.Agreements
            .AsNoTracking()
            .Include(a => a.Trainings)
            .OrderByDescending(a => a.ExpiryDate)
            .Skip(query.Skip)
            .Take(query.PageSize)
            .ToListAsync(ct);

        return new PagedResult<AgreementDto>(items.Select(ToDto).ToList(), query.Page, query.PageSize, totalCount);
    }

    public async Task<IReadOnlyList<AgreementDto>> GetForClientAsync(Guid clientId, CancellationToken ct = default) =>
        (await _db.Agreements.AsNoTracking().Include(a => a.Trainings).Where(a => a.ClientId == clientId).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task<IReadOnlyList<AgreementDto>> GetExpiringSoonAsync(CancellationToken ct = default)
    {
        var in30 = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(30));
        return (await _db.Agreements.AsNoTracking().Include(a => a.Trainings).Where(a => a.ExpiryDate <= in30).ToListAsync(ct)).Select(ToDto).ToList();
    }

    public async Task<AgreementDto?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var agreement = await _db.Agreements.AsNoTracking().Include(a => a.Trainings).FirstOrDefaultAsync(a => a.Id == id, ct);
        return agreement is null ? null : ToDto(agreement);
    }

    public async Task<AgreementDto> UploadScannedFileAsync(Guid agreementId, Stream content, string fileName, string contentType, CancellationToken ct = default)
    {
        var agreement = await _db.Agreements.Include(a => a.Trainings).FirstOrDefaultAsync(a => a.Id == agreementId, ct)
            ?? throw new InvalidOperationException("Agreement not found.");

        var previousStorageKey = agreement.ScannedFileUrl;

        var result = await _storage.SaveAsync(content, fileName, contentType, ct);

        agreement.ScannedFileUrl = result.StorageKey;
        _db.Update(agreement);
        await _db.SaveChangesAsync(ct);

        // Only delete the old file after the new one and the DB update both
        // succeeded — otherwise a failed upload would silently orphan the
        // agreement with no file at all.
        if (!string.IsNullOrEmpty(previousStorageKey))
            await _storage.DeleteAsync(previousStorageKey, ct);

        return ToDto(agreement);
    }

    public async Task<RetrievedFile?> DownloadScannedFileAsync(Guid agreementId, CancellationToken ct = default)
    {
        var agreement = await _db.Agreements.AsNoTracking().FirstOrDefaultAsync(a => a.Id == agreementId, ct);
        if (agreement is null || string.IsNullOrEmpty(agreement.ScannedFileUrl))
            return null;

        return await _storage.GetAsync(agreement.ScannedFileUrl, ct);
    }

    /// <summary>Creates a new, empty training row on the agreement. Details are filled in afterward via SaveTrainingAsync/UploadTrainingScanAsync, each with its own save action.</summary>
    public async Task<AgreementDto> AddTrainingAsync(Guid agreementId, CancellationToken ct = default)
    {
        var agreement = await _db.Agreements.Include(a => a.Trainings).FirstOrDefaultAsync(a => a.Id == agreementId, ct)
            ?? throw new InvalidOperationException("Agreement not found.");

        var training = new AgreementTraining { AgreementId = agreementId };
        _db.Add(training);
        agreement.Trainings.Add(training);
        // A brand-new training has no EndDate yet, so this can't change
        // SignDate, but keeping the call here keeps the invariant in one
        // place rather than scattering recalculation logic.
        agreement.RecalculateSignDate();
        await _db.SaveChangesAsync(ct);
        return ToDto(agreement);
    }

    /// <summary>Sets/updates one training row's description and timeline, then recalculates the agreement's derived SignDate (see Agreement.RecalculateSignDate) since the latest training EndDate may have changed.</summary>
    public async Task<AgreementDto> SaveTrainingAsync(Guid agreementId, Guid trainingId, SaveAgreementTrainingRequest request, CancellationToken ct = default)
    {
        var agreement = await _db.Agreements.Include(a => a.Trainings).FirstOrDefaultAsync(a => a.Id == agreementId, ct)
            ?? throw new InvalidOperationException("Agreement not found.");

        var training = agreement.Trainings.FirstOrDefault(t => t.Id == trainingId)
            ?? throw new InvalidOperationException("Training not found on this agreement.");

        training.Description = request.Description;
        training.StartDate = request.StartDate;
        training.EndDate = request.EndDate;

        agreement.RecalculateSignDate();
        _db.Update(agreement);
        await _db.SaveChangesAsync(ct);
        return ToDto(agreement);
    }

    /// <summary>Deletes a training row (and its scan file, if any) and recalculates the agreement's derived SignDate.</summary>
    public async Task<AgreementDto> DeleteTrainingAsync(Guid agreementId, Guid trainingId, CancellationToken ct = default)
    {
        var agreement = await _db.Agreements.Include(a => a.Trainings).FirstOrDefaultAsync(a => a.Id == agreementId, ct)
            ?? throw new InvalidOperationException("Agreement not found.");

        var training = agreement.Trainings.FirstOrDefault(t => t.Id == trainingId)
            ?? throw new InvalidOperationException("Training not found on this agreement.");

        var storageKey = training.ScanStorageKey;

        agreement.Trainings.Remove(training);
        _db.Remove(training);
        agreement.RecalculateSignDate();
        _db.Update(agreement);
        await _db.SaveChangesAsync(ct);

        if (!string.IsNullOrEmpty(storageKey))
            await _storage.DeleteAsync(storageKey, ct);

        return ToDto(agreement);
    }

    /// <summary>Uploads (or replaces) the scanned training document for one specific training row — a separate file from the signed-agreement scan.</summary>
    public async Task<AgreementDto> UploadTrainingScanAsync(Guid agreementId, Guid trainingId, Stream content, string fileName, string contentType, CancellationToken ct = default)
    {
        var agreement = await _db.Agreements.Include(a => a.Trainings).FirstOrDefaultAsync(a => a.Id == agreementId, ct)
            ?? throw new InvalidOperationException("Agreement not found.");

        var training = agreement.Trainings.FirstOrDefault(t => t.Id == trainingId)
            ?? throw new InvalidOperationException("Training not found on this agreement.");

        var previousStorageKey = training.ScanStorageKey;

        var result = await _storage.SaveAsync(content, fileName, contentType, ct);

        training.ScanStorageKey = result.StorageKey;
        training.ScanFileName = result.OriginalFileName;
        _db.Update(agreement);
        await _db.SaveChangesAsync(ct);

        if (!string.IsNullOrEmpty(previousStorageKey))
            await _storage.DeleteAsync(previousStorageKey, ct);

        return ToDto(agreement);
    }

    public async Task<RetrievedFile?> DownloadTrainingScanAsync(Guid agreementId, Guid trainingId, CancellationToken ct = default)
    {
        var training = await _db.AgreementTrainings.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == trainingId && t.AgreementId == agreementId, ct);
        if (training is null || string.IsNullOrEmpty(training.ScanStorageKey))
            return null;

        return await _storage.GetAsync(training.ScanStorageKey, ct);
    }

    private static AgreementDto ToDto(Agreement a) => new(
        a.Id, a.ClientId, a.DocumentNumber, a.ScannedFileUrl, a.AgreementPlace,
        a.SignDate, a.ExpiryDate, a.SupportWindowMonths, a.Status, a.BillingTier,
        a.Trainings.Select(ToTrainingDto).ToList()
    );

    private static AgreementTrainingDto ToTrainingDto(AgreementTraining t) => new(
        t.Id, t.AgreementId, t.Description, t.StartDate, t.EndDate, t.ScanFileName
    );
}
