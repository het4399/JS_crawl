const API_BASE_URL = '';

export interface AnalysisResult {
  success: boolean;
  url: string;
  grade: string;
  grade_color: string;
  overall_score: number;
  module_scores?: {
    ai_presence: number;
    competitor_analysis: number;
    knowledge_base: number;
    answerability: number;
    crawler_accessibility: number;
    structured_data?: number;
  };
  module_weights?: {
    ai_presence: number;
    competitor: number;
    strategy_review: number;
  };
  detailed_analysis?: {
    ai_presence: any;
    competitor_analysis: any;
    knowledge_base: any;
    answerability: any;
    crawler_accessibility: any;
    structured_data?: any;
  };
  structured_data?: {
    total_schemas: number;
    valid_schemas: number;
    invalid_schemas: number;
    schema_types: string[];
    coverage_score: number;
    quality_score: number;
    completeness_score: number;
    seo_relevance_score: number;
    details: any;
  };
  all_recommendations?: string[];
  analysis_timestamp?: string;
  run_id?: string;
  errors?: string[];
  warnings?: string[];
  recommendations?: string[];
}

class ApiService {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('accessToken');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  async analyzeUrl(url: string, crawlerOptions?: {
    allowSubdomains: boolean;
    runAudits: boolean;
    auditDevice: 'mobile' | 'desktop';
    captureLinkDetails: boolean;
    forceRecrawl?: boolean;
  }): Promise<any> {
    try {
      if (crawlerOptions) {
        // First, start the crawler
        console.log(`Starting crawler for: ${url}`, crawlerOptions);

        const crawlResponse = await fetch('/crawl', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ 
            url: url.trim(),
            allowSubdomains: crawlerOptions.allowSubdomains,
            runAudits: crawlerOptions.runAudits,
            auditDevice: crawlerOptions.auditDevice,
            captureLinkDetails: crawlerOptions.captureLinkDetails,
            forceRecrawl: Boolean(crawlerOptions.forceRecrawl)
          })
        });

        if (!crawlResponse.ok) {
          const errorData = await crawlResponse.json().catch(() => ({}));
          
          // Handle authentication errors
          if (crawlResponse.status === 401) {
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
            throw new Error('Please login to continue');
          }
          
          // Handle usage limit errors
          if (crawlResponse.status === 429) {
            throw new Error(errorData.message || 'Daily usage limit exceeded. Please upgrade or try again tomorrow.');
          }
          
          throw new Error(errorData.error || errorData.message || 'Crawler failed to start');
        }

        const crawlData = await crawlResponse.json();
        
        // Surface reuse info to the caller to decide (show modal)
        if (crawlData.reuseMode && crawlData.sessionId) {
          return {
            reuseMode: true,
            sessionId: crawlData.sessionId,
            url: crawlData.url || url.trim(),
            hasAudits: crawlData.hasAudits,
            auditsTriggered: crawlData.auditsTriggered,
            auditsInProgress: crawlData.auditsInProgress,
            message: crawlData.message,
          };
        }

        // Then get AEO analysis for the main URL
        console.log(`Getting AEO analysis for: ${url}`);
        
        const aeoResponse = await fetch(
          `${this.baseURL}/aeo/analyze`,
          {
            method: 'POST',
            headers: this.getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({ url: url.trim() }),
          }
        );

        if (!aeoResponse.ok) {
          const errorData = await aeoResponse.json().catch(() => ({}));
          
          // Handle authentication errors
          if (aeoResponse.status === 401) {
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
            throw new Error('Please login to continue');
          }
          
          // Handle usage limit errors
          if (aeoResponse.status === 429) {
            throw new Error(errorData.message || 'Daily usage limit exceeded');
          }
          
          throw new Error(errorData.error || errorData.message || 'AEO analysis failed');
        }

        const aeoData = await aeoResponse.json();
        console.log('AEO API Response:', aeoData);
        
        // Handle the response structure from AEO API
        if (aeoData.success && aeoData.results) {
          return aeoData.results;
        } else {
          throw new Error(aeoData.error || 'AEO analysis failed');
        }
      } else {
        // Call the AEO analyzer endpoint for single page analysis
        console.log(`Making API call to: ${this.baseURL}/aeo/analyze`);
        console.log(`Analyzing URL: ${url}`);

        const response = await fetch(
          `${this.baseURL}/aeo/analyze`,
          {
            method: 'POST',
            headers: this.getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({ url: url.trim() }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Handle authentication errors
          if (response.status === 401) {
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
            throw new Error('Please login to continue');
          }
          
          // Handle usage limit errors
          if (response.status === 429) {
            throw new Error(errorData.message || 'Daily usage limit exceeded');
          }
          
          throw new Error(errorData.error || errorData.message || 'AEO analysis failed');
        }

        const data = await response.json();
        console.log('AEO API Response (single page):', data);
        
        // Handle the response structure from AEO API
        if (data.success && data.results) {
          return data.results;
        } else {
          throw new Error(data.error || 'AEO analysis failed');
        }
      }
    } catch (error: any) {
      console.error('API Error:', error);
      throw new Error(error.message || 'Failed to analyze URL');
    }
  }

  async healthCheck(): Promise<{ status: string; service: string }> {
    try {
      console.log(`Making health check to: ${this.baseURL}/health`);

      const response = await fetch(`${this.baseURL}/health`);
      const data = await response.json();

      console.log('Health check response:', data);
      return data;
    } catch (error: any) {
      console.error('Health check error:', error);
      throw new Error('Health check failed - backend may not be running');
    }
  }

  async getSessionData(sessionId: number): Promise<{
    data: any[];
    totalPages: number;
    totalResources: number;
    session?: any;
    logs?: Array<{ id: number; message: string; level: string; timestamp: string }>;
  }> {
    try {
      const response = await fetch(`${this.baseURL}/api/data/list?sessionId=${sessionId}`, {
        headers: this.getAuthHeaders(),
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          window.location.href = '/login';
          throw new Error('Please login to continue');
        }
        throw new Error('Failed to fetch session data');
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('Get session data error:', error);
      throw new Error(error.message || 'Failed to fetch session data');
    }
  }
}

export const apiService = new ApiService();
export default apiService;
