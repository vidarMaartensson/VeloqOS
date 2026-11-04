using VeloqOS.Api.Integrations;

namespace VeloqOS.Api.Services;

/// <summary>
/// Keeps the inbox and what has been done with each item. Refetches from the provider every
/// couple of minutes, keeping handled items so they can still be undone.
/// </summary>
public sealed class InboxService(IInboxProvider provider, TimeProvider? time = null)
{
    public static readonly TimeSpan RefreshAfter = TimeSpan.FromMinutes(2);

    private readonly TimeProvider _time = time ?? TimeProvider.System;
    private readonly SemaphoreSlim _load = new(1, 1);
    private readonly Lock _gate = new();
    private List<InboxItem>? _items;
    private DateTimeOffset? _loadedAt;

    /// <summary>Fetch again on the next call, for example after signing in to Google.</summary>
    public void Invalidate()
    {
        lock (_gate) _loadedAt = null;
    }

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
        if (item.HandledWith == InboxActions.Reply) throw new InvalidOperationException("Ett skickat svar går inte att ångra.");
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

    private bool Fresh()
    {
        lock (_gate) return _items is not null && _loadedAt is { } at && _time.GetUtcNow() - at < RefreshAfter;
    }

    private async Task<List<InboxItem>> EnsureLoadedAsync(CancellationToken ct)
    {
        if (Fresh()) return _items!;
        await _load.WaitAsync(ct);
        try
        {
            if (Fresh()) return _items!;
            var fetched = await provider.FetchAsync(ct);
            lock (_gate)
            {
                // What has been done here wins over the provider; handled items that left the
                // provider's inbox (archived, snoozed) stay so they can be undone.
                var handled = (_items ?? []).Where(i => i.HandledWith is not null).ToDictionary(i => i.Id);
                _items = fetched.Select(i => handled.Remove(i.Id, out var mine) ? mine : i).Concat(handled.Values).ToList();
                _loadedAt = _time.GetUtcNow();
                return _items;
            }
        }
        finally
        {
            _load.Release();
        }
    }
}
