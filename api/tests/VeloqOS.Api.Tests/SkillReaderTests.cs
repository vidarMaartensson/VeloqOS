using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Tests;

public class SkillReaderTests : IDisposable
{
    private readonly string _folder = Directory.CreateTempSubdirectory("veloq-skills").FullName;

    public void Dispose() => Directory.Delete(_folder, recursive: true);

    private void Skill(string folder, string markdown)
    {
        Directory.CreateDirectory(Path.Combine(_folder, folder));
        File.WriteAllText(Path.Combine(_folder, folder, "SKILL.md"), markdown);
    }

    [Fact]
    public void Reads_each_skill_folder_as_a_chore_sorted_by_name()
    {
        Skill("samsung", "---\nname: samsung\ndescription: Bygg och starta appen på telefonen. Använd när användaren skriver /samsung.\n---\n# Samsung");
        Skill("pr", "---\nname: pr\ndescription: \"Committa och pusha.\"\nargument-hint: <titel>\n---\n");
        Directory.CreateDirectory(Path.Combine(_folder, "synced")); // no SKILL.md

        var chores = SkillReader.Read(_folder);

        Assert.Equal(["skill-pr", "skill-samsung"], chores.Select(c => c.Id));
        var samsung = chores[1];
        Assert.Equal("/samsung", samsung.Name);
        Assert.Equal("Bygg och starta appen på telefonen.", samsung.Description);
        Assert.Equal(ChoreKinds.Skill, samsung.Kind);
        Assert.Equal(ChoreProjects.Optional, samsung.Project);
        Assert.Equal(SkillReader.DefaultArgument, samsung.Argument);
        Assert.Equal("<titel>", chores[0].Argument);
        Assert.Equal("Committa och pusha.", chores[0].Description);
    }

    [Fact]
    public void A_missing_folder_has_no_skills()
    {
        Assert.Empty(SkillReader.Read(Path.Combine(_folder, "finns-inte")));
    }

    [Fact]
    public void Folded_and_indented_descriptions_become_one_line()
    {
        var chore = SkillReader.Parse("motion", "---\nname: motion\ndescription: >\n  Rörelse som\n  känns rätt. Mer text.\ntriggers:\n  - \"x\"\n---\n");

        Assert.Equal("Rörelse som känns rätt.", chore!.Description);
    }

    [Fact]
    public void Falls_back_to_the_folder_name_and_skips_names_that_are_not_commands()
    {
        Assert.Equal("skill-ny-branch", SkillReader.Parse("ny-branch", "Ingen frontmatter.")!.Id);
        Assert.Null(SkillReader.Parse("x", "---\nname: två ord\n---\n"));
    }

    [Fact]
    public void Knows_a_skill_id_from_a_built_in_one()
    {
        Assert.Equal("pr", SkillReader.SkillName("skill-pr"));
        Assert.Null(SkillReader.SkillName("disk-cleanup"));
    }
}
