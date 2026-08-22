import axios from 'axios';

interface LinearGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class LinearIntegrationService {
  private static endpoint = 'https://api.linear.app/graphql';

  private static async executeQuery<T>(token: string, query: string, variables?: any): Promise<T> {
    const response = await axios.post<LinearGraphQLResponse<T>>(
      this.endpoint,
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.data.errors && response.data.errors.length > 0) {
      throw new Error(`Linear API Error: ${response.data.errors[0].message}`);
    }

    if (!response.data.data) {
      throw new Error('Linear API Error: No data returned');
    }

    return response.data.data;
  }

  public static async getTeams(token: string) {
    const query = `
      query {
        teams {
          nodes {
            id
            name
            projects {
              nodes {
                id
                name
              }
            }
          }
        }
      }
    `;
    const result = await this.executeQuery<{ teams: { nodes: { id: string, name: string, projects: { nodes: { id: string, name: string }[] } }[] } }>(token, query);
    return result.teams.nodes;
  }

  public static async getUsers(token: string) {
    const query = `
      query {
        users {
          nodes {
            id
            name
            email
          }
        }
      }
    `;
    const result = await this.executeQuery<{ users: { nodes: { id: string, name: string, email: string }[] } }>(token, query);
    return result.users.nodes;
  }

  public static async getLabels(token: string) {
    const query = `
      query {
        issueLabels {
          nodes {
            id
            name
            color
          }
        }
      }
    `;
    const result = await this.executeQuery<{ issueLabels: { nodes: { id: string, name: string, color: string }[] } }>(token, query);
    return result.issueLabels.nodes;
  }

  public static async getIssue(token: string, id: string) {
    const query = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          title
          description
          priority
          team { id }
          project { id }
          assignee { id }
          labels { nodes { id } }
        }
      }
    `;
    const result = await this.executeQuery<{ 
      issue: { 
        id: string; 
        title: string; 
        description: string; 
        priority: number; 
        team: { id: string }; 
        project?: { id: string }; 
        assignee?: { id: string }; 
        labels?: { nodes: { id: string }[] }; 
      } 
    }>(token, query, { id });
    return result.issue;
  }

  public static async createIssue(
    token: string,
    input: {
      title: string;
      description?: string;
      teamId: string;
      projectId?: string;
      assigneeId?: string;
      priority?: number;
      labelIds?: string[];
    }
  ) {
    const mutation = `
      mutation CreateIssue(
        $title: String!
        $description: String
        $teamId: String!
        $projectId: String
        $assigneeId: String
        $priority: Int
        $labelIds: [String!]
      ) {
        issueCreate(input: {
          title: $title
          description: $description
          teamId: $teamId
          projectId: $projectId
          assigneeId: $assigneeId
          priority: $priority
          labelIds: $labelIds
        }) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `;
    
    const result = await this.executeQuery<{ 
      issueCreate: { 
        success: boolean; 
        issue: { id: string; identifier: string; url: string } 
      } 
    }>(token, mutation, input);
    
    if (!result.issueCreate.success) {
      throw new Error('Failed to create Linear issue');
    }
    
    return result.issueCreate.issue;
  }

  public static async createAttachment(
    token: string,
    issueId: string,
    title: string,
    url: string
  ) {
    const mutation = `
      mutation CreateAttachment($issueId: String!, $title: String!, $url: String!) {
        attachmentCreate(input: { issueId: $issueId, title: $title, url: $url }) {
          success
        }
      }
    `;
    
    const result = await this.executeQuery<{ 
      attachmentCreate: { 
        success: boolean; 
      } 
    }>(token, mutation, { issueId, title, url });
    
    if (!result.attachmentCreate.success) {
      throw new Error('Failed to attach file to Linear issue');
    }
    
    return true;
  }
}
