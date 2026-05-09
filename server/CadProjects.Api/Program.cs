using CadProjects.Api.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseCors();
app.MapControllers();
app.MapGet("/", () => Results.Ok(new { status = "Online-CAD API running", version = "1.0.0-sprint1" }));

app.Run();
