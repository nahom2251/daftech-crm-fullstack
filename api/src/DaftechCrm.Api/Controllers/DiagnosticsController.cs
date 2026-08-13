using DaftechCrm.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DaftechCrm.Api.Controllers;

/// <summary>
/// TEMPORARY — diagnoses/fixes a stale __EFMigrationsHistory row that makes
/// EF think 20260813000000_AddAccountRefId already ran when the column was
/// never actually added to this database (see "column e.AccountRefId does
/// not exist" in the startup logs).
///
/// Protected by a secret query key, not by the normal JWT auth, since this
/// needs to be reachable before/independent of any account working.
///
/// DELETE THIS FILE once the fix has been applied and confirmed — it is not
/// meant to stay in the codebase.
/// </summary>
[ApiController]
[Route("api/__diag")]
[AllowAnonymous]
public class DiagnosticsController : ControllerBase
{
    // Change this to your own secret before deploying, then use the same
    // value in the URL query string when calling the endpoints below.
    private const string Secret = "daftech-temp-diag-2026";

    private readonly AppDbContext _db;
    public DiagnosticsController(AppDbContext db) => _db = db;

    /// <summary>
    /// GET /api/__diag/migrations?key=daftech-temp-diag-2026
    /// Lists every row EF thinks has been applied, and separately checks
    /// whether the "employees"."AccountRefId" column actually exists.
    /// </summary>
    [HttpGet("migrations")]
    public async Task<IActionResult> GetMigrationHistory([FromQuery] string key, CancellationToken ct)
    {
        if (key != Secret) return NotFound();

        var history = await _db.Database
            .SqlQueryRaw<string>(@"SELECT ""MigrationId"" FROM ""__EFMigrationsHistory"" ORDER BY ""MigrationId""")
            .ToListAsync(ct);

        bool columnExists;
        try
        {
            await _db.Database.ExecuteSqlRawAsync(@"SELECT ""AccountRefId"" FROM employees LIMIT 0", ct);
            columnExists = true;
        }
        catch
        {
            columnExists = false;
        }

        return Ok(new
        {
            appliedMigrations = history,
            accountRefIdColumnExistsOnEmployees = columnExists,
            staleHistoryRowPresent = history.Contains("20260813000000_AddAccountRefId") && !columnExists,
        });
    }

    /// <summary>
    /// POST /api/__diag/fix-migration-history?key=daftech-temp-diag-2026
    /// Deletes the stale history row (only if the column genuinely doesn't
    /// exist, as a safety check) so the real migration reruns on next
    /// deploy/restart. Does NOT run the migration itself — restart the
    /// service afterward to let the normal startup MigrateAsync() apply it.
    /// </summary>
    [HttpPost("fix-migration-history")]
    public async Task<IActionResult> FixMigrationHistory([FromQuery] string key, CancellationToken ct)
    {
        if (key != Secret) return NotFound();

        bool columnExists;
        try
        {
            await _db.Database.ExecuteSqlRawAsync(@"SELECT ""AccountRefId"" FROM employees LIMIT 0", ct);
            columnExists = true;
        }
        catch
        {
            columnExists = false;
        }

        if (columnExists)
        {
            return Ok(new { action = "none", reason = "AccountRefId column already exists — nothing to fix." });
        }

        var deleted = await _db.Database.ExecuteSqlRawAsync(
            @"DELETE FROM ""__EFMigrationsHistory"" WHERE ""MigrationId"" = '20260813000000_AddAccountRefId'", ct);

        return Ok(new
        {
            action = "deleted_stale_history_row",
            rowsDeleted = deleted,
            nextStep = "Restart the backend service now — the migration will re-apply automatically on startup.",
        });
    }
}
