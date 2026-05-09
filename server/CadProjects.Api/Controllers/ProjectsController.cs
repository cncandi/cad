using CadProjects.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace CadProjects.Api.Controllers;

[ApiController]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private static readonly List<CadProjectDto> _projects =
    [
        new("demo-doc-1", "Demo Assembly", "mm", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow),
    ];

    [HttpGet]
    public IActionResult GetAll() => Ok(_projects);

    [HttpGet("{id}")]
    public IActionResult GetById(string id)
    {
        var project = _projects.FirstOrDefault(p => p.Id == id);
        return project is null ? NotFound() : Ok(project);
    }

    [HttpPost]
    public IActionResult Create([FromBody] CreateProjectRequest request)
    {
        var project = new CadProjectDto(
            Guid.NewGuid().ToString(),
            request.Name,
            "mm",
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow
        );
        _projects.Add(project);
        return CreatedAtAction(nameof(GetById), new { id = project.Id }, project);
    }

    [HttpPost("{id}/operations")]
    public IActionResult AddOperation(string id, [FromBody] CadOperationDto operation)
    {
        // Sprint 1: stub — log operation, later persist to DB
        Console.WriteLine($"[Operations] Project={id} Op={operation.Type} Target={operation.TargetId}");
        return Accepted(operation);
    }
}

public record CreateProjectRequest(string Name);
