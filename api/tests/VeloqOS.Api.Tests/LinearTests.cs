using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Linear;

namespace VeloqOS.Api.Tests;

/// <summary>
/// The GraphQL calls against a fake Linear with two workspaces, told apart by the key in the
/// Authorization header (FakeGoogle answers any HTTP).
/// </summary>
public class LinearProviderTests
{
    private const string Veloq = "lin_api_veloq";
    private const string Jobb = "lin_api_jobb";

    private readonly FakeGoogle _http = new();
    private readonly Dictionary<string, Func<string, object>> _workspaces = [];
    private readonly List<(string Key, string Body)> _calls = [];

    public LinearProviderTests()
    {
        _http.On(HttpMethod.Post, LinearProvider.Endpoint, (request, body) =>
        {
            var key = request.Headers.GetValues("Authorization").Single();
            _calls.Add((key, body));
            return _workspaces.TryGetValue(key, out var answer)
                ? FakeGoogle.Json(answer(body))
                : FakeGoogle.Json(new { errors = new[] { new { message = "Authentication required" } } }, HttpStatusCode.BadRequest);
        });
        Workspace(Veloq, "w-veloq", "Veloq Labs", ("t-veloq", "VEL", "Veloq"), ("t-halo", "HAL", "Halo"));
        Workspace(Jobb, "w-jobb", "Jobbet", ("t-plattform", "PLA", "Plattform"));
    }

    private void Workspace(string key, string id, string name, params (string Id, string Key, string Name)[] teams) =>
        _workspaces[key] = body =>
        {
            var query = JsonDocument.Parse(body).RootElement.GetProperty("query").GetString()!;
            var organization = new { id, name };
            if (query.Contains("issueUpdate"))
                return body.Contains($"\"id\":\"id-{teams[0].Key}-1\"")
                    ? new { data = new { issueUpdate = new { success = true, issue = Issue($"{teams[0].Key}-1", "2026-10-31T12:00:00Z", "completed") } } }
                    : new { errors = new[] { new { message = "Entity not found: Issue" } } };
            if (query.Contains("issueCreate"))
                return new { data = new { issueCreate = new { success = true, issue = Issue($"{teams[0].Key}-9", "2026-10-30T12:00:00Z", "unstarted") } } };
            if (query.Contains("issues("))
                return new { data = new { issues = new { nodes = new[] { Issue($"{teams[0].Key}-1", "2026-10-29T10:00:00Z"), Issue($"{teams[0].Key}-2", "2026-10-30T10:00:00Z", assignee: new { displayName = "Vidar" }) } } } };
            if (query.Contains("teams("))
                return new
                {
                    data = new
                    {
                        viewer = new { organization },
                        teams = new
                        {
                            nodes = teams.Select(t => new
                            {
                                id = t.Id, key = t.Key, name = t.Name,
                                states = new
                                {
                                    nodes = new[]
                                    {
                                        new { id = $"{t.Id}-done", name = "Done", type = "completed", color = "#5e6ad2", position = 3.0 },
                                        new { id = $"{t.Id}-todo", name = "Todo", type = "unstarted", color = "#e2e2e2", position = 1.0 },
                                    },
                                },
                            }),
                        },
                    },
                };
            return new { data = new { viewer = new { organization } } };
        };

    private LinearProvider Provider(params string[] keys) =>
        new(Options.Create(new LinearOptions { ApiKeys = [.. keys] }), _http);

    private static object Issue(string identifier, string updatedAt, string stateType = "started", object? assignee = null) => new
    {
        id = $"id-{identifier}", identifier, title = $"Story {identifier}", description = (string?)null, priority = 2.0,
        url = $"https://linear.app/x/issue/{identifier}", updatedAt,
        state = new { id = "s1", name = "In Progress", type = stateType, color = "#f2c94c" },
        assignee,
    };

    private JsonElement Variables(int call) => JsonDocument.Parse(_calls[call].Body).RootElement.GetProperty("variables");

    [Fact]
    public void Collects_keys_from_the_list_and_the_single_key()
    {
        var options = new LinearOptions { ApiKey = "c", ApiKeys = ["a", " ", "b", "a"] };

        Assert.Equal(["a", "b", "c"], options.Keys);
        Assert.False(new LinearOptions().Configured);
    }

    [Fact]
    public async Task Moves_a_story_through_the_workspace_that_knows_it()
    {
        var moved = await Provider(Veloq, Jobb).MoveAsync("id-PLA-1", "t-plattform-done", default);

        Assert.Equal("PLA-1", moved!.Identifier);
        Assert.Equal("completed", moved.State.Type);
        Assert.Contains("issueUpdate", _calls[^1].Body);
        Assert.Equal("t-plattform-done", Variables(_calls.Count - 1).GetProperty("input").GetProperty("stateId").GetString());
        Assert.Null(await Provider(Veloq, Jobb).MoveAsync("id-NOPE-1", "s", default));
    }

    [Fact]
    public async Task Lists_every_workspace_and_marks_one_that_does_not_answer()
    {
        var workspaces = await Provider(Veloq, "lin_api_fel", Jobb).WorkspacesAsync(default);

        Assert.Equal(
            [
                new LinearWorkspace("w-veloq", "Veloq Labs", null),
                new LinearWorkspace("key-2", "Nyckel 2", "Linear: Authentication required"),
                new LinearWorkspace("w-jobb", "Jobbet", null),
            ],
            workspaces);
    }

    [Fact]
    public async Task Merges_teams_in_key_order_with_their_workspace_and_states()
    {
        var teams = await Provider(Veloq, Jobb).TeamsAsync(default);

        Assert.Equal(["Halo", "Veloq", "Plattform"], teams.Select(t => t.Name));
        Assert.Equal(["Veloq Labs", "Veloq Labs", "Jobbet"], teams.Select(t => t.Workspace));
        Assert.Equal("w-jobb", teams[2].WorkspaceId);
        Assert.Equal(["t-halo-todo", "t-halo-done"], teams[0].States.Select(s => s.Id));
    }

    [Fact]
    public async Task Teams_skip_a_broken_workspace_but_fail_when_none_answers()
    {
        var teams = await Provider("lin_api_fel", Jobb).TeamsAsync(default);
        Assert.Equal(["Plattform"], teams.Select(t => t.Name));

        var e = await Assert.ThrowsAsync<LinearApiException>(() => Provider("lin_api_fel").TeamsAsync(default));
        Assert.Equal("Linear: Authentication required", e.Message);
    }

    [Fact]
    public async Task Issues_go_through_the_key_of_the_teams_workspace()
    {
        var provider = Provider(Veloq, Jobb);

        var issues = await provider.IssuesAsync("t-plattform", open: true, default);

        // First call per key looks up the teams; the issues query then goes to the Jobbet key only.
        var last = _calls.Count - 1;
        Assert.Equal(Jobb, _calls[last].Key);
        Assert.Equal(["PLA-2", "PLA-1"], issues.Select(i => i.Identifier));
        Assert.Equal("Vidar", issues[0].Assignee);
        Assert.Equal("Hög", issues[0].PriorityLabel);
        var filter = Variables(last).GetProperty("filter");
        Assert.Equal("t-plattform", filter.GetProperty("team").GetProperty("id").GetProperty("eq").GetString());
        Assert.Equal(["completed", "canceled"], filter.GetProperty("state").GetProperty("type").GetProperty("nin").EnumerateArray().Select(x => x.GetString()));
    }

    [Fact]
    public async Task Teams_are_looked_up_once_and_unknown_teams_are_not_found()
    {
        var provider = Provider(Veloq, Jobb);
        await provider.TeamsAsync(default);
        var before = _calls.Count;

        await provider.IssuesAsync("t-veloq", open: false, default);
        Assert.Equal(before + 1, _calls.Count);
        Assert.False(Variables(_calls.Count - 1).GetProperty("filter").TryGetProperty("state", out _));

        await Assert.ThrowsAsync<LinearTeamNotFoundException>(() => provider.IssuesAsync("t-okand", open: true, default));
    }

    [Fact]
    public async Task Creates_in_the_right_workspace_with_only_the_fields_given()
    {
        var created = await Provider(Veloq, Jobb).CreateAsync(new NewLinearIssue("t-halo", "Ny story", null, 3, null), default);

        var last = _calls.Count - 1;
        Assert.Equal("VEL-9", created.Identifier);
        Assert.Equal(Veloq, _calls[last].Key);
        var input = Variables(last).GetProperty("input");
        Assert.Equal("t-halo", input.GetProperty("teamId").GetString());
        Assert.Equal(3, input.GetProperty("priority").GetInt32());
        Assert.False(input.TryGetProperty("description", out _));
        Assert.False(input.TryGetProperty("stateId", out _));
    }
}

/// <summary>The endpoints against the sample provider (no keys in the tests).</summary>
public class LinearEndpointTests : IClassFixture<LinearEndpointTests.Factory>
{
    public sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder) =>
            builder.UseEnvironment("Testing").UseSetting("Auth:ApiKey", "").UseSetting("Linear:ApiKey", "");
    }

    private readonly HttpClient _client;

    public LinearEndpointTests(Factory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Reports_sample_workspaces_without_a_key()
    {
        var status = await _client.GetFromJsonAsync<LinearStatus>("/api/linear");

        Assert.False(status!.Configured);
        Assert.Equal(["Veloq Labs", "Jobbet"], status.Workspaces.Select(w => w.Name));
    }

    [Fact]
    public async Task Lists_teams_from_every_workspace_and_open_issues()
    {
        var teams = await _client.GetFromJsonAsync<LinearTeam[]>("/api/linear/teams");
        Assert.Equal(["Veloq Labs", "Jobbet"], teams!.Select(t => t.Workspace).Distinct());
        var team = teams!.First(t => t.Key == "VEL");

        var open = await _client.GetFromJsonAsync<LinearIssue[]>($"/api/linear/issues?teamId={team.Id}");
        var all = await _client.GetFromJsonAsync<LinearIssue[]>($"/api/linear/issues?teamId={team.Id}&open=false");

        Assert.DoesNotContain(open!, i => i.State.Type == "completed");
        Assert.Contains(all!, i => i.State.Type == "completed");
    }

    [Fact]
    public async Task Creates_a_story_that_then_shows_in_the_list()
    {
        var response = await _client.PostAsJsonAsync("/api/linear/issues", new NewLinearIssue("t-plattform", "  Ny story  ", "Beskrivning", 2, null));
        var created = await response.Content.ReadFromJsonAsync<LinearIssue>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("Ny story", created!.Title);
        Assert.Equal("Hög", created.PriorityLabel);
        var issues = await _client.GetFromJsonAsync<LinearIssue[]>("/api/linear/issues?teamId=t-plattform");
        Assert.Contains(issues!, i => i.Id == created.Id);
    }

    [Theory]
    [InlineData(null, "Titel", null)]
    [InlineData("t-halo", " ", null)]
    [InlineData("t-halo", "Titel", 5)]
    public async Task Rejects_a_story_without_team_or_title_or_with_a_bad_priority(string? teamId, string title, int? priority)
    {
        var response = await _client.PostAsJsonAsync("/api/linear/issues", new NewLinearIssue(teamId, title, null, priority, null));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Issues_need_a_known_team()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await _client.GetAsync("/api/linear/issues")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.GetAsync("/api/linear/issues?teamId=t-okand")).StatusCode);
        var create = await _client.PostAsJsonAsync("/api/linear/issues", new NewLinearIssue("t-okand", "X", null, null, null));
        Assert.Equal(HttpStatusCode.NotFound, create.StatusCode);
    }
}
