using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using VeloqOS.Api.Integrations;

namespace VeloqOS.Api.Services.Chores;

/// <summary>
/// Runs <see cref="ChoreCatalog.SyncArtifacts"/>: Claude Code lists your claude.ai artifacts with its Artifact tool and
/// guesses kind and group from each title. Artifacts already on the shelf keep the kind and group they have.
/// </summary>
public sealed partial class ArtifactSyncHandler(IAgent agent, ArtifactCatalog catalog) : IChoreHandler
{
    private sealed record Listed(string? Url, string? Title, string? Updated, string? Kind, string? Group);

    private const string Prompt =
        "Lista alla mina artefakter med verktyget Artifact (action list, scope mine, limit 200). " +
        "Svara bara med en JSON-lista och ingen annan text: " +
        "[{\"url\":\"…\",\"title\":\"…\",\"updated\":\"YYYY-MM-DD\",\"kind\":\"…\",\"group\":\"…\"}]. " +
        "kind är en av doc, plan, map, screen, web, logo, system, spike, icon och gissas från titeln. " +
        "group är en av Veloq, Yagi, Jobb, Spel, Övrigt.";

    public bool Handles(Chore chore) => chore.Id == ChoreCatalog.SyncArtifacts;

    public async Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken)
    {
        var reply = await agent.ReplyAsync(new AgentRequest(Prompt, null, AgentModes.Chat, null, null, Tools: ["Artifact"]), cancellationToken);
        var listed = Parse(reply.Text) ?? throw new InvalidOperationException("Kunde inte läsa listan över artefakter från Claude Code.");

        var known = catalog.List().ToDictionary(a => a.Id);
        var synced = Merge(listed, known);
        catalog.Save(synced);

        var added = synced.Count(a => !known.ContainsKey(a.Id));
        return new ChoreOutcome(added switch
        {
            0 => $"Synkade {synced.Count} artefakter. Inga nya.",
            1 => $"Synkade {synced.Count} artefakter, 1 ny.",
            _ => $"Synkade {synced.Count} artefakter, {added} nya.",
        });
    }

    public Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("Synken har inget att godkänna.");

    [GeneratedRegex(@"\[.*\]", RegexOptions.Singleline)]
    private static partial Regex JsonList();

    [GeneratedRegex(@"^https://claude\.ai/(?:code/)?artifact/([A-Za-z0-9-]+)")]
    private static partial Regex ArtifactUrl();

    /// <summary>The list in Claude's reply, even inside a code fence; null when there is none.</summary>
    public static IReadOnlyList<Artifact>? Parse(string reply)
    {
        var match = JsonList().Match(reply);
        if (!match.Success) return null;
        List<Listed>? items;
        try
        {
            items = JsonSerializer.Deserialize<List<Listed>>(match.Value, JsonSerializerOptions.Web);
        }
        catch (JsonException)
        {
            return null;
        }
        if (items is null) return null;

        return items
            .Select(i => (Item: i, Id: i.Url is null ? null : ArtifactUrl().Match(i.Url) is { Success: true } m ? m.Groups[1].Value : null))
            .Where(x => x.Id is not null && !string.IsNullOrWhiteSpace(x.Item.Title))
            .Select(x => new Artifact(
                x.Id!,
                x.Item.Title!.Trim(),
                x.Item.Url!,
                x.Item.Kind is { } kind && ArtifactCatalog.Kinds.Contains(kind) ? kind : "doc",
                x.Item.Group is { } group && ArtifactCatalog.Groups.Contains(group) ? group : "Övrigt",
                DateOnly.TryParse(x.Item.Updated?[..Math.Min(10, x.Item.Updated.Length)], CultureInfo.InvariantCulture, out var d) ? d : DateOnly.MinValue))
            .DistinctBy(a => a.Id)
            .ToList();
    }

    /// <summary>Claude's list, newest first, with the kind and group the shelf already had for known artifacts.</summary>
    public static IReadOnlyList<Artifact> Merge(IReadOnlyList<Artifact> listed, IReadOnlyDictionary<string, Artifact> known) =>
        listed
            .Select(a => known.TryGetValue(a.Id, out var old) ? a with { Kind = old.Kind, Group = old.Group } : a)
            .OrderByDescending(a => a.UpdatedAt)
            .ToList();
}
