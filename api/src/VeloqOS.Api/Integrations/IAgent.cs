namespace VeloqOS.Api.Integrations;

/// <summary>
/// One turn in a chat. <c>WorkingDirectory</c> is set in code mode; <c>SessionId</c> continues an earlier chat.
/// <c>PermissionMode</c> overrides <c>Claude:CodePermissionMode</c>, for chores. <c>Tools</c> gives chat mode
/// exactly these tools, allowed without asking (artifact sync uses <c>Artifact</c>).
/// </summary>
public sealed record AgentRequest(
    string Text,
    string? Context,
    string Mode,
    string? WorkingDirectory,
    string? SessionId,
    string? PermissionMode = null,
    IReadOnlyList<string>? Tools = null);

/// <summary>The values of <see cref="AgentRequest.Mode"/>: chat without tools, or Claude Code with tools in a folder.</summary>
public static class AgentModes
{
    public const string Chat = "chat";
    public const string Code = "code";
}

public sealed record AgentReply(string Text, string? SessionId);

/// <summary>The model answered with an error, or did not answer in time.</summary>
public sealed class AgentException(string message, bool timedOut = false) : Exception(message)
{
    public bool TimedOut { get; } = timedOut;
}

/// <summary>Talks to the model. <see cref="Claude.ClaudeCodeAgent"/> when Claude Code is installed, otherwise <see cref="EchoAgent"/>.</summary>
public interface IAgent
{
    Task<AgentReply> ReplyAsync(AgentRequest request, CancellationToken cancellationToken);

    /// <summary>Like <see cref="ReplyAsync"/>, handing the text to <paramref name="onDelta"/> piece by piece as it is written.</summary>
    Task<AgentReply> StreamAsync(AgentRequest request, Func<string, Task> onDelta, CancellationToken cancellationToken);
}

/// <summary>Placeholder that answers plan-first without calling any model.</summary>
public sealed class EchoAgent : IAgent
{
    public Task<AgentReply> ReplyAsync(AgentRequest request, CancellationToken cancellationToken)
    {
        var scope = string.IsNullOrWhiteSpace(request.Context) ? "det här" : request.Context.Trim();
        var reply =
            $"Uppfattat. Jag gör en plan för {scope} först och frågar innan jag bygger något.\n\n" +
            "– Läser relevanta CLAUDE.md och minnesfiler\n" +
            "– Föreslår steg med tester till varje\n" +
            "– Väntar på ditt ok innan jag ändrar något";
        return Task.FromResult(new AgentReply(reply, request.SessionId ?? Guid.NewGuid().ToString()));
    }

    /// <summary>The same answer, a word at a time.</summary>
    public async Task<AgentReply> StreamAsync(AgentRequest request, Func<string, Task> onDelta, CancellationToken cancellationToken)
    {
        var reply = await ReplyAsync(request, cancellationToken);
        foreach (var word in System.Text.RegularExpressions.Regex.Split(reply.Text, @"(?<=\s)"))
            if (word.Length > 0) await onDelta(word);
        return reply;
    }
}
