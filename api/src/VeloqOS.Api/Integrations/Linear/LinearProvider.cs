using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

namespace VeloqOS.Api.Integrations.Linear;

/// <summary><c>Linear:*</c> in configuration. Personal API keys live in user-secrets, one per workspace.</summary>
public sealed class LinearOptions
{
    /// <summary>A single key; counts as one more next to <see cref="ApiKeys"/>.</summary>
    public string? ApiKey { get; set; }

    public List<string> ApiKeys { get; set; } = [];

    public IReadOnlyList<string> Keys =>
        ApiKeys.Append(ApiKey).Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k!.Trim()).Distinct().ToList();

    public bool Configured => Keys.Count > 0;
}

/// <summary>Linear answered with an error, or the key was refused.</summary>
public sealed class LinearApiException(string message) : Exception(message);

/// <summary>No workspace has a team with this id.</summary>
public sealed class LinearTeamNotFoundException(string teamId) : Exception($"Hittar inget team med id {teamId}.");

/// <summary>
/// Every workspace with a key, as one: teams are merged, and since team ids are unique across
/// workspaces, stories go through the key whose workspace owns the team.
/// </summary>
public sealed class LinearProvider : ILinearProvider
{
    public const string HttpClientName = "linear";
    public const string Endpoint = "https://api.linear.app/graphql";

    private readonly IReadOnlyList<LinearClient> _clients;
    private readonly ConcurrentDictionary<string, LinearClient> _owners = new();

    public LinearProvider(IOptions<LinearOptions> options, IHttpClientFactory http) =>
        _clients = options.Value.Keys.Select(key => new LinearClient(key, http)).ToList();

    public bool Configured => _clients.Count > 0;

    public async Task<IReadOnlyList<LinearWorkspace>> WorkspacesAsync(CancellationToken cancellationToken) =>
        await Task.WhenAll(_clients.Select(async (client, i) =>
        {
            try
            {
                var (id, name) = await client.OrganizationAsync(cancellationToken);
                return new LinearWorkspace(id, name, null);
            }
            catch (LinearApiException e)
            {
                return new LinearWorkspace($"key-{i + 1}", $"Nyckel {i + 1}", e.Message);
            }
        }));

    /// <summary>Teams from every workspace that answers, in key order. Throws only if none does.</summary>
    public async Task<IReadOnlyList<LinearTeam>> TeamsAsync(CancellationToken cancellationToken)
    {
        var results = await Task.WhenAll(_clients.Select(async client =>
        {
            try
            {
                var teams = await client.TeamsAsync(cancellationToken);
                foreach (var team in teams) _owners[team.Id] = client;
                return (Teams: teams, Error: (LinearApiException?)null);
            }
            catch (LinearApiException e)
            {
                return (Teams: (IReadOnlyList<LinearTeam>)[], Error: e);
            }
        }));
        if (results.All(r => r.Error is not null) && results.Length > 0) throw results[0].Error!;

        return results
            .SelectMany(r => r.Teams.OrderBy(t => t.Name, StringComparer.CurrentCultureIgnoreCase))
            .ToList();
    }

    public async Task<IReadOnlyList<LinearIssue>> IssuesAsync(string teamId, bool open, CancellationToken cancellationToken) =>
        await (await OwnerAsync(teamId, cancellationToken)).IssuesAsync(teamId, open, cancellationToken);

    public async Task<LinearIssue> CreateAsync(NewLinearIssue issue, CancellationToken cancellationToken) =>
        await (await OwnerAsync(issue.TeamId!, cancellationToken)).CreateAsync(issue, cancellationToken);

    /// <summary>Story ids are unique across workspaces, so the first workspace that knows the story moves it.</summary>
    public async Task<LinearIssue?> MoveAsync(string issueId, string stateId, CancellationToken cancellationToken)
    {
        LinearApiException? last = null;
        foreach (var client in _clients)
        {
            try
            {
                if (await client.MoveAsync(issueId, stateId, cancellationToken) is { } moved) return moved;
            }
            catch (LinearApiException e)
            {
                last = e;
            }
        }
        return last is null || last.Message.Contains("not found", StringComparison.OrdinalIgnoreCase) ? null : throw last;
    }

    /// <summary>The client for the team's workspace; looks the teams up again for a team it has not seen yet.</summary>
    private async Task<LinearClient> OwnerAsync(string teamId, CancellationToken cancellationToken)
    {
        if (_owners.TryGetValue(teamId, out var client)) return client;
        await TeamsAsync(cancellationToken);
        return _owners.TryGetValue(teamId, out client) ? client : throw new LinearTeamNotFoundException(teamId);
    }
}
