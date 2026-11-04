using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace VeloqOS.Api.Integrations.Voice;

/// <summary>
/// The voice through the Claude API (not Claude Code, which is too slow to start for a spoken reply):
/// one Messages call per step, running the tools Claude asks for until it answers in words.
/// </summary>
public sealed class ClaudeVoiceAgent(VoiceToolbox tools, IHttpClientFactory http, IOptions<VoiceOptions> options) : IVoiceAgent
{
    public const string HttpClientName = "anthropic";
    public const string Endpoint = "https://api.anthropic.com/v1/messages";

    /// <summary>Tool rounds before the agent gives up and says so.</summary>
    public const int MaxSteps = 6;

    private const int MaxHistory = 20;

    public string Name => "claude";

    public async Task<VoiceTurn> TurnAsync(VoiceTurnRequest request, CancellationToken cancellationToken)
    {
        var persona = request.Persona ?? new VoicePersona();
        var messages = new JsonArray();
        foreach (var line in (request.History ?? []).TakeLast(MaxHistory).Where(l => !string.IsNullOrWhiteSpace(l.Text)))
            Append(messages, line.Role == "assistant" ? "assistant" : "user", JsonValue.Create(line.Text));
        Append(messages, "user", JsonValue.Create(request.Text!.Trim()));

        var definitions = tools.Tools().Select(t => new { name = t.Name, description = t.Description, input_schema = t.InputSchema }).ToList();
        var system = VoicePersonas.SystemPrompt(persona, tools.LocalNow, tools.Zone);
        var actions = new List<VoiceAction>();
        VoiceConfirm? confirm = null;

        for (var step = 0; step < MaxSteps; step++)
        {
            var response = await SendAsync(new
            {
                model = options.Value.Model,
                max_tokens = 1024,
                system,
                tools = definitions,
                messages,
            }, cancellationToken);

            var content = response.GetProperty("content");
            var uses = content.EnumerateArray().Where(b => b.GetProperty("type").GetString() == "tool_use").ToList();
            if (response.GetProperty("stop_reason").GetString() != "tool_use" || uses.Count == 0)
                return new VoiceTurn(TextOf(content), actions, confirm);

            messages.Add(new JsonObject { ["role"] = "assistant", ["content"] = JsonNode.Parse(content.GetRawText()) });
            var results = new JsonArray();
            foreach (var use in uses)
            {
                var outcome = await tools.RunAsync(use.GetProperty("name").GetString()!, use.GetProperty("input"), cancellationToken);
                actions.Add(outcome.Action);
                confirm = outcome.Confirm ?? confirm;
                results.Add(new JsonObject
                {
                    ["type"] = "tool_result",
                    ["tool_use_id"] = use.GetProperty("id").GetString(),
                    ["content"] = outcome.Content,
                    ["is_error"] = !outcome.Action.Ok,
                });
            }
            messages.Add(new JsonObject { ["role"] = "user", ["content"] = results });
        }

        return new VoiceTurn("Det där krävde för många steg. Fråga en sak i taget.", actions, confirm);
    }

    /// <summary>Keeps roles alternating: two lines in a row from the same side are merged.</summary>
    private static void Append(JsonArray messages, string role, JsonNode? text)
    {
        if (messages.Count > 0 && messages[^1]!["role"]!.GetValue<string>() == role && messages[^1]!["content"] is JsonValue earlier)
        {
            messages[^1]!["content"] = $"{earlier.GetValue<string>()}\n{text!.GetValue<string>()}";
            return;
        }
        // The Messages API wants the first message from the user.
        if (messages.Count == 0 && role == "assistant") return;
        messages.Add(new JsonObject { ["role"] = role, ["content"] = text });
    }

    private static string TextOf(JsonElement content) =>
        string.Join(" ", content.EnumerateArray()
            .Where(b => b.GetProperty("type").GetString() == "text")
            .Select(b => b.GetProperty("text").GetString()!.Trim())).Trim();

    private async Task<JsonElement> SendAsync(object body, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint) { Content = JsonContent.Create(body) };
        request.Headers.Add("x-api-key", options.Value.AnthropicApiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        HttpResponseMessage response;
        try
        {
            response = await http.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new VoiceException("Claude svarade inte i tid.", timedOut: true);
        }
        catch (HttpRequestException e)
        {
            throw new VoiceException($"Kunde inte nå Claude: {e.Message}");
        }

        using (response)
        {
            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var message = doc.RootElement.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var m) ? m.GetString() : null;
                throw new VoiceException($"Claude svarade {(int)response.StatusCode}{(message is null ? "" : $": {message}")}");
            }
            return doc.RootElement.Clone();
        }
    }
}
