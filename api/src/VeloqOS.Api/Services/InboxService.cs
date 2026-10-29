using VeloqOS.Api.Integrations;

namespace VeloqOS.Api.Services;

/// <summary>Keeps the inbox and what has been done with each item.</summary>
public sealed class InboxService(IInboxProvider provider)
{
    private readonly SemaphoreSlim _load = new(1, 1);
    private readonly Lock _gate = new();
    private List<InboxItem>? _items;

    public async Task<IReadOnlyList<InboxItem>> ListAsync(string? tag, CancellationToken ct)
    {
        var items = await EnsureLoadedAsync(ct);
        lock (_gate)
        {
            return items.Where(i => tag is null || i.Tag == tag).OrderByDescending(i => i.ReceivedAt).ToList();
        }
    }

    public async Task<int> NeedsYouAsync(CancellationToken ct)
    {
        var items = await EnsureLoadedAsync(ct);
        lock (_gate)
        {
            return items.Count(i => i.HandledWith is null && (i.Tag == InboxTags.Action || i.Tag == InboxTags.Reply));
        }
    }

    /// <returns>The updated item, or null when no item has that id.</returns>
    public async Task<InboxItem?> ApplyAsync(string id, string action, string? body, CancellationToken ct)
    {
        if (!InboxActions.All.Contains(action)) throw new ArgumentException($"Okänd action: {action}", nameof(action));
        if (action == InboxActions.Reply && string.IsNullOrWhiteSpace(body))
            throw new ArgumentException("Ett svar behöver en text.", nameof(body));

        var item = await FindAsync(id, ct);
        if (item is null) return null;

        await provider.ApplyAsync(item, action, body, ct);
        return Replace(item with { HandledWith = action, Draft = action == InboxActions.Reply ? body : item.Draft });
    }

    public async Task<InboxItem?> UndoAsync(string id, CancellationToken ct)
    {
        var item = await FindAsync(id, ct);
        if (item is null) return null;
        if (item.HandledWith is { } previous) await provider.UndoAsync(item, previous, ct);
        return Replace(item with { HandledWith = null });
    }

    public async Task<int> ClearNoiseAsync(CancellationToken ct)
    {
        var items = await EnsureLoadedAsync(ct);
        List<InboxItem> noise;
        lock (_gate) noise = items.Where(i => i.Tag == InboxTags.Noise && i.HandledWith is null).ToList();

        foreach (var item in noise)
        {
            await provider.ApplyAsync(item, InboxActions.Archive, null, ct);
            Replace(item with { HandledWith = InboxActions.Archive });
        }
        return noise.Count;
    }

    private async Task<InboxItem?> FindAsync(string id, CancellationToken ct)
    {
        var items = await EnsureLoadedAsync(ct);
        lock (_gate) return items.FirstOrDefault(i => i.Id == id);
    }

    private InboxItem Replace(InboxItem updated)
    {
        lock (_gate)
        {
            var index = _items!.FindIndex(i => i.Id == updated.Id);
            _items[index] = updated;
            return updated;
        }
    }

    private async Task<List<InboxItem>> EnsureLoadedAsync(CancellationToken ct)
    {
        if (_items is not null) return _items;
        await _load.WaitAsync(ct);
        try
        {
            _items ??= (await provider.FetchAsync(ct)).ToList();
            return _items;
        }
        finally
        {
            _load.Release();
        }
    }
}
