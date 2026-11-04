using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace VeloqOS.Api.Integrations.Google;

/// <summary><c>Google:*</c> in configuration. The client is an OAuth client of type Desktop app, kept in user-secrets.</summary>
public sealed class GoogleOptions
{
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }

    /// <summary>Where the refresh token is kept. Defaults to VeloqOS/google-token.json under the user's app data.</summary>
    public string? TokenPath { get; set; }

    public bool Configured => !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);

    public string ResolvedTokenPath => TokenPath ?? Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VeloqOS", "google-token.json");
}

/// <summary>Not signed in to Google (or the sign-in was revoked).</summary>
public sealed class GoogleNotConnectedException() : InvalidOperationException("Google är inte anslutet.");

/// <summary>Google answered with an error.</summary>
public sealed class GoogleApiException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>Where Google should send the browser back, and where to go after that.</summary>
public sealed record OAuthRedirect(string CallbackUrl, string? ReturnTo);

/// <summary>
/// One Google sign-in for both Gmail and Calendar: OAuth with PKCE against a loopback callback,
/// the refresh token in a file outside the repo, and fresh access tokens on demand.
/// </summary>
public sealed class GoogleAuth(IOptions<GoogleOptions> options, IHttpClientFactory http, TimeProvider time)
{
    public const string HttpClientName = "google";

    private const string AuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
    private const string TokenEndpoint = "https://oauth2.googleapis.com/token";
    private const string RevokeEndpoint = "https://oauth2.googleapis.com/revoke";

    public const string Scopes =
        "openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events";

    private static readonly TimeSpan PendingLifetime = TimeSpan.FromMinutes(15);
    private static readonly JsonSerializerOptions FileJson = new() { WriteIndented = true };

    private readonly GoogleOptions _options = options.Value;
    private readonly ConcurrentDictionary<string, Pending> _pending = new();
    private readonly SemaphoreSlim _refresh = new(1, 1);
    private readonly Lock _gate = new();
    private StoredToken? _token;
    private bool _loaded;

    /// <summary>Raised after signing in or out, so cached Google data can be reloaded.</summary>
    public event Action? Changed;

    public bool Configured => _options.Configured;

    public bool IsConnected => Token is not null;

    public string? Email => Token?.Email;

    private StoredToken? Token
    {
        get
        {
            lock (_gate)
            {
                if (!_loaded)
                {
                    _token = Load();
                    _loaded = true;
                }
                return _token;
            }
        }
    }

    /// <returns>The Google sign-in URL to open in a browser.</returns>
    public string Start(OAuthRedirect redirect)
    {
        if (!Configured) throw new InvalidOperationException("Google är inte konfigurerat. Sätt Google:ClientId och Google:ClientSecret.");

        foreach (var (key, old) in _pending)
            if (time.GetUtcNow() - old.CreatedAt > PendingLifetime) _pending.TryRemove(key, out _);

        var state = Base64Url(RandomNumberGenerator.GetBytes(24));
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(48));
        _pending[state] = new Pending(verifier, redirect, time.GetUtcNow());

        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var query = new Dictionary<string, string>
        {
            ["client_id"] = _options.ClientId!,
            ["redirect_uri"] = redirect.CallbackUrl,
            ["response_type"] = "code",
            ["scope"] = Scopes,
            ["state"] = state,
            ["code_challenge"] = challenge,
            ["code_challenge_method"] = "S256",
            ["access_type"] = "offline",
            ["prompt"] = "consent",
        };
        return AuthEndpoint + "?" + string.Join("&", query.Select(kv => $"{kv.Key}={Uri.EscapeDataString(kv.Value)}"));
    }

    /// <summary>Exchanges the code from the callback for tokens and saves them.</summary>
    /// <returns>Where to send the browser next, if anywhere.</returns>
    public async Task<string?> CompleteAsync(string state, string code, CancellationToken ct)
    {
        if (!_pending.TryRemove(state, out var pending) || time.GetUtcNow() - pending.CreatedAt > PendingLifetime)
            throw new ArgumentException("Inloggningen har gått ut eller kom inte härifrån. Försök igen.", nameof(state));

        var response = await PostTokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = pending.Redirect.CallbackUrl,
            ["code_verifier"] = pending.Verifier,
        }, ct);

        if (string.IsNullOrEmpty(response.RefreshToken))
            throw new GoogleApiException(502, "Google skickade ingen refresh-token. Ta bort Veloq OS under myaccount.google.com/permissions och försök igen.");

        Save(new StoredToken(response.RefreshToken, response.AccessToken, ExpiresAt(response), EmailFrom(response.IdToken)));
        Changed?.Invoke();
        return pending.Redirect.ReturnTo;
    }

    public async Task<string> GetAccessTokenAsync(CancellationToken ct)
    {
        var token = Token ?? throw new GoogleNotConnectedException();
        if (token.AccessToken is not null && token.ExpiresAt - time.GetUtcNow() > TimeSpan.FromMinutes(1)) return token.AccessToken;

        await _refresh.WaitAsync(ct);
        try
        {
            token = Token ?? throw new GoogleNotConnectedException();
            if (token.AccessToken is not null && token.ExpiresAt - time.GetUtcNow() > TimeSpan.FromMinutes(1)) return token.AccessToken;

            TokenResponse response;
            try
            {
                response = await PostTokenAsync(new Dictionary<string, string>
                {
                    ["grant_type"] = "refresh_token",
                    ["refresh_token"] = token.RefreshToken,
                }, ct);
            }
            catch (GoogleApiException e) when (e.Status is 400 or 401)
            {
                // invalid_grant: revoked, expired (7 days in Testing mode) or password changed.
                Delete();
                Changed?.Invoke();
                throw new GoogleNotConnectedException();
            }

            var updated = token with { AccessToken = response.AccessToken, ExpiresAt = ExpiresAt(response) };
            Save(updated);
            return updated.AccessToken!;
        }
        finally
        {
            _refresh.Release();
        }
    }

    public async Task DisconnectAsync(CancellationToken ct)
    {
        var token = Token;
        if (token is null) return;
        try
        {
            using var content = new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token.RefreshToken });
            await http.CreateClient(HttpClientName).PostAsync(RevokeEndpoint, content, ct);
        }
        catch (HttpRequestException)
        {
            // Revoking is a courtesy; forgetting the token locally is what matters.
        }
        Delete();
        Changed?.Invoke();
    }

    private async Task<TokenResponse> PostTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        form["client_id"] = _options.ClientId!;
        form["client_secret"] = _options.ClientSecret!;
        using var content = new FormUrlEncodedContent(form);
        using var response = await http.CreateClient(HttpClientName).PostAsync(TokenEndpoint, content, ct);
        if (!response.IsSuccessStatusCode)
            throw new GoogleApiException((int)response.StatusCode, $"Google nekade inloggningen ({(int)response.StatusCode}).");
        return (await response.Content.ReadFromJsonAsync<TokenResponse>(ct))!;
    }

    private DateTimeOffset ExpiresAt(TokenResponse response) => time.GetUtcNow().AddSeconds(response.ExpiresIn);

    /// <summary>The email claim from the ID token. It came straight from Google over TLS, so it is not re-verified.</summary>
    internal static string? EmailFrom(string? idToken)
    {
        var parts = idToken?.Split('.');
        if (parts is not { Length: 3 }) return null;
        try
        {
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
            using var doc = JsonDocument.Parse(Convert.FromBase64String(payload));
            return doc.RootElement.TryGetProperty("email", out var email) ? email.GetString() : null;
        }
        catch (Exception e) when (e is FormatException or JsonException)
        {
            return null;
        }
    }

    private StoredToken? Load()
    {
        var path = _options.ResolvedTokenPath;
        if (!File.Exists(path)) return null;
        try
        {
            return JsonSerializer.Deserialize<StoredToken>(File.ReadAllText(path));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private void Save(StoredToken token)
    {
        var path = _options.ResolvedTokenPath;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(token, FileJson));
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        lock (_gate)
        {
            _token = token;
            _loaded = true;
        }
    }

    private void Delete()
    {
        File.Delete(_options.ResolvedTokenPath);
        lock (_gate)
        {
            _token = null;
            _loaded = true;
        }
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed record Pending(string Verifier, OAuthRedirect Redirect, DateTimeOffset CreatedAt);

    private sealed record StoredToken(string RefreshToken, string? AccessToken, DateTimeOffset ExpiresAt, string? Email);

    private sealed record TokenResponse(
        [property: System.Text.Json.Serialization.JsonPropertyName("access_token")] string? AccessToken,
        [property: System.Text.Json.Serialization.JsonPropertyName("expires_in")] int ExpiresIn,
        [property: System.Text.Json.Serialization.JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: System.Text.Json.Serialization.JsonPropertyName("id_token")] string? IdToken);
}
