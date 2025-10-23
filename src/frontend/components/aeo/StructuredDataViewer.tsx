import React from 'react';
import './StructuredDataViewer.css';

interface StructuredDataViewerProps {
  data: {
    score: number;
    metrics: {
      coverage: number;
      quality: number;
      completeness: number;
      seo_relevance: number;
    };
    total_schemas: number;
    valid_schemas: number;
    schema_types: string[];
    recommendations: string[];
    explanations: {
      coverage: string;
      quality: string;
      completeness: string;
      seo_relevance: string;
    };
  };
}

const StructuredDataViewer: React.FC<StructuredDataViewerProps> = ({ data }) => {
  return (
    <div className="structured-data-viewer">
      <div className="sd-header">
        <h3>📊 Structured Data Analysis</h3>
        <div className="sd-score">
          <div className="score-badge">{Math.round(data.score)}</div>
          <span>/100</span>
        </div>
      </div>

      <div className="sd-metrics">
        <div className="metric-box">
          <div className="metric-label">Coverage</div>
          <div className="metric-bar">
            <div className="metric-fill" style={{ width: `${data.metrics.coverage}%` }}></div>
          </div>
          <div className="metric-value">{Math.round(data.metrics.coverage)}</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Quality</div>
          <div className="metric-bar">
            <div className="metric-fill" style={{ width: `${data.metrics.quality}%` }}></div>
          </div>
          <div className="metric-value">{Math.round(data.metrics.quality)}</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Completeness</div>
          <div className="metric-bar">
            <div className="metric-fill" style={{ width: `${data.metrics.completeness}%` }}></div>
          </div>
          <div className="metric-value">{Math.round(data.metrics.completeness)}</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">SEO Relevance</div>
          <div className="metric-bar">
            <div className="metric-fill" style={{ width: `${data.metrics.seo_relevance}%` }}></div>
          </div>
          <div className="metric-value">{Math.round(data.metrics.seo_relevance)}</div>
        </div>
      </div>

      <div className="sd-schemas">
        <h4>Schema Types Found ({data.total_schemas})</h4>
        <div className="schema-tags">
          {data.schema_types.map((schema, idx) => (
            <span key={idx} className="schema-tag">{schema}</span>
          ))}
        </div>
        <p className="schema-count">
          Valid: {data.valid_schemas} | Total: {data.total_schemas}
        </p>
      </div>

      <div className="sd-explanations">
        <div className="explanation">
          <h5>Coverage</h5>
          <p>{data.explanations.coverage}</p>
        </div>
        <div className="explanation">
          <h5>Quality</h5>
          <p>{data.explanations.quality}</p>
        </div>
        <div className="explanation">
          <h5>Completeness</h5>
          <p>{data.explanations.completeness}</p>
        </div>
        <div className="explanation">
          <h5>SEO Relevance</h5>
          <p>{data.explanations.seo_relevance}</p>
        </div>
      </div>

      {data.recommendations.length > 0 && (
        <div className="sd-recommendations">
          <h4>Recommendations</h4>
          <ul>
            {data.recommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default StructuredDataViewer;
