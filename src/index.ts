import { Octokit } from "octokit";
import { Context } from "probot";
const core = require('@actions/core');

interface Issue {
    number: number;
    labels: { name: string }[];
    reactions: any;//{ [key: string]: number };
    html_url: string;
}

interface IssueListOptions {
    owner: string;
    repo: string;
    issueNumberToUpdate: number;
}

async function main() {
    const owner:string = core.getInput("org_name")
    const repo:string = core.getInput("repo_name");
    const issueNumberToUpdate:number = core.getInput("issue_number");

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const ctx: Context = { octokit } as unknown as Context;

    // List all open issues.
    const allIssues = await getAllOpenIssues(ctx, owner, repo);

    // Filter to those that have at least 2 thumbs-up.
    let issues: Issue[] = allIssues.filter(issue => issue.reactions["+1"] >= 2);

    // Sort by thumbs-up descending.
    issues.sort((a, b) => b.reactions["+1"] - a.reactions["+1"]);

    const templateParams = {
        EnhancementIssues: getTopIssuesByLabel("enhancement", issues),
        BugIssues: getTopIssuesByLabel("bug", issues),
        allIssues: issues,
    };

    // Render template for issue body.
    const rankingBodyString = renderRankingTemplate(templateParams);

    // Update the issue.
    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumberToUpdate,
        body: rankingBodyString
    });
}

async function getAllOpenIssues(ctx: Context, owner: string, repo: string): Promise<Issue[]> {
    let issues: Issue[] = [];
    let page = 1;
    while (true) {
        const response = await ctx.octokit.rest.issues.listForRepo({
            owner,
            repo,
            state: "open",
            per_page: 100,
            page
        });
        issues = issues.concat(response.data.map(issue => ({
            number: issue.number,
            labels: issue.labels.map((label:any)  => ({ name: label?.name || label })),
            reactions: issue.reactions,
            html_url: issue.html_url
        })));
        if (response.data.length < 100) break;
        page++;
    }
    return issues;
}

function getTopIssuesByLabel(label: string, issues: Issue[]): Issue[] {
    let labelledIssues: Issue[] = [];
    for (const issue of issues) {
        if (hasLabel(label, issue)) {
            labelledIssues.push(issue);
        }
    }

    // Just the top 20.
    if (labelledIssues.length > 20) {
        labelledIssues = labelledIssues.slice(0, 20);
    }

    return labelledIssues;
}

function hasLabel(label: string, issue: Issue): boolean {
    return issue.labels.some(issueLabel => issueLabel.name === label);
}

function renderRankingTemplate(templateParams: any): string {
    return`
## Top Issues
${templateParams.allIssues.map((issue:Issue) => `1. [${issue.html_url}](${issue.html_url}) - ${issue.reactions["+1"]} :+1:`).join("\n")}
    
`;

}


main().catch(error => console.error(error));
