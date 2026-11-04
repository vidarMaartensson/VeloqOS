using System.Text;
using System.Text.Json;
using VeloqOS.Api.Integrations.Google;

namespace VeloqOS.Api.Tests;

public class GmailTests
{
    private const string Gmail = "https://gmail.googleapis.com/gmail/v1/users/me";
    private static readonly CancellationToken Ct = CancellationToken.None;

    private readonly ManualTimeProvider _time = new(new DateTimeOffset(2026, 10, 30, 9, 0, 0, TimeSpan.Zero));
    private readonly FakeGoogle _google = new();

    private static object Message(
        string id, string from, string subject, string[]? labels = null, string snippet = "Hej &amp; tack",
        Dictionary<string, string>? extraHeaders = null)
    {
        var headers = new List<object> { new { name = "From", value = from }, new { name = "Subject", value = subject }, new { name = "Message-ID", value = $"<{id}@mail>" } };
        foreach (var (name, value) in extraHeaders ?? []) headers.Add(new { name, value });
        return new
        {
            id,
            threadId = $"t-{id}",
            labelIds = labels ?? ["INBOX", "CATEGORY_PERSONAL"],
            snippet,
            internalDate = "1793350800000",
            payload = new { headers },
        };
    }

    private static GmailMessage Parse(object message) => GmailMessage.Parse(JsonSerializer.SerializeToElement(message));

    [Fact]
    public void Parses_sender_subject_snippet_and_time()
    {
        var m = Parse(Message("m1", "\"Anna Svensson\" <anna@example.com>", "Middag?"));

        Assert.Equal("Anna Svensson", m.FromName);
        Assert.Equal("anna@example.com", m.FromAddress);
        Assert.Equal("Middag?", m.Subject);
        Assert.Equal("Hej & tack", m.Snippet);
        Assert.Equal("t-m1", m.ThreadId);
        Assert.Equal(DateTimeOffset.FromUnixTimeMilliseconds(1793350800000), m.ReceivedAt);
    }

    [Theory]
    [InlineData("anna@example.com", "Middag?", new[] { "INBOX", "CATEGORY_PERSONAL" }, "Svar")]
    [InlineData("deals@shop.se", "Rea!", new[] { "INBOX", "CATEGORY_PROMOTIONS" }, "Brus")]
    [InlineData("noreply@github.com", "Run failed: CI - main", new[] { "INBOX", "CATEGORY_UPDATES" }, "Åtgärd")]
    [InlineData("notifications@github.com", "[repo] New comment", new[] { "INBOX" }, "Info")]
    [InlineData("no-reply@play.google.com", "Granskningen är klar", new[] { "INBOX", "CATEGORY_UPDATES" }, "Info")]
    public void Sorts_mail_into_tags(string from, string subject, string[] labels, string tag)
    {
        Assert.Equal(tag, GmailClassifier.Classify(Parse(Message("m", from, subject, labels))).Tag);
    }

    [Fact]
    public void Newsletters_with_unsubscribe_links_are_noise_unless_important()
    {
        var unsubscribe = new Dictionary<string, string> { ["List-Unsubscribe"] = "<mailto:u@news.se>" };

        Assert.Equal("Brus", GmailClassifier.Classify(Parse(Message("m", "Nyheter <hej@news.se>", "Veckans", extraHeaders: unsubscribe))).Tag);
        Assert.NotEqual("Brus", GmailClassifier.Classify(Parse(Message("m", "Nyheter <hej@news.se>", "Veckans", ["INBOX", "IMPORTANT"], extraHeaders: unsubscribe))).Tag);
    }

    [Fact]
    public void Personal_mail_gets_a_reply_draft_with_the_first_name()
    {
        var result = GmailClassifier.Classify(Parse(Message("m", "Anna Svensson <anna@example.com>", "Middag?")));

        Assert.Equal("reply", result.SuggestedAction);
        Assert.StartsWith("Hej Anna,", result.Draft);
    }

    [Fact]
    public void Reply_goes_to_reply_to_in_the_same_thread_with_encoded_subject_and_body()
    {
        var original = Parse(Message("m1", "Anna <anna@example.com>", "Fråga om mötet",
            extraHeaders: new() { ["Reply-To"] = "kontor@example.com", ["References"] = "<m0@mail>" }));

        var raw = GmailReply.BuildRaw(original, "Hej Anna,\nJa, det går bra.");
        var mime = Encoding.UTF8.GetString(Convert.FromBase64String(raw.Replace('-', '+').Replace('_', '/').PadRight(raw.Length + (4 - raw.Length % 4) % 4, '=')));

        Assert.Contains("To: kontor@example.com\r\n", mime);
        Assert.Contains("In-Reply-To: <m1@mail>\r\n", mime);
        Assert.Contains("References: <m0@mail> <m1@mail>\r\n", mime);
        var subject = mime.Split("\r\n").Single(l => l.StartsWith("Subject: ")).Split("?B?")[1].TrimEnd('?', '=');
        Assert.Equal("Re: Fråga om mötet", Encoding.UTF8.GetString(Convert.FromBase64String(subject.PadRight(subject.Length + (4 - subject.Length % 4) % 4, '='))));
        var body = mime.Split("\r\n\r\n", 2)[1];
        Assert.Equal("Hej Anna,\r\nJa, det går bra.", Encoding.UTF8.GetString(Convert.FromBase64String(body.Replace("\r\n", ""))));
    }

    private GmailInboxProvider Provider()
    {
        var auth = _google.SignedIn(_time);
        return new GmailInboxProvider(auth, new GoogleClient(auth, _google));
    }

    [Fact]
    public async Task Fetches_the_inbox_as_inbox_items()
    {
        _google.On(HttpMethod.Get, $"{Gmail}/messages?", new { messages = new[] { new { id = "m1" }, new { id = "m2" } } })
            .On(HttpMethod.Get, $"{Gmail}/messages/m1?", Message("m1", "Anna <anna@example.com>", "Middag?"))
            .On(HttpMethod.Get, $"{Gmail}/messages/m2?", Message("m2", "deals@shop.se", "Rea!", ["INBOX", "CATEGORY_PROMOTIONS"]));

        var items = await Provider().FetchAsync(Ct);

        Assert.Equal(["m1", "m2"], items.Select(i => i.Id));
        Assert.Equal("Anna", items[0].From);
        Assert.Equal("Svar", items[0].Tag);
        Assert.Equal("Brus", items[1].Tag);
        Assert.All(_google.Requests, r => Assert.Equal(HttpMethod.Get, r.Method));
    }

    [Fact]
    public async Task Is_empty_until_google_is_connected()
    {
        var auth = _google.Auth(_time, out _);

        Assert.Empty(await new GmailInboxProvider(auth, new GoogleClient(auth, _google)).FetchAsync(Ct));
        Assert.Empty(_google.Requests);
    }

    private static InboxItem Item(string id) => new(id, "Anna", DateTimeOffset.UnixEpoch, "Middag?", "Svar", "", "reply", "svara", null, null);

    [Fact]
    public async Task Archive_and_its_undo_move_the_inbox_label()
    {
        _google.On(HttpMethod.Post, $"{Gmail}/messages/m1/modify", new { id = "m1" });
        var provider = Provider();

        await provider.ApplyAsync(Item("m1"), "archive", null, Ct);
        await provider.UndoAsync(Item("m1"), "archive", Ct);

        var bodies = _google.BodiesOf(HttpMethod.Post, $"{Gmail}/messages/m1/modify").ToList();
        Assert.Equal("""{"addLabelIds":[],"removeLabelIds":["INBOX"]}""", bodies[0]);
        Assert.Equal("""{"addLabelIds":["INBOX"],"removeLabelIds":[]}""", bodies[1]);
    }

    [Fact]
    public async Task Reply_sends_in_the_thread_and_cannot_be_undone()
    {
        _google.On(HttpMethod.Get, $"{Gmail}/messages/m1?", Message("m1", "Anna <anna@example.com>", "Middag?"))
            .On(HttpMethod.Post, $"{Gmail}/messages/send", new { id = "sent-1" });
        var provider = Provider();

        await provider.ApplyAsync(Item("m1"), "reply", "Gärna!", Ct);

        using var sent = JsonDocument.Parse(_google.BodiesOf(HttpMethod.Post, $"{Gmail}/messages/send").Single());
        Assert.Equal("t-m1", sent.RootElement.GetProperty("threadId").GetString());
        Assert.False(string.IsNullOrEmpty(sent.RootElement.GetProperty("raw").GetString()));
        await Assert.ThrowsAsync<InvalidOperationException>(() => provider.UndoAsync(Item("m1"), "reply", Ct));
    }

    [Fact]
    public async Task Task_creates_the_veloq_label_once_and_reuses_it()
    {
        _google.On(HttpMethod.Get, $"{Gmail}/labels", new { labels = new[] { new { id = "INBOX", name = "INBOX" } } })
            .On(HttpMethod.Post, $"{Gmail}/labels", new { id = "Label_9", name = "Veloq/Uppgift" })
            .On(HttpMethod.Post, $"{Gmail}/messages/", new { id = "x" });
        var provider = Provider();

        await provider.ApplyAsync(Item("m1"), "task", null, Ct);
        await provider.ApplyAsync(Item("m2"), "task", null, Ct);

        Assert.Contains("\"name\":\"Veloq/Uppgift\"", _google.BodiesOf(HttpMethod.Post, $"{Gmail}/labels").Single());
        Assert.Equal("""{"addLabelIds":["Label_9"],"removeLabelIds":[]}""", _google.BodiesOf(HttpMethod.Post, $"{Gmail}/messages/m2/modify").Single());
    }
}
