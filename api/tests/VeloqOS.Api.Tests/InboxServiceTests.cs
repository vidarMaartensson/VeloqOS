using VeloqOS.Api.Integrations;
using VeloqOS.Api.Services;

namespace VeloqOS.Api.Tests;

public class InboxServiceTests
{
    private static InboxService Create() =>
        new(new SampleInboxProvider(new ManualTimeProvider(new DateTimeOffset(2026, 10, 29, 14, 0, 0, TimeSpan.Zero))));

    private static readonly CancellationToken Ct = CancellationToken.None;

    [Fact]
    public async Task Counts_unhandled_action_and_reply_items_as_needing_you()
    {
        var inbox = Create();

        Assert.Equal(4, await inbox.NeedsYouAsync(Ct));
    }

    [Fact]
    public async Task Filters_by_tag()
    {
        var inbox = Create();

        var noise = await inbox.ListAsync(InboxTags.Noise, Ct);

        Assert.Equal(2, noise.Count);
        Assert.All(noise, i => Assert.Equal(InboxTags.Noise, i.Tag));
    }

    [Fact]
    public async Task Applying_an_action_marks_the_item_and_lowers_the_count()
    {
        var inbox = Create();

        var item = await inbox.ApplyAsync("m1", InboxActions.Delegate, null, Ct);

        Assert.Equal(InboxActions.Delegate, item!.HandledWith);
        Assert.Equal(3, await inbox.NeedsYouAsync(Ct));
    }

    [Fact]
    public async Task Undo_puts_the_item_back()
    {
        var inbox = Create();
        await inbox.ApplyAsync("m1", InboxActions.Archive, null, Ct);

        var item = await inbox.UndoAsync("m1", Ct);

        Assert.Null(item!.HandledWith);
        Assert.Equal(4, await inbox.NeedsYouAsync(Ct));
    }

    [Fact]
    public async Task Reply_keeps_the_sent_text()
    {
        var inbox = Create();

        var item = await inbox.ApplyAsync("m2", InboxActions.Reply, "Hej, det låter bra.", Ct);

        Assert.Equal("Hej, det låter bra.", item!.Draft);
    }

    [Fact]
    public async Task Reply_without_text_is_rejected()
    {
        var inbox = Create();

        await Assert.ThrowsAsync<ArgumentException>(() => inbox.ApplyAsync("m2", InboxActions.Reply, " ", Ct));
    }

    [Fact]
    public async Task Unknown_action_is_rejected()
    {
        var inbox = Create();

        await Assert.ThrowsAsync<ArgumentException>(() => inbox.ApplyAsync("m1", "explode", null, Ct));
    }

    [Fact]
    public async Task Unknown_id_returns_null()
    {
        var inbox = Create();

        Assert.Null(await inbox.ApplyAsync("nope", InboxActions.Archive, null, Ct));
    }

    [Fact]
    public async Task Clear_noise_archives_only_noise()
    {
        var inbox = Create();

        var archived = await inbox.ClearNoiseAsync(Ct);

        Assert.Equal(2, archived);
        var all = await inbox.ListAsync(null, Ct);
        Assert.All(all.Where(i => i.Tag == InboxTags.Noise), i => Assert.Equal(InboxActions.Archive, i.HandledWith));
        Assert.All(all.Where(i => i.Tag != InboxTags.Noise), i => Assert.Null(i.HandledWith));
    }

    [Fact]
    public async Task A_sent_reply_cannot_be_undone()
    {
        var inbox = Create();
        await inbox.ApplyAsync("m2", InboxActions.Reply, "Hej!", Ct);

        await Assert.ThrowsAsync<InvalidOperationException>(() => inbox.UndoAsync("m2", Ct));
    }

    /// <summary>Returns whatever <see cref="Mail"/> holds right now and counts the fetches.</summary>
    private sealed class ChangingInbox : IInboxProvider
    {
        public List<InboxItem> Mail { get; set; } = [];
        public int Fetches { get; private set; }

        public Task<IReadOnlyList<InboxItem>> FetchAsync(CancellationToken cancellationToken)
        {
            Fetches++;
            return Task.FromResult<IReadOnlyList<InboxItem>>(Mail.ToList());
        }

        public Task ApplyAsync(InboxItem item, string action, string? body, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task UndoAsync(InboxItem item, string action, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private static InboxItem Mail(string id) => new(id, "Anna", DateTimeOffset.UnixEpoch, id, InboxTags.Reply, "", InboxActions.Reply, "svara", null, null);

    [Fact]
    public async Task Refetches_after_a_while_and_keeps_handled_items_that_left_the_inbox()
    {
        var time = new ManualTimeProvider(new DateTimeOffset(2026, 10, 30, 9, 0, 0, TimeSpan.Zero));
        var provider = new ChangingInbox { Mail = [Mail("a"), Mail("b")] };
        var inbox = new InboxService(provider, time);
        await inbox.ApplyAsync("a", InboxActions.Archive, null, Ct);

        provider.Mail = [Mail("b"), Mail("c")];
        await inbox.ListAsync(null, Ct);
        Assert.Equal(1, provider.Fetches);

        time.Advance(InboxService.RefreshAfter);
        var items = await inbox.ListAsync(null, Ct);

        Assert.Equal(2, provider.Fetches);
        Assert.Equal(["a", "b", "c"], items.Select(i => i.Id).Order());
        Assert.Equal(InboxActions.Archive, items.Single(i => i.Id == "a").HandledWith);
        Assert.NotNull(await inbox.UndoAsync("a", Ct));
    }

    [Fact]
    public async Task Invalidate_refetches_on_the_next_call()
    {
        var provider = new ChangingInbox { Mail = [Mail("a")] };
        var inbox = new InboxService(provider);
        await inbox.ListAsync(null, Ct);

        inbox.Invalidate();
        provider.Mail = [Mail("a"), Mail("b")];

        Assert.Equal(2, (await inbox.ListAsync(null, Ct)).Count);
    }
}
