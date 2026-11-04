using Microsoft.Extensions.Configuration;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Tests;

public class ArtifactSyncTests : IDisposable
{
    private sealed class ListingAgent(string reply) : IAgent
    {
        public AgentRequest? Last { get; private set; }

        public Task<AgentReply> ReplyAsync(AgentRequest request, CancellationToken cancellationToken)
        {
            Last = request;
            return Task.FromResult(new AgentReply(reply, "s"));
        }

        public Task<AgentReply> StreamAsync(AgentRequest request, Func<string, Task> onDelta, CancellationToken cancellationToken) =>
            ReplyAsync(request, cancellationToken);
    }

    private const string Listing = """
        Här är listan:
        ```json
        [{"url":"https://claude.ai/artifact/Fmn4hqXTKLEDfEWsziuqme","title":"Veloq OS","updated":"2026-10-30","kind":"doc","group":"Övrigt"},
         {"url":"https://claude.ai/artifact/WpcKSnsT6eDjWybT4mqLZr","title":"Veloq Labs Hoodie","updated":"2026-10-30T10:00:00Z","kind":"merch","group":"Veloq"},
         {"url":"https://example.com/x","title":"Inte en artefakt","updated":"2026-10-30"}]
        ```
        """;

    private readonly string _folder = Directory.CreateTempSubdirectory("veloq-data").FullName;
    private readonly ArtifactCatalog _catalog;

    public ArtifactSyncTests() =>
        _catalog = new ArtifactCatalog(new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Veloq:DataFolder"] = _folder }).Build());

    public void Dispose() => Directory.Delete(_folder, recursive: true);

    private static Chore Sync => ChoreCatalog.Builtin.Single(c => c.Id == ChoreCatalog.SyncArtifacts);

    [Fact]
    public void Shows_the_sample_shelf_before_the_first_sync()
    {
        Assert.Equal(Api.Data.SampleData.Artifacts, _catalog.List());
    }

    [Fact]
    public async Task Syncs_through_the_artifact_tool_and_keeps_what_the_shelf_knew()
    {
        var agent = new ListingAgent(Listing);

        var outcome = await new ArtifactSyncHandler(agent, _catalog).RunAsync(Sync, new ChoreContext(null, "/tmp"), default);

        Assert.Equal(["Artifact"], agent.Last!.Tools);
        Assert.Equal(AgentModes.Chat, agent.Last.Mode);
        Assert.Equal("Synkade 2 artefakter, 1 ny.", outcome.Result);

        var shelf = _catalog.List();
        Assert.Equal(2, shelf.Count);
        var veloqOs = shelf.Single(a => a.Id == "Fmn4hqXTKLEDfEWsziuqme");
        Assert.Equal(("screen", "Veloq"), (veloqOs.Kind, veloqOs.Group)); // from the sample shelf, not Claude's guess
        Assert.Equal(new DateOnly(2026, 10, 30), veloqOs.UpdatedAt);
        var hoodie = shelf.Single(a => a.Id == "WpcKSnsT6eDjWybT4mqLZr");
        Assert.Equal(("doc", "Veloq"), (hoodie.Kind, hoodie.Group)); // unknown kind falls back to doc
    }

    [Fact]
    public async Task A_reply_without_a_list_fails_and_leaves_the_shelf()
    {
        var handler = new ArtifactSyncHandler(new ListingAgent("Jag kunde inte nå claude.ai."), _catalog);

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.RunAsync(Sync, new ChoreContext(null, "/tmp"), default));
        Assert.Equal(Api.Data.SampleData.Artifacts, _catalog.List());
    }
}
