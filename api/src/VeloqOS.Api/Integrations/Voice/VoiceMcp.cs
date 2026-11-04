using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;

namespace VeloqOS.Api.Integrations.Voice;

/// <summary>What the tools did during the reply in progress. Tools called with no reply in progress are refused.</summary>
public sealed class VoiceTurnRecorder
{
    private readonly object _lock = new();
    private List<VoiceAction>? _actions;
    private VoiceConfirm? _confirm;

    public bool Active
    {
        get { lock (_lock) return _actions is not null; }
    }

    public void Begin()
    {
        lock (_lock)
        {
            _actions = [];
            _confirm = null;
        }
    }

    public void Record(ToolOutcome outcome)
    {
        lock (_lock)
        {
            _actions?.Add(outcome.Action);
            _confirm = outcome.Confirm ?? _confirm;
        }
    }

    public (IReadOnlyList<VoiceAction> Actions, VoiceConfirm? Confirm) End()
    {
        lock (_lock)
        {
            var result = ((IReadOnlyList<VoiceAction>)(_actions ?? []), _confirm);
            _actions = null;
            _confirm = null;
            return result;
        }
    }
}

/// <summary>How the <c>claude</c> process finds the tools: this API on loopback, with a key made up at each start.</summary>
public sealed class VoiceMcpAccess(IServer server, IConfiguration configuration)
{
    public const string HeaderName = "X-Voice-Token";
    private const int FallbackPort = 7480;

    public string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

    public string Url
    {
        get
        {
            var address = server.Features.Get<IServerAddressesFeature>()?.Addresses.FirstOrDefault();
            var port = address is null ? FallbackPort : BindingAddress.Parse(address).Port;
            return $"http://127.0.0.1:{port}/api/voice/mcp";
        }
    }

    public bool Allows(string? given) =>
        given is not null && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(Token));

    /// <summary>The <c>--mcp-config</c> file's content. Only this server, and the API key when one is required.</summary>
    public string Config()
    {
        var headers = new JsonObject { [HeaderName] = Token };
        var key = configuration["Auth:ApiKey"];
        if (!string.IsNullOrEmpty(key)) headers[ApiKeyMiddleware.HeaderName] = key;
        return new JsonObject
        {
            ["mcpServers"] = new JsonObject
            {
                [VoiceMcpServer.Name] = new JsonObject { ["type"] = "http", ["url"] = Url, ["headers"] = headers },
            },
        }.ToJsonString();
    }
}

/// <summary>
/// <see cref="VoiceToolbox"/> as an MCP server (JSON-RPC over HTTP), so Claude Code can use the same tools as the
/// Claude API does. The little of the protocol that tools need: no sessions, no streams.
/// </summary>
public sealed class VoiceMcpServer(VoiceToolbox tools, VoiceTurnRecorder recorder)
{
    public const string Name = "veloq";
    private const string ProtocolVersion = "2025-06-18";
    private const int MethodNotFound = -32601;

    private static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    /// <summary>The answer, or null for a notification, which gets none.</summary>
    public async Task<JsonObject?> HandleAsync(JsonElement call, CancellationToken ct)
    {
        var method = call.TryGetProperty("method", out var m) ? m.GetString() : null;
        if (!call.TryGetProperty("id", out var id)) return null;

        var result = method switch
        {
            "initialize" => Initialize(call),
            "ping" => new JsonObject(),
            "tools/list" => ListTools(),
            "tools/call" => await CallToolAsync(call, ct),
            _ => null,
        };
        var answer = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = JsonNode.Parse(id.GetRawText()) };
        if (result is null) answer["error"] = new JsonObject { ["code"] = MethodNotFound, ["message"] = $"Okänd metod: {method}" };
        else answer["result"] = result;
        return answer;
    }

    private static JsonObject Initialize(JsonElement call) => new()
    {
        ["protocolVersion"] = call.TryGetProperty("params", out var p) && p.TryGetProperty("protocolVersion", out var v) ? v.GetString() : ProtocolVersion,
        ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
        ["serverInfo"] = new JsonObject { ["name"] = Name, ["version"] = "1.0" },
    };

    private JsonObject ListTools()
    {
        var list = new JsonArray();
        foreach (var tool in tools.Tools())
        {
            list.Add(new JsonObject
            {
                ["name"] = tool.Name,
                ["description"] = tool.Description,
                ["inputSchema"] = JsonSerializer.SerializeToNode(tool.InputSchema, Json),
            });
        }
        return new JsonObject { ["tools"] = list };
    }

    private async Task<JsonObject> CallToolAsync(JsonElement call, CancellationToken ct)
    {
        if (!recorder.Active) return ToolResult("Inget samtal pågår.", isError: true);
        var parameters = call.GetProperty("params");
        var input = parameters.TryGetProperty("arguments", out var a) ? a : default;
        var outcome = await tools.RunAsync(parameters.GetProperty("name").GetString()!, input, ct);
        recorder.Record(outcome);
        return ToolResult(outcome.Content, !outcome.Action.Ok);
    }

    private static JsonObject ToolResult(string text, bool isError) => new()
    {
        ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = text }),
        ["isError"] = isError,
    };
}
