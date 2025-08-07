import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

dotenv.config();

export interface GitHubIssueData {
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
}

export interface GitHubIssueResponse {
    id: number;
    number: number;
    title: string;
    html_url: string;
    state: string;
    created_at: string;
    updated_at: string;
}

export class GitHubService {
    private octokit: Octokit;

    constructor(token?: string) {
        const githubToken = token || process.env.GITHUB_TOKEN;
        
        if (!githubToken) {
            throw new Error('GitHub token is required. Please set GITHUB_TOKEN environment variable or pass token in constructor.');
        }

        this.octokit = new Octokit({
            auth: githubToken,
        });
    }

    /**
     * Parse GitHub URL to extract owner and repo
     * Supports formats:
     * - https://github.com/owner/repo
     * - https://github.com/owner/repo.git
     * - git@github.com:owner/repo.git
     */
    private parseGitHubUrl(githubUrl: string): { owner: string; repo: string } {
        try {
            // Handle HTTPS URLs
            if (githubUrl.startsWith('https://github.com/')) {
                const path = githubUrl.replace('https://github.com/', '');
                const parts = path.split('/');
                if (parts.length >= 2) {
                    const owner = parts[0];
                    const repo = parts[1].replace('.git', '');
                    return { owner, repo };
                }
            }
            
            // Handle SSH URLs
            if (githubUrl.startsWith('git@github.com:')) {
                const path = githubUrl.replace('git@github.com:', '');
                const parts = path.split('/');
                if (parts.length >= 2) {
                    const owner = parts[0];
                    const repo = parts[1].replace('.git', '');
                    return { owner, repo };
                }
            }

            throw new Error('Invalid GitHub URL format');
        } catch (error: any) {
            throw new Error(`Failed to parse GitHub URL "${githubUrl}": ${error.message}`);
        }
    }

    /**
     * Create a GitHub issue
     */
    async createIssue(githubUrl: string, issueData: GitHubIssueData): Promise<GitHubIssueResponse> {
        try {
            const { owner, repo } = this.parseGitHubUrl(githubUrl);

            console.log(`Creating GitHub issue in ${owner}/${repo}...`);
            console.log(`Title: ${issueData.title}`);
            console.log(`Labels: ${issueData.labels?.join(', ') || 'none'}`);
            console.log(`Assignees: ${issueData.assignees?.join(', ') || 'none'}`);

            const response = await this.octokit.rest.issues.create({
                owner,
                repo,
                title: issueData.title,
                body: issueData.body,
                labels: issueData.labels || [],
                assignees: issueData.assignees || []
            });

            console.log(`✅ GitHub issue created successfully: ${response.data.html_url}`);

            return {
                id: response.data.id,
                number: response.data.number,
                title: response.data.title,
                html_url: response.data.html_url,
                state: response.data.state,
                created_at: response.data.created_at,
                updated_at: response.data.updated_at
            };
        } catch (error: any) {
            console.error('Error creating GitHub issue:', error);
            
            // Provide more specific error messages
            if (error.status === 401) {
                throw new Error('GitHub authentication failed. Please check your GitHub token.');
            } else if (error.status === 403) {
                throw new Error('GitHub access forbidden. Please check your token permissions and repository access.');
            } else if (error.status === 404) {
                throw new Error('GitHub repository not found. Please check the repository URL and your access permissions.');
            } else if (error.status === 422) {
                throw new Error(`GitHub API validation error: ${error.message}`);
            } else {
                throw new Error(`GitHub API error: ${error.message}`);
            }
        }
    }

    /**
     * Test GitHub API connection
     */
    async testConnection(): Promise<{ authenticated: boolean; user?: string; scopes?: string[] }> {
        try {
            const response = await this.octokit.rest.users.getAuthenticated();
            
            return {
                authenticated: true,
                user: response.data.login,
                scopes: response.headers['x-oauth-scopes']?.split(', ') || []
            };
        } catch (error: any) {
            console.error('GitHub connection test failed:', error);
            return {
                authenticated: false
            };
        }
    }

    /**
     * Get repository information
     */
    async getRepositoryInfo(githubUrl: string): Promise<{
        name: string;
        full_name: string;
        description: string;
        private: boolean;
        has_issues: boolean;
        html_url: string;
    }> {
        try {
            const { owner, repo } = this.parseGitHubUrl(githubUrl);
            
            const response = await this.octokit.rest.repos.get({
                owner,
                repo
            });

            return {
                name: response.data.name,
                full_name: response.data.full_name,
                description: response.data.description || '',
                private: response.data.private,
                has_issues: response.data.has_issues,
                html_url: response.data.html_url
            };
        } catch (error: any) {
            console.error('Error getting repository info:', error);
            throw new Error(`Failed to get repository information: ${error.message}`);
        }
    }

    /**
     * List repository labels (useful for validation)
     */
    async getRepositoryLabels(githubUrl: string): Promise<string[]> {
        try {
            const { owner, repo } = this.parseGitHubUrl(githubUrl);
            
            const response = await this.octokit.rest.issues.listLabelsForRepo({
                owner,
                repo
            });

            return response.data.map(label => label.name);
        } catch (error: any) {
            console.error('Error getting repository labels:', error);
            return []; // Return empty array if we can't get labels
        }
    }

    /**
     * Validate assignees exist in the repository
     * Note: Bot accounts like 'github-actions[bot]' cannot be assigned to issues
     */
    async validateAssignees(githubUrl: string, assignees: string[]): Promise<string[]> {
        if (!assignees || assignees.length === 0) {
            return [];
        }

        try {
            const { owner, repo } = this.parseGitHubUrl(githubUrl);
            const validAssignees: string[] = [];

            for (const assignee of assignees) {
                // Skip bot accounts as they cannot be assigned to issues
                if (assignee.includes('[bot]') || assignee === 'copilot') {
                    console.warn(`Skipping bot account "${assignee}" - bots cannot be assigned to GitHub issues`);
                    continue;
                }

                try {
                    // Check if user exists and has access to the repository
                    await this.octokit.rest.repos.checkCollaborator({
                        owner,
                        repo,
                        username: assignee
                    });
                    validAssignees.push(assignee);
                    console.log(`✅ User "${assignee}" validated as repository collaborator`);
                } catch (error: any) {
                    if (error.status === 404) {
                        console.warn(`❌ User "${assignee}" is not a collaborator on ${owner}/${repo}, skipping...`);
                    } else {
                        console.warn(`❌ Error checking user "${assignee}": ${error.message}`);
                    }
                }
            }

            return validAssignees;
        } catch (error: any) {
            console.error('Error validating assignees:', error);
            return []; // Return empty array if validation fails
        }
    }
}
