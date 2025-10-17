import React from 'react';

interface AnalysisResult {
  success?: boolean;
  url: string;
  grade?: string;
  grade_color?: string;
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

interface ResultsDisplayProps {
  result: AnalysisResult;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result }) => {
  console.log('ResultsDisplay received result:', result);
  console.log('Overall score:', result.overall_score);
  console.log('Module scores:', result.module_scores);
  const getScoreColor = (score: number) => {
    const safeScore = isNaN(score) ? 0 : score;
    if (safeScore >= 80) return 'text-green-400';
    if (safeScore >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    const safeScore = isNaN(score) ? 0 : score;
    if (safeScore >= 80) return 'bg-green-900';
    if (safeScore >= 60) return 'bg-yellow-900';
    return 'bg-red-900';
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Overall Score Card */}
      <div className="bg-gray-800 rounded-xl shadow-lg p-8 mb-8">
        <div className="flex items-center gap-8">
          {/* Circular Progress */}
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-700"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                stroke="url(#gradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(Math.round(result.overall_score || 0) / 100) * 283} 283`}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {Math.round(result.overall_score || 0)}/100
              </span>
            </div>
          </div>
          
          {/* Brand Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-white">Your Brand</h2>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getScoreBgColor(Math.round(result.overall_score || 0))} ${getScoreColor(Math.round(result.overall_score || 0))}`}>
                {result.grade || (result.overall_score >= 80 ? 'A' : result.overall_score >= 60 ? 'B' : result.overall_score >= 40 ? 'C' : 'D')}
              </span>
            </div>
            <div className="text-gray-400 text-sm mb-2">
              {new Date().toLocaleDateString('en-GB')} • 
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-400 hover:text-blue-300">
                {result.url}
              </a>
            </div>
            <p className="text-gray-300 leading-relaxed">
              Your website's AEO analysis shows a score of {Math.round(result.overall_score || 0)}. 
              {Math.round(result.overall_score || 0) >= 80 ? ' Excellent work! Your site is well-optimized for AI search engines.' : 
               Math.round(result.overall_score || 0) >= 60 ? ' Good foundation, but there are opportunities for improvement.' : 
               ' There are significant areas for improvement to enhance your AI search visibility.'}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* AI Presence Card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">AI Presence</h3>
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-900 text-green-300">
                LIVE
              </span>
            </div>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getScoreColor(Math.round(result.module_scores?.ai_presence || 0))}`}>
              <span className={`font-bold text-lg ${getScoreColor(Math.round(result.module_scores?.ai_presence || 0))}`}>
                {Math.round(result.module_scores?.ai_presence || 0)}
              </span>
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            Measures how accessible your content is to AI crawlers like ChatGPT, Gemini, and Claude.
          </p>
        </div>

        {/* Competitor Analysis Card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">Competitor Analysis</h3>
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-900 text-green-300">
                LIVE
              </span>
            </div>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getScoreColor(Math.round(result.module_scores?.competitor_analysis || 0))}`}>
              <span className={`font-bold text-lg ${getScoreColor(Math.round(result.module_scores?.competitor_analysis || 0))}`}>
                {Math.round(result.module_scores?.competitor_analysis || 0)}
              </span>
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            Analyzes how your content compares to competitors in AI search results.
          </p>
        </div>

        {/* Knowledge Base Card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">Knowledge Base</h3>
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-900 text-green-300">
                LIVE
              </span>
            </div>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getScoreColor(Math.round(result.module_scores?.knowledge_base || 0))}`}>
              <span className={`font-bold text-lg ${getScoreColor(Math.round(result.module_scores?.knowledge_base || 0))}`}>
                {Math.round(result.module_scores?.knowledge_base || 0)}
              </span>
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            Evaluates the depth and structure of your content's knowledge representation.
          </p>
        </div>

        {/* Answerability Card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">Answerability</h3>
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-900 text-green-300">
                LIVE
              </span>
            </div>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getScoreColor(Math.round(result.module_scores?.answerability || 0))}`}>
              <span className={`font-bold text-lg ${getScoreColor(Math.round(result.module_scores?.answerability || 0))}`}>
                {Math.round(result.module_scores?.answerability || 0)}
              </span>
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            Measures how well your content answers specific questions and queries.
          </p>
        </div>

        {/* Crawler Accessibility Card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">Crawler Accessibility</h3>
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-900 text-green-300">
                LIVE
              </span>
            </div>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getScoreColor(Math.round(result.module_scores?.crawler_accessibility || 0))}`}>
              <span className={`font-bold text-lg ${getScoreColor(Math.round(result.module_scores?.crawler_accessibility || 0))}`}>
                {Math.round(result.module_scores?.crawler_accessibility || 0)}
              </span>
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            Checks technical accessibility for AI crawlers and search engines.
          </p>
        </div>

        {/* Structured Data Card */}
        <div className="bg-gray-800 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">Structured Data</h3>
              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-900 text-green-300">
                LIVE
              </span>
            </div>
            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getScoreColor(Math.round(result.structured_data?.coverage_score || 0))}`}>
              <span className={`font-bold text-lg ${getScoreColor(Math.round(result.structured_data?.coverage_score || 0))}`}>
                {Math.round(result.structured_data?.coverage_score || 0)}
              </span>
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            Analyzes your structured data implementation and schema markup.
          </p>
        </div>
      </div>

    </div>
  );
};

export default ResultsDisplay;
