namespace VeloqOS.Api.Integrations;

/// <summary>Source of mail and the side effects of acting on it. Gmail comes later.</summary>
public interface IInboxProvider
{
    Task<IReadOnlyList<InboxItem>> FetchAsync(CancellationToken cancellationToken);

    /// <summary>Carries out an action in the mail system (send, archive, label…).</summary>
    Task ApplyAsync(InboxItem item, string action, string? body, CancellationToken cancellationToken);

    /// <summary>Reverses an action where the mail system allows it.</summary>
    Task UndoAsync(InboxItem item, string action, CancellationToken cancellationToken);
}

/// <summary>Example mail with placeholders. Actions only change in-memory state.</summary>
public sealed class SampleInboxProvider(TimeProvider time) : IInboxProvider
{
    public Task<IReadOnlyList<InboxItem>> FetchAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        IReadOnlyList<InboxItem> items =
        [
            Item("m1", "GitHub", now.AddMinutes(-30), "CI misslyckades på main · [repo]", InboxTags.Action,
                "Ett steg i testsviten fallerar efter senaste pushen. Jag kan läsa loggen, hitta testet och föreslå en ändring som du godkänner.",
                InboxActions.Delegate, "låt Veloq OS föreslå en fix"),
            Item("m2", "[Avsändare]", now.AddHours(-3), "Re: [ämne]", InboxTags.Reply,
                "Vill ha besked om [fråga] senast [datum]. Jag har skrivit ett kort svar utifrån det du sagt tidigare.",
                InboxActions.Reply, "svara med utkastet",
                "Hej [namn],\n\nTack för ditt mejl. [Ditt besked här].\n\nVänliga hälsningar\nVidar"),
            Item("m3", "Google Kalender", now.AddHours(-4), "Inbjudan: [möte] · [datum]", InboxTags.Reply,
                "En mötesinbjudan. Tiden krockar inte med något i din kalender.",
                InboxActions.Calendar, "tacka ja och lägg in i kalendern", "Tackar ja."),
            Item("m4", "GitHub", now.AddHours(-5), "Dependabot: [paket] kan uppdateras", InboxTags.Action,
                "En ny version av ett beroende finns. Ingen säkerhetsvarning, så det kan vänta till nästa gång du jobbar i repot.",
                InboxActions.Task, "gör till uppgift i projektet"),
            Item("m5", "Google Play Console", now.AddDays(-1), "[app]: granskningen är klar", InboxTags.Info,
                "Granskningen av senaste versionen är klar. Inget du behöver göra.",
                InboxActions.Archive, "arkivera"),
            Item("m6", "[Tjänst]", now.AddDays(-1), "Kvitto för [månad]", InboxTags.Info,
                "Ett kvitto. Spara det om du bokför för Veloq Labs.",
                InboxActions.Snooze, "påminn vid månadsskiftet"),
            Item("m7", "[Nyhetsbrev]", now.AddDays(-3), "[rubrik]", InboxTags.Noise,
                "Inget som rör dina projekt.", InboxActions.Archive, "arkivera"),
            Item("m8", "[Nyhetsbrev]", now.AddDays(-4), "[rubrik]", InboxTags.Noise,
                "Inget som rör dina projekt.", InboxActions.Archive, "arkivera"),
        ];
        return Task.FromResult(items);
    }

    public Task ApplyAsync(InboxItem item, string action, string? body, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task UndoAsync(InboxItem item, string action, CancellationToken cancellationToken) => Task.CompletedTask;

    private static InboxItem Item(
        string id, string from, DateTimeOffset at, string subject, string tag, string summary,
        string suggested, string suggestion, string? draft = null) =>
        new(id, from, at, subject, tag, summary, suggested, suggestion, draft, HandledWith: null);
}
