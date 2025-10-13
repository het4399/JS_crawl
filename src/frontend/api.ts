const API_BASE_URL = '/aeo';

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

  async analyzeUrl(url: string): Promise<AnalysisResult> {
    try {
      console.log(`Making API call to: ${this.baseURL}/analyze`);
      console.log(`Analyzing URL: ${url}`);

      const response = await fetch(
        `${this.baseURL}/analyze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: url.trim() }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        return data;
      } else {
        throw new Error(data.error || 'Analysis failed');
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
}

export const apiService = new ApiService();
export default apiService;
