using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace VeloqOS.Api.Integrations.Google;

/// <summary>Signed-in JSON calls to Google's REST APIs (Gmail, Calendar).</summary>
public sealed class GoogleClient(GoogleAuth auth, IHttpClientFactory http)
{
    public async Task<JsonElement> GetAsync(string url, CancellationToken ct) =>
        await SendAsync(HttpMethod.Get, url, body: null, ct);

    public async Task<JsonElement> PostAsync(string url, object body, CancellationToken ct) =>
        await SendAsync(HttpMethod.Post, url, body, ct);

    public async Task<JsonElement> PatchAsync(string url, object body, CancellationToken ct) =>
        await SendAsync(HttpMethod.Patch, url, body, ct);

    private async Task<JsonElement> SendAsync(HttpMethod method, string url, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await auth.GetAccessTokenAsync(ct));
        if (body is not null) request.Content = JsonContent.Create(body);

        using var response = await http.CreateClient(GoogleAuth.HttpClientName).SendAsync(request, ct);
        if (response.StatusCode == HttpStatusCode.Unauthorized) throw new GoogleNotConnectedException();
        if (!response.IsSuccessStatusCode)
            throw new GoogleApiException((int)response.StatusCode, $"Google svarade {(int)response.StatusCode} på {method} {new Uri(url).AbsolutePath}.");
        if (response.StatusCode == HttpStatusCode.NoContent) return default;

        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        return doc.RootElement.Clone();
    }
}
