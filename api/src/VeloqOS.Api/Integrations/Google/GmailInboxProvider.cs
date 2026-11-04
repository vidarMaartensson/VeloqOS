using System.Collections.Concurrent;

namespace VeloqOS.Api.Integrations.Google;

/// <summary>The Gmail inbox. Empty until Google is connected.</summary>
public sealed class GmailInboxProvider(GoogleAuth auth, GoogleClient google) : IInboxProvider
{
    private const string Base = "https://gmail.googleapis.com/gmail/v1/users/me";
    private const int MaxMessages = 25;

    /// <summary>Gmail labels Veloq OS puts on mail it has acted on.</summary>
    public static readonly IReadOnlyDictionary<string, string> ActionLabels = new Dictionary<string, string>
    {
        [InboxActions.Snooze] = "Veloq/Snoozad",
        [InboxActions.Task] = "Veloq/Uppgift",
        [InboxActions.Delegate] = "Veloq/Delegerad",
        [InboxActions.Calendar] = "Veloq/Kalender",
    };

    private readonly ConcurrentDictionary<string, string> _labelIds = new();

    public async Task<IReadOnlyList<InboxItem>> FetchAsync(CancellationToken cancellationToken)
    {
        if (!auth.IsConnected) return [];

        var list = await google.GetAsync($"{Base}/messages?labelIds=INBOX&maxResults={MaxMessages}", cancellationToken);
        if (!list.TryGetProperty("messages", out var refs)) return [];

        var messages = await Task.WhenAll(refs.EnumerateArray().Select(r => GetMessageAsync(r.GetProperty("id").GetString()!, cancellationToken)));
        return messages.Select(ToItem).ToList();
    }

    public async Task ApplyAsync(InboxItem item, string action, string? body, CancellationToken cancellationToken)
    {
        switch (action)
        {
            case InboxActions.Archive:
                await ModifyAsync(item.Id, add: [], remove: ["INBOX"], cancellationToken);
                break;
            case InboxActions.Reply:
                var original = await GetMessageAsync(item.Id, cancellationToken);
                await google.PostAsync($"{Base}/messages/send", new { raw = GmailReply.BuildRaw(original, body!), threadId = original.ThreadId }, cancellationToken);
                break;
            case InboxActions.Snooze:
                await ModifyAsync(item.Id, add: [await LabelIdAsync(ActionLabels[action], cancellationToken)], remove: ["INBOX"], cancellationToken);
                break;
            default:
                await ModifyAsync(item.Id, add: [await LabelIdAsync(ActionLabels[action], cancellationToken)], remove: [], cancellationToken);
                break;
        }
    }

    public async Task UndoAsync(InboxItem item, string action, CancellationToken cancellationToken)
    {
        switch (action)
        {
            case InboxActions.Reply:
                throw new InvalidOperationException("Ett skickat svar går inte att ångra.");
            case InboxActions.Archive:
                await ModifyAsync(item.Id, add: ["INBOX"], remove: [], cancellationToken);
                break;
            case InboxActions.Snooze:
                await ModifyAsync(item.Id, add: ["INBOX"], remove: [await LabelIdAsync(ActionLabels[action], cancellationToken)], cancellationToken);
                break;
            default:
                await ModifyAsync(item.Id, add: [], remove: [await LabelIdAsync(ActionLabels[action], cancellationToken)], cancellationToken);
                break;
        }
    }

    internal static InboxItem ToItem(GmailMessage message)
    {
        var sorted = GmailClassifier.Classify(message);
        return new InboxItem(
            message.Id, message.FromName, message.ReceivedAt, message.Subject, sorted.Tag,
            message.Snippet, sorted.SuggestedAction, sorted.Suggestion, sorted.Draft, HandledWith: null);
    }

    private async Task<GmailMessage> GetMessageAsync(string id, CancellationToken ct)
    {
        var headers = string.Join("", GmailMessage.HeaderNames.Select(h => $"&metadataHeaders={h}"));
        return GmailMessage.Parse(await google.GetAsync($"{Base}/messages/{Uri.EscapeDataString(id)}?format=metadata{headers}", ct));
    }

    private Task ModifyAsync(string id, string[] add, string[] remove, CancellationToken ct) =>
        google.PostAsync($"{Base}/messages/{Uri.EscapeDataString(id)}/modify", new { addLabelIds = add, removeLabelIds = remove }, ct);

    /// <summary>Finds or creates a user label such as Veloq/Uppgift.</summary>
    private async Task<string> LabelIdAsync(string name, CancellationToken ct)
    {
        if (_labelIds.TryGetValue(name, out var cached)) return cached;

        var labels = await google.GetAsync($"{Base}/labels", ct);
        if (labels.TryGetProperty("labels", out var all))
        {
            foreach (var label in all.EnumerateArray())
                _labelIds[label.GetProperty("name").GetString()!] = label.GetProperty("id").GetString()!;
        }
        if (_labelIds.TryGetValue(name, out var found)) return found;

        var created = await google.PostAsync($"{Base}/labels", new { name, labelListVisibility = "labelShow", messageListVisibility = "show" }, ct);
        return _labelIds[name] = created.GetProperty("id").GetString()!;
    }
}
