namespace VeloqOS.Api.Integrations;

/// <summary>Talks to the model. Swap <see cref="EchoAgent"/> for a Claude implementation.</summary>
public interface IAgent
{
    Task<string> ReplyAsync(string text, string? context, CancellationToken cancellationToken);
}

/// <summary>Placeholder that answers plan-first without calling any model.</summary>
public sealed class EchoAgent : IAgent
{
    public Task<string> ReplyAsync(string text, string? context, CancellationToken cancellationToken)
    {
        var scope = string.IsNullOrWhiteSpace(context) ? "det här" : context.Trim();
        var reply =
            $"Uppfattat. Jag gör en plan för {scope} först och frågar innan jag bygger något.\n\n" +
            "– Läser relevanta CLAUDE.md och minnesfiler\n" +
            "– Föreslår steg med tester till varje\n" +
            "– Väntar på ditt ok innan jag ändrar något";
        return Task.FromResult(reply);
    }
}
