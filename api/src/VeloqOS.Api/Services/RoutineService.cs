using VeloqOS.Api.Data;

namespace VeloqOS.Api.Services;

/// <summary>Routines and whether they are on. Scheduling them for real comes later.</summary>
public sealed class RoutineService
{
    private readonly Lock _gate = new();
    private readonly List<Routine> _routines = SampleData.Routines.ToList();

    public IReadOnlyList<Routine> List()
    {
        lock (_gate) return _routines.ToList();
    }

    public Routine? SetEnabled(string id, bool enabled)
    {
        lock (_gate)
        {
            var index = _routines.FindIndex(r => r.Id == id);
            if (index < 0) return null;
            _routines[index] = _routines[index] with { Enabled = enabled };
            return _routines[index];
        }
    }
}
