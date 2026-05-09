namespace CadProjects.Api.Models;

public record CadProjectDto(
    string Id,
    string Name,
    string Units,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public record CadOperationDto(
    string Id,
    string Type,
    string TargetId,
    double[]? Matrix,
    double? DistanceMm,
    DateTimeOffset CreatedAt
);
