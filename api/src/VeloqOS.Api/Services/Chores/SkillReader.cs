namespace VeloqOS.Api.Services.Chores;

/// <summary>
/// Turns the Claude Code skills in a folder (<c>&lt;name&gt;/SKILL.md</c>) into chores that run as <c>/&lt;name&gt;</c>.
/// Only the frontmatter is read: <c>name</c>, <c>description</c> and <c>argument-hint</c>.
/// </summary>
public static class SkillReader
{
    public const string IdPrefix = "skill-";
    public const string DefaultArgument = "Tillägg (valfritt)";

    public static IReadOnlyList<Chore> Read(string folder)
    {
        if (!Directory.Exists(folder)) return [];
        return Directory.EnumerateDirectories(folder)
            .Select(dir => Path.Combine(dir, "SKILL.md"))
            .Where(File.Exists)
            .Select(path => Parse(Path.GetFileName(Path.GetDirectoryName(path))!, File.ReadAllText(path)))
            .OfType<Chore>()
            .OrderBy(c => c.Id, StringComparer.Ordinal)
            .ToList();
    }

    public static Chore? Parse(string folderName, string markdown)
    {
        var fields = Frontmatter(markdown);
        var name = fields.GetValueOrDefault("name") is { Length: > 0 } n ? n : folderName;
        if (name.Any(c => char.IsWhiteSpace(c) || c == '/')) return null;

        var description = FirstSentence(fields.GetValueOrDefault("description") ?? "");
        var argument = fields.GetValueOrDefault("argument-hint") is { Length: > 0 } hint ? hint : DefaultArgument;
        return new Chore(IdPrefix + name, "/" + name, description, "skill", "Skill", TimeSpan.FromMinutes(2),
            ChoreKinds.Skill, ChoreProjects.Optional, argument);
    }

    /// <summary>The skill's name, if <paramref name="choreId"/> is a skill.</summary>
    public static string? SkillName(string choreId) => choreId.StartsWith(IdPrefix, StringComparison.Ordinal) ? choreId[IdPrefix.Length..] : null;

    /// <summary>Top-level <c>key: value</c> pairs; folded (<c>&gt;</c>, <c>|</c>) and indented values are joined into one line.</summary>
    public static IReadOnlyDictionary<string, string> Frontmatter(string markdown)
    {
        var fields = new Dictionary<string, string>();
        var lines = markdown.ReplaceLineEndings("\n").Split('\n');
        if (lines.Length == 0 || lines[0].Trim() != "---") return fields;

        string? key = null;
        var value = new List<string>();
        void Flush()
        {
            if (key is not null) fields[key] = Unquote(string.Join(' ', value.Where(v => v.Length > 0)));
            key = null;
            value.Clear();
        }

        foreach (var line in lines.Skip(1))
        {
            if (line.Trim() == "---") break;
            if (line.Length > 0 && !char.IsWhiteSpace(line[0]) && line.IndexOf(':') is var colon and > 0)
            {
                Flush();
                key = line[..colon].Trim();
                var rest = line[(colon + 1)..].Trim();
                if (rest is not (">" or "|" or ">-" or "|-")) value.Add(rest);
            }
            else if (key is not null)
            {
                value.Add(line.Trim());
            }
        }
        Flush();
        return fields;
    }

    private static string Unquote(string value) =>
        value.Length >= 2 && (value[0] == '"' || value[0] == '\'') && value[^1] == value[0] ? value[1..^1] : value;

    private static string FirstSentence(string text)
    {
        var end = text.IndexOf(". ", StringComparison.Ordinal);
        var sentence = end > 0 ? text[..(end + 1)] : text;
        return sentence.Length > 160 ? sentence[..157].TrimEnd() + "…" : sentence;
    }
}
