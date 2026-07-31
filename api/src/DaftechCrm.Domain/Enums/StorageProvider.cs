namespace DaftechCrm.Domain.Enums;

/// <summary>
/// Which backend LocalFileStorageService (or a future implementation)
/// stores files against. Only LocalFileSystem is implemented today —
/// the enum exists so a future S3/Azure Blob provider is a config
/// switch, not a rewrite.
/// </summary>
public enum StorageProvider
{
    LocalFileSystem
}
