import axios from "axios";

export class JiraApiService {
  private readonly baseUrl = "https://api.atlassian.com/ex/jira";

  public async getAccessibleResources(accessToken: string) {
    const url = "https://api.atlassian.com/oauth/token/accessible-resources";
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return response.data;
  }

  public async getProjects(accessToken: string, cloudId: string) {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/project`;
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return response.data;
  }

  public async getFilters(accessToken: string, cloudId: string) {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/filter/search`;
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return response.data;
  }

  public async getStatuses(accessToken: string, cloudId: string) {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/status`;
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return response.data;
  }

  public async getUsers(accessToken: string, cloudId: string) {
    // Note: To get all users in a workspace, we query without filtering
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/users/search`;
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      },
      params: {
        maxResults: 1000 // reasonable upper limit for typical workspace UI dropdown
      }
    });

    return response.data;
  }

  public async searchIssues(accessToken: string, cloudId: string, jql: string, nextPageToken?: string, maxResults: number = 50) {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/search/jql`;
    
    const payload: any = {
      jql: jql || "order by created DESC",
      maxResults,
      fields: ["*all"],
      expand: "changelog"
    };
    
    if (nextPageToken) {
      payload.nextPageToken = nextPageToken;
    }
    
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });

    return response.data;
  }

  public async getTotalIssues(accessToken: string, cloudId: string, jql: string): Promise<number> {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/search/approximate-count`;
    try {
      const response = await axios.post(url, { jql }, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });
      return response.data.count || 0;
    } catch (e: any) {
      console.warn("Could not fetch total issues count via approximate-count:", e.response?.data || e.message);
      return 0; // Return 0 gracefully on error
    }
  }


  public async downloadAttachment(accessToken: string, url: string) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "*/*"
      }
    });
    return {
      buffer: response.data,
      mimeType: response.headers['content-type']
    };
  }

  public async getBoardsByProject(accessToken: string, cloudId: string, projectKeyOrId: string) {
    const url = `${this.baseUrl}/${cloudId}/rest/agile/1.0/board?projectKeyOrId=${projectKeyOrId}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    return response.data;
  }

  public async getAllBoards(accessToken: string, cloudId: string) {
    const url = `${this.baseUrl}/${cloudId}/rest/agile/1.0/board?maxResults=50`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    return response.data;
  }

  public async getSprintsForBoard(accessToken: string, cloudId: string, boardId: string | number, startAt: number = 0) {
    const url = `${this.baseUrl}/${cloudId}/rest/agile/1.0/board/${boardId}/sprint?startAt=${startAt}&maxResults=50`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    return response.data;
  }

  public async getIssueTypes(accessToken: string, cloudId: string, projectId: string) {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/issuetype/project?projectId=${projectId}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
    return response.data;
  }

  public async createIssue(accessToken: string, cloudId: string, payload: any) {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/issue`;
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      }
    });
    return response.data;
  }

  public async uploadAttachment(accessToken: string, cloudId: string, issueIdOrKey: string, fileStream: any, filename: string) {
    const url = `${this.baseUrl}/${cloudId}/rest/api/3/issue/${issueIdOrKey}/attachments`;
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fileStream, filename);

    const response = await axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Atlassian-Token': 'no-check',
        ...form.getHeaders()
      }
    });
    return response.data;
  }
}
