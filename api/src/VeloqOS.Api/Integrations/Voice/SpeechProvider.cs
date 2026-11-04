using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace VeloqOS.Api.Integrations.Voice;

/// <summary>A speech service answered with an error.</summary>
public sealed class SpeechException(string message) : Exception(message);

/// <summary>Text to speech through ElevenLabs and speech to text through Deepgram, each when its key is set.</summary>
public sealed class SpeechProvider(IHttpClientFactory http, IOptions<VoiceOptions> options)
{
    public const string HttpClientName = "speech";
    public const string ElevenLabs = "https://api.elevenlabs.io/v1/text-to-speech";
    public const string Deepgram = "https://api.deepgram.com/v1/listen";

    public bool CanSpeak => options.Value.CanSpeak;
    public bool CanListen => options.Value.CanListen;

    /// <summary>MP3 of the text in the configured voice. Burp markers and markdown are left out.</summary>
    public async Task<byte[]> SpeakAsync(string text, CancellationToken cancellationToken)
    {
        var o = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{ElevenLabs}/{Uri.EscapeDataString(o.ElevenLabsVoiceId!)}?output_format=mp3_44100_128")
        {
            Content = JsonContent.Create(new { text = VoiceText.Speakable(text), model_id = o.ElevenLabsModel, language_code = o.Language }),
        };
        request.Headers.Add("xi-api-key", o.ElevenLabsApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("audio/mpeg"));

        using var response = await http.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new SpeechException($"ElevenLabs svarade {(int)response.StatusCode}.");
        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
    }

    /// <summary>What was said in the recording, in <c>Voice:Language</c>.</summary>
    public async Task<string> TranscribeAsync(Stream audio, string contentType, CancellationToken cancellationToken)
    {
        var o = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{Deepgram}?model={Uri.EscapeDataString(o.DeepgramModel)}&language={Uri.EscapeDataString(o.Language)}&smart_format=true")
        {
            Content = new StreamContent(audio),
        };
        request.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", o.DeepgramApiKey);

        using var response = await http.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new SpeechException($"Deepgram svarade {(int)response.StatusCode}.");
        using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        return doc.RootElement.GetProperty("results").GetProperty("channels")[0].GetProperty("alternatives")[0].GetProperty("transcript").GetString() ?? "";
    }
}
