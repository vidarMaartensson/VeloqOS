using System.Net.Http.Json;
using System.Text.Json;

namespace VeloqOS.Api.Integrations.Linear;

/// <summary>Linear's GraphQL API for the one workspace a personal API key belongs to.</summary>
public sealed class LinearClient(string apiKey, IHttpClientFactory http)
{
    private const string StateFields = "id name type color";

    private const string IssueFields =
        $"id identifier title description priority url updatedAt state {{ {StateFields} }} assignee {{ displayName }}";

    public async Task<(string Id, string Name)> OrganizationAsync(CancellationToken cancellationToken)
    {
        var data = await QueryAsync("query { viewer { organization { id name } } }", null, cancellationToken);
        return Organization(data);
    }

    /// <summary>The workspace's teams, labelled with the workspace, in one request.</summary>
    public async Task<IReadOnlyList<LinearTeam>> TeamsAsync(CancellationToken cancellationToken)
    {
        var data = await QueryAsync(
            $"query {{ viewer {{ organization {{ id name }} }} teams(first: 50) {{ nodes {{ id key name states {{ nodes {{ {StateFields} position }} }} }} }} }}",
            null,
            cancellationToken);
        var (orgId, orgName) = Organization(data);
        return data.GetProperty("teams").GetProperty("nodes").EnumerateArray()
            .Select(t => new LinearTeam(
                t.GetProperty("id").GetString()!,
                t.GetProperty("key").GetString()!,
                t.GetProperty("name").GetString()!,
                orgId,
                orgName,
                t.GetProperty("states").GetProperty("nodes").EnumerateArray()
                    .OrderBy(s => s.GetProperty("position").GetDouble())
                    .Select(State)
                    .ToList()))
            .ToList();
    }

    public async Task<IReadOnlyList<LinearIssue>> IssuesAsync(string teamId, bool open, CancellationToken cancellationToken)
    {
        object filter = open
            ? new { team = new { id = new { eq = teamId } }, state = new { type = new { nin = new[] { "completed", "canceled" } } } }
            : new { team = new { id = new { eq = teamId } } };
        var data = await QueryAsync(
            $"query($filter: IssueFilter) {{ issues(first: 100, filter: $filter, orderBy: updatedAt) {{ nodes {{ {IssueFields} }} }} }}",
            new { filter },
            cancellationToken);
        return data.GetProperty("issues").GetProperty("nodes").EnumerateArray()
            .Select(Issue)
            .OrderByDescending(i => i.UpdatedAt)
            .ToList();
    }

    public async Task<LinearIssue> CreateAsync(NewLinearIssue issue, CancellationToken cancellationToken)
    {
        var input = new Dictionary<string, object?> { ["teamId"] = issue.TeamId, ["title"] = issue.Title };
        if (!string.IsNullOrWhiteSpace(issue.Description)) input["description"] = issue.Description;
        if (issue.Priority is { } priority) input["priority"] = priority;
        if (!string.IsNullOrWhiteSpace(issue.StateId)) input["stateId"] = issue.StateId;

        var data = await QueryAsync(
            $"mutation($input: IssueCreateInput!) {{ issueCreate(input: $input) {{ success issue {{ {IssueFields} }} }} }}",
            new { input },
            cancellationToken);
        var result = data.GetProperty("issueCreate");
        if (!result.GetProperty("success").GetBoolean()) throw new LinearApiException("Linear skapade inte storyn.");
        return Issue(result.GetProperty("issue"));
    }

    /// <summary>Null when this workspace has no such story.</summary>
    public async Task<LinearIssue?> MoveAsync(string issueId, string stateId, CancellationToken cancellationToken)
    {
        var data = await QueryAsync(
            $"mutation($id: String!, $input: IssueUpdateInput!) {{ issueUpdate(id: $id, input: $input) {{ success issue {{ {IssueFields} }} }} }}",
            new { id = issueId, input = new { stateId } },
            cancellationToken);
        var result = data.GetProperty("issueUpdate");
        return result.GetProperty("success").GetBoolean() ? Issue(result.GetProperty("issue")) : null;
    }

    private async Task<JsonElement> QueryAsync(string query, object? variables, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, LinearProvider.Endpoint)
        {
            Content = JsonContent.Create(new { query, variables }),
        };
        // Personal API keys go in the header as they are, without "Bearer".
        request.Headers.TryAddWithoutValidation("Authorization", apiKey);

        using var response = await http.CreateClient(LinearProvider.HttpClientName).SendAsync(request, cancellationToken);
        JsonElement root;
        try
        {
            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            root = doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            throw new LinearApiException($"Linear svarade {(int)response.StatusCode}.");
        }

        if (root.TryGetProperty("errors", out var errors) && errors.GetArrayLength() > 0)
            throw new LinearApiException($"Linear: {errors[0].GetProperty("message").GetString()}");
        if (!response.IsSuccessStatusCode)
            throw new LinearApiException($"Linear svarade {(int)response.StatusCode}.");
        return root.GetProperty("data");
    }

    private static (string Id, string Name) Organization(JsonElement data)
    {
        var org = data.GetProperty("viewer").GetProperty("organization");
        return (org.GetProperty("id").GetString()!, org.GetProperty("name").GetString()!);
    }

    private static LinearState State(JsonElement s) => new(
        s.GetProperty("id").GetString()!,
        s.GetProperty("name").GetString()!,
        s.GetProperty("type").GetString()!,
        s.GetProperty("color").GetString()!);

    private static LinearIssue Issue(JsonElement i)
    {
        var priority = (int)i.GetProperty("priority").GetDouble();
        var assignee = i.GetProperty("assignee");
        return new LinearIssue(
            i.GetProperty("id").GetString()!,
            i.GetProperty("identifier").GetString()!,
            i.GetProperty("title").GetString()!,
            i.GetProperty("description").GetString(),
            priority,
            LinearPriority.Label(priority),
            i.GetProperty("url").GetString()!,
            State(i.GetProperty("state")),
            assignee.ValueKind == JsonValueKind.Object ? assignee.GetProperty("displayName").GetString() : null,
            i.GetProperty("updatedAt").GetDateTimeOffset());
    }
}
