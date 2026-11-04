namespace VeloqOS.Api.Services.Chores;

/// <summary>Runs <see cref="ChoreCatalog.ClearInbox"/> in the API: archives what the inbox has tagged as noise.</summary>
public sealed class InboxChoreHandler(InboxService inbox) : IChoreHandler
{
    public bool Handles(Chore chore) => chore.Id == ChoreCatalog.ClearInbox;

    public async Task<ChoreOutcome> RunAsync(Chore chore, ChoreContext context, CancellationToken cancellationToken)
    {
        var archived = await inbox.ClearNoiseAsync(cancellationToken);
        return new ChoreOutcome(archived switch
        {
            0 => "Inget brus att arkivera.",
            1 => "Arkiverade 1 mejl som var brus.",
            _ => $"Arkiverade {archived} mejl som var brus.",
        });
    }

    public Task<ChoreOutcome> ConfirmAsync(Chore chore, ChoreContext context, ChoreOutcome proposal, IReadOnlyList<JobChoice> picked, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("Att rensa inkorgen har inget att godkänna.");
}
