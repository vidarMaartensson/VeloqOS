using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Google;

namespace VeloqOS.Api.Tests;

/// <summary>Stands in for Google's HTTP endpoints: answers by method and URL prefix and records every request.</summary>
public sealed class FakeGoogle : HttpMessageHandler, IHttpClientFactory
{
    private readonly List<(HttpMethod Method, string Prefix, Func<HttpRequestMessage, string, HttpResponseMessage> Respond)> _routes = [];

    public List<(HttpMethod Method, string Url, string Body)> Requests { get; } = [];

    public FakeGoogle On(HttpMethod method, string urlPrefix, object json, HttpStatusCode status = HttpStatusCode.OK) =>
        On(method, urlPrefix, (_, _) => Json(json, status));

    public FakeGoogle On(HttpMethod method, string urlPrefix, Func<HttpRequestMessage, string, HttpResponseMessage> respond)
    {
        _routes.Insert(0, (method, urlPrefix, respond));
        return this;
    }

    public static HttpResponseMessage Json(object json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(JsonSerializer.Serialize(json), Encoding.UTF8, "application/json") };

    public IEnumerable<string> BodiesOf(HttpMethod method, string urlPrefix) =>
        Requests.Where(r => r.Method == method && r.Url.StartsWith(urlPrefix, StringComparison.Ordinal)).Select(r => r.Body);

    public HttpClient CreateClient(string name) => new(this, disposeHandler: false);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var url = request.RequestUri!.ToString();
        var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add((request.Method, url, body));
        var route = _routes.FirstOrDefault(r => r.Method == request.Method && url.StartsWith(r.Prefix, StringComparison.Ordinal));
        return route.Respond is null ? Json(new { error = $"no fake for {request.Method} {url}" }, HttpStatusCode.NotFound) : route.Respond(request, body);
    }

    /// <summary>A GoogleAuth with a test client and a token file in a fresh temp folder.</summary>
    public GoogleAuth Auth(TimeProvider time, out string tokenPath)
    {
        tokenPath = Path.Combine(Path.GetTempPath(), "veloq-tests", Guid.NewGuid().ToString("N"), "google-token.json");
        var options = Options.Create(new GoogleOptions { ClientId = "client-id", ClientSecret = "client-secret", TokenPath = tokenPath });
        return new GoogleAuth(options, this, time);
    }

    /// <summary>A GoogleAuth that is already signed in with a valid access token.</summary>
    public GoogleAuth SignedIn(TimeProvider time)
    {
        var auth = Auth(time, out var path);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(new
        {
            RefreshToken = "refresh-1",
            AccessToken = "access-1",
            ExpiresAt = time.GetUtcNow().AddHours(1),
            Email = "vidar@example.com",
        }));
        return auth;
    }

    /// <summary>An unsigned JWT whose payload carries the email claim, like Google's id_token.</summary>
    public static string IdToken(string email)
    {
        static string B64(string s) => Convert.ToBase64String(Encoding.UTF8.GetBytes(s)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return $"{B64("{\"alg\":\"none\"}")}.{B64(JsonSerializer.Serialize(new { email }))}.sig";
    }
}
