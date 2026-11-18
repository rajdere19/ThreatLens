import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Doughnut, Bar, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from './firebase';
import './style.css';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler
);

const API_BASE = (typeof window !== 'undefined' && window.location.port === '5173') ? 'http://127.0.0.1:8000' : '';

// --- Subtle Glitter Small Star Mouse Cursor ---
function StarSprinkleCursor() {
  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    class StarParticle {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 2.2 + 0.8;
        this.alpha = 1;
        this.fade = Math.random() * 0.035 + 0.02;
        this.vx = (Math.random() - 0.5) * 0.9;
        this.vy = (Math.random() - 0.5) * 0.9 + 0.3;
        this.color = Math.random() > 0.4 ? '#00f2fe' : '#ffffff';
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.fade;
      }
      draw(c) {
        c.save();
        c.globalAlpha = Math.max(0, this.alpha);
        c.fillStyle = this.color;
        c.shadowColor = this.color;
        c.shadowBlur = 6;
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = starsRef.current.length - 1; i >= 0; i--) {
        const s = starsRef.current[i];
        s.update();
        if (s.alpha <= 0) {
          starsRef.current.splice(i, 1);
        } else {
          s.draw(ctx);
        }
      }
      animFrameRef.current = requestAnimationFrame(render);
    };
    render();

    let lastX = 0, lastY = 0;
    const onPointerMove = (e) => {
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      if (dist > 7) {
        lastX = e.clientX;
        lastY = e.clientY;
        for (let i = 0; i < 2; i++) {
          starsRef.current.push(new StarParticle(e.clientX + (Math.random() - 0.5) * 8, e.clientY + (Math.random() - 0.5) * 8));
        }
        if (starsRef.current.length > 60) starsRef.current.shift();
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onPointerMove);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }} />;
}

// --- Icons ---
const ShieldIcon = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" stroke="#00f2fe" strokeWidth="2.5" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const MailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
  </svg>
);

const AlertIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

// --- Circular Gauge Meter ---
function ScoreGauge({ score, riskLevel }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const validScore = Math.max(0, Math.min(100, score || 0));
  const offset = circumference - (validScore / 100) * circumference;

  let strokeColor = '#10b981';
  if (validScore >= 80 || riskLevel === 'CRITICAL') {
    strokeColor = '#ef4444';
  } else if (validScore >= 65 || riskLevel === 'HIGH') {
    strokeColor = '#f87171';
  } else if (validScore >= 35 || riskLevel === 'MODERATE') {
    strokeColor = '#f59e0b';
  }

  return (
    <div className="radial-meter-box">
      <svg className="gauge-svg" viewBox="0 0 120 120">
        <circle className="gauge-bg-circle" cx="60" cy="60" r={radius} />
        <circle
          className="gauge-fill-circle"
          cx="60"
          cy="60"
          r={radius}
          stroke={strokeColor}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="gauge-text-center">
        <div className="gauge-score-num" style={{ color: strokeColor }}>{validScore}%</div>
        <div className="gauge-score-label">Risk</div>
      </div>
    </div>
  );
}

// --- Story-Driven Narrative Scroll Animation Showcase (5 Frames) ---
function ThreatScrollyShowcase() {
  const [activeFrame, setActiveFrame] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollableDist = rect.height - window.innerHeight;
      if (scrollableDist <= 0) return;
      const progress = Math.max(0, Math.min(1, -rect.top / scrollableDist));
      const frameIdx = Math.min(4, Math.floor(progress * 5));
      setActiveFrame(frameIdx);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section ref={containerRef} className="scrolly-container">
      <div className="scrolly-sticky-stage">
        
        {/* Frame 1: Warning Sign in Triangle */}
        <div className={`scrolly-frame ${activeFrame === 0 ? 'active' : ''}`}>
          <div className="alert-triangle-pulse">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h3 className="frame-title">Zero-Day Digital Threats Detected</h3>
          <p className="frame-caption">Scroll down to observe how deceptive cyber campaigns harvest credentials and bypass defenses...</p>
        </div>

        {/* Frame 2: Beware of fake emails and harmful websites */}
        <div className={`scrolly-frame ${activeFrame === 1 ? 'active' : ''}`}>
          <h2 className="frame-big-headline">
            Beware of <span className="highlight-red">Fake Emails</span> & <span className="highlight-amber">Harmful Websites</span>
          </h2>
          <p className="frame-caption" style={{ marginTop: '0.75rem' }}>
            Attackers deploy urgent lures and lookalike domains designed to deceive the human eye.
          </p>
          <div className="pulsing-triangles-cloud">
            <span className="pop-triangle t1">⚠️</span>
            <span className="pop-triangle t2">⚠️</span>
            <span className="pop-triangle t3">⚠️</span>
            <span className="pop-triangle t4">⚠️</span>
          </div>
        </div>

        {/* Frame 3: Fake Email Simulator */}
        <div className={`scrolly-frame ${activeFrame === 2 ? 'active' : ''}`}>
          <div className="fake-email-card">
            <div className="email-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MailIcon />
                <span className="sender-tag">From: security-notice@paypa1-billing.tk</span>
              </div>
              <span className="urgency-badge">URGENT</span>
            </div>
            <p className="typewriter-text">
              "Your financial account will be suspended within 24 hours. Immediate re-verification required: click below to confirm your password and 2FA code."
            </p>
            <div className="flags-wrap">
              <span className="flag-pill">🚨 Coercive Urgency Pressure</span>
              <span className="flag-pill">🚨 Credential & 2FA Solicitation</span>
              <span className="flag-pill">🚨 Spoofed Financial Authority</span>
            </div>
          </div>
        </div>

        {/* Frame 4: Harmful Website Spoof Bar */}
        <div className={`scrolly-frame ${activeFrame === 3 ? 'active' : ''}`}>
          <div className="fake-browser-card">
            <div className="fake-url-bar">
              <span style={{ color: '#ef4444' }}>🔓 Not Secure</span>
              <span>http://<span className="spoof-highlight">paypa1.com</span>.verify-account.tk/login</span>
            </div>
            <div className="callouts-row">
              <span className="callout-pill">⚠️ Leetspeak: 1 replaced l</span>
              <span className="callout-pill">⚠️ High-Risk TLD: .tk</span>
              <span className="callout-pill">⚠️ Deceptive Subdomain Stacking</span>
              <span className="callout-pill">⚠️ Bare HTTP Protocol</span>
            </div>
          </div>
        </div>

        {/* Frame 5: ThreatLens AI Neutralization */}
        <div className={`scrolly-frame ${activeFrame === 4 ? 'active' : ''}`}>
          <div className="shield-activate-wrap">
            <ShieldIcon style={{ width: 44, height: 44 }} />
          </div>
          <h2 className="frame-title">Threat Neutralized in Real Time</h2>
          <p className="frame-caption">
            ThreatLens dual-engine machine learning and lexical heuristics isolate brand spoofing in &lt;40ms.
          </p>
        </div>

        {/* Progress Dots */}
        <div className="scrolly-progress-dots">
          {[0, 1, 2, 3, 4].map((idx) => (
            <div key={idx} className={`progress-dot ${activeFrame === idx ? 'active' : ''}`} />
          ))}
        </div>

      </div>
    </section>
  );
}

// --- Home Page (Duskline Layout + ThreatLens Capabilities) ---
function HomePage({ onScanSample, onNavigateTab, userEmail }) {
  const [heroInput, setHeroInput] = useState('');
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroResult, setHeroResult] = useState(null);

  async function handleHeroScan(overrideUrl) {
    const target = (overrideUrl || heroInput).trim();
    if (!target) return;
    setHeroLoading(true);
    setHeroResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: target, user_email: userEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inspection failed');
      setHeroResult(data);
    } catch (err) {
      setHeroResult({ error: err.message });
    } finally {
      setHeroLoading(false);
    }
  }

  const samplePresets = [
    { label: 'Google (Legitimate)', url: 'https://www.google.com', tier: 'safe' },
    { label: 'PayPal (Official)', url: 'https://paypal.com/signin', tier: 'safe' },
    { label: 'Bitly (Shortener)', url: 'http://bit.ly/secure-login-392', tier: 'warn' },
    { label: 'PayPal Spoof (Phishing)', url: 'http://paypal-security-update.tk/login.php', tier: 'danger' },
    { label: 'Bare IP Host', url: 'http://192.168.1.100/paypal-verification.php?user=login', tier: 'danger' }
  ];

  return (
    <div>
      {/* Duskline Hero Section */}
      <section className="home-hero">
        <div className="home-hero-glow" />
        <div className="home-hero-inner">
          <div className="home-hero-copy">
            <span className="home-pill">
              <div className="home-thq-home-pill-dot-elm" />
              <span>1,284 new exposures confirmed this week</span>
            </span>

            <h1 className="hero-title">
              The threat you didn&apos;t see is the one they exploited.
            </h1>

            <p className="hero-subtitle home-hero-lede">
              ThreatLens maps everything your organization has facing the internet, scores what an attacker could do with it, and detects zero-day phishing, brand typosquatting, and coercive social engineering in real time.
            </p>

            {/* Embedded Live URL Threat Scanner */}
            <div className="hero-scan-embed">
              <div className="hero-search-input-wrap">
                <SearchIcon />
                <input
                  className="hero-search-input-field"
                  placeholder="Paste website URL (e.g. https://example.com or suspicious link)..."
                  value={heroInput}
                  onChange={(e) => setHeroInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHeroScan()}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => handleHeroScan()}
                  disabled={heroLoading || !heroInput.trim()}
                >
                  {heroLoading ? 'Inspecting...' : 'Analyze Threat'}
                </button>
              </div>

              <div className="hero-presets-strip">
                <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-dim)', fontWeight: 600 }}>PRESETS:</span>
                {samplePresets.map((p, idx) => (
                  <button
                    key={idx}
                    className={`preset-pill ${p.tier}`}
                    onClick={() => {
                      setHeroInput(p.url);
                      handleHeroScan(p.url);
                    }}
                  >
                    {p.tier === 'safe' ? '🟢' : p.tier === 'warn' ? '🟡' : '🔴'} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Hero Result Card */}
            {heroResult && (
              <div style={{ marginTop: '1rem' }}>
                {heroResult.error ? (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    {heroResult.error}
                  </div>
                ) : (
                  <div className={`verdict-banner-card level-${heroResult.risk_level.toLowerCase()}`}>
                    <div>
                      <div className="verdict-badges-wrap">
                        <span className={`threat-level-tag tag-${heroResult.risk_level.toLowerCase()}`}>
                          {heroResult.risk_level} RISK
                        </span>
                        <span className="category-tag">{heroResult.threat_category}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-dim)' }}>
                          Confidence: {heroResult.confidence}%
                        </span>
                      </div>
                      <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '0.35rem' }}>{heroResult.verdict}</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-secondary)', marginBottom: '0.75rem' }}>
                        {heroResult.metadata?.recommendation}
                      </p>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                        onClick={() => {
                          onScanSample(heroResult.value);
                          onNavigateTab('url');
                        }}
                      >
                        View Full Threat Breakdown →
                      </button>
                    </div>
                    <ScoreGauge score={heroResult.risk_score} riskLevel={heroResult.risk_level} />
                  </div>
                )}
              </div>
            )}

            <div className="home-hero-actions">
              <button className="btn btn-primary btn-lg" onClick={() => onNavigateTab('url')}>
                <span>Launch Deep Scanner</span>
              </button>
              <button className="btn btn-outline btn-lg" onClick={() => onNavigateTab('platform')}>
                <span>How the Scan Works</span>
              </button>
            </div>

            <p className="home-hero-note">
              No agent, no credentials, no contract. One domain is enough to start.
            </p>
          </div>

          {/* Duskline Attack Surface Map Card */}
          <div className="home-map">
            <div className="home-map-top">
              <span className="home-map-title">Perimeter · threatlens.intel</span>
              <span className="home-map-count">412 assets</span>
            </div>
            <div className="home-map-grid">
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node home-node-warn" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node home-node-hot" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node home-node-warn" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node home-node-warn" />
              <div className="home-node home-node-warn" />
              <div className="home-node" />
              <div className="home-node" />
              <div className="home-node home-node-hot" />
              <div className="home-node" />
              <div className="home-node" />
            </div>
            <div className="home-map-find">
              <span className="home-find-sev">Critical</span>
              <div>
                <p className="home-find-title">paypal-security-update.tk</p>
                <p className="home-find-text">
                  Unauthorized brand typosquatting · credential harvesting prompt · bare HTTP
                </p>
              </div>
            </div>
            <div className="home-map-find home-map-find-quiet">
              <span className="home-find-sev home-find-sev-med">High</span>
              <div>
                <p className="home-find-title">bit.ly/secure-login-392</p>
                <p className="home-find-text">
                  Destination masking via URL shortener · unverified destination
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Narrative Scrollytelling Showcase */}
      <ThreatScrollyShowcase />

      {/* Duskline Logos Strip */}
      <section className="home-logos">
        <p className="home-logos-label">Watching the perimeter for</p>
        <div className="home-logos-row">
          <span className="home-logo">Northvale Group</span>
          <span className="home-logo">Kestrel Bank</span>
          <span className="home-logo">Saarloos Energy</span>
          <span className="home-logo">Vilja Health</span>
          <span className="home-logo">Port of Rauma</span>
        </div>
      </section>

      {/* Duskline Three Pillars */}
      <section className="home-pillars">
        <div className="home-pillars-head">
          <span className="home-eyebrow">Three jobs, done every day</span>
          <h2 className="section-title">Find it, rank it, tell you what changed.</h2>
        </div>
        <div className="home-pillars-grid">
          <article className="home-pillar">
            <div className="home-pillar-art">
              <div className="home-pillar-line">
                <span className="home-pillar-key">threatlens.intel</span>
                <span className="home-pillar-val">root</span>
              </div>
              <div className="home-pillar-line">
                <span className="home-pillar-key">api.threatlens.intel</span>
                <span className="home-pillar-val">known</span>
              </div>
              <div className="home-pillar-line">
                <span className="home-pillar-key">vpn-2.threatlens.intel</span>
                <span className="home-pillar-val">new</span>
              </div>
              <div className="home-pillar-line">
                <span className="home-pillar-key">auth.threatlens.org</span>
                <span className="home-pillar-val">related</span>
              </div>
            </div>
            <h3 className="home-pillar-title">Discovery without a list</h3>
            <p className="home-pillar-text">
              Certificates, DNS, registries, cloud ranges and acquisition trails. We find the assets nobody wrote down.
            </p>
          </article>

          <article className="home-pillar">
            <div className="home-pillar-art">
              <div className="home-score">
                <span className="home-score-val">88</span>
                <span className="home-score-key">exposure score</span>
              </div>
              <div className="home-score-bars">
                <div className="home-score-bar home-sb-a" />
                <div className="home-score-bar home-sb-b" />
                <div className="home-score-bar home-sb-c" />
                <div className="home-score-bar home-sb-d" />
              </div>
              <p className="home-pillar-caption">Reachability · auth · data · blast radius</p>
            </div>
            <h3 className="home-pillar-title">Scored by what an attacker gains</h3>
            <p className="home-pillar-text">
              An unauthenticated admin console on a forgotten host outranks a theoretical flaw behind three firewalls.
            </p>
          </article>

          <article className="home-pillar">
            <div className="home-pillar-art">
              <div className="home-diff-line home-diff-add">
                <span>+</span>
                <span>2 suspicious domains detected overnight</span>
              </div>
              <div className="home-diff-line home-diff-add">
                <span>+</span>
                <span>1 typosquatted certificate registered</span>
              </div>
              <div className="home-diff-line home-diff-rem">
                <span>−</span>
                <span>3 phishing vectors blocked by SOC</span>
              </div>
              <p className="home-pillar-caption">Sent 07:00 · Slack and email telemetry</p>
            </div>
            <h3 className="home-pillar-title">A diff, not a dashboard</h3>
            <p className="home-pillar-text">
              Most mornings it is three lines and nothing to do. You read it because it is short, reporting only verified change.
            </p>
          </article>
        </div>
      </section>

      {/* Feature Deep Dive */}
      <section className="home-feature">
        <div className="home-feature-inner">
          <div className="home-panel">
            <div className="home-panel-top">
              <span>Morning diff · Tuesday</span>
              <span style={{ color: 'var(--color-primary)' }}>07:00</span>
            </div>
            <div className="home-panel-row">
              <span className="home-panel-sev">Critical</span>
              <span className="home-panel-txt">paypa1-update.tk · brand spoofing</span>
              <span className="home-panel-age">11d</span>
            </div>
            <div className="home-panel-row">
              <span className="home-panel-sev home-panel-sev-med">High</span>
              <span className="home-panel-txt">bit.ly/secure-login · masked URL</span>
              <span className="home-panel-age">2d</span>
            </div>
            <div className="home-panel-row">
              <span className="home-panel-sev home-panel-sev-low">Medium</span>
              <span className="home-panel-txt">wildcard certificate expires in 9 days</span>
              <span className="home-panel-age">new</span>
            </div>
            <div className="home-panel-row">
              <span className="home-panel-sev home-panel-sev-ok">Closed</span>
              <span className="home-panel-txt">staging-api · credentials revoked</span>
              <span className="home-panel-age">1d</span>
            </div>
            <p className="home-panel-foot">Nothing else changed. 412 assets checked, 0 new domains.</p>
          </div>

          <div>
            <span className="home-eyebrow">Ownership</span>
            <h2 className="section-title" style={{ marginBottom: '1rem' }}>
              Each finding arrives with the team that can close it.
            </h2>
            <p style={{ color: 'var(--color-on-surface-secondary)', lineHeight: 1.6 }}>
              ThreatLens maps every asset back to a repository, cloud account, or administrator — so an incident does not sit unassigned for weeks.
            </p>
            <ul className="home-feature-list">
              <li className="home-feature-item">
                <span>Ticket opened in Jira or Linear with complete forensic indicators</span>
              </li>
              <li className="home-feature-item">
                <span>Re-checked continuously; closes automatically when neutralized</span>
              </li>
              <li className="home-feature-item">
                <span>A named security analyst calls you for anything critical, day or night</span>
              </li>
            </ul>
            <button className="btn btn-outline" onClick={() => onNavigateTab('platform')}>
              <span>See the Platform</span>
            </button>
          </div>
        </div>
      </section>

      {/* Measured Stats */}
      <section className="home-stats">
        <h2 className="home-stats-title">Measured across 190 customer perimeters.</h2>
        <div className="home-stats-grid">
          <div className="home-stat">
            <span className="home-stat-val">31%</span>
            <span className="home-stat-key">of assets we find were unknown to the security team</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-val">4h</span>
            <span className="home-stat-key">median time from exposure appearing to an owned ticket</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-val">0.8</span>
            <span className="home-stat-key">false positives per hundred findings, verified by an analyst</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-val">24/7</span>
            <span className="home-stat-key">analyst cover for confirmed critical exposures</span>
          </div>
        </div>
      </section>

      {/* System Boundaries */}
      <section className="home-limits">
        <span className="home-eyebrow">Boundaries</span>
        <h2 className="section-title">What we will not do to your systems.</h2>
        <div className="home-limits-grid">
          <article className="home-limit">
            <h3 className="home-limit-title">No exploitation</h3>
            <p className="home-limit-text">
              We prove reachability and stop. Nothing is downloaded, written, or brute-forced. Every check is documented.
            </p>
          </article>
          <article className="home-limit">
            <h3 className="home-limit-title">No surprise load</h3>
            <p className="home-limit-text">
              Rate limits per host, published scanner ranges, and a pause switch you control.
            </p>
          </article>
          <article className="home-limit">
            <h3 className="home-limit-title">No scope creep</h3>
            <p className="home-limit-text">
              We scan what you confirm as yours. Discovered assets outside boundary are shown to you and left alone.
            </p>
          </article>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="home-faq">
        <span className="home-eyebrow">Before the first call</span>
        <h2 className="section-title">Questions security teams ask.</h2>
        <div className="home-faq-list">
          <details className="home-acc" open>
            <summary className="home-accordion-trigger">
              <span>How is this different from our vulnerability scanner?</span>
              <span>▾</span>
            </summary>
            <div className="home-acc-body">
              A scanner checks the hosts you give it. Our job is the hosts you did not give it — the ones nobody remembers — and then what an attacker could actually reach on them.
            </div>
          </details>
          <details className="home-acc">
            <summary className="home-accordion-trigger">
              <span>Do you need credentials or an agent?</span>
              <span>▾</span>
            </summary>
            <div className="home-acc-body">
              Neither. Everything we report is visible from the outside, the way an attacker sees it. Optional read-only cloud access improves ownership mapping.
            </div>
          </details>
          <details className="home-acc">
            <summary className="home-accordion-trigger">
              <span>How does ThreatLens prevent false positives on official domains?</span>
              <span>▾</span>
            </summary>
            <div className="home-acc-body">
              Machine learning bag-of-words models often penalize tokens like "paypal" or "google". ThreatLens includes an authoritative Brand Directory that verifies official apex domains, instantly eliminating false alarms while catching spoofed lookalikes.
            </div>
          </details>
          <details className="home-acc">
            <summary className="home-accordion-trigger">
              <span>Can we run the sweep before signing anything?</span>
              <span>▾</span>
            </summary>
            <div className="home-acc-body">
              Yes. One domain, a scope confirmation by email, and a report within three working days. You keep the report either way.
            </div>
          </details>
        </div>
      </section>

      {/* Duskline CTA Section */}
      <section className="home-cta">
        <div className="home-cta-inner">
          <h2 className="home-cta-title">Give us one domain. We&apos;ll show you the rest.</h2>
          <p className="home-cta-text">
            A free sweep of your external perimeter, with every finding verified by an analyst before it reaches you.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => onNavigateTab('url')}>
            <span>Book the Free Sweep</span>
          </button>
          <span className="home-cta-note">Scope confirmed in writing first · results in three working days</span>
        </div>
      </section>
    </div>
  );
}

// --- Platform View ---
function PlatformView({ onNavigateTab }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="scanner-view-container animate-fade">
      <div style={{ maxWidth: '820px', marginBottom: '3rem' }}>
        <span className="home-eyebrow">Platform</span>
        <h1 className="hero-title" style={{ fontSize: '2.8rem', margin: '0.5rem 0 1rem' }}>
          Four scans, one boundary, no agents.
        </h1>
        <p className="hero-subtitle">
          Everything ThreatLens knows comes from the outside, the way an attacker sees it. Here is what runs, how often, and what we do with the result.
        </p>
      </div>

      {/* Scanner Activity Card */}
      <div className="glass-panel" style={{ maxWidth: '640px', marginBottom: '3.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          Scanner activity · last hour
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
            <span>DNS and certificate watch</span>
            <span style={{ color: 'var(--color-primary)' }}>continuous</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
            <span>Port and service sweep</span>
            <span style={{ color: 'var(--color-primary)' }}>every 6h</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
            <span>Web surface crawl</span>
            <span style={{ color: 'var(--color-primary)' }}>daily</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Credential leak feed</span>
            <span style={{ color: 'var(--color-primary)' }}>hourly</span>
          </div>
        </div>
      </div>

      {/* Interactive Tabs */}
      <div style={{ marginBottom: '4rem' }}>
        <span className="home-eyebrow">What you get on screen</span>
        <h2 className="section-title" style={{ marginBottom: '2rem' }}>Three views, and nothing you have to assemble.</h2>
        
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
          {['Inventory', 'Findings', 'Ownership'].map((tabLabel, idx) => (
            <button
              key={idx}
              className={`btn ${activeTab === idx ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab(idx)}
            >
              {tabLabel}
            </button>
          ))}
        </div>

        <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '2rem' }}>
          {activeTab === 0 && (
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '0.5rem' }}>Every asset, with how we found it.</h3>
              <p style={{ color: 'var(--color-on-surface-secondary)', marginBottom: '1.5rem' }}>
                Domains, hosts, certificates, buckets, mail records and third-party pages carrying your brand.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="home-panel-row"><span>known</span><span>api.threatlens.intel</span><span>cert</span></div>
                <div className="home-panel-row"><span>new</span><span>vpn-2.threatlens.intel</span><span>reverse DNS</span></div>
                <div className="home-panel-row"><span>related</span><span>nv-group.net</span><span>registrar</span></div>
              </div>
            </div>
          )}

          {activeTab === 1 && (
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '0.5rem' }}>Findings a person has already read.</h3>
              <p style={{ color: 'var(--color-on-surface-secondary)', marginBottom: '1.5rem' }}>
                Anything above medium is verified by an analyst before it reaches your queue. False-positive rate is under one per hundred.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="home-panel-row"><span className="home-panel-sev">Critical</span><span>Admin console public · jenkins-old</span><span>11d</span></div>
                <div className="home-panel-row"><span className="home-panel-sev home-panel-sev-med">High</span><span>Bucket listing enabled · assets</span><span>2d</span></div>
                <div className="home-panel-row"><span className="home-panel-sev home-panel-sev-low">Medium</span><span>Certificate expiring in 9 days</span><span>new</span></div>
              </div>
            </div>
          )}

          {activeTab === 2 && (
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '0.5rem' }}>Who has to fix it, decided before the ticket.</h3>
              <p style={{ color: 'var(--color-on-surface-secondary)', marginBottom: '1.5rem' }}>
                Assets map to repositories, cloud accounts, and the people who last touched them.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="home-panel-row"><span>platform-team</span><span>jenkins-old</span><span>SEC-4192</span></div>
                <div className="home-panel-row"><span>web-team</span><span>assets</span><span>SEC-4193</span></div>
                <div className="home-panel-row"><span style={{ color: '#ef4444' }}>needs owner</span><span>legacy-shop</span><span>UNCLAIMED</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Pricing View ---
function PricingView({ onNavigateTab }) {
  return (
    <div className="scanner-view-container animate-fade">
      <div style={{ maxWidth: '820px', marginBottom: '3.5rem' }}>
        <span className="home-eyebrow">Pricing</span>
        <h1 className="hero-title" style={{ fontSize: '2.8rem', margin: '0.5rem 0 1rem' }}>
          Per asset, per month. You see the count before you sign.
        </h1>
        <p className="hero-subtitle">
          The free sweep tells you how many internet-facing assets you actually have. That number is the price.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '4rem' }}>
        <article className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ color: '#fff', fontSize: '1.5rem' }}>Sweep</h2>
          <p style={{ color: 'var(--color-on-surface-secondary)', fontSize: '0.88rem' }}>One perimeter, once. Keep the report either way.</p>
          <div style={{ fontSize: '2.6rem', fontWeight: 700, color: '#fff' }}>Free</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--color-on-surface-secondary)' }}>
            <li>✓ Full external discovery on one domain</li>
            <li>✓ Analyst-verified critical findings</li>
            <li>✓ Written report in three working days</li>
            <li>✓ No account, no credit card required</li>
          </ul>
          <button className="btn btn-outline" style={{ marginTop: 'auto' }} onClick={() => onNavigateTab('url')}>Book the Sweep</button>
        </article>

        <article className="glass-panel" style={{ borderColor: 'var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'linear-gradient(180deg, rgba(0, 242, 254, 0.08), var(--color-surface-panel))' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', textTransform: 'uppercase', fontWeight: 700 }}>Most Teams</span>
          <h2 style={{ color: '#fff', fontSize: '1.5rem' }}>Watch</h2>
          <p style={{ color: 'var(--color-on-surface-secondary)', fontSize: '0.88rem' }}>Continuous monitoring with the morning diff and ticketing.</p>
          <div>
            <span style={{ fontSize: '2.6rem', fontWeight: 700, color: '#fff' }}>€1.90</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-dim)', marginLeft: '0.5rem' }}>per asset / month</span>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--color-on-surface-secondary)' }}>
            <li>✓ All six surfaces scanned continuously</li>
            <li>✓ Analyst verification above medium severity</li>
            <li>✓ Ownership mapping and automatic tickets</li>
            <li>✓ Slack, Teams, Jira, Linear and API access</li>
            <li>✓ Unlimited users — security is not per seat</li>
          </ul>
          <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => onNavigateTab('url')}>Get a Quote</button>
        </article>

        <article className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ color: '#fff', fontSize: '1.5rem' }}>Watch + Response</h2>
          <p style={{ color: 'var(--color-on-surface-secondary)', fontSize: '0.88rem' }}>For teams without a night shift of their own.</p>
          <div>
            <span style={{ fontSize: '2.6rem', fontWeight: 700, color: '#fff' }}>€3.40</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-on-surface-dim)', marginLeft: '0.5rem' }}>per asset / month</span>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--color-on-surface-secondary)' }}>
            <li>✓ Everything in Watch</li>
            <li>✓ 24/7 analyst call-out on confirmed criticals</li>
            <li>✓ Containment guidance while on the phone</li>
            <li>✓ Quarterly review with named analyst</li>
          </ul>
          <button className="btn btn-outline" style={{ marginTop: 'auto' }} onClick={() => onNavigateTab('url')}>Talk to Us</button>
        </article>
      </div>
    </div>
  );
}

// --- Deep URL Threat Inspection View ---
function UrlScannerView({ initialUrl = '', onScanComplete, userEmail }) {
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (initialUrl) {
      setUrlInput(initialUrl);
      executeScan(initialUrl);
    }
  }, [initialUrl]);

  async function executeScan(targetUrl) {
    const target = (targetUrl || urlInput).trim();
    if (!target) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: target, user_email: userEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inspection failed');
      setResult(data);
      if (onScanComplete) onScanComplete();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  const samplePresets = [
    { label: 'Google (Legitimate)', url: 'https://www.google.com' },
    { label: 'MahaDBT (Gov)', url: 'https://mahadbt.maharashtra.gov.in' },
    { label: 'MahaDBT Fake (.xyz)', url: 'https://mahadbt.xyz' },
    { label: 'Bhulekh 7/12 (Gov)', url: 'https://bhulekh.mahabhumi.gov.in' },
    { label: 'Bhulekh Fake (.site)', url: 'https://bhulekh-mahabhumi.site' },
    { label: 'Sarathi DL (Gov)', url: 'https://sarathi.parivahan.gov.in' },
    { label: 'Sarathi Fake (.hn)', url: 'https://sarathi-parivahan.hn' },
    { label: 'FitGirl (Official)', url: 'https://fitgirl-repacks.site' },
    { label: 'FitGirl Clone (.to)', url: 'https://fitgirl-repacks.to' },
    { label: 'PayPal Spoof', url: 'http://paypal-security-update.tk/login.php' }
  ];

  return (
    <div className="scanner-view-container animate-fade">
      <div className="scanner-view-header">
        <span className="home-eyebrow">Deep Analysis</span>
        <h2 className="section-title">Deep URL Threat Inspection</h2>
        <p style={{ color: 'var(--color-on-surface-secondary)' }}>
          Evaluate domains for brand masquerading, direct IP hosting, suspicious TLDs, and lexical anomalies.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            className="hero-search-input-field"
            style={{ background: 'var(--color-surface)', padding: '0.75rem 1rem', borderRadius: 8, border: '1px solid var(--color-border)' }}
            placeholder="e.g. https://secure-login-portal.com or paste full URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeScan()}
          />
          <button
            className="btn btn-primary"
            onClick={() => executeScan()}
            disabled={loading || !urlInput.trim()}
          >
            {loading ? 'Analyzing…' : 'Inspect URL'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-dim)', fontWeight: 600 }}>PRESETS:</span>
          {samplePresets.map((p, idx) => (
            <button
              key={idx}
              className="preset-pill"
              onClick={() => {
                setUrlInput(p.url);
                executeScan(p.url);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div>
          {result.error ? (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '1rem', borderRadius: 8 }}>
              {result.error}
            </div>
          ) : (
            <div className="analysis-columns-grid">
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ color: '#fff', fontSize: '1.25rem' }}>Threat Assessment</h3>
                  <span className={`threat-level-tag tag-${result.risk_level.toLowerCase()}`}>{result.risk_level} RISK</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <ScoreGauge score={result.risk_score} riskLevel={result.risk_level} />
                  <div>
                    <h4 style={{ color: '#fff', fontSize: '1.1rem' }}>{result.verdict}</h4>
                    <p style={{ color: 'var(--color-on-surface-secondary)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
                      {result.metadata?.recommendation}
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-panel">
                <h3 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>
                  Indicators Observed ({result.risks?.length || 0})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {result.risks?.map((r, i) => (
                    <div key={i} style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.75rem 1rem', borderRadius: 8, borderLeft: `3px solid ${r.severity === 'CRITICAL' ? '#ef4444' : r.severity === 'HIGH' ? '#f87171' : r.severity === 'MEDIUM' ? '#f59e0b' : '#10b981'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.85rem' }}>
                        <span style={{ color: '#fff' }}>{r.name}</span>
                        <span style={{ color: r.score_impact < 0 ? '#10b981' : '#f59e0b' }}>{r.score_impact > 0 ? `+${r.score_impact}` : r.score_impact} pts</span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--color-on-surface-secondary)', marginTop: '0.25rem' }}>{r.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Social Engineering NLP Scanner (Email & SMS) ---
function MessagesScannerView({ userEmail }) {
  const [kind, setKind] = useState('email');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const emailPresets = [
    {
      label: 'CEO Wire Fraud (Header + Delimiter BEC)',
      text: "Subject: 🚩 URGENT — Wire needed before 3:00 PM today\nFrom: Michael Reyes, CEO <m.reyes.ceo@northwind-holdings.co>\nTo: Jordan Ellis <jellis@northwindholdings.com>\nTime: Today, 1:47 PM\n\nJordan,\nI need you to process a wire transfer of $48,750.00 to a new vendor. It has to go out before 3:00 PM today or we lose the deal.\nThis is strictly confidential. Please don't mention it to anyone else on the team, including finance, until we announce.\nI'm in back-to-back meetings and can't take calls. Just reply here once it's sent. Banking details are attached.\n\nMichael"
    },
    {
      label: 'Google Sign-in Alert (Authentic)',
      text: "From: Google <no-reply@accounts.google.com>\nTo: Alex Mercer <alex.mercer@gmail.com>\nSubject: Security alert: new sign-in on Windows\n\nSecurity alert: new sign-in on Windows\nDevice: Windows, Chrome\nLocation: Mumbai, India\nTime: Today, 10:14 PM\n\nIf this was you, you don't need to do anything.\nIf this wasn't you, check activity at https://myaccount.google.com/notifications."
    },
    {
      label: 'Google Password Expiry (Phishing)',
      text: "From: Google Support <support@google-accounts.xyz>\nTo: Alex Mercer <alex.mercer@gmail.com>\nSubject: Security Warning: Confirm your password\n\nYour Google account password has expired. Confirm your current password within 24 hours to prevent account deletion:\nhttp://google-verify-password.site"
    },
    {
      label: 'Steam Guard Code (Authentic)',
      text: "From: Steam Support <noreply@steampowered.com>\nTo: GamerX <gamerx@gmail.com>\nSubject: Your Steam account: Access from new web or mobile device\n\nDear GamerX,\nHere is the Steam Guard code you need that will allow you to log in to your Steam account:\nRD72M\n\nComputer name: DESKTOP-GAMER\nCity: Pune, India\n\nIf you are not attempting to log in, you can safely ignore this email.\nSteam Support will never ask for your password or Steam Guard code.\nNeed help? https://help.steampowered.com"
    },
    {
      label: 'Steam Duping Ban (Phishing)',
      text: "From: Valve Steam Admin <admin@steam-valve.xyz>\nTo: GamerX <gamerx@gmail.com>\nSubject: Steam Community Ban Notice\n\nYour Steam account has been reported for illegal item duping. Confirm your current password and Steam Guard code to avoid a permanent ban:\nhttp://steamcommunity-trade.top"
    },
    {
      label: 'Microsoft Security Code (Authentic)',
      text: "From: Microsoft account team <account-security-noreply@accountprotection.microsoft.com>\nTo: Sarah <sarah@outlook.com>\nSubject: Microsoft account security code\n\nMicrosoft account security code\nWe received your request for a single-use code to use with your Microsoft account.\nYour code is: 849201\n\nIf you didn't request this code, you can safely ignore this email. Someone might have typed your email address by mistake.\nhttps://account.live.com"
    },
    {
      label: 'Amazon Password OTP (Authentic)',
      text: "From: Amazon.com <account-update@amazon.com>\nTo: David <david@gmail.com>\nSubject: Amazon password assistance\n\nTo authenticate, please use the following One-Time Password (OTP):\n742918\n\nDo not share this OTP with anyone. Amazon customer service will never ask you for your password or OTP."
    },
    {
      label: 'Amazon $500 Credit Bait (Phishing)',
      text: "From: Amazon Rewards <rewards@amazon-bonus-claim.xyz>\nTo: David <david@gmail.com>\nSubject: Account Notice: $500 Credit Issued\n\nAmazon Notification: $500 cash balance has been credited to your account wallet. Click here to claim your cash refund:\nhttp://amazon-cash-refund.xyz"
    },
    {
      label: 'Steam Summer Sale (Promo)',
      text: "From: Steam Support <noreply@steampowered.com>\nTo: GamerX <gamerx@gmail.com>\nSubject: The Steam Summer Sale is here!\n\nThe Steam Summer Sale is now live! Save up to 80% on thousands of games on your wishlist. Shop now before July 11th.\nUnsubscribe here."
    },
    {
      label: 'CEO Payroll Fraud (BEC)',
      text: "Are you at your desk? I'm in a conference and can't take calls. Need you to update my direct deposit bank routing info before payroll cutoff today."
    },
    {
      label: 'Account Termination Panic',
      text: "Your financial account will be suspended within 24 hours due to suspicious activity. Verify your password and 2FA code immediately."
    },
    {
      label: 'Normal Team Sync (Clean)',
      text: "Hey team, quick reminder about our project sync tomorrow at 10 AM. Please review the agenda doc before the call."
    }
  ];

  const smsPresets = [
    {
      label: 'Electricity Cutoff Extortion',
      text: "Dear Consumer, your electricity power will be disconnected tonight at 9:30 PM because previous month bill was not updated. Call electricity officer immediately."
    },
    {
      label: 'USPS Package Redelivery',
      text: "USPS: Your package could not be delivered due to incomplete street address. Update details and pay $1.99 redelivery fee at bit.ly/usps-redelivery"
    },
    {
      label: 'Bank OTP Verification Scam',
      text: "Your card ending in 4921 has been blocked. Click here to confirm your 2FA OTP code and CVV to restore access."
    },
    {
      label: 'Meeting Reminder (Clean)',
      text: "Hey, are you free for lunch today at 1 PM near the cafeteria?"
    }
  ];

  const currentPresets = kind === 'email' ? emailPresets : smsPresets;

  async function handleAnalyze(overrideText) {
    const val = (typeof overrideText === 'string' ? overrideText : text).trim();
    if (!val) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/analyze/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: val, user_email: userEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inspection failed');
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scanner-view-container animate-fade">
      <div className="scanner-view-header">
        <span className="home-eyebrow">Natural Language Processing</span>
        <h2 className="section-title">Social Engineering Threat Analyzer</h2>
        <p style={{ color: 'var(--color-on-surface-secondary)' }}>
          Detect hyper-personalized spear phishing, CEO wire fraud, credential harvesting, and urgent coercive pressure.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button
            className={`btn ${kind === 'email' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setKind('email');
              setResult(null);
            }}
          >
            ✉️ Email Inspection
          </button>
          <button
            className={`btn ${kind === 'sms' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setKind('sms');
              setResult(null);
            }}
          >
            📱 SMS Smishing Inspection
          </button>
        </div>

        <textarea
          rows={6}
          style={{ width: '100%', background: 'var(--color-surface)', color: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '1rem', outline: 'none', fontFamily: 'inherit', fontSize: '0.95rem' }}
          placeholder={kind === 'email' ? "Paste full email text or lure message here..." : "Paste SMS smishing message here..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-dim)', fontWeight: 600 }}>QUICK PRESETS:</span>
          {currentPresets.map((p, idx) => (
            <button
              key={idx}
              className="preset-pill"
              onClick={() => {
                setText(p.text);
                handleAnalyze(p.text);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          style={{ marginTop: '1.25rem' }}
          onClick={() => handleAnalyze()}
          disabled={loading || !text.trim()}
        >
          {loading ? 'Analyzing Content...' : 'Inspect Message'}
        </button>
      </div>

      {result && (
        <div>
          {result.error ? (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '1.25rem', borderRadius: 8 }}>
              <strong>Analysis Error:</strong> {result.error}
            </div>
          ) : (
            <div className="analysis-columns-grid">
              <div className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ color: '#fff', fontSize: '1.25rem' }}>Threat Assessment</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: 4, background: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}>
                      {result.threat_category}
                    </span>
                    <span className={`threat-level-tag tag-${result.risk_level.toLowerCase()}`}>
                      {result.risk_level} RISK
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <ScoreGauge score={result.risk_score} riskLevel={result.risk_level} />
                  <div>
                    <h4 style={{ color: '#fff', fontSize: '1.15rem' }}>{result.verdict}</h4>
                    <p style={{ color: 'var(--color-on-surface-secondary)', fontSize: '0.85rem', marginTop: '0.4rem', lineHeight: '1.45' }}>
                      {result.metadata?.recommendation}
                    </p>
                  </div>
                </div>
              </div>

              <div className="glass-panel">
                <h3 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>
                  Indicators Observed ({result.risks?.length || 0})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {result.risks?.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        padding: '0.75rem 1rem',
                        borderRadius: 8,
                        borderLeft: `3px solid ${r.severity === 'CRITICAL' ? '#ef4444' : r.severity === 'HIGH' ? '#f87171' : r.severity === 'MEDIUM' ? '#f59e0b' : '#10b981'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.85rem' }}>
                        <span style={{ color: '#fff' }}>{r.name}</span>
                        <span style={{ color: r.score_impact < 0 ? '#10b981' : '#f59e0b' }}>
                          {r.score_impact > 0 ? `+${r.score_impact}` : r.score_impact} pts
                        </span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--color-on-surface-secondary)', marginTop: '0.25rem' }}>
                        {r.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Live SOC Dashboard & Telemetry ---
function DashboardView({ onSelectScan, userEmail }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');

  const fetchDashboard = () => {
    setLoading(true);
    const url = userEmail ? `${API_BASE}/api/dashboard?user=${encodeURIComponent(userEmail)}` : `${API_BASE}/api/dashboard`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, [userEmail]);

  const filteredScans = useMemo(() => {
    if (!data?.recent) return [];
    if (!filterQuery.trim()) return data.recent;
    return data.recent.filter((s) => s.value.toLowerCase().includes(filterQuery.toLowerCase()) || s.verdict.toLowerCase().includes(filterQuery.toLowerCase()));
  }, [data, filterQuery]);

  const doughnutData = useMemo(() => {
    if (!data) return null;
    return {
      labels: ['Critical', 'High', 'Moderate', 'Low Risk'],
      datasets: [
        {
          data: [data.critical || 0, data.high || 0, data.moderate || 0, data.low || 0],
          backgroundColor: ['#ef4444', '#f87171', '#f59e0b', '#10b981'],
          borderWidth: 0
        }
      ]
    };
  }, [data]);

  return (
    <div className="scanner-view-container animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <span className="home-eyebrow">Real-Time Telemetry</span>
          <h2 className="section-title">SOC Threat Intelligence Feed</h2>
          <p style={{ color: 'var(--color-on-surface-secondary)' }}>
            Scoped to account: <span style={{ color: 'var(--color-primary)' }}>{userEmail}</span>
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchDashboard}>↻ Refresh Feed</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-on-surface-dim)' }}>Loading real-time telemetry…</div>
      ) : (
        <div>
          <div className="home-stats-grid" style={{ marginBottom: '2.5rem' }}>
            <div className="home-stat"><span className="home-stat-val">{data?.total || 0}</span><span className="home-stat-key">Total Threat Audits</span></div>
            <div className="home-stat"><span className="home-stat-val" style={{ color: '#ef4444' }}>{data?.critical || 0}</span><span className="home-stat-key">Critical Phishing Blocks</span></div>
            <div className="home-stat"><span className="home-stat-val" style={{ color: '#f59e0b' }}>{data?.moderate || 0}</span><span className="home-stat-key">Moderate Ambiguity Alerts</span></div>
            <div className="home-stat"><span className="home-stat-val" style={{ color: '#10b981' }}>{data?.low || 0}</span><span className="home-stat-key">Verified Safe Domains</span></div>
          </div>

          {doughnutData && (
            <div className="analysis-columns-grid" style={{ marginBottom: '2.5rem' }}>
              <div className="glass-panel" style={{ textAlign: 'center' }}>
                <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Threat Severity Spectrum</h3>
                <div style={{ maxWidth: '280px', margin: '0 auto' }}>
                  <Doughnut data={doughnutData} options={{ plugins: { legend: { labels: { color: '#94a3b8' } } } }} />
                </div>
              </div>
              <div className="glass-panel">
                <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Attack Vector Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Website URLs</span>
                      <span style={{ color: 'var(--color-primary)' }}>{data?.breakdown?.url || 0}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>Phishing Emails</span>
                      <span style={{ color: 'var(--color-primary)' }}>{data?.breakdown?.email || 0}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>SMS Smishing Lures</span>
                      <span style={{ color: 'var(--color-primary)' }}>{data?.breakdown?.sms || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="history-table-wrapper">
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: '#fff' }}>Historical Forensic Audit Ledger</strong>
              <input
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: '#fff', padding: '0.35rem 0.75rem', borderRadius: 6, fontSize: '0.82rem' }}
                placeholder="Search audit ledger..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
              />
            </div>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Target Value</th>
                  <th>Verdict</th>
                  <th>Risk Tier</th>
                  <th>Score</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredScans.map((s) => (
                  <tr key={s.id} onClick={() => onSelectScan(s)} style={{ cursor: 'pointer' }}>
                    <td><span className="preset-pill">{s.kind.toUpperCase()}</span></td>
                    <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</td>
                    <td>{s.verdict}</td>
                    <td><span className={`threat-level-tag tag-${s.risk_level.toLowerCase()}`}>{s.risk_level}</span></td>
                    <td style={{ fontWeight: 700, color: s.score >= 65 ? '#ef4444' : s.score >= 35 ? '#f59e0b' : '#10b981' }}>{s.score}%</td>
                    <td style={{ color: 'var(--color-on-surface-dim)', fontSize: '0.78rem' }}>{new Date(s.created).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Dedicated Full Login & Access Clearance Page ---
function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleGuest = () => {
    onLoginSuccess({ email: 'guest@threatlens.intel', displayName: 'Guest Analyst', isGuest: true });
  };

  const handleGoogle = async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      onLoginSuccess(res.user);
    } catch (e) {
      setErrorMsg(e.message);
    }
  };

  return (
    <div className="login-page-view">
      <div className="login-card-container">
        <span className="home-eyebrow">Security Clearance Portal</span>
        <h2 className="section-title" style={{ fontSize: '1.8rem', margin: '0.5rem 0 0.5rem' }}>Analyst Sign In</h2>
        <p style={{ color: 'var(--color-on-surface-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Personalized Threat Intelligence Telemetry & Audit Logging
        </p>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '0.65rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.8rem' }}>
            {errorMsg}
          </div>
        )}

        <button className="btn btn-outline" style={{ width: '100%', marginBottom: '1rem' }} onClick={handleGoogle}>
          Continue with Google
        </button>

        <div style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--color-on-surface-dim)', fontSize: '0.75rem' }}>OR DEMO ACCESS</div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGuest}>
          Enter as Guest Analyst (1-Click Demo)
        </button>
      </div>
    </div>
  );
}

// --- Main App Root with Duskline Navigation & Footer ---
function App() {
  const [tab, setTab] = useState('home');
  const [user, setUser] = useState(null);
  const [activeUrlScan, setActiveUrlScan] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) setUser(currentUser);
    });
    return () => unsub();
  }, []);

  const currentEmail = user?.email || 'guest@threatlens.intel';

  return (
    <div>
      <StarSprinkleCursor />

      {/* Duskline Navigation (.dl-nav) */}
      <header className="dl-nav">
        <div className="dl-nav-bar">
          <div className="dl-nav-brand" onClick={() => setTab('home')}>
            <div className="dl-logo-mark">
              <ShieldIcon style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div className="dl-brand-title">ThreatLens</div>
              <div className="dl-brand-badge">Defensive Intelligence</div>
            </div>
          </div>

          <div className="dl-nav-right">
            {/* Duskline Menu Dropdown */}
            <div className="dl-nav-drop">
              <div className="dl-nav-trigger">
                <span>Threat Intelligence</span>
                <span className="dl-nav-chev">▾</span>
              </div>
              <ul className="dl-nav-panel">
                <li className="dl-nav-panel-item-note">
                  <h4 className="dl-nav-panel-heading">Live Perimeter</h4>
                  <p className="dl-nav-panel-metric">1,284</p>
                  <p className="dl-nav-panel-text">new exposures confirmed across estates this week, analyst-verified.</p>
                </li>
                <li>
                  <div className="dl-nav-panel-link" onClick={() => setTab('platform')}>
                    <span>Platform</span>
                    <span className="dl-nav-panel-text">Four scans, one boundary, no agents.</span>
                  </div>
                  <div className="dl-nav-panel-link" onClick={() => setTab('pricing')}>
                    <span>Pricing</span>
                    <span className="dl-nav-panel-text">Per asset, per month, counted before you sign.</span>
                  </div>
                  <div className="dl-nav-panel-link" onClick={() => setTab('dashboard')}>
                    <span>Threat Feed</span>
                    <span className="dl-nav-panel-text">Real-time SQLite telemetry & Radar metrics.</span>
                  </div>
                </li>
              </ul>
            </div>

            <button className={`btn btn-outline ${tab === 'home' ? 'btn-primary' : ''}`} onClick={() => setTab('home')}>
              Overview
            </button>
            <button className={`btn btn-outline ${tab === 'url' ? 'btn-primary' : ''}`} onClick={() => setTab('url')}>
              URL Scanner
            </button>
            <button className={`btn btn-outline ${tab === 'messages' ? 'btn-primary' : ''}`} onClick={() => setTab('messages')}>
              Email & SMS
            </button>
            <button className={`btn btn-outline ${tab === 'platform' ? 'btn-primary' : ''}`} onClick={() => setTab('platform')}>
              Platform
            </button>
            <button className={`btn btn-outline ${tab === 'pricing' ? 'btn-primary' : ''}`} onClick={() => setTab('pricing')}>
              Pricing
            </button>
            <button className={`btn btn-outline ${tab === 'dashboard' ? 'btn-primary' : ''}`} onClick={() => setTab('dashboard')}>
              Threat Feed
            </button>

            <div className="dl-nav-account">
              <div className="dl-nav-account-dot" />
              <span>Operational</span>
            </div>

            {user ? (
              <button className="btn btn-outline" style={{ fontSize: '0.82rem' }} onClick={() => setUser(null)}>
                {user.displayName || user.email?.split('@')[0]} (Sign Out)
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setTab('login')}>
                Free Perimeter Sweep
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Surface */}
      <main>
        {tab === 'home' && (
          <HomePage
            onScanSample={(url) => {
              setActiveUrlScan(url);
              setTab('url');
            }}
            onNavigateTab={setTab}
            userEmail={currentEmail}
          />
        )}

        {tab === 'url' && (
          <UrlScannerView
            initialUrl={activeUrlScan}
            userEmail={currentEmail}
          />
        )}

        {tab === 'messages' && (
          <MessagesScannerView
            userEmail={currentEmail}
          />
        )}

        {tab === 'platform' && (
          <PlatformView
            onNavigateTab={setTab}
          />
        )}

        {tab === 'pricing' && (
          <PricingView
            onNavigateTab={setTab}
          />
        )}

        {tab === 'dashboard' && (
          <DashboardView
            onSelectScan={(s) => {
              if (s.kind === 'url') {
                setActiveUrlScan(s.value);
                setTab('url');
              } else {
                setTab('messages');
              }
            }}
            userEmail={currentEmail}
          />
        )}

        {tab === 'login' && (
          <LoginPage
            onLoginSuccess={(u) => {
              setUser(u);
              setTab('dashboard');
            }}
          />
        )}
      </main>

      {/* Duskline Footer (.dl-foot) */}
      <footer className="dl-foot">
        <div className="dl-foot-inner">
          <div className="dl-foot-cols">
            <div className="dl-foot-col">
              <span className="dl-foot-head">Platform</span>
              <a className="dl-foot-link" onClick={() => setTab('platform')}>Asset Discovery</a>
              <a className="dl-foot-link" onClick={() => setTab('platform')}>Exposure Scoring</a>
              <a className="dl-foot-link" onClick={() => setTab('platform')}>Daily Perimeter Diff</a>
              <a className="dl-foot-link" onClick={() => setTab('url')}>Certificate and DNS Watch</a>
              <a className="dl-foot-link" onClick={() => setTab('messages')}>Credential Leak Monitoring</a>
              <a className="dl-foot-link" onClick={() => setTab('pricing')}>Plans and Limits</a>
            </div>

            <div className="dl-foot-col">
              <span className="dl-foot-head">Documentation</span>
              <a className="dl-foot-link" onClick={() => setTab('platform')}>API Reference ↗</a>
              <a className="dl-foot-link" onClick={() => setTab('home')}>Service Status ↗</a>
              <p className="dl-foot-text">Scanner IP ranges published and versioned, so your allow-lists stay stable.</p>
              <div style={{ marginTop: '1rem' }}>
                <span className="dl-foot-head">Legal</span>
                <p className="dl-foot-text">Terms · Privacy · Responsible Disclosure</p>
              </div>
            </div>

            <div className="dl-foot-col">
              <span className="dl-foot-head">Talk to Us</span>
              <a className="dl-foot-link" style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem' }} href="tel:+3726024180">+372 602 4180</a>
              <p className="dl-foot-text">Analysts on call 24/7 for confirmed critical exposures.</p>
              <a className="dl-foot-link" style={{ color: 'var(--color-primary)' }} onClick={() => setTab('url')}>Book a Sweep →</a>
              <div className="dl-foot-social">
                <div className="dl-foot-circle">in</div>
                <div className="dl-foot-circle">gh</div>
                <div className="dl-foot-circle">x</div>
              </div>
            </div>

            <div className="dl-foot-col">
              <span className="dl-foot-head">Company</span>
              <p className="dl-foot-text">ThreatLens OÜ</p>
              <p className="dl-foot-text">Telliskivi 60a, Tallinn 10412</p>
              <p className="dl-foot-text">Registered in Estonia 16410922</p>
              <div className="dl-foot-badge">
                <span className="dl-foot-badge-mark">SOC 2</span>
                <span className="dl-foot-badge-text">Type II · audited annually since 2023</span>
              </div>
            </div>
          </div>

          <div className="dl-foot-base">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="dl-logo-mark"><ShieldIcon style={{ width: 16, height: 16 }} /></div>
              <strong style={{ color: '#fff' }}>ThreatLens</strong>
            </div>
            <p className="dl-foot-copy">
              © 2026 ThreatLens OÜ · We scan what you own, and only what you own.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
