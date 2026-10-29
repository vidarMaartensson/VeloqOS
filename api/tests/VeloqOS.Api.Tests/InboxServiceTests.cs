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
}
