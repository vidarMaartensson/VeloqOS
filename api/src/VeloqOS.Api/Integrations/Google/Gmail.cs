using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VeloqOS.Api.Integrations.Google;

/// <summary>The parts of a Gmail message (format=metadata) that Veloq OS uses.</summary>
public sealed record GmailMessage(
    string Id,
    string ThreadId,
    IReadOnlySet<string> Labels,
    string FromName,
    string FromAddress,
    string Subject,
    string Snippet,
    DateTimeOffset ReceivedAt,
    IReadOnlyDictionary<string, string> Headers)
{
    public static readonly string[] HeaderNames = ["From", "Subject", "Reply-To", "Message-ID", "References", "List-Unsubscribe"];

    public static GmailMessage Parse(JsonElement json)
    {
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (json.TryGetProperty("payload", out var payload) && payload.TryGetProperty("headers", out var list))
            foreach (var h in list.EnumerateArray())
                headers.TryAdd(h.GetProperty("name").GetString()!, h.GetProperty("value").GetString() ?? "");

        var (name, address) = ParseAddress(headers.GetValueOrDefault("From", ""));
        var labels = json.TryGetProperty("labelIds", out var ids)
            ? ids.EnumerateArray().Select(l => l.GetString()!).ToHashSet()
            : [];
        var millis = long.Parse(json.GetProperty("internalDate").GetString()!, System.Globalization.CultureInfo.InvariantCulture);

        return new GmailMessage(
            json.GetProperty("id").GetString()!,
            json.GetProperty("threadId").GetString()!,
            labels,
            name,
            address,
            headers.GetValueOrDefault("Subject", "").Trim() is { Length: > 0 } subject ? subject : "(utan ämne)",
            WebUtility.HtmlDecode(json.TryGetProperty("snippet", out var snippet) ? snippet.GetString() ?? "" : ""),
            DateTimeOffset.FromUnixTimeMilliseconds(millis),
            headers);
    }

    /// <returns>Display name (falls back to the address) and address.</returns>
    internal static (string Name, string Address) ParseAddress(string header)
    {
        if (MailAddress.TryCreate(header, out var mail))
            return (string.IsNullOrWhiteSpace(mail.DisplayName) ? mail.Address : mail.DisplayName.Trim('"', ' '), mail.Address);
        return (header.Trim(), header.Trim());
    }
}

/// <summary>Sorts mail into Åtgärd, Svar, Info and Brus with plain rules until Claude does it.</summary>
public static partial class GmailClassifier
{
    public sealed record Result(string Tag, string SuggestedAction, string Suggestion, string? Draft);

    private static readonly string[] NoiseCategories = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"];

    [GeneratedRegex(@"^(no-?reply|do-?not-?reply|notifications?|notify|alerts?|mailer-daemon|bounces?|info|news(letter)?)([+.\-]|@)", RegexOptions.IgnoreCase)]
    private static partial Regex AutomatedSender();

    [GeneratedRegex(@"\b(failed|failure|misslyckades|error|fel|action required|åtgärd krävs|requires? your attention|security alert|säkerhetsvarning|expir\w*|går ut|förfaller|payment failed|betalning)\b", RegexOptions.IgnoreCase)]
    private static partial Regex NeedsAction();

    public static Result Classify(GmailMessage message)
    {
        var important = message.Labels.Contains("IMPORTANT");
        var automated = AutomatedSender().IsMatch(message.FromAddress);

        if (message.Labels.Overlaps(NoiseCategories) || (message.Headers.ContainsKey("List-Unsubscribe") && !important && !NeedsAction().IsMatch(message.Subject)))
            return new Result(InboxTags.Noise, InboxActions.Archive, "arkivera", null);

        if (automated || message.Labels.Contains("CATEGORY_UPDATES"))
        {
            return NeedsAction().IsMatch(message.Subject)
                ? new Result(InboxTags.Action, InboxActions.Task, "gör till uppgift", null)
                : new Result(InboxTags.Info, InboxActions.Archive, "arkivera", null);
        }

        var firstName = message.FromName.Contains('@') ? null : message.FromName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        var greeting = firstName is null ? "Hej," : $"Hej {firstName},";
        return new Result(InboxTags.Reply, InboxActions.Reply, "svara", $"{greeting}\n\n");
    }
}

/// <summary>Builds the RFC 2822 reply that Gmail's messages.send takes as base64url "raw".</summary>
public static class GmailReply
{
    public static string BuildRaw(GmailMessage original, string body)
    {
        var to = original.Headers.GetValueOrDefault("Reply-To") is { Length: > 0 } replyTo ? replyTo : original.Headers.GetValueOrDefault("From", original.FromAddress);
        var subject = original.Subject.StartsWith("Re:", StringComparison.OrdinalIgnoreCase) ? original.Subject : $"Re: {original.Subject}";
        var messageId = original.Headers.GetValueOrDefault("Message-ID");
        var references = string.Join(' ', new[] { original.Headers.GetValueOrDefault("References"), messageId }.Where(s => !string.IsNullOrWhiteSpace(s)));

        var mime = new StringBuilder();
        mime.Append("To: ").Append(StripNewlines(to)).Append("\r\n");
        mime.Append("Subject: ").Append(EncodeHeader(subject)).Append("\r\n");
        if (!string.IsNullOrWhiteSpace(messageId)) mime.Append("In-Reply-To: ").Append(StripNewlines(messageId)).Append("\r\n");
        if (references.Length > 0) mime.Append("References: ").Append(StripNewlines(references)).Append("\r\n");
        mime.Append("MIME-Version: 1.0\r\n");
        mime.Append("Content-Type: text/plain; charset=\"UTF-8\"\r\n");
        mime.Append("Content-Transfer-Encoding: base64\r\n\r\n");
        mime.Append(Convert.ToBase64String(Encoding.UTF8.GetBytes(body.Replace("\r\n", "\n").Replace("\n", "\r\n")), Base64FormattingOptions.InsertLineBreaks));

        return Convert.ToBase64String(Encoding.UTF8.GetBytes(mime.ToString())).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string EncodeHeader(string value) =>
        value.All(c => c < 128) ? StripNewlines(value) : $"=?UTF-8?B?{Convert.ToBase64String(Encoding.UTF8.GetBytes(StripNewlines(value)))}?=";

    private static string StripNewlines(string value) => value.Replace("\r", " ").Replace("\n", " ");
}
