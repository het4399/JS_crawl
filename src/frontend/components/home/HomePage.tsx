import React from 'react';
import './HomePage.css';

interface HomePageProps {
    onLogin: () => void;
    onRegister: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onLogin, onRegister }) => {
    return (
        <div className="homepage-container">
            {/* Hero Section */}
            <div className="hero-section">
                <div className="hero-content">
                    <h1 className="hero-title">
                        📊 Contentlytics
                    </h1>
                    <p className="hero-subtitle">
                        Content Analytics & AEO Intelligence Platform
                    </p>
                    <p className="hero-description">
                        Analyze your website's structured data, optimize for AI search engines, 
                        and get actionable insights to improve your Answer Engine Optimization (AEO).
                    </p>
                    <div className="hero-actions">
                        <button onClick={onRegister} className="btn-primary-large">
                            Get Started Free
                        </button>
                        <button onClick={onLogin} className="btn-secondary-large">
                            Sign In
                        </button>
                    </div>
                </div>
            </div>

            {/* Features Section */}
            <div className="features-section">
                <h2 className="section-title">Powerful Features</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon">🕷️</div>
                        <h3 className="feature-title">Fast Web Crawling</h3>
                        <p className="feature-description">
                            Discover all pages on your site quickly with our intelligent crawler. 
                            No depth limits, automatic sitemap detection.
                        </p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">🤖</div>
                        <h3 className="feature-title">AEO Analysis</h3>
                        <p className="feature-description">
                            AI-powered content analysis to optimize for answer engines like ChatGPT, 
                            Perplexity, and Google SGE.
                        </p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">⚡</div>
                        <h3 className="feature-title">Performance Audits</h3>
                        <p className="feature-description">
                            Google PageSpeed Insights integration with Core Web Vitals tracking 
                            for both mobile and desktop.
                        </p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">📊</div>
                        <h3 className="feature-title">SEO Analytics</h3>
                        <p className="feature-description">
                            Keyword extraction, intent classification, and hierarchical 
                            content structure analysis with NLP.
                        </p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">🔗</div>
                        <h3 className="feature-title">Link Analysis</h3>
                        <p className="feature-description">
                            Comprehensive internal and external link mapping with 
                            anchor text analysis and relationship visualization.
                        </p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">⏰</div>
                        <h3 className="feature-title">Automated Scheduling</h3>
                        <p className="feature-description">
                            Schedule regular crawls and audits with cron expressions. 
                            Track changes over time automatically.
                        </p>
                    </div>
                </div>
            </div>

            {/* Pricing Section */}
            <div className="pricing-section">
                <h2 className="section-title">Simple Pricing</h2>
                <div className="pricing-grid">
                    <div className="pricing-card">
                        <div className="pricing-header">
                            <h3 className="pricing-tier">Free</h3>
                            <div className="pricing-price">
                                <span className="price-amount">$0</span>
                                <span className="price-period">/month</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ 10 crawls per day</li>
                            <li>✓ 10 AEO analyses per day</li>
                            <li>✓ Performance audits</li>
                            <li>✓ SEO keyword extraction</li>
                            <li>✓ Basic analytics</li>
                        </ul>
                        <button onClick={onRegister} className="pricing-button">
                            Start Free
                        </button>
                    </div>

                    <div className="pricing-card pricing-card-featured">
                        <div className="featured-badge">⭐ Popular</div>
                        <div className="pricing-header">
                            <h3 className="pricing-tier">Premium</h3>
                            <div className="pricing-price">
                                <span className="price-amount">$49</span>
                                <span className="price-period">/month</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ 50 crawls per day (5x)</li>
                            <li>✓ 50 AEO analyses per day (5x)</li>
                            <li>✓ Priority support</li>
                            <li>✓ Advanced analytics</li>
                            <li>✓ Custom API keys</li>
                            <li>✓ Email notifications</li>
                        </ul>
                        <button onClick={onRegister} className="pricing-button pricing-button-featured">
                            Upgrade to Premium
                        </button>
                    </div>

                    <div className="pricing-card">
                        <div className="pricing-header">
                            <h3 className="pricing-tier">Enterprise</h3>
                            <div className="pricing-price">
                                <span className="price-amount">Custom</span>
                            </div>
                        </div>
                        <ul className="pricing-features">
                            <li>✓ Unlimited usage</li>
                            <li>✓ Dedicated support</li>
                            <li>✓ Team collaboration</li>
                            <li>✓ White-label options</li>
                            <li>✓ SLA guarantees</li>
                            <li>✓ Custom integrations</li>
                        </ul>
                        <button className="pricing-button">
                            Contact Sales
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="homepage-footer">
                <p>© 2025 Contentlytics. All rights reserved.</p>
            </div>
        </div>
    );
};

