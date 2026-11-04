using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using VeloqOS.Api.Endpoints;

namespace VeloqOS.Api.Tests;

public class GoogleRedirectTests
{
    private static readonly IConfiguration Config = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Veloq:WebOrigins:0"] = "http://localhost:7470", ["Veloq:WebOrigins:1"] = "tauri://localhost" })
        .Build();

    private static HttpContext Request(string host, string? origin)
    {
        var http = new DefaultHttpContext();
        http.Request.Host = new HostString(host);
        if (origin is not null) http.Request.Headers.Origin = origin;
        return http;
    }

    [Fact]
    public void Calls_back_on_the_loopback_address_and_returns_to_a_known_dashboard()
    {
        var redirect = Endpoints.Endpoints.Redirect(Request("localhost:7470", "http://localhost:7470"), Config);

        Assert.Equal("http://127.0.0.1:7470/api/google/callback", redirect.CallbackUrl);
        Assert.Equal("http://localhost:7470/", redirect.ReturnTo);
    }

    [Fact]
    public void The_mac_app_and_unknown_origins_get_the_done_page()
    {
        Assert.Null(Endpoints.Endpoints.Redirect(Request("127.0.0.1:7480", "tauri://localhost"), Config).ReturnTo);
        Assert.Null(Endpoints.Endpoints.Redirect(Request("127.0.0.1:7480", "https://evil.example"), Config).ReturnTo);
        Assert.Null(Endpoints.Endpoints.Redirect(Request("127.0.0.1:7480", null), Config).ReturnTo);
    }
}
