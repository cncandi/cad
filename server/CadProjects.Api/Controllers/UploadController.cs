using Microsoft.AspNetCore.Mvc;

namespace CadProjects.Api.Controllers;

[ApiController]
[Route("api/upload")]
public class UploadController : ControllerBase
{
    [HttpPost("step")]
    public IActionResult UploadStep(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest("No file provided.");

        // Sprint 2: forward to OpenCascade.js WASM or server-side OCCT
        Console.WriteLine($"[Upload] STEP file received: {file.FileName} ({file.Length} bytes)");
        return Accepted(new
        {
            message = "STEP upload received. OpenCascade.js integration follows in Sprint 2.",
            fileName = file.FileName,
            sizeBytes = file.Length,
        });
    }
}
