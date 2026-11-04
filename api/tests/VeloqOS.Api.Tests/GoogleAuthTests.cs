using System.Net;
using VeloqOS.Api.Integrations.Google;

namespace VeloqOS.Api.Tests;

public class GoogleAuthTests
{
    private const string Token = "https://oauth2.googleapis.com/token";
    private static readonly CancellationToken Ct = CancellationToken.None;
    private static readonly OAuthRedirect Redirect = new("http://127.0.0.1:7480/api/google/callback", "http://localhost:7470/");

    private readonly ManualTimeProvider _time = new(new DateTimeOffset(2026, 10, 30, 9, 0, 0, TimeSpan.Zero));
    private readonly FakeGoogle _google = new();

    private static Dictionary<string, string> Query(string url) =>
        new Uri(url).Query.TrimStart('?').Split('&').Select(p => p.Split('=', 2))
            .ToDictionary(p => p[0], p => Uri.UnescapeDataString(p[1]));

    [Fact]
    public void Start_asks_for_offline_access_to_gmail_and_calendar_with_pkce()
    {
        var auth = _google.Auth(_time, out _);

        var query = Query(auth.Start(Redirect));

        Assert.Equal("client-id", query["client_id"]);
        Assert.Equal(Redirect.CallbackUrl, query["redirect_uri"]);
        Assert.Contains("gmail.modify", query["scope"]);
        Assert.Contains("calendar.events", query["scope"]);
        Assert.Equal("S256", query["code_challenge_method"]);
        Assert.Equal("offline", query["access_type"]);
        Assert.False(string.IsNullOrEmpty(query["state"]));
    }

    [Fact]
    public async Task Complete_exchanges_the_code_saves_the_token_and_returns_to_the_dashboard()
    {
        var auth = _google.Auth(_time, out var path);
        _google.On(HttpMethod.Post, Token, new { access_token = "access-1", expires_in = 3600, refresh_token = "refresh-1", id_token = FakeGoogle.IdToken("vidar@example.com") });
        var changed = 0;
        auth.Changed += () => changed++;
        var state = Query(auth.Start(Redirect))["state"];

        var returnTo = await auth.CompleteAsync(state, "the-code", Ct);

        Assert.Equal("http://localhost:7470/", returnTo);
        Assert.True(auth.IsConnected);
        Assert.Equal("vidar@example.com", auth.Email);
        Assert.True(File.Exists(path));
        Assert.Equal(1, changed);
        var form = _google.BodiesOf(HttpMethod.Post, Token).Single();
        Assert.Contains("code=the-code", form);
        Assert.Contains("code_verifier=", form);
        Assert.Contains("grant_type=authorization_code", form);
    }

    [Fact]
    public async Task Complete_rejects_a_state_it_did_not_start()
    {
        var auth = _google.Auth(_time, out _);

        await Assert.ThrowsAsync<ArgumentException>(() => auth.CompleteAsync("forged", "code", Ct));
        Assert.Empty(_google.Requests);
    }

    [Fact]
    public async Task Complete_rejects_a_state_that_is_too_old()
    {
        var auth = _google.Auth(_time, out _);
        var state = Query(auth.Start(Redirect))["state"];
        _time.Advance(TimeSpan.FromMinutes(16));

        await Assert.ThrowsAsync<ArgumentException>(() => auth.CompleteAsync(state, "code", Ct));
    }

    [Fact]
    public async Task Access_token_is_reused_until_it_is_about_to_expire_then_refreshed()
    {
        var auth = _google.SignedIn(_time);
        _google.On(HttpMethod.Post, Token, new { access_token = "access-2", expires_in = 3600 });

        Assert.Equal("access-1", await auth.GetAccessTokenAsync(Ct));
        _time.Advance(TimeSpan.FromMinutes(59.5));
        Assert.Equal("access-2", await auth.GetAccessTokenAsync(Ct));
        Assert.Contains("refresh_token=refresh-1", _google.BodiesOf(HttpMethod.Post, Token).Single());
    }

    [Fact]
    public async Task A_revoked_refresh_token_signs_out()
    {
        var auth = _google.SignedIn(_time);
        _google.On(HttpMethod.Post, Token, new { error = "invalid_grant" }, HttpStatusCode.BadRequest);
        _time.Advance(TimeSpan.FromHours(2));

        await Assert.ThrowsAsync<GoogleNotConnectedException>(() => auth.GetAccessTokenAsync(Ct));
        Assert.False(auth.IsConnected);
    }

    [Fact]
    public async Task Disconnect_revokes_and_forgets_the_token()
    {
        var auth = _google.SignedIn(_time);
        _google.On(HttpMethod.Post, "https://oauth2.googleapis.com/revoke", new { });

        await auth.DisconnectAsync(Ct);

        Assert.False(auth.IsConnected);
        Assert.Single(_google.BodiesOf(HttpMethod.Post, "https://oauth2.googleapis.com/revoke"));
    }

    [Fact]
    public void Reads_the_email_from_an_id_token()
    {
        Assert.Equal("a@b.se", GoogleAuth.EmailFrom(FakeGoogle.IdToken("a@b.se")));
        Assert.Null(GoogleAuth.EmailFrom("not-a-jwt"));
        Assert.Null(GoogleAuth.EmailFrom(null));
    }
}
