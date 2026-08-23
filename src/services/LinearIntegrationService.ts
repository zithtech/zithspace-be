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

  
  public static async getProjects(token: string) {
    const query = `
      query {
        projects {
          nodes {
            id
            name
            description
            state
            lead { id }
            teams {
              nodes {
                id
                name
              }
            }
          }
        }
      }
    `;
    const result = await this.executeQuery<{ projects: { nodes: any[] } }>(token, query);
    return result.projects.nodes;
  }

  public static async getWorkflowStates(token: string) {
    const query = `
      query {
        workflowStates {
          nodes {
            id
            name
            type
            color
          }
        }
      }
    `;
    const result = await this.executeQuery<{ workflowStates: { nodes: any[] } }>(token, query);
    return result.workflowStates.nodes;
  }

  public static async getCycles(token: string) {
    const query = `
      query {
        cycles {
          nodes {
            id
            name
            number
            startsAt
            endsAt
            completedAt
          }
        }
      }
    `;
    const result = await this.executeQuery<{ cycles: { nodes: any[] } }>(token, query);
    return result.cycles.nodes;
  }

  
  public static async previewIssues(
    token: string, 
    projectIds: string[], 
    teamIds: string[], 
    cycleIds: string[] = [],
    stateIds: string[] = [],
    userIds: string[] = [],
    cursor?: string
  ) {
    let filterString = '';
    const filters = [];
    
    if (projectIds && projectIds.length > 0) {
      filters.push(`project: { id: { in: ${JSON.stringify(projectIds)} } }`);
    }
    
    if (teamIds && teamIds.length > 0) {
      filters.push(`team: { id: { in: ${JSON.stringify(teamIds)} } }`);
    }

    if (cycleIds && cycleIds.length > 0) {
      filters.push(`cycle: { id: { in: ${JSON.stringify(cycleIds)} } }`);
    }

    if (stateIds && stateIds.length > 0) {
      filters.push(`state: { id: { in: ${JSON.stringify(stateIds)} } }`);
    }

    if (userIds && userIds.length > 0) {
      // Filtering by assignee. If we want creator as well, Linear requires complex OR logic. Assignee is standard.
      filters.push(`assignee: { id: { in: ${JSON.stringify(userIds)} } }`);
    }
    
    if (filters.length > 0) {
      filterString = `filter: { ${filters.join(', ')} },`;
    }

    const query = `
      query GetPreviewIssues($cursor: String) {
        issues(first: 10, after: $cursor, ${filterString}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            identifier
            title
            state { id name }
            project { id name }
          }
        }
      }
    `;
    
    const finalQuery = filterString ? query : query.replace(', filter: {  }', '');

    const result = await this.executeQuery<{ 
      issues: { 
        pageInfo: { hasNextPage: boolean, endCursor: string },
        nodes: any[] 
      } 
    }>(token, finalQuery, { cursor });
    
    return result.issues;
  }


  public static async getIssues(
    token: string, 
    filter: { projectId?: string; teamId?: string; cycleIds?: string[]; stateIds?: string[]; userIds?: string[] }, 
    cursor?: string
  ) {
    let filterString = '';
    const filters = [];
    if (filter.projectId) filters.push(`project: { id: { eq: "${filter.projectId}" } }`);
    if (filter.teamId) filters.push(`team: { id: { eq: "${filter.teamId}" } }`);
    
    if (filter.cycleIds && filter.cycleIds.length > 0) {
      filters.push(`cycle: { id: { in: ${JSON.stringify(filter.cycleIds)} } }`);
    }
    if (filter.stateIds && filter.stateIds.length > 0) {
      filters.push(`state: { id: { in: ${JSON.stringify(filter.stateIds)} } }`);
    }
    if (filter.userIds && filter.userIds.length > 0) {
      filters.push(`assignee: { id: { in: ${JSON.stringify(filter.userIds)} } }`);
    }

    if (filters.length > 0) {
      filterString = `filter: { ${filters.join(', ')} },`;
    }

    const query = `
      query GetIssues($cursor: String) {
        issues(first: 50, after: $cursor, ${filterString}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            identifier
            title
            description
            priority
            createdAt
            dueDate
            state { id name type }
            assignee { id name email }
            creator { id name email }
            project { id name }
            cycle { id name startsAt endsAt }
            labels { nodes { id name color } }
            comments { nodes { id body createdAt user { id name } } }
            attachments { nodes { id title url } }
          }
        }
      }
    `;
    
    const finalQuery = filterString ? query : query.replace(', filter: {  }', '');

    const result = await this.executeQuery<{ 
      issues: { 
        pageInfo: { hasNextPage: boolean, endCursor: string },
        nodes: any[] 
      } 
    }>(token, finalQuery, { cursor });
    
    return result.issues;
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
